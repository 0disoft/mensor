import assert from "node:assert/strict";
import test from "node:test";

import {
  importCandidates,
  resolveImport,
} from "../dist/src/module-boundary-rule.js";

test("uses the NodeNext relative JavaScript substitution matrix", () => {
  assert.deepEqual(importCandidates("src/foo.js"), [
    "src/foo.ts",
    "src/foo.tsx",
    "src/foo.d.ts",
    "src/foo.js",
    "src/foo.jsx",
  ]);
  assert.deepEqual(importCandidates("src/foo.jsx"), [
    "src/foo.ts",
    "src/foo.tsx",
    "src/foo.d.ts",
    "src/foo.js",
    "src/foo.jsx",
  ]);
  assert.deepEqual(importCandidates("src/foo.mjs"), [
    "src/foo.mts",
    "src/foo.d.mts",
    "src/foo.mjs",
  ]);
  assert.deepEqual(importCandidates("src/foo.cjs"), [
    "src/foo.cts",
    "src/foo.d.cts",
    "src/foo.cjs",
  ]);
});

test("resolves only the matching NodeNext extension family", () => {
  const discovered = new Set([
    "src/browser/value.ts",
    "src/browser/value.mts",
    "src/browser/value.cts",
    "src/browser/types.d.ts",
    "src/browser/module.d.mts",
    "src/browser/common.d.cts",
    "src/browser/view.jsx",
  ]);

  assert.equal(resolveImport("src/browser/entry.ts", "./value.mjs", discovered), "src/browser/value.mts");
  assert.equal(resolveImport("src/browser/entry.ts", "./value.cjs", discovered), "src/browser/value.cts");
  assert.equal(resolveImport("src/browser/entry.ts", "./types.js", discovered), "src/browser/types.d.ts");
  assert.equal(resolveImport("src/browser/entry.ts", "./module.mjs", discovered), "src/browser/module.d.mts");
  assert.equal(resolveImport("src/browser/entry.ts", "./common.cjs", discovered), "src/browser/common.d.cts");
  assert.equal(resolveImport("src/browser/entry.ts", "./view.jsx", discovered), "src/browser/view.jsx");
});

test("does not resolve an mjs import to a discovered ts file", () => {
  assert.throws(
    () => resolveImport(
      "src/browser/entry.ts",
      "./server.mjs",
      new Set(["src/browser/server.ts"]),
    ),
    (error) => error?.code === "module.import_unresolved",
  );
});
