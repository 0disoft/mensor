import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMutationBenchmarkReport,
  mutationCatalog,
  runMutationCase,
} from "../internal/fixture-kit/dist/src/index.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const cases = [];

for (const mutation of mutationCatalog) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-mutation-benchmark-"));
  try {
    await cp(
      path.join(repositoryRoot, "fixtures", "valid", mutation.baselineId),
      root,
      { recursive: true },
    );
    cases.push(await runMutationCase(root, mutation.id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const report = createMutationBenchmarkReport(cases, "0.0.23");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
