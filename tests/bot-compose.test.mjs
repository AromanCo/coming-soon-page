import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const localCompose = readFileSync(new URL("../compose.bots.yaml", import.meta.url), "utf8");
const productionCompose = readFileSync(new URL("../compose.prod.bots.yaml", import.meta.url), "utf8");
const swedenCompose = readFileSync(new URL("../compose.sweden.telegram.yaml", import.meta.url), "utf8");
const afraCompose = readFileSync(new URL("../compose.afra.bale.yaml", import.meta.url), "utf8");
const roleSql = readFileSync(new URL("../db/production/reconcile-bot-roles.sql", import.meta.url), "utf8");

test("opt-in bot overlays mount only the provider secrets at the paths workers and role SQL expect", () => {
  assert.match(localCompose, /source: telegram_bot_database_password\s+target: db_telegram_bot_password/);
  assert.match(localCompose, /source: bale_bot_database_password\s+target: db_bale_bot_password/);
  assert.match(roleSql, /\/run\/secrets\/db_telegram_bot_password/);
  assert.match(roleSql, /\/run\/secrets\/db_bale_bot_password/);
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
