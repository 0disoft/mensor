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
  assert.deepEqual(fact.exports.map((entry) => [entry.name, entry.kind]), [
    ["createTask", "value"],
    ["default", "value"],
    ["first", "value"],
    ["renamed", "value"],
    ["second", "value"],
  ]);
});

test("distinguishes runtime exports from type-only and ambient declarations", () => {
  const fact = extractModuleFact(`export type createTask = () => void;
export interface Handler {}
export declare function ambientHandler(): void;
export enum RuntimeEnum { Ready }
export interface merged {}
export const merged = 1;
export type { Contract } from "./contract.js";
export { type Shape, runtimeValue } from "./mixed.js";
`, "handler.ts");

  assert.deepEqual(fact.exports.map((entry) => [entry.name, entry.kind]), [
    ["Contract", "type"],
    ["Handler", "type"],
    ["RuntimeEnum", "value"],
    ["Shape", "type"],
    ["ambientHandler", "type"],
    ["createTask", "type"],
    ["merged", "value"],
    ["runtimeValue", "value"],
  ]);
});

test("separates explicit namespace exports from unresolved export stars", () => {
  const fact = extractModuleFact(
    'export * from "./all.js";\nexport * as named from "./named.js";\n',
    "handler.ts",
  );

  assert.equal(fact.hasExportStar, true);
  assert.deepEqual(fact.exports.map((entry) => [entry.name, entry.kind]), [["named", "value"]]);
});

test("reports parser diagnostics without executing source", () => {
  const fact = extractModuleFact("export function broken( {", "broken.ts");

  assert.ok(fact.syntaxErrors.length > 0);
});

test("extracts ESM and CommonJS runtime edges and rejects computed targets", () => {
  const fact = extractModuleFact(`import value from "./value.js";
import type { Shape } from "./shape.js";
export type { Contract } from "./contract.js";
void import("./lazy.js");
void import(runtimeTarget);
const commonjs = require("./commonjs.cjs");
require.resolve("./resolved.js");
require(runtimeTarget);
`, "browser.ts");

  assert.deepEqual(
    fact.imports.map((entry) => [entry.specifier, entry.edgeKind]),
    [
      ["./commonjs.cjs", "runtime"],
      ["./contract.js", "type"],
      ["./lazy.js", "runtime"],
      ["./resolved.js", "runtime"],
      ["./shape.js", "type"],
      ["./value.js", "runtime"],
    ],
  );
  assert.equal(fact.unsupportedDynamicImports.length, 2);
});

test("ignores CommonJS-like calls when require is lexically shadowed", () => {
  const fact = extractModuleFact(`function run(require: (value: string) => unknown) {
  return require("./server.js");
}
{
  const require = (value: string) => value;
  require.resolve("./also-local.js");
}
`, "browser.ts");

  assert.deepEqual(fact.imports, []);
  assert.deepEqual(fact.unsupportedDynamicImports, []);
});

test("honors a require binding shared by switch clauses", () => {
  const fact = extractModuleFact(`switch (mode) {
  case "setup":
    const require = (value: string) => value;
    break;
  default:
    require("./local-call.js");
}
`, "browser.ts");

  assert.deepEqual(fact.imports, []);
});

test("honors a module-scoped var binding declared inside a block", () => {
  const fact = extractModuleFact(
    `
      if (enabled) {
        var require = loadDependency;
      }
      require("./local.js");
    `,
    "src/module-var.ts",
  );

  assert.deepEqual(fact.imports, []);
  assert.deepEqual(fact.unsupportedDynamicImports, []);
});

test("accepts no-substitution template literals as static dynamic imports", () => {
  const fact = extractModuleFact("void import(`./lazy.js`);\n", "browser.ts");

  assert.deepEqual(
    fact.imports.map((entry) => [entry.specifier, entry.edgeKind]),
    [["./lazy.js", "runtime"]],
  );
  assert.deepEqual(fact.unsupportedDynamicImports, []);
});
