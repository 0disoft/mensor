import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "@mensor/compiler";

const fixtureRoot = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

test("returns the canonical passing report for the valid fixture", async () => {
  const result = await checkFixture("valid/tiny-tasks");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport("valid/tiny-tasks"));
  }
});

test("reports a stable handler placement diagnostic without executing source", async () => {
  const fixture = "invalid/file-role-mismatch";
  const sentinel = path.join(
    fixtureRoot,
    fixture,
    "src/features/tasks/routes/compiler-executed.txt",
  );
  await assertMissing(sentinel);

  const result = await checkFixture(fixture);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
  await assertMissing(sentinel);
});

test("reports the canonical missing form field diagnostic", async () => {
  const fixture = "invalid/form-field-missing";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports the canonical unexpected form field diagnostic", async () => {
  const fixture = "invalid/form-field-unexpected";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports the canonical form method mismatch diagnostic", async () => {
  const fixture = "invalid/form-method-mismatch";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports the canonical form action mismatch diagnostic", async () => {
  const fixture = "invalid/form-action-mismatch";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports the canonical control and codec mismatch diagnostic", async () => {
  const fixture = "invalid/form-control-codec-mismatch";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("produces byte-identical reports from different absolute roots", async () => {
  for (const fixture of [
    "invalid/file-role-mismatch",
    "invalid/form-field-missing",
    "invalid/form-field-unexpected",
    "invalid/form-method-mismatch",
    "invalid/form-action-mismatch",
    "invalid/form-control-codec-mismatch",
  ]) {
    const temporaryRoots = await Promise.all([
      copyFixture(fixture),
      copyFixture(fixture),
    ]);
    try {
      const reports = await Promise.all(
        temporaryRoots.map((root) =>
          checkProject({ root, producerVersion: "0.0.0-fixture" }),
        ),
      );
      assert.ok(reports.every((result) => result.ok));
      const serialized = reports.map((result) =>
        result.ok ? `${JSON.stringify(result.report, null, 2)}\n` : "failed",
      );
      assert.equal(serialized[0], serialized[1], fixture);
    } finally {
      await Promise.all(
        temporaryRoots.map((root) => rm(root, { recursive: true, force: true })),
      );
    }
  }
});

test("fails closed when discovery exceeds the configured file limit", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    limits: { maxFiles: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "filesystem");
    assert.equal(result.failure.code, "discovery.file_limit_exceeded");
    assert.equal(result.failure.file, "src");
  }
});

test("rejects an empty producer version before creating an invalid report", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    producerVersion: "",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "configuration");
    assert.equal(result.failure.code, "producer.version_invalid");
  }
});

test("fails closed before reading a source file above the byte limit", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    limits: { maxFileBytes: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "filesystem");
    assert.equal(result.failure.code, "file.size_limit_exceeded");
    assert.equal(result.failure.file, "mensor.project.jsonc");
  }
});

async function checkFixture(relativePath) {
  return checkProject({
    root: path.join(fixtureRoot, relativePath),
    producerVersion: "0.0.0-fixture",
  });
}

async function expectedReport(relativePath) {
  return JSON.parse(
    await readFile(path.join(fixtureRoot, relativePath, "expected-report.json"), "utf8"),
  );
}

async function copyFixture(relativePath) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-fixture-"));
  await cp(path.join(fixtureRoot, relativePath), root, { recursive: true });
  return root;
}

async function assertMissing(file) {
  await assert.rejects(access(file), { code: "ENOENT" });
}
