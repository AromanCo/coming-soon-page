import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { test } from "node:test";

const composeEnv = {
  ...process.env,
  POSTGRES_PASSWORD: "synthetic-db-password",
  POSTGRES_DB: "aroman_test",
  DATABASE_URL: "postgres://synthetic:synthetic@db:5432/aroman_test",
  WAITLIST_HASH_SECRET: "synthetic-waitlist-secret",
  SCENT_BOT_IMAGE_TAG: "test",
  AROMAN_SECRETS_DIR: "/tmp/aroman-synthetic-secrets",
  AFRA_PRIVATE_DB_HOST: "afra-private.example.invalid",
  AFRA_PRIVATE_DB_PORT: "55432",
  AROMAN_CADDY_IMAGE: "caddy:test@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  AROMAN_DOMAIN: "example.invalid",
  AROMAN_BUILD_REVISION: "38158694f00cdb7e23e5025b3462fb5da2ae0883",
  NEXT_PUBLIC_SITE_URL: "https://example.invalid",
  NEXT_PUBLIC_PRIVACY_EMAIL: "privacy@example.invalid",
};

function config(files, profile) {
  const args = ["compose"];
  if (profile) args.push("--profile", profile);
  for (const file of files) args.push("-f", file);
  args.push("config", "--format", "json");
  return JSON.parse(execFileSync("docker", args, { encoding: "utf8", env: composeEnv }));
}

test("Sweden Compose renders as one Telegram worker and no database, website or migration", () => {
  const rendered = config(["compose.sweden.telegram.yaml"]);
  assert.deepEqual(Object.keys(rendered.services), ["telegram-bot"]);
  const worker = rendered.services["telegram-bot"];
  assert.equal(worker.environment.PGHOST, "afra-private.example.invalid");
  assert.equal(worker.environment.PGPORT, "55432");
  assert.equal(worker.environment.PGDATABASE, "aroman_test");
  assert.equal(worker.environment.PGUSER, "aroman_bot_telegram");
  assert.equal(worker.environment.DATABASE_SSL, "false");
  assert.deepEqual(Object.keys(worker.networks), ["aroman-telegram"]);
  assert.equal(rendered.networks["aroman-telegram"].name, "aroman-telegram");
  assert.equal(rendered.networks["aroman-telegram"].external, true);
  assert.equal(rendered.networks.default, undefined);
  assert.equal(worker.ports, undefined);
  assert.deepEqual(worker.command, ["node", "scripts/run-scent-companion.mjs", "telegram"]);
  assert.equal(worker.restart, "unless-stopped");
  assert.equal(worker.stop_grace_period, "45s");
  assert.equal(worker.init, true);
  assert.equal(worker.read_only, true);
  assert.deepEqual(worker.security_opt, ["no-new-privileges:true"]);
  assert.deepEqual(worker.cap_drop, ["ALL"]);
  assert.equal(worker.environment.TELEGRAM_BOT_TOKEN_FILE, "/run/secrets/telegram_bot_token");
  assert.equal(worker.environment.TELEGRAM_BOT_DATABASE_PASSWORD_FILE, "/run/secrets/db_telegram_bot_password");
  assert.deepEqual(worker.secrets.map(secret => secret.source).sort(), ["db_telegram_bot_password", "telegram_bot_token"]);
  assert.equal(rendered.secrets.telegram_bot_token.file, "/tmp/aroman-synthetic-secrets/telegram_bot_token");
  assert.equal(rendered.secrets.db_telegram_bot_password.file, "/tmp/aroman-synthetic-secrets/db_telegram_bot_password");
});

test("Afra Bale overlay retains base web/database settings and isolates the database from egress", () => {
  const base = config(["compose.yaml"]);
  const merged = config(["compose.yaml", "compose.afra.bale.yaml"], "bale");
  assert.deepEqual(merged.services.web, base.services.web);
  for (const [key, value] of Object.entries(base.services.db)) {
    if (key !== "networks") assert.deepEqual(merged.services.db[key], value);
  }
  assert.deepEqual(Object.keys(config(["compose.yaml", "compose.afra.bale.yaml"]).services).sort(),
    Object.keys(base.services).sort());
  assert.ok(merged.services["bale-bot"]);
  assert.equal(merged.services["telegram-bot"], undefined);
  assert.equal(merged.services.db.ports, undefined);
  assert.equal(merged.services["bale-bot"].ports, undefined);
  assert.deepEqual(Object.keys(merged.services.db.networks).sort(), ["afra-bot-database", "backend"]);
  assert.deepEqual(Object.keys(merged.services["bale-bot"].networks).sort(), ["afra-bot-database", "bot-egress"]);
  assert.equal(merged.networks["afra-bot-database"].internal, true);
  assert.equal(merged.services["bale-bot"].environment.PGUSER, "aroman_bot_bale");
  assert.deepEqual(merged.services["bale-bot"].secrets.map(secret => secret.source).sort(), ["bale_bot_token", "db_bale_bot_password"]);
  assert.ok(!Object.keys(merged.services).some(name => /backup/i.test(name)));
});

test("workers never receive privileged database identities and roles are an explicit profile", () => {
  const defaults = config(["compose.prod.yaml", "compose.prod.bots.yaml"]);
  assert.equal(defaults.services["bale-bot"], undefined);
  assert.equal(defaults.services["telegram-bot"], undefined);
  assert.equal(defaults.services["bot-db-roles"], undefined);

  const merged = config(["compose.prod.yaml", "compose.prod.bots.yaml"], "bale");
  const worker = merged.services["bale-bot"];
  assert.equal(worker.environment.PGUSER, "aroman_bot_bale");
  assert.equal(worker.environment.POSTGRES_ADMIN_USER, undefined);
  assert.equal(worker.environment.POSTGRES_MIGRATION_USER, undefined);
  assert.equal(merged.services["telegram-bot"], undefined);
  assert.equal(merged.services["bot-db-roles"], undefined);
  assert.equal(merged.services.db.ports, undefined);
  assert.ok(!Object.keys(merged.services).some(name => /backup/i.test(name)));

  const roleSetup = config(["compose.prod.yaml", "compose.prod.bots.yaml"], "provision-bot-roles");
  assert.ok(roleSetup.services["bot-db-roles"]);
  assert.equal(roleSetup.services["bale-bot"], undefined);
});
