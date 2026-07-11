import assert from "node:assert/strict";
import test from "node:test";

import { extractModuleFact } from "../dist/src/typescript-source.js";

test("extracts direct, aliased, default, and destructured exports", () => {
  const fact = extractModuleFact(`const local = 1;
export function createTask() {}
export const { first, nested: { second } } = source;
export { local as renamed };
export default class Handler {}
`, "handler.ts");

  assert.deepEqual(fact.syntaxErrors, []);
  assert.equal(fact.hasExportStar, false);
  assert.deepEqual(fact.exports.map((entry) => entry.name), [
    "createTask",
    "default",
    "first",
    "renamed",
    "second",
  ]);
});

test("separates explicit namespace exports from unresolved export stars", () => {
  const fact = extractModuleFact(
    'export * from "./all.js";\nexport * as named from "./named.js";\n',
    "handler.ts",
  );

  assert.equal(fact.hasExportStar, true);
  assert.deepEqual(fact.exports.map((entry) => entry.name), ["named"]);
});

test("reports parser diagnostics without executing source", () => {
  const fact = extractModuleFact("export function broken( {", "broken.ts");

  assert.ok(fact.syntaxErrors.length > 0);
});

test("extracts static, type-only, literal dynamic, and unsupported dynamic imports", () => {
  const fact = extractModuleFact(`import value from "./value.js";
import type { Shape } from "./shape.js";
export type { Contract } from "./contract.js";
void import("./lazy.js");
void import(runtimeTarget);
`, "browser.ts");

  assert.deepEqual(
    fact.imports.map((entry) => [entry.specifier, entry.edgeKind]),
    [
      ["./contract.js", "type"],
      ["./lazy.js", "runtime"],
      ["./shape.js", "type"],
      ["./value.js", "runtime"],
    ],
  );
  assert.equal(fact.unsupportedDynamicImports.length, 1);
});
