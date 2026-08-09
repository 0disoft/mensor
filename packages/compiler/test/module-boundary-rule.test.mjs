import assert from "node:assert/strict";
import test from "node:test";

import {
  checkImportBoundaries,
  importCandidates,
  resolveImport,
} from "../dist/src/module-boundary-rule.js";

const zeroRange = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 1 },
};

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

test("direct boundaries parse only from-role roots", async () => {
  const facts = new Map([
    ["src/features/tasks/browser/entry.ts", moduleFact({
      imports: [moduleImport("../server/secret.js")],
    })],
  ]);
  const reads = [];
  const diagnostics = await checkImportBoundaries(boundaryOptions({
    mode: "direct",
    discoveredFiles: [
      "src/features/tasks/browser/entry.ts",
      "src/features/tasks/server/secret.ts",
      "src/features/tasks/server/unrelated.ts",
    ],
    facts,
    reads,
  }));

  assert.deepEqual(reads, ["src/features/tasks/browser/entry.ts"]);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "module.boundary_violation");
  assert.deepEqual(diagnostics[0].facts.importChain, [
    "src/features/tasks/browser/entry.ts",
    "src/features/tasks/server/secret.ts",
  ]);
});

test("transitive boundaries reuse one shared traversal and canonical witness", async () => {
  const facts = new Map([
    ["src/features/tasks/browser/a.ts", moduleFact({
      imports: [moduleImport("../shared/common.js")],
    })],
    ["src/features/tasks/browser/b.ts", moduleFact({
      imports: [moduleImport("../shared/common.js")],
    })],
    ["src/features/tasks/shared/common.ts", moduleFact({
      imports: [moduleImport("../server/secret.js")],
      unsupportedDynamicImports: [zeroRange],
    })],
  ]);
  const reads = [];
  const diagnostics = await checkImportBoundaries(boundaryOptions({
    mode: "transitive",
    discoveredFiles: [
      "src/features/tasks/browser/a.ts",
      "src/features/tasks/browser/b.ts",
      "src/features/tasks/shared/common.ts",
      "src/features/tasks/server/secret.ts",
      "src/features/tasks/server/unrelated.ts",
    ],
    facts,
    reads,
  }));

  assert.deepEqual(reads, [
    "src/features/tasks/browser/a.ts",
    "src/features/tasks/browser/b.ts",
    "src/features/tasks/shared/common.ts",
  ]);
  assert.equal(diagnostics.length, 2);
  assert.equal(
    diagnostics.filter((diagnostic) =>
      diagnostic.code === "module.dynamic_import_unsupported").length,
    1,
  );
  const violation = diagnostics.find((diagnostic) =>
    diagnostic.code === "module.boundary_violation");
  assert.deepEqual(violation.facts.importChain, [
    "src/features/tasks/browser/a.ts",
    "src/features/tasks/shared/common.ts",
    "src/features/tasks/server/secret.ts",
  ]);
});

function boundaryOptions({ mode, discoveredFiles, facts, reads }) {
  const boundary = {
    id: "browser-no-server",
    mode,
    from: ["browser"],
    deny: ["server"],
  };
  return {
    projectContractPath: "mensor.project.jsonc",
    projectText: JSON.stringify({ boundaries: [boundary] }),
    featureContractPaths: ["src/features/tasks/feature.mensor.jsonc"],
    fileRoles: [
      { role: "browser", withinFeature: "browser" },
      { role: "shared", withinFeature: "shared" },
      { role: "server", withinFeature: "server" },
    ],
    boundaries: [boundary],
    discoveredFiles,
    sourceFacts: {
      async get(file) {
        reads.push(file);
        const fact = facts.get(file);
        if (fact === undefined) {
          throw new Error(`unexpected source parse: ${file}`);
        }
        return fact;
      },
      async source() {
        throw new Error("source text should not be requested directly");
      },
    },
  };
}

function moduleFact({ imports = [], unsupportedDynamicImports = [] } = {}) {
  return {
    exports: [],
    hasExportStar: false,
    imports,
    unsupportedDynamicImports,
    syntaxErrors: [],
  };
}

function moduleImport(specifier) {
  return {
    edgeKind: "runtime",
    specifier,
    range: zeroRange,
  };
}
