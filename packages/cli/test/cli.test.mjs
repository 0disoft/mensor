import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cliVersion } from "@0disoft/mensor-cli";
import {
  parseCheckOutputV2,
  parseRuntimeManifest,
  serializeRuntimeManifest,
} from "../../contract/dist/src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureRoot = path.join(repositoryRoot, "fixtures");
const executable = fileURLToPath(new URL("../dist/src/bin.js", import.meta.url));

test("keeps the runtime version aligned with package metadata", async () => {
  const metadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(cliVersion, metadata.version);
});

test("writes one canonical JSON report and exits zero for a valid project", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--json",
  ]);
  const expected = JSON.parse(
    await readFile(
      path.join(fixtureRoot, "valid/tiny-tasks/expected-report.json"),
      "utf8",
    ),
  );
  expected.producer.version = cliVersion;

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
});

test("writes canonical revision-2 inspection for a valid project", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--json",
    "--report-version",
    "2",
  ]);
  const v1 = JSON.parse(
    await readFile(
      path.join(fixtureRoot, "valid/tiny-tasks/expected-report.json"),
      "utf8",
    ),
  );
  const expected = {
    schemaVersion: 2,
    producer: { name: "mensor", version: cliVersion },
    status: v1.status,
    inspection: {
      filePlacement: { state: "checked", basis: "file-roles" },
      forms: { state: "checked", basis: "static-html-form-index" },
      handlers: { state: "checked", basis: "static-module-facts" },
      moduleBoundaries: { state: "not-configured", basis: "module-graph" },
      ownership: { state: "not-configured", basis: "ownership-rules" },
      routes: { state: "not-configured", basis: "route-index" },
      runtimeSemantics: { state: "out-of-scope", basis: "none" },
    },
    diagnostics: v1.diagnostics,
    summary: v1.summary,
  };

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  assert.equal(parseCheckOutputV2(result.stdout).ok, true);
});

test("compiles one canonical RuntimeManifest to stdout", async () => {
  const result = await runCli([
    "compile",
    path.join(fixtureRoot, "valid/tiny-tasks"),
  ]);
  const parsed = parseRuntimeManifest(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(result.stdout, serializeRuntimeManifest(parsed.value));
    assert.equal(parsed.value.producer.version, cliVersion);
    assert.equal(parsed.value.pages.length, 1);
    assert.equal(parsed.value.actions.length, 1);
  }
});

test("atomically replaces a RuntimeManifest output file without stdout", async () => {
  const temporaryRoot = await copyFixture("valid/tiny-tasks");
  const outputRelative = "generated/runtime-manifest.json";
  const outputFile = path.join(temporaryRoot, ...outputRelative.split("/"));
  try {
    const first = await runCli([
      "compile",
      temporaryRoot,
      "--output",
      outputRelative,
    ]);
    const firstText = await readFile(outputFile, "utf8");
    assert.equal(first.code, 0);
    assert.equal(first.stdout, "");
    assert.equal(first.stderr, "");
    assert.equal(parseRuntimeManifest(firstText).ok, true);

    await writeFile(outputFile, "stale\n", "utf8");
    const second = await runCli([
      "compile",
      temporaryRoot,
      "--output",
      outputRelative,
    ]);
    const secondText = await readFile(outputFile, "utf8");
    const parsed = parseRuntimeManifest(secondText);
    assert.equal(second.code, 0);
    assert.equal(second.stdout, "");
    assert.equal(second.stderr, "");
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(secondText, serializeRuntimeManifest(parsed.value));
    }
    assert.deepEqual(
      await readdir(path.dirname(outputFile)),
      [path.basename(outputFile)],
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("does not create a RuntimeManifest file when diagnostics remain", async () => {
  const temporaryRoot = await copyFixture("invalid/form-field-missing");
  const outputRelative = "generated/runtime-manifest.json";
  const outputFile = path.join(temporaryRoot, ...outputRelative.split("/"));
  try {
    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, "stale\n", "utf8");
    const result = await runCli([
      "compile",
      temporaryRoot,
      "--output",
      outputRelative,
    ]);
    const report = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.equal(result.stderr, "");
    assert.equal(report.status, "failed");
    assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.code), [
      "form.field_missing",
    ]);
    assert.equal(await readFile(outputFile, "utf8"), "stale\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects output paths that escape the project root", async () => {
  const result = await runCli([
    "compile",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--output",
    "../runtime-manifest.json",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.failure.kind, "configuration");
  assert.equal(envelope.failure.code, "cli.output_path_invalid");
  assert.equal("file" in envelope.failure, false);
});

test("rejects an output parent that resolves outside the project root", async () => {
  const temporaryRoot = await copyFixture("valid/tiny-tasks");
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "mensor-cli-outside-"));
  const linkedDirectory = path.join(temporaryRoot, "generated");
  const outputFile = path.join(outsideRoot, "runtime-manifest.json");
  try {
    await symlink(
      outsideRoot,
      linkedDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );
    const result = await runCli([
      "compile",
      temporaryRoot,
      "--output",
      "generated/runtime-manifest.json",
    ]);
    const envelope = JSON.parse(result.stdout);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");
    assert.equal(envelope.failure.kind, "configuration");
    assert.equal(envelope.failure.code, "cli.output_outside_root");
    await assert.rejects(readFile(outputFile, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});

test("rejects compile-only flags on check", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--output",
    "runtime-manifest.json",
    "--json",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.failure.code, "cli.usage_invalid");
  assert.match(envelope.failure.message, /--output is valid only with compile/u);
});

test("exits one and keeps JSON stdout clean for contract diagnostics", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "invalid/form-field-missing"),
    "--json",
  ]);
  const report = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  assert.equal(report.status, "failed");
  assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.code), [
    "form.field_missing",
  ]);
});

test("keeps revision-2 inspection when diagnostics fail", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "invalid/form-field-missing"),
    "--json",
    "--report-version=2",
  ]);
  const report = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.status, "failed");
  assert.equal(report.inspection.forms.state, "checked");
  assert.equal(parseCheckOutputV2(result.stdout).ok, true);
  assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.code), [
    "form.field_missing",
  ]);
});

test("returns a JSON usage failure without stderr contamination", async () => {
  const result = await runCli(["check", "--unknown", "--json"]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.status, "error");
  assert.equal(envelope.failure.code, "cli.usage_invalid");
});

test("returns a revision-2 error envelope for a selected revision", async () => {
  const result = await runCli([
    "check",
    "--unknown",
    "--json",
    "--report-version",
    "2",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.schemaVersion, 2);
  assert.equal(envelope.status, "error");
  assert.equal(envelope.failure.code, "cli.usage_invalid");
  assert.equal("inspection" in envelope, false);
  assert.equal(parseCheckOutputV2(result.stdout).ok, true);
});

test("rejects report revision selection outside JSON mode", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--report-version",
    "2",
  ]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /--report-version requires --json/u);
});

test("rejects report revision selection for compile", async () => {
  const result = await runCli([
    "compile",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--report-version",
    "2",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.failure.code, "cli.usage_invalid");
  assert.match(envelope.failure.message, /valid only with check/u);
});

test("rejects an unknown report revision without inventing its envelope", async () => {
  const result = await runCli([
    "check",
    "--json",
    "--report-version",
    "3",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.failure.code, "cli.usage_invalid");
  assert.match(envelope.failure.message, /must be 1 or 2/u);
});

test("rejects a config path that escapes the selected root", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--config",
    "../outside.jsonc",
    "--json",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.failure.kind, "configuration");
  assert.equal(envelope.failure.code, "path.invalid");
});

test("keeps revision-2 path failures schema-valid without leaking invalid paths", async () => {
  for (const config of [
    "../outside.jsonc",
    "C:\\outside\\mensor.project.jsonc",
  ]) {
    const result = await runCli([
      "check",
      path.join(fixtureRoot, "valid/tiny-tasks"),
      "--config",
      config,
      "--json",
      "--report-version",
      "2",
    ]);
    const envelope = JSON.parse(result.stdout);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");
    assert.equal(envelope.schemaVersion, 2);
    assert.equal("file" in envelope.failure, false);
    assert.equal(parseCheckOutputV2(result.stdout).ok, true);
  }
});

test("rejects Windows absolute config paths before slash normalization", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
    "--config",
    "C:\\outside\\mensor.project.jsonc",
    "--json",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(envelope.failure.code, "cli.config_not_relative");
});

test("separates filesystem failure from a clean project", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "does-not-exist"),
    "--json",
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 3);
  assert.equal(result.stderr, "");
  assert.equal(envelope.failure.kind, "filesystem");
});

test("keeps compile filesystem failures machine-readable", async () => {
  const result = await runCli([
    "compile",
    path.join(fixtureRoot, "does-not-exist"),
  ]);
  const envelope = JSON.parse(result.stdout);

  assert.equal(result.code, 3);
  assert.equal(result.stderr, "");
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.failure.kind, "filesystem");
});

test("writes concise human output for a valid project", async () => {
  const result = await runCli([
    "check",
    path.join(fixtureRoot, "valid/tiny-tasks"),
  ]);

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "No contract violations found.\n");
  assert.equal(result.stderr, "");
});

test("defaults root and config to the current working directory", async () => {
  const result = await runCli(
    ["check", "--json"],
    path.join(fixtureRoot, "valid/tiny-tasks"),
  );
  const report = JSON.parse(result.stdout);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(report.status, "passed");
});

test("compile defaults root and config to the current working directory", async () => {
  const result = await runCli(
    ["compile"],
    path.join(fixtureRoot, "valid/tiny-tasks"),
  );

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(parseRuntimeManifest(result.stdout).ok, true);
});

async function copyFixture(relativeFixture) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-cli-test-"));
  await cp(path.join(fixtureRoot, relativeFixture), temporaryRoot, {
    recursive: true,
  });
  return temporaryRoot;
}

async function runCli(args, cwd = repositoryRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {
      cwd,
      env: {},
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`CLI terminated by signal ${signal}.`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}
