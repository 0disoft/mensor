import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "../../../packages/compiler/dist/src/index.js";
import {
  createProtectedNodeSemanticTestPort,
  runAgentAuthoredBuildTrial,
} from "../dist/src/index.js";
import {
  writeAgentAuthoredGuestbook,
} from "./support/fake-agent-authored-guestbook.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const briefFile = fileURLToPath(
  new URL("../briefs/guestbook-v1.md", import.meta.url),
);
const rsvpBriefFile = fileURLToPath(
  new URL("../briefs/rsvp-v1.md", import.meta.url),
);
const guestbookV2BriefFile = fileURLToPath(
  new URL("../briefs/guestbook-v2.md", import.meta.url),
);
const guestbookV2OracleFile = fileURLToPath(
  new URL("../oracles/guestbook-v2.test.mjs", import.meta.url),
);
const codexSubagentCohortFile = fileURLToPath(
  new URL("../cohorts/codex-subagents-v1.json", import.meta.url),
);
const codexSubagentCohortV2File = fileURLToPath(
  new URL("../cohorts/codex-subagents-v2.json", import.meta.url),
);
const fakeAdapterIdentity = Object.freeze({
  runnerId: "fixture-agent",
  providerId: "test",
  modelId: "test/fake-guestbook-agent",
  reasoningEffort: "none",
  cohortId: "fixture-agent-authored-build",
});
const approvedDocuments = [
  ["readme", "README.md"],
  ["product-spec", "docs/product/02-spec.md"],
  ["cli-contract", "docs/cli/command-contract.md"],
  ["contract-spec", "packages/contract/spec/README.md"],
];

test("runs a complete agent-authored build trial in a fresh workspace", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const result = await runAgentAuthoredBuildTrial({
      ...await baseOptions(temporaryRoot),
      adapter: {
        identity: fakeAdapterIdentity,
        isolation: "injected-test",
        async run(context) {
          assert.deepEqual(await readdir(context.projectRoot), []);
          await writeAgentAuthoredGuestbook(context.projectRoot);
          return { rounds: 1 };
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.failureCategory, null);
    assert.deepEqual(result.semanticOracle, {
      id: "guestbook-semantic-oracle",
      revision: "v2",
      sha256: (await source(
        "guestbook-semantic-oracle",
        "v2",
        guestbookV2OracleFile,
      )).sha256,
    });
    assert.deepEqual(result.adapter, {
      identity: fakeAdapterIdentity,
      isolation: "injected-test",
      completed: true,
      rounds: 1,
    });
    assert.equal(result.finalState.semanticTestsPassed, true);
    assert.equal(result.finalState.semanticTestIsolation, "process-only");
    assert.equal(result.finalState.mensorCheckPassed, true);
    assert.deepEqual(result.finalState.diagnosticCodes, []);
    assert.ok(result.finalState.generatedFiles.includes("mensor.project.jsonc"));
    assert.ok(result.finalState.generatedFiles.includes("test/semantic.test.mjs"));
    assert.equal(JSON.stringify(result).includes(temporaryRoot), false);
    assert.deepEqual(await readdir(temporaryRoot), []);
  });
});

test("the protected oracle accepts the maintained reference app", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const projectRoot = path.join(temporaryRoot, "project");
    await mkdir(projectRoot);
    await writeAgentAuthoredGuestbook(projectRoot);
    const result = spawnSync(
      process.execPath,
      ["--test", guestbookV2OracleFile],
      {
        cwd: projectRoot,
        env: {},
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      },
    );
    assert.equal(
      result.status,
      0,
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  });
});

test("keeps semantic behavior independent from a clean Mensor check", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const result = await runAgentAuthoredBuildTrial({
      ...await baseOptions(temporaryRoot),
      adapter: {
        identity: fakeAdapterIdentity,
        isolation: "injected-test",
        async run(context) {
          await writeAgentAuthoredGuestbook(context.projectRoot, {
            semanticFailure: true,
          });
          return { rounds: 1 };
        },
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.failureCategory, "semantic-test-failed");
    assert.equal(result.finalState.semanticTestCompleted, true);
    assert.equal(result.finalState.semanticTestsPassed, false);
    assert.equal(result.finalState.mensorCheckPassed, true);
  });
});

test("reports Mensor diagnostics after application semantics pass", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const result = await runAgentAuthoredBuildTrial({
      ...await baseOptions(temporaryRoot),
      adapter: {
        identity: fakeAdapterIdentity,
        isolation: "injected-test",
        async run(context) {
          await writeAgentAuthoredGuestbook(context.projectRoot, {
            missingHandlerExport: true,
          });
          return { rounds: 1 };
        },
      },
    });

    assert.equal(result.success, false);
    assert.equal(result.failureCategory, "mensor-check-failed");
    assert.equal(result.finalState.semanticTestsPassed, true);
    assert.equal(result.finalState.mensorCheckCompleted, true);
    assert.equal(result.finalState.mensorCheckPassed, false);
    assert.deepEqual(result.finalState.diagnosticCodes, [
      "handler.export_missing",
    ]);
  });
});

test("rejects protected input mutation before running either oracle", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    let semanticCalls = 0;
    let mensorCalls = 0;
    const options = await baseOptions(temporaryRoot);
    const result = await runAgentAuthoredBuildTrial({
      ...options,
      adapter: {
        identity: fakeAdapterIdentity,
        isolation: "injected-test",
        async run(context) {
          await writeFile(context.briefFile, "weakened\n", "utf8");
          return { rounds: 1 };
        },
      },
      semanticTest: {
        isolation: "injected-test",
        async run() {
          semanticCalls += 1;
          return true;
        },
      },
      mensorCheck: async () => {
        mensorCalls += 1;
        return { completed: true, passed: true, diagnosticCodes: [] };
      },
    });

    assert.equal(result.failureCategory, "protected-input-changed");
    assert.equal(result.finalState.semanticTestCompleted, false);
    assert.equal(result.finalState.mensorCheckCompleted, false);
    assert.equal(semanticCalls, 0);
    assert.equal(mensorCalls, 0);
    assert.deepEqual(await readdir(temporaryRoot), []);
  });
});

test("prioritizes workspace boundary violations over agent errors", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const result = await runAgentAuthoredBuildTrial({
      ...await baseOptions(temporaryRoot),
      adapter: {
        identity: fakeAdapterIdentity,
        isolation: "injected-test",
        async run(context) {
          await writeFile(
            path.join(context.workspaceRoot, "outside-project.txt"),
            "partial\n",
            "utf8",
          );
          throw new Error("private provider failure");
        },
      },
    });

    assert.equal(result.failureCategory, "workspace-boundary-violation");
    assert.equal(result.adapter.completed, false);
    assert.equal(JSON.stringify(result).includes("private provider failure"), false);
    assert.deepEqual(await readdir(temporaryRoot), []);
  });
});

test("validates pinned inputs before creating mutable workspace state", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const options = await baseOptions(temporaryRoot);
    await assert.rejects(
      runAgentAuthoredBuildTrial({
        ...options,
        brief: { ...options.brief, sha256: "0".repeat(64) },
      }),
      /does not match its pinned SHA-256 digest/,
    );
    assert.deepEqual(await readdir(temporaryRoot), []);
  });
});

test("requires canonical adapter identity before creating mutable state", async () => {
  await withTemporaryParent(async (temporaryRoot) => {
    const options = await baseOptions(temporaryRoot);
    await assert.rejects(
      runAgentAuthoredBuildTrial({
        ...options,
        adapter: {
          ...options.adapter,
          identity: {
            ...fakeAdapterIdentity,
            modelId: "unnamespaced-model",
          },
        },
      }),
      /adapter must declare a canonical execution identity/,
    );
    assert.deepEqual(await readdir(temporaryRoot), []);
  });
});

test("the first brief is self-contained and forbids fixture copying", async () => {
  const brief = await readFile(briefFile, "utf8");
  for (const heading of [
    "## Goal",
    "## Product Behavior",
    "## Mensor Contract",
    "## Required Files",
    "## Constraints",
    "## Completion Evidence",
  ]) {
    assert.ok(brief.includes(heading));
  }
  assert.match(brief, /empty `project\/` directory/);
  assert.match(brief, /Do not read or copy Mensor fixtures/);
  assert.match(brief, /Both must pass/);
});

test("the second brief exercises one mutually exclusive radio field", async () => {
  const brief = await readFile(rsvpBriefFile, "utf8");
  for (const heading of [
    "## Goal",
    "## Product Behavior",
    "## Mensor Contract",
    "## Required Files",
    "## Constraints",
    "## Completion Evidence",
  ]) {
    assert.ok(brief.includes(heading));
  }
  assert.match(brief, /exact values `yes`, `no`, and `maybe`/);
  assert.match(
    brief,
    /same-name radio controls as one mutually exclusive wire\s+field/,
  );
  assert.match(brief, /Do not read or copy Mensor fixtures/);
  assert.match(brief, /Both must pass/);
});

test("guestbook v2 gives the evaluator ownership of the semantic oracle", async () => {
  const brief = await readFile(guestbookV2BriefFile, "utf8");
  assert.match(brief, /evaluator owns the semantic oracle/i);
  assert.match(brief, /Export a runtime function named `createGuestbookApp`/);
  assert.match(brief, /GET rendering must use the supplied `templateHtml`/);
  assert.match(brief, /Agent-authored tests and completion claims are not evidence/);
});

test("pins the first Codex subagent cohort without silent model substitution", async () => {
  const cohort = JSON.parse(await readFile(codexSubagentCohortFile, "utf8"));
  assert.deepEqual(
    {
      schemaVersion: cohort.schemaVersion,
      cohortId: cohort.cohortId,
      runnerId: cohort.runnerId,
      contextPolicy: cohort.contextPolicy,
      availabilityPolicy: cohort.availabilityPolicy,
      aggregationPolicy: cohort.aggregationPolicy,
      trialsPerModel: cohort.trialsPerModel,
      correctionRoundLimit: cohort.correctionRoundLimit,
    },
    {
      schemaVersion: 1,
      cohortId: "codex-subagents-v1",
      runnerId: "codex-subagent",
      contextPolicy: "fresh-agent-no-inherited-conversation",
      availabilityPolicy: "record-unavailable-without-substitution",
      aggregationPolicy: "report-each-model-separately",
      trialsPerModel: 1,
      correctionRoundLimit: 3,
    },
  );
  assert.deepEqual(cohort.brief, { id: "guestbook", revision: "v1" });
  assert.deepEqual(
    cohort.models.map(({ modelId }) => modelId),
    [
      "umans/umans-glm-5.2",
      "umans/umans-kimi-k2.7",
      "opencode-go/minimax-m3",
      "opencode-go/deepseek-v4-flash",
    ],
  );
  assert.equal(new Set(cohort.models.map(({ modelId }) => modelId)).size, 4);
  assert.ok(cohort.models.every(({ reasoningEffort }) => reasoningEffort === "high"));
});

test("pins cohort v2 to the evaluator-owned oracle", async () => {
  const cohort = JSON.parse(await readFile(codexSubagentCohortV2File, "utf8"));
  assert.equal(cohort.cohortId, "codex-subagents-v2");
  assert.deepEqual(cohort.brief, { id: "guestbook", revision: "v2" });
  assert.deepEqual(cohort.semanticOracle, {
    id: "guestbook-semantic-oracle",
    revision: "v2",
  });
  assert.deepEqual(
    cohort.models.map(({ modelId }) => modelId),
    [
      "umans/umans-glm-5.2",
      "umans/umans-kimi-k2.7",
      "opencode-go/minimax-m3",
      "opencode-go/deepseek-v4-flash",
    ],
  );
});

async function baseOptions(temporaryRoot) {
  return {
    trialId: "guestbook-v2.fake.1",
    producerVersion: "0.0.0-test",
    brief: await source("guestbook", "v2", guestbookV2BriefFile),
    semanticOracle: await source(
      "guestbook-semantic-oracle",
      "v2",
      guestbookV2OracleFile,
    ),
    documents: await Promise.all(
      approvedDocuments.map(([id, relativePath]) =>
        source(id, "v1", path.join(repositoryRoot, ...relativePath.split("/")))
      ),
    ),
    adapter: {
      identity: fakeAdapterIdentity,
      isolation: "injected-test",
      async run() {
        throw new Error("adapter must be replaced by the test");
      },
    },
    semanticTest: createProtectedNodeSemanticTestPort({
      inputFile: "semantic-oracle.test.mjs",
      timeoutMs: 5_000,
      maxOutputBytes: 65_536,
    }),
    mensorCheck: checkGeneratedProject,
    temporaryRoot,
  };
}

async function checkGeneratedProject(projectRoot) {
  const result = await checkProject({
    root: projectRoot,
    producerVersion: "0.0.0-agent-build-test",
  });
  if (!result.ok) {
    return { completed: false, passed: false, diagnosticCodes: [] };
  }
  const diagnosticCodes = result.report.diagnostics
    .map((diagnostic) => diagnostic.code)
    .sort();
  return {
    completed: true,
    passed: diagnosticCodes.length === 0,
    diagnosticCodes,
  };
}

async function source(id, revision, sourceFile) {
  const bytes = await readFile(sourceFile);
  return {
    id,
    revision,
    sourceFile,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function withTemporaryParent(callback) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-agent-build-parent-"));
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
