import assert from "node:assert/strict";
import test from "node:test";

import { createSourceFactIndex } from "../dist/src/source-fact-index.js";
import { CompilerTiming } from "../dist/src/compiler-timing.js";

test("prefetch caps reads, shares results, and drains failures before ordered consumption", async () => {
  let active = 0;
  let peak = 0;
  const reads = [];
  const gates = [];
  let signalThird;
  const thirdStarted = new Promise(resolve => { signalThird = resolve; });
  const timing = new CompilerTiming();
  const index = createSourceFactIndex(async (file) => {
    reads.push(file);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => {
      gates.push(resolve);
      if (gates.length === 3) signalThird();
    });
    active -= 1;
    if (file === "a.ts" || file === "b.ts") throw new Error(file);
    return "export const value = 1;\n";
  }, timing, 2);
  const pending = index.prefetch(["a.ts", "b.ts", "c.ts", "c.ts"]);
  await Promise.resolve();
  assert.equal(active, 2);
  gates[1]();
  gates[0]();
  await thirdStarted;
  assert.equal(active, 1);
  gates[2]();
  await pending;
  assert.equal(active, 0);
  assert.equal(peak, 2);
  await assert.rejects(index.get("a.ts"), /a\.ts/u);
  await assert.rejects(index.get("b.ts"), /b\.ts/u);
  assert.equal((await index.get("c.ts")).exports[0].name, "value");
  assert.deepEqual(reads, ["a.ts", "b.ts", "c.ts"]);
});

test("serial mode does not speculate and prefetch does not hide synchronous failures", async () => {
  let reads = 0;
  const serial = createSourceFactIndex(async () => { reads += 1; return "export const x = 1;"; }, undefined, 1);
  await serial.prefetch(["later.ts"]);
  assert.equal(reads, 0);
  const failing = createSourceFactIndex(() => { throw new Error("sync read failure"); });
  await failing.prefetch(["bad.ts"]);
  await assert.rejects(failing.get("bad.ts"), /sync read failure/u);
});

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
