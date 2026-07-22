import {
  parseCheckOutputV2,
  parseProjectContract,
} from "../packages/contract/dist/src/index.js";

const result = parseProjectContract(`{
  // Smoke-test comment
  "version": 1,
  "sourceRoot": "src",
  "featureContracts": ["src/features/tasks/feature.mensor.jsonc"],
  "fileRoles": [{"role": "server", "withinFeature": "server"}]
}`);

if (!result.ok || result.value.sourceRoot !== "src") {
  throw new Error(`Contract package smoke test failed: ${JSON.stringify(result)}`);
}

const output = parseCheckOutputV2(JSON.stringify({
  schemaVersion: 2,
  producer: { name: "mensor", version: "0.0.0-smoke" },
  status: "passed",
  inspection: {
    filePlacement: { state: "checked", basis: "file-roles" },
    forms: { state: "checked", basis: "static-html-form-index" },
    handlers: { state: "checked", basis: "static-module-facts" },
    moduleBoundaries: { state: "not-configured", basis: "module-graph" },
    ownership: { state: "not-configured", basis: "ownership-rules" },
    routes: { state: "not-configured", basis: "route-index" },
    runtimeSemantics: { state: "out-of-scope", basis: "none" },
  },
  diagnostics: [],
  summary: { errorCount: 0, warningCount: 0 },
}));

if (!output.ok || output.value.status !== "passed") {
  throw new Error(`Check Output v2 smoke test failed: ${JSON.stringify(output)}`);
}
