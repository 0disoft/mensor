import { readFile } from "node:fs/promises";

import {
  parseDiagnosticReport,
  parseFeatureContract,
  parseProjectContract,
  parseRouteIndex,
} from "../packages/contract/dist/src/index.js";

const fixtures = [
  fixture("valid/tiny-tasks"),
  fixture("valid/layered-tasks"),
  fixture("valid/hono-static-tasks", {
    routeIndex: "mensor.route-index.json",
  }),
  fixture("valid/node-static-rsvp", {
    feature: "src/features/rsvp/feature.mensor.jsonc",
    routeIndex: "mensor.route-index.json",
  }),
  fixture("invalid/file-role-mismatch"),
  fixture("invalid/form-field-missing"),
  fixture("invalid/form-field-unexpected"),
  fixture("invalid/form-method-mismatch"),
  fixture("invalid/form-action-mismatch"),
  fixture("invalid/form-control-codec-mismatch"),
  fixture("invalid/form-control-unsupported"),
  fixture("invalid/handler-export-missing"),
  fixture("invalid/module-boundary-transitive"),
  fixture("invalid/module-boundary-direct"),
  fixture("invalid/module-dynamic-import-unsupported"),
  fixture("invalid/ownership-test-slot"),
  fixture("invalid/ownership-i18n-unowned"),
];
const fixtureRoot = new URL("../fixtures/", import.meta.url);

for (const entry of fixtures) {
  assertSuccess(
    parseProjectContract(await text(`${entry.root}/mensor.project.jsonc`)),
    `${entry.root}/mensor.project.jsonc`,
  );
  assertSuccess(
    parseFeatureContract(await text(`${entry.root}/${entry.feature}`)),
    `${entry.root}/${entry.feature}`,
  );
  assertSuccess(
    parseDiagnosticReport(await text(`${entry.root}/expected-report.json`)),
    `${entry.root}/expected-report.json`,
  );
  if (entry.routeIndex !== undefined) {
    assertSuccess(
      parseRouteIndex(await text(`${entry.root}/${entry.routeIndex}`)),
      `${entry.root}/${entry.routeIndex}`,
    );
  }
}

assertSuccess(
  parseProjectContract(await readFile(new URL(
    "../examples/dogfood-tasks/mensor.project.jsonc",
    import.meta.url,
  ), "utf8")),
  "examples/dogfood-tasks/mensor.project.jsonc",
);
assertSuccess(
  parseFeatureContract(await readFile(new URL(
    "../examples/dogfood-tasks/src/features/tasks/feature.mensor.jsonc",
    import.meta.url,
  ), "utf8")),
  "examples/dogfood-tasks/src/features/tasks/feature.mensor.jsonc",
);
assertSuccess(
  parseDiagnosticReport(await readFile(new URL(
    "../examples/dogfood-tasks/expected-report.json",
    import.meta.url,
  ), "utf8")),
  "examples/dogfood-tasks/expected-report.json",
);

function fixture(root, options = {}) {
  return {
    root,
    feature: options.feature ?? "src/features/tasks/feature.mensor.jsonc",
    ...(options.routeIndex === undefined
      ? {}
      : { routeIndex: options.routeIndex }),
  };
}

function assertSuccess(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed validation: ${JSON.stringify(result.issues)}`);
  }
}

async function text(relativePath) {
  return readFile(new URL(relativePath, fixtureRoot), "utf8");
}
