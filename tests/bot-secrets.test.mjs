import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readBotConfiguration } from "../src/bots/secrets.mjs";

test("bot credentials load from secret files and PostgreSQL password files", () => {
  const dir = mkdtempSync(join(tmpdir(), "aroman-bot-secret-test-"));
  try {
    const tokenFile = join(dir, "token");
    const passwordFile = join(dir, "password");
    writeFileSync(tokenFile, "synthetic-token\n", { mode: 0o600 });
    writeFileSync(passwordFile, "synthetic-db-password\n", { mode: 0o600 });
    const result = readBotConfiguration({
      TELEGRAM_BOT_TOKEN_FILE: tokenFile,
      PGHOST: "127.0.0.1", PGPORT: "55439", PGDATABASE: "bot_test", PGUSER: "aroman_bot_test",
      BOT_DATABASE_PASSWORD_FILE: passwordFile,
    }, "telegram");
    assert.equal(result.token, "synthetic-token");
    assert.deepEqual(result.database, { host: "127.0.0.1", port: 55439, database: "bot_test", user: "aroman_bot_test", password: "synthetic-db-password" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("legacy environment credentials remain supported", () => {
  assert.deepEqual(readBotConfiguration({
    BALE_BOT_TOKEN: "synthetic-token", BOT_DATABASE_URL: "postgres://bot:synthetic@127.0.0.1:5432/bot_test",
  }, "bale"), { token: "synthetic-token", database: "postgres://bot:synthetic@127.0.0.1:5432/bot_test" });
});

test("Telegram and Bale load distinct database password files", () => {
  const dir = mkdtempSync(join(tmpdir(), "aroman-provider-secret-test-"));
  try {
    const telegram = join(dir, "telegram-password");
    const bale = join(dir, "bale-password");
    writeFileSync(telegram, "telegram-synthetic-password\n", { mode: 0o600 });
    writeFileSync(bale, "bale-synthetic-password\n", { mode: 0o600 });
    const shared = { PGHOST: "127.0.0.1", PGPORT: "55439", PGDATABASE: "bot_test" };
    assert.equal(readBotConfiguration({ ...shared, PGUSER: "aroman_bot_telegram", TELEGRAM_BOT_TOKEN: "test", TELEGRAM_BOT_DATABASE_PASSWORD_FILE: telegram }, "telegram").database.password, "telegram-synthetic-password");
    assert.equal(readBotConfiguration({ ...shared, PGUSER: "aroman_bot_bale", BALE_BOT_TOKEN: "test", BALE_BOT_DATABASE_PASSWORD_FILE: bale }, "bale").database.password, "bale-synthetic-password");
    assert.throws(() => readBotConfiguration({ ...shared, PGUSER: "aroman_bot_telegram", TELEGRAM_BOT_TOKEN: "test", TELEGRAM_BOT_DATABASE_PASSWORD_FILE: telegram, BALE_BOT_DATABASE_PASSWORD_FILE: bale }, "telegram"), /Ambiguous bot database credentials/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ambiguous or malformed secrets fail without echoing contents", () => {
  const secret = "synthetic-secret-do-not-print";
  assert.throws(() => readBotConfiguration({
    TELEGRAM_BOT_TOKEN: secret, TELEGRAM_BOT_TOKEN_FILE: "/not/read", BOT_DATABASE_URL: "postgres://a:b@localhost/db",
  }, "telegram"), /Set only one of TELEGRAM_BOT_TOKEN/);
  assert.throws(() => readBotConfiguration({
    TELEGRAM_BOT_TOKEN: secret, BOT_DATABASE_URL: "postgres://a:b@localhost/db", DATABASE_URL: "postgres://c:d@localhost/db",
  }, "telegram"), /Ambiguous bot database credentials/);
  assert.throws(() => readBotConfiguration({
    TELEGRAM_BOT_TOKEN: secret, BOT_DATABASE_URL: "postgres://a:b@localhost/db", PGHOST: "localhost",
  }, "telegram"), /Ambiguous bot database credentials/);
  assert.throws(() => readBotConfiguration({
    TELEGRAM_BOT_TOKEN: secret, BOT_DATABASE_URL: "file:secret",
  }, "telegram"), error => !error.message.includes(secret));
});
