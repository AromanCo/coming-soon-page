import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";
import { test } from "node:test";

const connectionString = process.env.BOT_TEST_TELEGRAM_DATABASE_URL;
let safe = false;
try {
  const url = new URL(connectionString);
  safe = ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname === "/bot_test";
} catch { /* Missing/invalid URLs keep this destructive-capable test skipped. */ }

test("Telegram provider database role is least privilege", { skip: safe ? false : "requires BOT_TEST_TELEGRAM_DATABASE_URL pointing to loopback database /bot_test" }, async () => {
  const pool = new pg.Pool({ connectionString, max: 1 });
  const platform = "telegram";
  const chatId = `synthetic-privilege-${Date.now()}`;
  try {
    const checks = (await pool.query(`
      SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolinherit, r.rolbypassrls,
        has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
        has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
        has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
        has_table_privilege(current_user, 'public.scent_bot_sessions', 'SELECT,INSERT,UPDATE,DELETE') AS sessions_dml,
        has_table_privilege(current_user, 'public.scent_bot_poll_offsets', 'SELECT,INSERT,UPDATE,DELETE') AS offsets_dml,
        has_table_privilege(current_user, 'public.scent_bot_outbox', 'SELECT,INSERT,UPDATE,DELETE') AS outbox_dml,
        has_table_privilege(current_user, 'public.scent_bot_delivery_metrics', 'SELECT') AS metrics_select,
        has_table_privilege(current_user, 'public.scent_bot_delivery_metrics', 'UPDATE') AS metrics_update,
        has_table_privilege(current_user, 'public.scent_bot_delivery_metrics', 'INSERT') AS metrics_insert,
        has_table_privilege(current_user, 'public.scent_bot_delivery_metrics', 'DELETE') AS metrics_delete,
        has_sequence_privilege(current_user, 'public.scent_bot_outbox_id_seq', 'USAGE') AS outbox_sequence,
        has_table_privilege(current_user, 'public.waitlist_subscriptions', 'SELECT') AS waitlist_read
      FROM pg_roles r WHERE r.rolname = current_user
    `)).rows[0];
    assert.equal(checks.rolsuper, false);
    assert.equal(checks.rolcreatedb, false);
    assert.equal(checks.rolcreaterole, false);
    assert.equal(checks.rolreplication, false);
    assert.equal(checks.rolinherit, false);
    assert.equal(checks.rolbypassrls, false);
    for (const key of ["can_connect", "schema_usage", "sessions_dml", "offsets_dml", "outbox_dml", "outbox_sequence", "metrics_select", "metrics_update"]) assert.equal(checks[key], true, `${key} should be granted`);
    assert.equal(checks.metrics_insert, false);
    assert.equal(checks.metrics_delete, false);
    assert.equal(checks.schema_create, false);
    assert.equal(checks.waitlist_read, false);

    await assert.rejects(pool.query("CREATE TABLE public.synthetic_bot_role_probe (id integer)"));
    await assert.rejects(pool.query("SELECT * FROM public.waitlist_subscriptions LIMIT 1"));
    assert.equal((await pool.query("SELECT session_user")).rows[0].session_user, "aroman_bot_telegram");
    await pool.query("INSERT INTO scent_bot_sessions (platform, chat_id, phase) VALUES ($1,$2,'welcome')", [platform, chatId]);
    await pool.query("UPDATE scent_bot_sessions SET position=1 WHERE platform=$1 AND chat_id=$2", [platform, chatId]);
    await pool.query("DELETE FROM scent_bot_sessions WHERE platform=$1 AND chat_id=$2", [platform, chatId]);
    await pool.query("INSERT INTO scent_bot_poll_offsets (platform,next_update_id) VALUES ($1,1)", [platform]);
    await pool.query("UPDATE scent_bot_poll_offsets SET next_update_id=2 WHERE platform=$1", [platform]);
    await pool.query("DELETE FROM scent_bot_poll_offsets WHERE platform=$1", [platform]);
    await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,$2,'{}'::jsonb)", [platform, chatId]);
    await pool.query("UPDATE scent_bot_outbox SET media_origin='https://example.test' WHERE platform=$1 AND chat_id=$2", [platform, chatId]);
    await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2", [platform, chatId]);
    await pool.query("UPDATE scent_bot_delivery_metrics SET ordinary_omitted=ordinary_omitted+1 WHERE platform=$1", [platform]);
    await assert.rejects(pool.query("DELETE FROM scent_bot_delivery_metrics WHERE platform=$1", [platform]));
  } finally { await pool.end(); }
});
