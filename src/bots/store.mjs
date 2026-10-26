/** PostgreSQL persistence. No user names, phones, message bodies or marketing consent stored. */
export class PostgresSessionStore {
  constructor(pool) { this.pool = pool; }

  async get(platform, chatId) {
    const { rows } = await this.pool.query(
      `SELECT phase, position, answers FROM scent_bot_sessions
       WHERE platform = $1 AND chat_id = $2 AND expires_at > NOW()`,
      [platform, String(chatId)],
    );
    return rows[0] ? { phase: rows[0].phase, position: rows[0].position, answers: rows[0].answers } : null;
  }

  async put(platform, chatId, session) {
    await this.pool.query(
      `INSERT INTO scent_bot_sessions (platform, chat_id, phase, position, answers, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW() + INTERVAL '30 days')
       ON CONFLICT (platform, chat_id)
       DO UPDATE SET phase = EXCLUDED.phase, position = EXCLUDED.position,
         answers = EXCLUDED.answers, updated_at = NOW(), expires_at = EXCLUDED.expires_at`,
      [platform, String(chatId), session.phase, session.position, JSON.stringify(session.answers)],
    );
  }

  async forget(platform, chatId) {
    await this.pool.query('DELETE FROM scent_bot_sessions WHERE platform = $1 AND chat_id = $2', [platform, String(chatId)]);
  }

  async getOffset(platform) {
    const { rows } = await this.pool.query('SELECT next_update_id FROM scent_bot_poll_offsets WHERE platform = $1', [platform]);
    return rows.length ? Number(rows[0].next_update_id) : 0;
  }

  async saveOffset(platform, nextId) {
    await this.pool.query(
      `INSERT INTO scent_bot_poll_offsets (platform, next_update_id) VALUES ($1, $2)
       ON CONFLICT (platform) DO UPDATE SET next_update_id = GREATEST(scent_bot_poll_offsets.next_update_id, EXCLUDED.next_update_id)`,
      [platform, String(nextId)],
    );
  }

  async prune() {
    await this.pool.query('DELETE FROM scent_bot_sessions WHERE expires_at < NOW()');
  }
}
