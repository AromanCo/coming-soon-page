import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preflight = path.join(repo, "scripts/afra-compose-preflight.mjs");
const approvedImage = "postgres:16-alpine";
const composeFileNames = ["compose.yaml", "compose.ecr.yaml", "compose.nginx.yaml", "aroman-db-compat.override.yaml"];

async function fixture(t, config, { missingFile } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "aroman-afra-compose-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const projectDir = path.join(root, "checkout");
  const ecrConfigDir = path.join(root, ".config", "aroman-inplace");
  const maintenanceConfigDir = path.join(root, ".config", "server-maintenance");
  await mkdir(bin);
  for (const directory of [projectDir, ecrConfigDir, maintenanceConfigDir]) await mkdir(directory, { recursive: true });
  const composePaths = [
    path.join(projectDir, composeFileNames[0]),
    path.join(ecrConfigDir, composeFileNames[1]),
    path.join(ecrConfigDir, composeFileNames[2]),
    path.join(maintenanceConfigDir, composeFileNames[3]),
  ];
  for (const file of composePaths) {
    if (path.basename(file) !== missingFile) await writeFile(file, "# test fixture\n");
  }
  const configPath = path.join(root, "effective-config.json");
  const argsPath = path.join(root, "docker-args.txt");
  await writeFile(configPath, JSON.stringify(config));
  const docker = path.join(bin, "docker");
  await writeFile(docker, "#!/bin/sh\nprintf '%s\\n' \"$*\" > \"$MOCK_ARGS_FILE\"\n[ \"$1\" = compose ] || exit 11\nfound_config=0\nfor arg do [ \"$arg\" = config ] && found_config=1; done\n[ \"$found_config\" -eq 1 ] || exit 12\ncat \"$MOCK_CONFIG_FILE\"\n");
  await chmod(docker, 0o755);
  return { root, projectDir, composePaths, bin, configPath, argsPath };
}

function services(dbImage = approvedImage, migrateImage = approvedImage, dbPull = "never", migratePull = "never") {
  return { services: { db: { image: dbImage, pull_policy: dbPull }, migrate: { image: migrateImage, pull_policy: migratePull } } };
}

function run(project, args = [], projectDirectory = project.projectDir) {
  const composeArgs = project.composePaths.flatMap((file) => ["--compose-file", file]);
  return spawnSync(process.execPath, [preflight, "--project-dir", projectDirectory, ...composeArgs, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${project.bin}${path.delimiter}${process.env.PATH}`,
      MOCK_CONFIG_FILE: project.configPath,
      MOCK_ARGS_FILE: project.argsPath,
    },
  });
}

test("Afra preflight fails closed when a host Compose override is missing", async (t) => {
  const project = await fixture(t, services(), { missingFile: "aroman-db-compat.override.yaml" });
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required Afra Compose file is missing: .*aroman-db-compat\.override\.yaml/);
  await assert.rejects(readFile(project.argsPath), { code: "ENOENT" }, "Docker Compose is not invoked with an incomplete file set");
});

test("Afra preflight rejects PostgreSQL 16.15 until an explicitly approved baseline change", async (t) => {
  const project = await fixture(t, services("postgres:16.15-alpine"));
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /db image must be exactly postgres:16-alpine/);
  const implementation = await readFile(preflight, "utf8");
  assert.match(implementation, /APPROVED_POSTGRES_IMAGE = "postgres:16-alpine"/);
});

test("Afra preflight rejects effective db and migrate image mismatches", async (t) => {
  const project = await fixture(t, services(approvedImage, "postgres:16.14-alpine"));
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /migrate image must be exactly postgres:16-alpine/);
});

test("Afra preflight requires pull_policy never for both PostgreSQL services", async (t) => {
  const project = await fixture(t, services(approvedImage, approvedImage, "always", "never"));
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /db pull_policy must be "never"/);
});

test("Afra preflight renders the four effective files in order without deployment or pulls", async (t) => {
  const project = await fixture(t, services());
  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /preflight passed/);
  assert.match(result.stdout, /does not verify the local image contents or running PostgreSQL version/);
  assert.match(result.stdout, /did not pull images or start services/);
  const args = (await readFile(project.argsPath, "utf8")).trim();
  assert.ok(args.includes(`--project-directory ${project.projectDir}`));
  assert.equal(new Set(project.composePaths.map((file) => path.dirname(file))).size, 3, "fixture paths span the checkout and two separate configuration directories");
  const orderedFiles = project.composePaths.map((file) => `-f ${file}`);
  let cursor = args.indexOf("compose ");
  for (const expected of orderedFiles) {
    const next = args.indexOf(expected, cursor);
    assert.ok(next > cursor, `Docker Compose receives files in Afra order: ${expected}`);
    cursor = next + expected.length;
  }
  assert.ok(args.slice(cursor).includes("config --format json"));
  assert.doesNotMatch(args, /\b(up|pull|run|exec)\b/);
});

test("Afra preflight rejects Compose files supplied out of order", async (t) => {
  const project = await fixture(t, services());
  project.composePaths.reverse();
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Compose file 1 must be compose\.yaml/);
  await assert.rejects(readFile(project.argsPath), { code: "ENOENT" }, "invalid order is rejected before invoking Docker Compose");
});

test("Afra preflight requires the checkout as an explicit Compose project directory", async (t) => {
  const project = await fixture(t, services());
  const composeArgs = project.composePaths.flatMap((file) => ["--compose-file", file]);
  const result = spawnSync(process.execPath, [preflight, ...composeArgs], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${project.bin}${path.delimiter}${process.env.PATH}`,
      MOCK_CONFIG_FILE: project.configPath,
      MOCK_ARGS_FILE: project.argsPath,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--project-dir is required/);
  await assert.rejects(readFile(project.argsPath), { code: "ENOENT" }, "project directory omission is rejected before invoking Docker Compose");
});

test("Afra preflight requires the project directory to contain compose.yaml", async (t) => {
  const project = await fixture(t, services());
  const result = run(project, [], project.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /project directory must be the directory containing the first Compose file/);
  await assert.rejects(readFile(project.argsPath), { code: "ENOENT" }, "incorrect project directory is rejected before invoking Docker Compose");
});

test("Afra deployment instructions pin and protect the effective PostgreSQL config", async () => {
  const docs = await readFile(path.join(repo, "docs/afra-postgres-image-safety.md"), "utf8");
  for (const file of composeFileNames) assert.ok(docs.includes(file), `documents ${file}`);
  for (const file of [
    "/root/dev/aroman/coming-soon-page/compose.yaml",
    "/root/.config/aroman-inplace/compose.ecr.yaml",
    "/root/.config/aroman-inplace/compose.nginx.yaml",
    "/root/.config/server-maintenance/aroman-db-compat.override.yaml",
  ]) assert.ok(docs.includes(file), `documents Afra path ${file}`);
  assert.ok(docs.includes(approvedImage));
  assert.match(docs, /currently runs PostgreSQL 16\.14/);
  assert.match(docs, /does not inspect Afra's local image store/);
  assert.match(docs, /or query the running server's\s+version/);
  assert.match(docs, /No verified PostgreSQL 16\.14 registry digest/);
  assert.match(docs, /pull_policy:\s*never/);
  assert.match(docs, /--pull never/);
  assert.match(docs, /does not run migrations, pull images,\s+or modify containers/i);
});
