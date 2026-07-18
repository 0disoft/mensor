import assert from "node:assert/strict";
import test from "node:test";

import { createSourceFactIndex } from "../dist/src/source-fact-index.js";

test("reads and parses one source file at most once per project check", async () => {
  let reads = 0;
  const index = createSourceFactIndex(async () => {
    reads += 1;
    return 'export function createTask() {}\nimport "./shared.js";\n';
  });

  const first = await index.get("src/create-task.ts");
  const source = await index.source("src/create-task.ts");
  const second = await index.get("src/create-task.ts");

  assert.equal(reads, 1);
  assert.equal(first, second);
  assert.match(source, /createTask/u);
  assert.deepEqual(first.exports.map((entry) => entry.name), ["createTask"]);
  assert.deepEqual(first.imports.map((entry) => entry.specifier), ["./shared.js"]);
});

test("shares one in-flight parse between concurrent consumers", async () => {
  let reads = 0;
  const index = createSourceFactIndex(async () => {
    reads += 1;
    await Promise.resolve();
    return "export const value = 1;\n";
  });

  const [first, second] = await Promise.all([
    index.get("src/value.ts"),
    index.get("src/value.ts"),
  ]);

  assert.equal(reads, 1);
  assert.equal(first, second);
});
