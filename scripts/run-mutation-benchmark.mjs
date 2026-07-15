import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMutationBenchmarkReport,
  mutationCatalog,
  runMutationCase,
} from "../internal/fixture-kit/dist/src/index.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const producerVersion = await workspaceVersion();
const cases = [];

for (const mutation of mutationCatalog) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-mutation-benchmark-"));
  try {
    await cp(
      baselineRoot(mutation.baselineId),
      root,
      { recursive: true },
    );
    cases.push(await runMutationCase(root, mutation.id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function baselineRoot(baselineId) {
  return baselineId === "dogfood-tasks"
    ? path.join(repositoryRoot, "examples", "dogfood-tasks")
    : path.join(repositoryRoot, "fixtures", "valid", baselineId);
}

const report = createMutationBenchmarkReport(cases, producerVersion);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function workspaceVersion() {
  const metadata = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  if (
    typeof metadata.version !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/u.test(metadata.version)
  ) {
    throw new Error("Workspace package metadata must declare a semantic version.");
  }
  return metadata.version;
}
