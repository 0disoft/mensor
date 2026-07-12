import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  captureRepairBaseline,
  evaluateRepair,
} from "../dist/src/index.js";

const fixture = fileURLToPath(
  new URL("../../../fixtures/invalid/form-field-missing/", import.meta.url),
);
const protectedFiles = [
  "mensor.project.jsonc",
  "src/features/tasks/feature.mensor.jsonc",
];
const template = "src/features/tasks/views/index.html";
const handler = "src/features/tasks/server/create-task.ts";

test("accepts a repair only when check, contracts, and semantics pass", async () => {
  await withFixture(async (root) => {
    const baseline = await captureRepairBaseline({ root, protectedFiles });
    await addTitleControl(root);

    const evaluation = await evaluateRepair({
      root,
      baseline,
      semanticCheck: () => semanticFeaturePresent(root),
    });

    assert.deepEqual(evaluation, {
      success: true,
      checkPassed: true,
      diagnosticCodes: [],
      protectedFilesChanged: [],
      semanticCheckPassed: true,
    });
  });
});

test("rejects a repair that weakens a protected contract", async () => {
  await withFixture(async (root) => {
    const baseline = await captureRepairBaseline({ root, protectedFiles });
    const contractFile = path.join(root, ...protectedFiles[1].split("/"));
    const contract = JSON.parse(await readFile(contractFile, "utf8"));
    contract.actions[0].input.schema.required = [];
    await writeFile(contractFile, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

    const evaluation = await evaluateRepair({
      root,
      baseline,
      semanticCheck: () => true,
    });

    assert.equal(evaluation.checkPassed, true);
    assert.deepEqual(evaluation.protectedFilesChanged, [protectedFiles[1]]);
    assert.equal(evaluation.semanticCheckPassed, true);
    assert.equal(evaluation.success, false);
  });
});

test("rejects a checker-clean repair that deletes feature semantics", async () => {
  await withFixture(async (root) => {
    const baseline = await captureRepairBaseline({ root, protectedFiles });
    await addTitleControl(root);
    await writeFile(
      path.join(root, ...handler.split("/")),
      "export function createTask(): void {}\n",
      "utf8",
    );

    const evaluation = await evaluateRepair({
      root,
      baseline,
      semanticCheck: () => semanticFeaturePresent(root),
    });

    assert.equal(evaluation.checkPassed, true);
    assert.deepEqual(evaluation.protectedFilesChanged, []);
    assert.equal(evaluation.semanticCheckPassed, false);
    assert.equal(evaluation.success, false);
  });
});

test("rejects semantic checks that mutate the evaluated workspace", async () => {
  await withFixture(async (root) => {
    const baseline = await captureRepairBaseline({ root, protectedFiles });
    await addTitleControl(root);
    const evaluation = await evaluateRepair({
      root,
      baseline,
      semanticCheck: async () => {
        const file = path.join(root, ...template.split("/"));
        const html = await readFile(file, "utf8");
        await writeFile(file, html.replace('action="/tasks"', 'action="/changed"'), "utf8");
        return true;
      },
    });

    assert.equal(evaluation.success, false);
    assert.equal(evaluation.checkPassed, false);
    assert.equal(evaluation.semanticCheckPassed, false);
    assert.deepEqual(evaluation.diagnosticCodes, ["form.action_mismatch"]);
  });
});

async function addTitleControl(root) {
  const file = path.join(root, ...template.split("/"));
  const html = await readFile(file, "utf8");
  await writeFile(
    file,
    html.replace(
      "      <button",
      '      <input name="title" type="text" />\n      <button',
    ),
    "utf8",
  );
}

async function semanticFeaturePresent(root) {
  const html = await readFile(path.join(root, ...template.split("/")), "utf8");
  const source = await readFile(path.join(root, ...handler.split("/")), "utf8");
  return (
    html.includes('name="title"') &&
    source.includes("Synthetic fixture handler")
  );
}

async function withFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-repair-eval-"));
  try {
    await cp(fixture, root, { recursive: true });
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
