import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const localCompose = readFileSync(new URL("../compose.bots.yaml", import.meta.url), "utf8");
const productionCompose = readFileSync(new URL("../compose.prod.bots.yaml", import.meta.url), "utf8");
const swedenCompose = readFileSync(new URL("../compose.sweden.telegram.yaml", import.meta.url), "utf8");
const afraCompose = readFileSync(new URL("../compose.afra.bale.yaml", import.meta.url), "utf8");
const roleSql = readFileSync(new URL("../db/production/reconcile-bot-roles.sql", import.meta.url), "utf8");
const grantSql = readFileSync(new URL("../db/production/grant-bot-privileges.sql", import.meta.url), "utf8");
const databaseIsolationScriptUrl = new URL("../scripts/test-bot-database-isolation.sh", import.meta.url);
const databaseIsolationScript = readFileSync(databaseIsolationScriptUrl, "utf8");

test("opt-in bot overlays mount only the provider secrets at the paths workers and role SQL expect", () => {
  assert.match(localCompose, /source: telegram_bot_database_password\s+target: db_telegram_bot_password/);
  assert.match(localCompose, /source: bale_bot_database_password\s+target: db_bale_bot_password/);
  assert.match(roleSql, /\/run\/secrets\/db_telegram_bot_password/);
  assert.match(roleSql, /\/run\/secrets\/db_bale_bot_password/);
  assert.match(roleSql, /pg_shdepend/);
  assert.match(roleSql, /pg_terminate_backend/);
  assert.match(roleSql, /BEGIN;[\s\S]*COMMIT;/);
  for (const compose of [localCompose, productionCompose]) {
    const checkStart = compose.indexOf("for secret_file in /run/secrets/db_telegram_bot_password");
    const checkEnd = compose.indexOf("done", checkStart);
    assert.ok(checkStart >= 0 && checkEnd > checkStart, "provider secret validation must exist in both role services");
    const secretCheck = compose.slice(checkStart, checkEnd);
    assert.ok(secretCheck.includes("$" + "$" + "secret_file"), "shell variables must be escaped for Compose");
    assert.ok(secretCheck.includes("$" + "$" + "(awk"), "shell command substitutions must be escaped for Compose");
    assert.ok(secretCheck.includes("$" + "$" + "(printf"), "carriage-return validation must be escaped for Compose");
  }
  assert.match(grantSql, /pg_policies/);
  assert.match(grantSql, /former shared aroman_bot login must remain disabled/);
  assert.match(grantSql, /REVOKE ALL PRIVILEGES ON DATABASE/);
  assert.match(grantSql, /REVOKE ALL PRIVILEGES ON SCHEMA public/);
  assert.match(grantSql, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  assert.match(grantSql, /REVOKE EXECUTE ON FUNCTION public.aroman_create_waitlist_subscription/);
  assert.match(grantSql, /ALL ROUTINES IN SCHEMA public/);
  assert.match(grantSql, /pg_auth_members/);
  assert.match(grantSql, /pg_shdepend/);
  assert.match(grantSql, /Provider bot roles must be NOINHERIT/);
  assert.match(grantSql, /Provider role must remain NOLOGIN until its grants are complete/);
  assert.match(grantSql, /ALTER ROLE %I LOGIN/);
  assert.match(roleSql, /CREATE ROLE aroman_bot_telegram NOLOGIN/);
  assert.match(grantSql, /FROM PUBLIC;/);
  assert.match(localCompose, /profiles: \[bots, telegram\]/);
  assert.match(localCompose, /profiles: \[bots, bale\]/);
  assert.match(productionCompose, /profiles: \[provision-bot-roles\]/);
  assert.match(productionCompose, /profiles: \[bale\]/);
  assert.doesNotMatch(productionCompose, /telegram-bot:/);
  assert.match(productionCompose, /PGUSER: aroman_bot_bale/);
  assert.match(productionCompose, /BALE_BOT_DATABASE_PASSWORD_FILE: \/run\/secrets\/db_bale_bot_password/);
  assert.doesNotMatch(productionCompose, /depends_on:\s+bot-db-roles/);
});

test("Sweden and Afra topology overlays isolate providers and database ingress", () => {
  assert.match(swedenCompose, /PGHOST: \$\{AFRA_PRIVATE_DB_HOST:\?[^\n]+/);
  assert.match(swedenCompose, /PGPORT: \$\{AFRA_PRIVATE_DB_PORT:\?[^\n]+/);
  assert.match(swedenCompose, /PGUSER: aroman_bot_telegram/);
  assert.match(swedenCompose, /TELEGRAM_BOT_TOKEN_FILE:/);
  assert.match(swedenCompose, /TELEGRAM_BOT_DATABASE_PASSWORD_FILE:/);
  assert.doesNotMatch(swedenCompose, /bale-bot:|telegram-bot:.*ports:|^\s{2}(db|web|migrate):/m);
  assert.doesNotMatch(swedenCompose, /ports:/);
  assert.match(swedenCompose, /read_only: true/);
  assert.match(swedenCompose, /cap_drop:\s+- ALL/);
  assert.match(swedenCompose, /restart: unless-stopped/);
  const runner = readFileSync(new URL("../scripts/run-scent-companion.mjs", import.meta.url), "utf8");
  assert.match(runner, /DATABASE_SSL==="true"\?\{rejectUnauthorized:true\}/);
  assert.doesNotMatch(runner, /DATABASE_SSL_REJECT_UNAUTHORIZED/);

  assert.match(afraCompose, /PGUSER: aroman_bot_bale/);
  assert.match(afraCompose, /BALE_BOT_TOKEN_FILE:/);
  assert.match(afraCompose, /BALE_BOT_DATABASE_PASSWORD_FILE:/);
  assert.match(afraCompose, /afra-bot-database:\s+driver: bridge\s+internal: true/);
  assert.match(afraCompose, /bale-bot:[\s\S]*?networks:\s+- afra-bot-database\s+- bot-egress/);
  assert.doesNotMatch(afraCompose, /telegram-bot:|ports:|bot-db-roles:|migrate:/);
  assert.match(afraCompose, /restart: unless-stopped/);
});

test("disposable PostgreSQL bot isolation harness is syntax-valid and loopback-only", () => {
  execFileSync("bash", ["-n", fileURLToPath(databaseIsolationScriptUrl)]);
  assert.ok(databaseIsolationScript.includes("postgres:16.15-alpine@sha256:"));
  assert.ok(databaseIsolationScript.includes('--publish "127.0.0.1:${port}:5432"'));
  assert.ok(databaseIsolationScript.includes("synthetic_ci_admin_pw_16_14"));
  assert.ok(databaseIsolationScript.includes("synthetic_bot_owned_probe"));
  assert.ok(databaseIsolationScript.includes('== "f|f"'));
  assert.ok(databaseIsolationScript.includes('== "f|t"'));
  assert.ok(databaseIsolationScript.includes('== "t|t"'));
  assert.ok(databaseIsolationScript.includes("DISABLE ROW LEVEL SECURITY"));
  assert.ok(databaseIsolationScript.includes("tests/scent-bot-postgres.integration.test.mjs"));
  assert.ok(databaseIsolationScript.includes("docker rm -f"));
});
