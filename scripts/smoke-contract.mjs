import { parseProjectContract } from "../packages/contract/dist/src/index.js";

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
