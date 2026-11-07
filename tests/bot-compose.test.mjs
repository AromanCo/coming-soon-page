import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const localCompose = readFileSync(new URL("../compose.bots.yaml", import.meta.url), "utf8");
const productionCompose = readFileSync(new URL("../compose.prod.bots.yaml", import.meta.url), "utf8");
const roleSql = readFileSync(new URL("../db/production/reconcile-bot-roles.sql", import.meta.url), "utf8");

test("opt-in bot overlays mount only the provider secrets at the paths workers and role SQL expect", () => {
  assert.match(localCompose, /source: telegram_bot_database_password\s+target: db_telegram_bot_password/);
  assert.match(localCompose, /source: bale_bot_database_password\s+target: db_bale_bot_password/);
  assert.match(roleSql, /\/run\/secrets\/db_telegram_bot_password/);
  assert.match(roleSql, /\/run\/secrets\/db_bale_bot_password/);
  assert.match(localCompose, /profiles: \[bots, telegram\]/);
  assert.match(localCompose, /profiles: \[bots, bale\]/);
  assert.match(productionCompose, /profiles: \[telegram, bots\]/);
  assert.match(productionCompose, /profiles: \[bale, bots\]/);
  assert.match(productionCompose, /TELEGRAM_BOT_DATABASE_PASSWORD_FILE: \/run\/secrets\/db_telegram_bot_password/);
  assert.match(productionCompose, /BALE_BOT_DATABASE_PASSWORD_FILE: \/run\/secrets\/db_bale_bot_password/);
});
