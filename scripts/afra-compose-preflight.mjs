#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import console from "node:console";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const APPROVED_POSTGRES_IMAGE = "postgres:16-alpine";
const COMPOSE_FILE_NAMES = [
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
  let directory;
  let envFile;
  const composeFiles = [];
  const args = process.argv.slice(2);
  while (args.length) {
    const flag = args.shift();
    const value = args.shift();
    if (!value || !["--project-dir", "--env-file", "--compose-file"].includes(flag)) {
      fail("usage: scripts/afra-compose-preflight.mjs --project-dir DIR --compose-file FILE (repeat four times, in Afra order) [--env-file FILE]");
    }
    if (flag === "--project-dir") {
      if (directory) fail("--project-dir may be specified only once");
      directory = path.resolve(value);
    }
    else if (flag === "--env-file") {
      if (envFile) fail("--env-file may be specified only once");
      envFile = value;
    } else composeFiles.push(path.resolve(value));
  }
  if (!directory) fail("--project-dir is required so relative Compose paths resolve against the Afra checkout");
  if (composeFiles.length !== COMPOSE_FILE_NAMES.length) {
    fail(`exactly four --compose-file arguments are required, in this order: ${COMPOSE_FILE_NAMES.join(", ")}`);
  }
  for (const [index, file] of composeFiles.entries()) {
    if (path.basename(file) !== COMPOSE_FILE_NAMES[index]) {
      fail(`Compose file ${index + 1} must be ${COMPOSE_FILE_NAMES[index]}; received ${file}`);
    }
  }
  return { directory, envFile, composeFiles };
}

const { directory, envFile, composeFiles } = projectDirectory();
if (!existsSync(directory) || !statSync(directory).isDirectory()) {
  fail(`project directory does not exist: ${directory}`);
}
if (path.dirname(composeFiles[0]) !== directory) {
  fail(`project directory must be the directory containing the first Compose file: ${path.dirname(composeFiles[0])}`);
}

for (const file of composeFiles) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    fail(`required Afra Compose file is missing: ${file}`);
  }
}

const composeArgs = ["compose", "--project-directory", directory];
if (envFile) {
  const fullEnvFile = path.isAbsolute(envFile) ? envFile : path.resolve(directory, envFile);
  if (!existsSync(fullEnvFile) || !statSync(fullEnvFile).isFile()) fail(`environment file is missing: ${fullEnvFile}`);
  composeArgs.push("--env-file", fullEnvFile);
}
for (const file of composeFiles) composeArgs.push("-f", file);
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
