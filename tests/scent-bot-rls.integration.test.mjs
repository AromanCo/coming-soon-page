import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
import pg from "pg";
import { test } from "node:test";
import { PostgresSessionStore } from "../src/bots/store.mjs";

const adminUrl = process.env.BOT_TEST_DATABASE_URL;
const hasAdminUrl = adminUrl !== undefined;
let parsedAdminUrl = null;
try {
  const candidate = new URL(adminUrl);
  if (["postgres:", "postgresql:"].includes(candidate.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(candidate.hostname) &&
      candidate.username && candidate.password && candidate.pathname === "/bot_test") {
    parsedAdminUrl = candidate;
  }
} catch { /* An explicitly configured invalid URL must fail before connecting. */ }
let parsedAdminUsername = "";
try { if (parsedAdminUrl) parsedAdminUsername = parsedAdminUsername; } catch { /* Invalid percent-encoding is unsafe. */ }
const safe = Boolean(parsedAdminUrl && parsedAdminUsername);

const syntheticLogins = {
  telegram: { role: "aroman_bot_telegram", password: "synthetic_telegram_pw_16_14" },
  bale: { role: "aroman_bot_bale", password: "synthetic_bale_pw_16_14" },
  migration: { role: "aroman_migrate_test", password: "synthetic_migration_pw_16_14" },
  app: { role: "aroman_app", password: "synthetic_app_pw_16_14" },
  unknown: { role: "aroman_bot_unknown_test", password: "synthetic_unknown_pw_16_14" },
};

test("Scent Companion provider row isolation with independent PostgreSQL logins", { skip: hasAdminUrl ? false : "requires BOT_TEST_DATABASE_URL on loopback database /bot_test" }, async () => {
  assert.ok(safe, "Refusing to run: BOT_TEST_DATABASE_URL must use PostgreSQL, loopback, a password, and the /bot_test database");
  const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  const pools = {};
  let migrationPool;
  const stamp = Date.now();
  const chats = { telegram: `synthetic-rls-tg-${stamp}`, bale: `synthetic-rls-bale-${stamp}` };
  try {
    const adminIdentity = (await admin.query("SELECT current_database() AS db, session_user AS role, r.rolsuper FROM pg_roles r WHERE r.rolname=session_user")).rows[0];
    assert.equal(adminIdentity.db, "bot_test");
    assert.equal(adminIdentity.role, decodeURIComponent(parsedAdminUrl.username));
    assert.equal(adminIdentity.rolsuper, true, "isolated fixture requires a disposable database administrator");

    for (const migration of [
      "001_create_waitlist.sql",
      "002_add_phone_waitlist.sql",
      "003_create_scent_bot_sessions.sql",
      "004_add_scent_bot_outbox.sql",
      "006_bound_bot_delivery_retries.sql",
      "007_bounded_bot_control_queue_metrics.sql",
      "008_isolate_bot_provider_rows.sql",
    ]) {
      const sql = await readFile(`db/migrations/${migration}`, "utf8");
      await admin.query(sql);
      await admin.query(sql);
    }

    for (const { role, password } of Object.values(syntheticLogins)) {
      const exists = (await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount > 0;
      if (!exists) await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
      await admin.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
    }
    await admin.query(`
      DO $$ DECLARE edge RECORD; BEGIN
        FOR edge IN
          SELECT granted.rolname AS granted_role, member.rolname AS member_role
          FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
          WHERE granted.rolname IN ('aroman_bot_telegram','aroman_bot_bale')
             OR member.rolname IN ('aroman_bot_telegram','aroman_bot_bale')
        LOOP EXECUTE format('REVOKE %I FROM %I', edge.granted_role, edge.member_role); END LOOP;
      END $$`);
    await admin.query("ALTER SCHEMA public OWNER TO aroman_migrate_test");
    await admin.query("GRANT USAGE, CREATE ON SCHEMA public TO aroman_migrate_test");
    for (const table of ["scent_bot_sessions", "scent_bot_poll_offsets", "scent_bot_outbox", "scent_bot_delivery_metrics", "waitlist_subscriptions", "waitlist_rate_limits"]) {
      await admin.query(`ALTER TABLE public.${table} OWNER TO aroman_migrate_test`);
    }
    await admin.query("ALTER SEQUENCE public.scent_bot_outbox_id_seq OWNER TO aroman_migrate_test");
    await admin.query("GRANT CONNECT ON DATABASE bot_test TO aroman_bot_telegram, aroman_bot_bale, aroman_migrate_test, aroman_app, aroman_bot_unknown_test");
    await admin.query("GRANT USAGE ON SCHEMA public TO aroman_bot_telegram, aroman_bot_bale, aroman_app, aroman_bot_unknown_test");
    await admin.query("GRANT SELECT ON scent_bot_sessions, scent_bot_poll_offsets, scent_bot_outbox, scent_bot_delivery_metrics TO aroman_bot_unknown_test");

    for (const role of ["aroman_bot_telegram", "aroman_bot_bale"]) {
      await admin.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`);
      await admin.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON scent_bot_sessions, scent_bot_poll_offsets, scent_bot_outbox TO ${role}`);
      await admin.query(`GRANT SELECT, UPDATE ON scent_bot_delivery_metrics TO ${role}`);
      await admin.query(`GRANT USAGE ON SEQUENCE scent_bot_outbox_id_seq TO ${role}`);
    }
    // Repeat the grant reconciliation to confirm it neither accumulates grants nor fails.
    for (const role of ["aroman_bot_telegram", "aroman_bot_bale"]) {
      await admin.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`);
      await admin.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON scent_bot_sessions, scent_bot_poll_offsets, scent_bot_outbox TO ${role}`);
      await admin.query(`GRANT SELECT, UPDATE ON scent_bot_delivery_metrics TO ${role}`);
      await admin.query(`GRANT USAGE ON SEQUENCE scent_bot_outbox_id_seq TO ${role}`);
    }

    const host = new URL(adminUrl);
    for (const [platform, { role, password }] of Object.entries(syntheticLogins)) {
      const connectionString = `postgres://${encodeURIComponent(role)}:${encodeURIComponent(password)}@${host.hostname}:${host.port || 5432}/bot_test`;
      pools[platform] = new pg.Pool({ connectionString, max: 2 });
    }
    migrationPool = pools.migration;

    await admin.query("INSERT INTO scent_bot_sessions (platform,chat_id,phase) VALUES ('telegram',$1,'quick'),('bale',$2,'deep')", [chats.telegram, chats.bale]);
    await admin.query("INSERT INTO scent_bot_poll_offsets (platform,next_update_id) VALUES ('telegram',100),('bale',200)");
    await admin.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ('telegram',$1,'{}'),('bale',$2,'{}')", [chats.telegram, chats.bale]);

    for (const platform of ["telegram", "bale"]) {
      const client = pools[platform];
      const other = platform === "telegram" ? "bale" : "telegram";
      const own = (await client.query("SELECT platform,chat_id FROM scent_bot_sessions ORDER BY platform")).rows;
      assert.deepEqual(own, [{ platform, chat_id: chats[platform] }], `${platform} must only see its own session rows`);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM scent_bot_sessions WHERE platform=$1", [other])).rows[0].n, 0, "spoofed provider parameters cannot bypass RLS");
      assert.equal((await client.query("SELECT count(*)::int AS n FROM scent_bot_poll_offsets")).rows[0].n, 1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM scent_bot_outbox")).rows[0].n, 1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM scent_bot_delivery_metrics")).rows[0].n, 1);

      await client.query("SELECT set_config('app.provider', $1, false)", [other]);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM scent_bot_sessions")).rows[0].n, 1, "writable custom settings do not determine provider identity");
      await assert.rejects(client.query(`SET ROLE ${syntheticLogins[other].role}`));
      assert.equal((await client.query("SELECT has_table_privilege(current_user,'public.waitlist_subscriptions','SELECT') AS can_read")).rows[0].can_read, false);
      await assert.rejects(client.query("SELECT * FROM waitlist_subscriptions LIMIT 1"));
      const protectedFunction = (await client.query("SELECT to_regprocedure('public.aroman_create_waitlist_subscription(text,text,text)') AS signature")).rows[0].signature;
      if (protectedFunction) {
        assert.equal((await client.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS can_execute", [protectedFunction])).rows[0].can_execute, false, "provider roles cannot invoke waitlist SECURITY DEFINER functions");
      }

      const crossUpdate = await client.query("UPDATE scent_bot_sessions SET phase='deep' WHERE platform=$1 AND chat_id=$2", [other, chats[other]]);
      const crossSessionDelete = await client.query("DELETE FROM scent_bot_sessions WHERE platform=$1 AND chat_id=$2", [other, chats[other]]);
      const crossOffsetUpdate = await client.query("UPDATE scent_bot_poll_offsets SET next_update_id=999 WHERE platform=$1", [other]);
      const crossOffsetDelete = await client.query("DELETE FROM scent_bot_poll_offsets WHERE platform=$1", [other]);
      const crossOutboxUpdate = await client.query("UPDATE scent_bot_outbox SET view='{}' WHERE platform=$1 AND chat_id=$2", [other, chats[other]]);
      const crossDelete = await client.query("DELETE FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2", [other, chats[other]]);
      assert.equal(crossUpdate.rowCount, 0);
      assert.equal(crossSessionDelete.rowCount, 0);
      assert.equal(crossOffsetUpdate.rowCount, 0);
      assert.equal(crossOffsetDelete.rowCount, 0);
      assert.equal(crossOutboxUpdate.rowCount, 0);
      assert.equal(crossDelete.rowCount, 0);
      await assert.rejects(client.query("INSERT INTO scent_bot_sessions (platform,chat_id,phase) VALUES ($1,'synthetic-rls-spoof','quick')", [other]), error => error.code === "42501");
      await assert.rejects(client.query("UPDATE scent_bot_sessions SET platform=$1 WHERE chat_id=$2", [other, chats[platform]]), error => error.code === "42501");
      await assert.rejects(client.query("INSERT INTO scent_bot_poll_offsets (platform,next_update_id) VALUES ($1,999)", [other]), error => error.code === "42501");
      await assert.rejects(client.query("UPDATE scent_bot_poll_offsets SET platform=$1 WHERE platform=$2", [other, platform]), error => error.code === "42501");
      await assert.rejects(client.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,'synthetic-rls-spoof','{}')", [other]), error => error.code === "42501");
      await assert.rejects(client.query("UPDATE scent_bot_outbox SET platform=$1 WHERE chat_id=$2", [other, chats[platform]]), error => error.code === "42501");
      assert.equal((await client.query("UPDATE scent_bot_delivery_metrics SET ordinary_omitted=ordinary_omitted+1 WHERE platform=$1", [other])).rowCount, 0);
      await assert.rejects(client.query("UPDATE scent_bot_delivery_metrics SET platform=$1 WHERE platform=$2", [other, platform]), error => error.code === "42501");
      await assert.rejects(client.query("DELETE FROM scent_bot_delivery_metrics WHERE platform=$1", [other]));
      assert.equal((await client.query("SELECT has_sequence_privilege(current_user,'public.scent_bot_outbox_id_seq','USAGE') AS can_use")).rows[0].can_use, true);

      const roleInfo = (await client.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolinherit,
        has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect,
        has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
        has_schema_privilege(current_user,'public','CREATE') AS schema_create,
        pg_has_role(current_user,$1,'MEMBER') AS other_membership
        FROM pg_roles r WHERE r.rolname=session_user`, [syntheticLogins[other].role])).rows[0];
      for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls", "rolinherit", "schema_create", "other_membership"]) assert.equal(roleInfo[key], false, `${platform} ${key} must be false`);
      for (const key of ["can_connect", "schema_usage"]) assert.equal(roleInfo[key], true);

      await client.query("DELETE FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2", [platform, chats[platform]]);
      const workerStore = new PostgresSessionStore(pools[platform]);
      const release = await workerStore.acquireWorkerLock(platform);
      try {
        const nextOffset = await workerStore.getOffset(platform);
        await workerStore.applyUpdate(platform, nextOffset, async tx => {
          await tx.put(platform, chats[platform], { phase: "quick", position: 1, answers: { Q09: "الف" } });
          return tx.enqueue(chats[platform], { text: `synthetic ${platform} delivery`, rows: [] }, "");
        });
        const sent = [];
        await workerStore.deliverReady({ sendMessage: async (chat, view) => sent.push([chat, view.text]) }, platform);
        assert.deepEqual(sent, [[chats[platform], `synthetic ${platform} delivery`]], `${platform} lock and outbox operations must work through its own login`);
      } finally { await release(); }
    }

    for (const table of ["scent_bot_sessions", "scent_bot_poll_offsets", "scent_bot_outbox", "scent_bot_delivery_metrics"]) {
      assert.equal((await pools.unknown.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, `unknown login must fail closed on ${table}`);
    }

    const migrationProof = await migrationPool.query("SELECT session_user, count(*)::int AS rows FROM scent_bot_sessions");
    assert.equal(migrationProof.rows[0].session_user, "aroman_migrate_test");
    assert.equal(migrationProof.rows[0].rows, 2, "trusted migration owner without FORCE RLS can inspect both providers");
    await migrationPool.query("INSERT INTO scent_bot_sessions (platform,chat_id,phase) VALUES ('bale','synthetic-rls-restore','welcome')");
    assert.equal((await migrationPool.query("DELETE FROM scent_bot_sessions WHERE chat_id='synthetic-rls-restore'")).rowCount, 1, "migration owner can restore and clean data across providers");
    assert.equal((await pools.app.query("SELECT has_table_privilege(current_user,'public.waitlist_subscriptions','SELECT') AS can_read")).rows[0].can_read, false, "app role still cannot directly read waitlist records");
    await assert.rejects(pools.app.query("SELECT * FROM waitlist_subscriptions LIMIT 1"));
    const registerFunction = (await pools.app.query("SELECT to_regprocedure('public.aroman_register_rate_limit(text)') AS signature")).rows[0].signature;
    if (registerFunction) assert.equal((await pools.app.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS can_execute", [registerFunction])).rows[0].can_execute, true, "app keeps the existing rate-limit entry point");
    const subscriptionFunction = (await pools.app.query("SELECT to_regprocedure('public.aroman_create_waitlist_subscription(text,text,text)') AS signature")).rows[0].signature;
    if (subscriptionFunction) assert.equal((await pools.app.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS can_execute", [subscriptionFunction])).rows[0].can_execute, true, "app keeps the existing waitlist entry point");
    const rlsState = (await admin.query(`SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner
      FROM pg_class WHERE relname IN ('scent_bot_sessions','scent_bot_poll_offsets','scent_bot_outbox','scent_bot_delivery_metrics') ORDER BY relname`)).rows;
    assert.equal(rlsState.length, 4);
    assert.ok(rlsState.every(row => row.relrowsecurity && !row.relforcerowsecurity && row.owner === "aroman_migrate_test"));
  } finally {
    for (const pool of Object.values(pools)) await pool.end();
    await admin.query("DELETE FROM scent_bot_outbox WHERE chat_id LIKE 'synthetic-rls-%'").catch(() => {});
    await admin.query("DELETE FROM scent_bot_sessions WHERE chat_id LIKE 'synthetic-rls-%'").catch(() => {});
    await admin.query("DELETE FROM scent_bot_poll_offsets WHERE platform IN ('telegram','bale')").catch(() => {});
    await admin.end();
  }
});
