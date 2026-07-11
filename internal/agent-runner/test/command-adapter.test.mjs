import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runAgentTrial } from "@mensor/fixture-kit";
import { createCommandAgentAdapter } from "../dist/src/index.js";

const fixture = fileURLToPath(
  new URL("../../../fixtures/valid/tiny-tasks/", import.meta.url),
);
const fakeAgent = fileURLToPath(new URL("./fake-agent.mjs", import.meta.url));
const protectedFiles = [
  "mensor.project.jsonc",
  "src/features/tasks/feature.mensor.jsonc",
];

test("repairs a mutation through the bounded command protocol", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "command-success-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: adapter("repair"),
      semanticCheck: () => semanticFeaturePresent(root),
    });

    assert.equal(result.repaired, true);
    assert.equal(result.adapterCompleted, true);
    assert.equal(result.rounds, 1);
  });
});

test("passes only explicitly allowlisted environment values", async () => {
  await withFixture(async (root) => {
    const previous = process.env["FORBIDDEN"];
    process.env["FORBIDDEN"] = "parent-secret";
    try {
      const command = createCommandAgentAdapter({
        executable: process.execPath,
        args: [fakeAgent, "environment"],
      timeoutMs: 5_000,
      maxInputBytes: 4_096,
      maxOutputBytes: 4_096,
        environment: { ALLOWED: "yes" },
      });
      const result = await command(context(root));
      assert.deepEqual(result, { rounds: 1 });
    } finally {
      if (previous === undefined) {
        delete process.env["FORBIDDEN"];
      } else {
        process.env["FORBIDDEN"] = previous;
      }
    }
  });
});

test("rejects relative executables before process creation", () => {
  assert.throws(
    () =>
      createCommandAgentAdapter({
        executable: "node",
        timeoutMs: 1_000,
        maxInputBytes: 1_024,
        maxOutputBytes: 1_024,
      }),
    /absolute path/,
  );
});

test("fails closed on timeout, output overflow, invalid output, and exit failure", async () => {
  await withFixture(async (root) => {
    await assert.rejects(adapter("hang", { timeoutMs: 100 })(context(root)), /timeout/);
    await assert.rejects(
      adapter("output-limit", { maxOutputBytes: 128 })(context(root)),
      /output limit/,
    );
    await assert.rejects(adapter("invalid-json")(context(root)), /valid UTF-8 JSON/);
    await assert.rejects(adapter("failure")(context(root)), /exited unsuccessfully/);
  });
});

test("rejects oversized protocol input before running the command", async () => {
  await withFixture(async (root) => {
    const command = createCommandAgentAdapter({
      executable: process.execPath,
      args: [fakeAgent, "repair"],
      timeoutMs: 5_000,
      maxInputBytes: 1,
      maxOutputBytes: 4_096,
      environment: {},
    });
    await assert.rejects(command(context(root)), /input limit/);
  });
});

test("trial results do not expose command stderr", async () => {
  await withFixture(async (root) => {
    const result = await runAgentTrial({
      trialId: "command-failure-1",
      root,
      mutationId: "form-field-missing",
      protectedFiles,
      adapter: adapter("failure"),
      semanticCheck: () => semanticFeaturePresent(root),
    });
    assert.equal(result.failureCategory, "agent-error");
    assert.equal(JSON.stringify(result).includes("private provider failure details"), false);
  });
});

function adapter(mode, overrides = {}) {
  return createCommandAgentAdapter({
    executable: process.execPath,
    args: [fakeAgent, mode],
    timeoutMs: overrides.timeoutMs ?? 5_000,
    maxInputBytes: 4_096,
    maxOutputBytes: overrides.maxOutputBytes ?? 4_096,
    environment: {},
  });
}

function context(root) {
  return {
    root,
    mutationId: "form-field-missing",
    baselineId: "tiny-tasks",
    diagnosticCodes: ["form.field_missing"],
  };
}

async function semanticFeaturePresent(root) {
  const html = await readFile(
    path.join(root, "src", "features", "tasks", "views", "index.html"),
    "utf8",
  );
  const source = await readFile(
    path.join(root, "src", "features", "tasks", "server", "create-task.ts"),
    "utf8",
  );
  return html.includes('name="title"') && source.includes("Synthetic fixture handler");
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-command-agent-"));
  try {
    await cp(fixture, root, { recursive: true });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
