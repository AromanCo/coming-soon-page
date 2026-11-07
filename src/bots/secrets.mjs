import { readFileSync, lstatSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";

function configured(env, name) {
  const value = env[name];
  const file = env[`${name}_FILE`];
  if (value !== undefined && file !== undefined) throw new Error(`Set only one of ${name} or ${name}_FILE`);
  if (file !== undefined) {
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
      const contents = readFileSync(file, "utf8");
      const secret = contents.replace(/\r?\n$/, "");
      if (!secret || /[\r\n]/.test(secret)) throw new Error();
      return secret;
    } catch {
      throw new Error(`Unable to read a valid secret file for ${name}`);
    }
  }
  return value;
}

export function readBotConfiguration(env = process.env, platform) {
  const tokenName = platform === "telegram" ? "TELEGRAM_BOT_TOKEN" : platform === "bale" ? "BALE_BOT_TOKEN" : null;
  if (!tokenName) throw new Error("Unsupported bot platform");
  const token = configured(env, tokenName);
  const providerPrefix = platform === "telegram" ? "TELEGRAM" : "BALE";
  const otherProviderPrefix = platform === "telegram" ? "BALE" : "TELEGRAM";
  const providerUrlName = `${providerPrefix}_BOT_DATABASE_URL`;
  const providerPasswordName = `${providerPrefix}_BOT_DATABASE_PASSWORD`;
  const otherProviderDatabaseNames = [`${otherProviderPrefix}_BOT_DATABASE_URL`, `${otherProviderPrefix}_BOT_DATABASE_PASSWORD`];
  if (otherProviderDatabaseNames.some(name => env[name] !== undefined || env[`${name}_FILE`] !== undefined)) throw new Error("Ambiguous bot database credentials");
  const urlNames = [providerUrlName, "BOT_DATABASE_URL", "DATABASE_URL"];
  const selectedUrls = urlNames.filter(name => env[name] !== undefined || env[`${name}_FILE`] !== undefined);
  const providerPasswordConfigured = env[providerPasswordName] !== undefined || env[`${providerPasswordName}_FILE`] !== undefined;
  const sharedPasswordConfigured = env.BOT_DATABASE_PASSWORD !== undefined || env.BOT_DATABASE_PASSWORD_FILE !== undefined;
  const pgConfig = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER"].some(key => env[key] !== undefined) || providerPasswordConfigured || sharedPasswordConfigured;
  if (selectedUrls.length > 1 || (selectedUrls.length && pgConfig) || (providerPasswordConfigured && sharedPasswordConfigured)) throw new Error("Ambiguous bot database credentials; configure one database credential method");
  let database;
  if (selectedUrls.length) {
    const key = selectedUrls[0];
    database = configured(env, key);
    if (typeof database !== "string" || !database) throw new Error("Bot database URL is required");
    let parsed;
    try { parsed = new URL(database); } catch { throw new Error("Bot database URL is invalid"); }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) throw new Error("Bot database URL is invalid");
  } else if (pgConfig) {
    const password = configured(env, providerPasswordConfigured ? providerPasswordName : "BOT_DATABASE_PASSWORD");
    if (![env.PGHOST, env.PGDATABASE, env.PGUSER, password].every(Boolean)) throw new Error("Incomplete bot PostgreSQL credentials");
    database = { host: env.PGHOST, port: Number(env.PGPORT || 5432), database: env.PGDATABASE, user: env.PGUSER, password };
    if (!Number.isInteger(database.port) || database.port < 1 || database.port > 65535) throw new Error("Invalid bot PostgreSQL port");
  } else throw new Error("Bot database credentials are required");
  if (!token) throw new Error("Bot token is required");
  return { token, database };
}
