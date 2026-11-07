const WORKER_LOCKS = { telegram: 780301, bale: 780302 };

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
          await client.query('DELETE FROM scent_bot_outbox WHERE platform = $1 AND chat_id = $2', [provider, String(chatId)]);
        },
        enqueue: async (chatId, view, mediaOrigin) => {
          await client.query(
            'INSERT INTO scent_bot_outbox (platform, chat_id, view, media_origin) VALUES ($1, $2, $3::jsonb, $4)',
            [platform, String(chatId), JSON.stringify(view), mediaOrigin],
          );
        },
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

  async deliverPending(api, platform) {
    const client = this.workerClients.get(platform);
    if (!client) throw Error("Provider worker lock is not held");
    for (;;) {
      await this.assertWorkerLock(platform);
      await client.query('DELETE FROM scent_bot_outbox WHERE platform = $1 AND expires_at <= NOW()', [platform]);
      const { rows } = await client.query(
        'SELECT id, chat_id, view, media_origin FROM scent_bot_outbox WHERE platform = $1 ORDER BY id LIMIT 1',
        [platform],
      );
      const item = rows[0];
      if (!item) return;
      await api.sendMessage(item.chat_id, item.view, item.media_origin);
      await client.query('DELETE FROM scent_bot_outbox WHERE id = $1', [item.id]);
    }
  }

  async prune() {
    const client=this.workerClients.values().next().value ?? this.pool;
    await client.query('DELETE FROM scent_bot_sessions WHERE expires_at < NOW()');
    await client.query('DELETE FROM scent_bot_outbox WHERE expires_at <= NOW()');
  }
}
