import assert from "node:assert/strict";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";
import { test } from "node:test";

const connectionString = process.env.BOT_TEST_TELEGRAM_DATABASE_URL;
const hasDatabaseConfiguration = connectionString !== undefined;
let parsedUrl = null;
try {
  const candidate = new URL(connectionString);
  if (["postgres:", "postgresql:"].includes(candidate.protocol) && candidate.hostname && candidate.username && candidate.password && candidate.pathname === "/bot_test") parsedUrl = candidate;
} catch { /* An explicitly configured invalid URL must fail, not silently skip. */ }
const safe = Boolean(parsedUrl &&
  ["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname) &&
  decodeURIComponent(parsedUrl.username) === "aroman_bot_telegram");

test("Telegram provider database role is least privilege", { skip: hasDatabaseConfiguration ? false : "requires BOT_TEST_TELEGRAM_DATABASE_URL pointing to loopback database /bot_test" }, async () => {
  assert.ok(safe, "Refusing to run: BOT_TEST_TELEGRAM_DATABASE_URL must use the loopback /bot_test database and aroman_bot_telegram login");
  const pool = new pg.Pool({ connectionString, max: 1 });
  const platform = "telegram";
  const chatId = `synthetic-privilege-${Date.now()}`;
  try {
    const identity = (await pool.query("SELECT current_database() AS name, session_user AS role")).rows[0];
    assert.deepEqual(identity, { name: "bot_test", role: "aroman_bot_telegram" });
    const checks = (await pool.query(`
      SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolinherit, r.rolbypassrls,
        has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
        has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
        has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
        has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname IN ('scent_bot_sessions','scent_bot_poll_offsets','scent_bot_outbox','scent_bot_delivery_metrics','scent_bot_outbox_id_seq')
            AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS bot_owns_relations,
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
    assert.equal(checks.database_create, false);
    assert.equal(checks.bot_owns_relations, 0, "provider role must not own bot tables or sequences");
    assert.equal(checks.metrics_insert, false);
    assert.equal(checks.metrics_delete, false);
    assert.equal(checks.schema_create, false);
    assert.equal(checks.waitlist_read, false);

    const policyCount = (await pool.query(`
      SELECT count(*)::int AS n FROM pg_policies
      WHERE schemaname='public'
        AND tablename = ANY($1::text[])
        AND policyname='scent_bot_provider_isolation'
        AND cmd='ALL'
        AND qual ILIKE '%session_user%'
        AND qual ILIKE '%aroman_bot_telegram%'
        AND qual ILIKE '%aroman_bot_bale%'
        AND with_check ILIKE '%session_user%'
        AND with_check ILIKE '%aroman_bot_telegram%'
        AND with_check ILIKE '%aroman_bot_bale%'
    `, [["scent_bot_sessions", "scent_bot_poll_offsets", "scent_bot_outbox", "scent_bot_delivery_metrics"]])).rows[0].n;
    assert.equal(policyCount, 4, "all bot tables must retain the provider session_user policy");

    for (const signature of [
      "public.aroman_register_rate_limit(text)",
      "public.aroman_create_waitlist_subscription(text,text,text)",
    ]) {
      const functionName = (await pool.query("SELECT to_regprocedure($1) AS signature", [signature])).rows[0].signature;
      if (functionName) {
        const canExecute = (await pool.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed", [functionName])).rows[0].allowed;
        assert.equal(canExecute, false, `provider role must not execute ${signature}`);
      }
    }

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
    await pool.query("BEGIN");
    try {
      await pool.query("UPDATE scent_bot_delivery_metrics SET ordinary_omitted=ordinary_omitted+1 WHERE platform=$1", [platform]);
      await pool.query("ROLLBACK");
    } catch (error) {
      await pool.query("ROLLBACK").catch(() => {});
      throw error;
    }
    await assert.rejects(pool.query("DELETE FROM scent_bot_delivery_metrics WHERE platform=$1", [platform]));
  } finally { await pool.end(); }
});
