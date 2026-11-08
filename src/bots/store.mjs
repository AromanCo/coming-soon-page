import { randomUUID } from "node:crypto";

const WORKER_LOCKS = { telegram: 780301, bale: 780302 };
export const OUTBOX_LIMITS = Object.freeze({
  attempts: 10,
  perProvider: 2000,
  ordinaryPerProvider: 1800,
  forgetPerProvider: 100,
  busyPerProvider: 100,
  perChat: 20,
  leaseMs: 120_000,
  backoffBaseMs: 2_000,
  backoffMaxMs: 15 * 60_000,
});

/** PostgreSQL persistence; no user names, phones, raw inbound messages or marketing consent. */
export class PostgresSessionStore {
  constructor(pool) { this.pool = pool; this.workerClients = new Map(); }

  connection(platform) { return this.workerClients.get(platform) ?? this.pool; }

  async assertWorkerLock(platform) {
    const client = this.workerClients.get(platform);
    if (!client) throw Error("Provider worker lock is not held");
    const key = WORKER_LOCKS[platform];
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [key]);
    if (!rows[0]?.acquired) throw Error("Provider worker lock was lost");
    await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]);
  }

  async acquireWorkerLock(platform) {
    const key = WORKER_LOCKS[platform];
    if (!key) throw Error("Unsupported bot platform");
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [key]);
      if (!rows[0]?.acquired) throw Error("A worker already owns this provider");
      this.workerClients.set(platform, client);
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        this.workerClients.delete(platform);
        try { await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]); }
        catch { /* Closing the connection also releases the session lock. */ }
        finally { try { client.release(); } catch { /* The pool may already have discarded a broken connection. */ } }
      };
    } catch (error) {
      try { client.release(); } catch { /* The pool may already have discarded a broken connection. */ }
      throw error;
    }
  }

  async get(platform, chatId) {
    const { rows } = await this.connection(platform).query(
      `SELECT phase, position, answers FROM scent_bot_sessions
       WHERE platform = $1 AND chat_id = $2 AND expires_at > NOW()`,
      [platform, String(chatId)],
    );
    return rows[0] ? { phase: rows[0].phase, position: rows[0].position, answers: rows[0].answers } : null;
  }

  async put(platform, chatId, session) {
    await this.connection(platform).query(
      `INSERT INTO scent_bot_sessions (platform, chat_id, phase, position, answers, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW() + INTERVAL '30 days')
       ON CONFLICT (platform, chat_id)
       DO UPDATE SET phase = EXCLUDED.phase, position = EXCLUDED.position,
         answers = EXCLUDED.answers, updated_at = NOW(), expires_at = EXCLUDED.expires_at`,
      [platform, String(chatId), session.phase, session.position, JSON.stringify(session.answers)],
    );
  }

  async forget(platform, chatId) {
    await this.connection(platform).query('DELETE FROM scent_bot_sessions WHERE platform = $1 AND chat_id = $2', [platform, String(chatId)]);
  }

  async getOffset(platform) {
    const { rows } = await this.connection(platform).query('SELECT next_update_id FROM scent_bot_poll_offsets WHERE platform = $1', [platform]);
    return rows.length ? Number(rows[0].next_update_id) : 0;
  }

  /** Atomically deduplicates an update, commits its state/outbox effects, and advances polling. */
  async applyUpdate(platform, updateId, operation) {
    const client = this.workerClients.get(platform);
    if (!client) throw Error("Provider worker lock is not held");
    try {
      await this.assertWorkerLock(platform);
      await client.query("BEGIN");
      const { rows } = await client.query(
        'SELECT next_update_id FROM scent_bot_poll_offsets WHERE platform = $1 FOR UPDATE',
        [platform],
      );
      const current = rows.length ? Number(rows[0].next_update_id) : 0;
      if (updateId < current) {
        await client.query("ROLLBACK");
        return { duplicate: true };
      }
      const tx = {
        get: async (provider, chatId) => {
          const result = await client.query(
            `SELECT phase, position, answers FROM scent_bot_sessions
             WHERE platform = $1 AND chat_id = $2 AND expires_at > NOW()`,
            [provider, String(chatId)],
          );
          return result.rows[0] ? { phase: result.rows[0].phase, position: result.rows[0].position, answers: result.rows[0].answers } : null;
        },
        put: async (provider, chatId, session) => {
          await client.query(
            `INSERT INTO scent_bot_sessions (platform, chat_id, phase, position, answers, expires_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, NOW() + INTERVAL '30 days')
             ON CONFLICT (platform, chat_id)
             DO UPDATE SET phase = EXCLUDED.phase, position = EXCLUDED.position,
               answers = EXCLUDED.answers, updated_at = NOW(), expires_at = EXCLUDED.expires_at`,
            [provider, String(chatId), session.phase, session.position, JSON.stringify(session.answers)],
          );
        },
        forget: async (provider, chatId) => {
          await client.query('DELETE FROM scent_bot_sessions WHERE platform = $1 AND chat_id = $2', [provider, String(chatId)]);
          const deleted = await client.query('DELETE FROM scent_bot_outbox WHERE platform = $1 AND chat_id = $2', [provider, String(chatId)]);
          if (deleted.rowCount) await incrementMetric(client, provider, 'responses_cleared_by_forget', deleted.rowCount);
        },
        enqueue: async (chatId, view, mediaOrigin) => enqueueOrdinary(client, platform, chatId, view, mediaOrigin),
        enqueueControl: async (chatId, view, mediaOrigin, kind) => enqueueControl(client, platform, chatId, view, mediaOrigin, kind),
      };
      const result = await operation(tx);
      await client.query(
        `INSERT INTO scent_bot_poll_offsets (platform, next_update_id)
         VALUES ($1, $2) ON CONFLICT (platform)
         DO UPDATE SET next_update_id = GREATEST(scent_bot_poll_offsets.next_update_id, EXCLUDED.next_update_id), updated_at = NOW()`,
        [platform, String(updateId + 1)],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Connection may already be lost. */ }
      throw error;
    }
  }

  async claimNextDelivery(platform) {
    const client = this.workerClients.get(platform);
    if (!client) throw Error("Provider worker lock is not held");
    await this.assertWorkerLock(platform);
    const token = randomUUID();
    await client.query("BEGIN");
    try {
      const expired = await client.query('DELETE FROM scent_bot_outbox WHERE platform = $1 AND expires_at <= NOW()', [platform]);
      if (expired.rowCount) await incrementMetric(client, platform, 'responses_expired', expired.rowCount);
      const exhausted = await client.query(
        `DELETE FROM scent_bot_outbox
         WHERE platform = $1 AND delivery_attempts >= $2
           AND (delivery_lease_until IS NULL OR delivery_lease_until <= NOW())`,
        [platform, OUTBOX_LIMITS.attempts],
      );
      if (exhausted.rowCount) await incrementMetric(client, platform, 'responses_exhausted', exhausted.rowCount);
      const laneResult = await client.query('SELECT next_delivery_lane FROM scent_bot_delivery_metrics WHERE platform = $1 FOR UPDATE', [platform]);
      const preferred = laneResult.rows[0]?.next_delivery_lane ?? 'control';
      let selectedLane = preferred;
      let rows = await selectDelivery(client, platform, preferred);
      if (!rows[0]) {
        selectedLane = preferred === 'control' ? 'ordinary' : 'control';
        rows = await selectDelivery(client, platform, selectedLane);
      }
      if (!rows[0]) {
        await client.query("UPDATE scent_bot_delivery_metrics SET next_delivery_lane = $2 WHERE platform = $1", [platform, preferred]);
        await client.query("COMMIT");
        return null;
      }
      const row = rows[0];
      const claimed = await client.query(
        `UPDATE scent_bot_outbox
         SET delivery_attempts = delivery_attempts + 1,
             delivery_lease_until = NOW() + ($3::int * INTERVAL '1 millisecond'),
             delivery_lease_token = $2
         WHERE id = $1
         RETURNING id, chat_id, view, media_origin, delivery_attempts, delivery_lease_token, message_kind`,
        [row.id, token, OUTBOX_LIMITS.leaseMs],
      );
      await client.query("UPDATE scent_bot_delivery_metrics SET next_delivery_lane = $2, updated_at = NOW() WHERE platform = $1", [platform, selectedLane === 'control' ? 'ordinary' : 'control']);
      await client.query("COMMIT");
      return claimed.rows[0];
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* The pinned session may already be gone. */ }
      throw error;
    }
  }

  async recordDeliveryFailure(item) {
    const client = this.workerClients.get(item.platform);
    if (!client) throw Error("Provider worker lock is not held");
    const exhausted = item.delivery_attempts >= OUTBOX_LIMITS.attempts;
    if (exhausted) {
      await client.query("BEGIN");
      try {
        const result = await client.query(
          'DELETE FROM scent_bot_outbox WHERE id = $1 AND delivery_lease_token = $2',
          [item.id, item.delivery_lease_token],
        );
        if (result.rowCount) await incrementMetric(client, item.platform, 'responses_exhausted');
        await client.query("COMMIT");
        return { exhausted: result.rowCount > 0 };
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { /* The pinned session may already be gone. */ }
        throw error;
      }
    }
    const delay = Math.min(OUTBOX_LIMITS.backoffBaseMs * (2 ** (item.delivery_attempts - 1)), OUTBOX_LIMITS.backoffMaxMs);
    const result = await client.query(
      `UPDATE scent_bot_outbox
       SET available_at = NOW() + ($3::int * INTERVAL '1 millisecond'),
           delivery_lease_until = NULL, delivery_lease_token = NULL
       WHERE id = $1 AND delivery_lease_token = $2`,
      [item.id, item.delivery_lease_token, delay],
    );
    return { exhausted: false, scheduled: result.rowCount > 0, delayMs: delay };
  }

  async deliverReady(api, platform, { limit = 1 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw Error("Delivery batch limit must be between 1 and 10");
    const summary = { delivered: 0, failed: 0, exhausted: 0 };
    for (let index = 0; index < limit; index++) {
      const row = await this.claimNextDelivery(platform);
      if (!row) break;
      const item = { ...row, platform };
      try {
        await api.sendMessage(item.chat_id, item.view, item.media_origin);
        const client = this.workerClients.get(platform);
        await client.query(
          'DELETE FROM scent_bot_outbox WHERE id = $1 AND delivery_lease_token = $2',
          [item.id, item.delivery_lease_token],
        );
        summary.delivered++;
      } catch {
        const failure = await this.recordDeliveryFailure(item);
        if (failure.exhausted) summary.exhausted++;
        else if (failure.scheduled) summary.failed++;
      }
    }
    return summary;
  }

  async prune(platform) {
    const client=this.workerClients.values().next().value ?? this.pool;
    await client.query("BEGIN");
    try {
      await client.query('DELETE FROM scent_bot_sessions WHERE expires_at < NOW()');
      const expired = await client.query('DELETE FROM scent_bot_outbox WHERE platform = $1 AND expires_at <= NOW()', [platform]);
      if (expired.rowCount) await incrementMetric(client, platform, 'responses_expired', expired.rowCount);
      const exhausted = await client.query(
        'DELETE FROM scent_bot_outbox WHERE platform = $1 AND delivery_attempts >= $2 AND (delivery_lease_until IS NULL OR delivery_lease_until <= NOW())',
        [platform, OUTBOX_LIMITS.attempts],
      );
      if (exhausted.rowCount) await incrementMetric(client, platform, 'responses_exhausted', exhausted.rowCount);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* The pinned session may already be gone. */ }
      throw error;
    }
  }
}

async function incrementMetric(client, platform, name, count = 1) {
  const columns = new Set(['ordinary_omitted','busy_omitted','forget_confirmation_omitted','responses_expired','responses_exhausted','responses_cleared_by_forget']);
  if (!columns.has(name)) throw Error('Unsupported bot metric');
  await client.query(`UPDATE scent_bot_delivery_metrics SET ${name} = ${name} + $2, updated_at = NOW() WHERE platform = $1`, [platform, count]);
}

async function enqueueOrdinary(client, platform, chatId, view, mediaOrigin) {
  const counts = await client.query(`SELECT
    (SELECT COUNT(*)::int FROM scent_bot_outbox WHERE platform = $1 AND message_kind = 'ordinary') AS provider_count,
    (SELECT COUNT(*)::int FROM scent_bot_outbox WHERE platform = $1 AND chat_id = $2) AS chat_count`, [platform, String(chatId)]);
  if (counts.rows[0].provider_count >= OUTBOX_LIMITS.ordinaryPerProvider || counts.rows[0].chat_count >= OUTBOX_LIMITS.perChat) {
    await incrementMetric(client, platform, 'ordinary_omitted');
    return false;
  }
  await client.query("INSERT INTO scent_bot_outbox (platform, chat_id, view, media_origin, message_kind) VALUES ($1, $2, $3::jsonb, $4, 'ordinary')", [platform, String(chatId), JSON.stringify(view), mediaOrigin]);
  return true;
}

async function enqueueControl(client, platform, chatId, view, mediaOrigin, kind) {
  if (!['forget_confirmation','busy'].includes(kind)) throw Error('Unsupported bot control response');
  const metric = kind === 'busy' ? 'busy_omitted' : 'forget_confirmation_omitted';
  const already = await client.query("SELECT message_kind FROM scent_bot_outbox WHERE platform = $1 AND chat_id = $2 AND message_kind IN ('forget_confirmation','busy')", [platform, String(chatId)]);
  if (already.rows[0]?.message_kind === kind) {
    await client.query(`INSERT INTO scent_bot_outbox (platform, chat_id, view, media_origin, message_kind) VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT (platform, chat_id) WHERE message_kind IN ('forget_confirmation','busy') DO UPDATE SET view=EXCLUDED.view, media_origin=EXCLUDED.media_origin, available_at=NOW(), delivery_attempts=0, delivery_lease_until=NULL, delivery_lease_token=NULL, expires_at=NOW()+INTERVAL '30 days'`, [platform, String(chatId), JSON.stringify(view), mediaOrigin, kind]);
    return true;
  }
  const cap = kind === 'busy' ? OUTBOX_LIMITS.busyPerProvider : OUTBOX_LIMITS.forgetPerProvider;
  const counts = await client.query(`SELECT
    (SELECT COUNT(*)::int FROM scent_bot_outbox WHERE platform = $1 AND message_kind = $3) AS provider_count,
    (SELECT COUNT(*)::int FROM scent_bot_outbox WHERE platform = $1 AND chat_id = $2) AS chat_count`, [platform, String(chatId), kind]);
  if (already.rows.length || counts.rows[0].provider_count >= cap || counts.rows[0].chat_count >= OUTBOX_LIMITS.perChat) {
    await incrementMetric(client, platform, metric);
    return false;
  }
  await client.query("INSERT INTO scent_bot_outbox (platform, chat_id, view, media_origin, message_kind) VALUES ($1, $2, $3::jsonb, $4, $5)", [platform, String(chatId), JSON.stringify(view), mediaOrigin, kind]);
  return true;
}

async function selectDelivery(client, platform, lane) {
  const predicate = lane === 'control' ? "message_kind IN ('forget_confirmation','busy')" : "message_kind = 'ordinary'";
  const order = lane === 'control' ? "CASE message_kind WHEN 'forget_confirmation' THEN 0 ELSE 1 END, id" : 'id';
  const { rows } = await client.query(`SELECT o.id, o.chat_id, o.view, o.media_origin, o.delivery_attempts, o.message_kind
    FROM scent_bot_outbox o WHERE o.platform = $1 AND o.expires_at > NOW() AND o.available_at <= NOW()
      AND o.delivery_attempts < $2 AND (o.delivery_lease_until IS NULL OR o.delivery_lease_until <= NOW())
      AND ${predicate}
      AND NOT EXISTS (SELECT 1 FROM scent_bot_outbox prior WHERE prior.platform = o.platform AND prior.chat_id = o.chat_id AND prior.id < o.id)
    ORDER BY ${order} FOR UPDATE OF o SKIP LOCKED LIMIT 1`, [platform, OUTBOX_LIMITS.attempts]);
  return rows;
}
