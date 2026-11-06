#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import console from "node:console";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const APPROVED_POSTGRES_IMAGE = "postgres:16-alpine";
const COMPOSE_FILES = [
  "compose.yaml",
  "compose.ecr.yaml",
  "compose.nginx.yaml",
  "aroman-db-compat.override.yaml",
];

function fail(message) {
  console.error(`Afra Compose preflight failed: ${message}`);
  process.exit(1);
}

function projectDirectory() {
  let directory = process.cwd();
  let envFile;
  const args = process.argv.slice(2);
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || (flag !== "--project-dir" && flag !== "--env-file")) {
      fail("usage: scripts/afra-compose-preflight.mjs [--project-dir DIR] [--env-file FILE]");
    }
    if (flag === "--project-dir") directory = path.resolve(value);
    else envFile = value;
  }
  return { directory, envFile };
}

const { directory, envFile } = projectDirectory();
if (!existsSync(directory) || !statSync(directory).isDirectory()) {
  fail(`project directory does not exist: ${directory}`);
}

for (const file of COMPOSE_FILES) {
  const fullPath = path.join(directory, file);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    fail(`required Afra Compose file is missing: ${file}`);
  }
}

const composeArgs = ["compose", "--project-directory", directory];
if (envFile) {
  const fullEnvFile = path.isAbsolute(envFile) ? envFile : path.resolve(directory, envFile);
  if (!existsSync(fullEnvFile) || !statSync(fullEnvFile).isFile()) fail(`environment file is missing: ${fullEnvFile}`);
  composeArgs.push("--env-file", fullEnvFile);
}
for (const file of COMPOSE_FILES) composeArgs.push("-f", file);
composeArgs.push("config", "--format", "json");

const rendered = spawnSync("docker", composeArgs, {
  cwd: directory,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});
if (rendered.error) fail(`could not run Docker Compose config: ${rendered.error.message}`);
if (rendered.status !== 0) {
  fail(`Docker Compose config could not render the effective configuration: ${(rendered.stderr || "").trim()}`);
}

let config;
try {
  config = JSON.parse(rendered.stdout);
} catch {
  fail("Docker Compose config did not return valid JSON");
}

for (const serviceName of ["db", "migrate"]) {
  const service = config.services?.[serviceName];
  if (!service || typeof service !== "object") fail(`effective configuration is missing service ${serviceName}`);
  if (service.image !== APPROVED_POSTGRES_IMAGE) {
    fail(`${serviceName} image must be exactly ${APPROVED_POSTGRES_IMAGE}; received ${String(service.image)}`);
  }
  if (service.pull_policy !== "never") {
    fail(`${serviceName} pull_policy must be "never" to prevent automatic PostgreSQL image pulls; received ${String(service.pull_policy)}`);
  }
}

console.log(`Afra Compose preflight passed: db and migrate declare ${APPROVED_POSTGRES_IMAGE} with pull_policy=never.`);
console.log("This validates Compose declarations only; it does not verify the local image contents or running PostgreSQL version, and it did not pull images or start services.");
