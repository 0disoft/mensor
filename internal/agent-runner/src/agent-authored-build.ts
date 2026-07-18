import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  captureWorkspaceSnapshot,
  type WorkspaceSnapshotLimits,
} from "@mensor/fixture-kit";

export type AgentAuthoredBuildIsolation =
  | "injected-test"
  | "process-only"
  | "sandboxed-workspace-only";

export const agentAuthoredBuildIsolationKinds = [
  "injected-test",
  "process-only",
  "sandboxed-workspace-only",
] as const satisfies readonly AgentAuthoredBuildIsolation[];

export type AgentAuthoredBuildFailureCategory =
  | "agent-error"
  | "mensor-check-failed"
  | "protected-input-changed"
  | "semantic-test-failed"
  | "workspace-boundary-violation";

export const agentAuthoredBuildFailureCategories = [
  "agent-error",
  "mensor-check-failed",
  "protected-input-changed",
  "semantic-test-failed",
  "workspace-boundary-violation",
] as const satisfies readonly AgentAuthoredBuildFailureCategory[];

export interface AgentAuthoredBuildSource {
  readonly id: string;
  readonly revision: string;
  readonly sourceFile: string;
  readonly sha256: string;
}

export interface AgentAuthoredBuildAdapterContext {
  readonly workspaceRoot: string;
  readonly projectRoot: string;
  readonly inputRoot: string;
  readonly briefFile: string;
  readonly documentationRoot: string;
}

export interface AgentAuthoredBuildAdapterResult {
  readonly rounds: number;
}

export type AgentAuthoredBuildReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";

export interface AgentAuthoredBuildAdapterIdentity {
  readonly runnerId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoningEffort: AgentAuthoredBuildReasoningEffort;
  readonly cohortId: string;
}

export interface AgentAuthoredBuildAdapterPort {
  readonly identity: AgentAuthoredBuildAdapterIdentity;
  readonly isolation: AgentAuthoredBuildIsolation;
  readonly run: (
    context: AgentAuthoredBuildAdapterContext,
  ) => AgentAuthoredBuildAdapterResult | Promise<AgentAuthoredBuildAdapterResult>;
}

export interface AgentAuthoredMensorCheckResult {
  readonly completed: boolean;
  readonly passed: boolean;
  readonly diagnosticCodes: readonly string[];
}

export type AgentAuthoredMensorCheckPort = (
  projectRoot: string,
) => AgentAuthoredMensorCheckResult | Promise<AgentAuthoredMensorCheckResult>;

export type AgentAuthoredSemanticTestIsolation =
  | "injected-test"
  | "process-only"
  | "sandboxed-workspace-only";

export interface AgentAuthoredSemanticTestPort {
  readonly isolation: AgentAuthoredSemanticTestIsolation;
  readonly run: (projectRoot: string) => boolean | Promise<boolean>;
}

export interface RunAgentAuthoredBuildTrialOptions {
  readonly trialId: string;
  readonly producerVersion: string;
  readonly brief: AgentAuthoredBuildSource;
  readonly documents: readonly AgentAuthoredBuildSource[];
  readonly adapter: AgentAuthoredBuildAdapterPort;
  readonly semanticTest: AgentAuthoredSemanticTestPort;
  readonly mensorCheck: AgentAuthoredMensorCheckPort;
  readonly temporaryRoot?: string;
  readonly snapshotLimits?: Partial<WorkspaceSnapshotLimits>;
}

export interface AgentAuthoredBuildTrialResult {
  readonly schemaVersion: 1;
  readonly kind: "agent-authored-build-trial";
  readonly trialId: string;
  readonly producerVersion: string;
  readonly brief: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  };
  readonly documents: readonly {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
  }[];
  readonly adapter: {
    readonly identity: AgentAuthoredBuildAdapterIdentity;
    readonly isolation: AgentAuthoredBuildIsolation;
    readonly completed: boolean;
    readonly rounds: number;
  };
  readonly finalState: {
    readonly semanticTestIsolation: AgentAuthoredSemanticTestIsolation;
    readonly semanticTestCompleted: boolean;
    readonly semanticTestsPassed: boolean;
    readonly mensorCheckCompleted: boolean;
    readonly mensorCheckPassed: boolean;
    readonly diagnosticCodes: readonly string[];
    readonly generatedFiles: readonly string[];
  };
  readonly success: boolean;
  readonly failureCategory: AgentAuthoredBuildFailureCategory | null;
}

export interface NodeSemanticTestPortOptions {
  readonly testFile: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

interface LoadedSource {
  readonly id: string;
  readonly revision: string;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

const maximumInputFileBytes = 262_144;

export async function runAgentAuthoredBuildTrial(
  options: RunAgentAuthoredBuildTrialOptions,
): Promise<AgentAuthoredBuildTrialResult> {
  const validated = await validateOptions(options);
  const temporaryRoot = path.resolve(options.temporaryRoot ?? tmpdir());
  await assertRealDirectory(temporaryRoot, "Temporary root");
  const workspaceRoot = await mkdtemp(
    path.join(temporaryRoot, `mensor-build-${safePrefix(validated.trialId)}-`),
  );
  assertContained(temporaryRoot, workspaceRoot);

  try {
    const inputRoot = path.join(workspaceRoot, "input");
    const documentationRoot = path.join(inputRoot, "docs");
    const projectRoot = path.join(workspaceRoot, "project");
    const briefFile = path.join(inputRoot, "brief.md");
    await mkdir(documentationRoot, { recursive: true });
    await mkdir(projectRoot);
    await writeFile(briefFile, validated.brief.bytes, { flag: "wx" });
    for (const document of validated.documents) {
      await writeFile(
        path.join(documentationRoot, `${document.id}.md`),
        document.bytes,
        { flag: "wx" },
      );
    }
    const protectedSnapshot = await captureWorkspaceSnapshot(
      inputRoot,
      options.snapshotLimits,
    );

    let adapterCompleted = false;
    let rounds = 0;
    try {
      const adapterResult = await options.adapter.run({
        workspaceRoot,
        projectRoot,
        inputRoot,
        briefFile,
        documentationRoot,
      });
      rounds = requirePositiveCount(adapterResult.rounds, "adapter rounds");
      adapterCompleted = true;
    } catch {
      adapterCompleted = false;
      rounds = 0;
    }

    let protectedInputChanged = false;
    let workspaceBoundaryViolated = false;
    let generatedFiles: readonly string[] = [];
    try {
      const finalProtectedSnapshot = await captureWorkspaceSnapshot(
        inputRoot,
        options.snapshotLimits,
      );
      protectedInputChanged = !sameRecord(
        protectedSnapshot,
        finalProtectedSnapshot,
      );
      const workspaceSnapshot = await captureWorkspaceSnapshot(
        workspaceRoot,
        options.snapshotLimits,
      );
      const files = Object.keys(workspaceSnapshot);
      workspaceBoundaryViolated = files.some((file) =>
        !file.startsWith("input/") && !file.startsWith("project/")
      );
      generatedFiles = files
        .filter((file) => file.startsWith("project/"))
        .map((file) => file.slice("project/".length))
        .sort(compareText);
    } catch {
      workspaceBoundaryViolated = true;
      generatedFiles = [];
    }

    let semanticTestCompleted = false;
    let semanticTestsPassed = false;
    let mensorCheckCompleted = false;
    let mensorCheckPassed = false;
    let diagnosticCodes: readonly string[] = [];
    if (
      adapterCompleted
      && !protectedInputChanged
      && !workspaceBoundaryViolated
    ) {
      try {
        semanticTestsPassed = await options.semanticTest.run(projectRoot);
        semanticTestCompleted = true;
      } catch {
        semanticTestCompleted = false;
        semanticTestsPassed = false;
      }
      try {
        const check = validateMensorCheckResult(
          await options.mensorCheck(projectRoot),
        );
        mensorCheckCompleted = check.completed;
        mensorCheckPassed = check.passed;
        diagnosticCodes = check.diagnosticCodes;
      } catch {
        mensorCheckCompleted = false;
        mensorCheckPassed = false;
        diagnosticCodes = [];
      }
    }

    const failureCategory = classifyFailure({
      protectedInputChanged,
      workspaceBoundaryViolated,
      adapterCompleted,
      semanticTestCompleted,
      semanticTestsPassed,
      mensorCheckCompleted,
      mensorCheckPassed,
    });
    return {
      schemaVersion: 1,
      kind: "agent-authored-build-trial",
      trialId: validated.trialId,
      producerVersion: validated.producerVersion,
      brief: sourceReference(validated.brief),
      documents: validated.documents.map(sourceReference),
      adapter: {
        identity: validated.adapterIdentity,
        isolation: options.adapter.isolation,
        completed: adapterCompleted,
        rounds,
      },
      finalState: {
        semanticTestIsolation: options.semanticTest.isolation,
        semanticTestCompleted,
        semanticTestsPassed,
        mensorCheckCompleted,
        mensorCheckPassed,
        diagnosticCodes,
        generatedFiles,
      },
      success: failureCategory === null,
      failureCategory,
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: false });
  }
}

export function createNodeSemanticTestPort(
  options: NodeSemanticTestPortOptions,
): AgentAuthoredSemanticTestPort {
  const testFile = requireRelativePath(options.testFile, "testFile");
  const timeoutMs = requireLimit(options.timeoutMs, 1, 60_000, "timeoutMs");
  const maxOutputBytes = requireLimit(
    options.maxOutputBytes,
    1,
    1_048_576,
    "maxOutputBytes",
  );
  return {
    isolation: "process-only",
    run: (projectRoot) => runNodeSemanticTest({
      projectRoot,
      testFile,
      timeoutMs,
      maxOutputBytes,
    }),
  };
}

async function runNodeSemanticTest(options: {
  readonly projectRoot: string;
  readonly testFile: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}): Promise<boolean> {
  const projectRoot = path.resolve(options.projectRoot);
  await assertRealDirectory(projectRoot, "Generated project root");
  const testFile = path.resolve(
    projectRoot,
    ...options.testFile.split("/"),
  );
  assertContained(projectRoot, testFile);
  const testStats = await lstat(testFile);
  if (testStats.isSymbolicLink() || !testStats.isFile()) {
    throw new Error("Semantic test entry must be a real file.");
  }

  const child = spawn(process.execPath, ["--test", options.testFile], {
    cwd: projectRoot,
    env: {},
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let outputBytes = 0;
  let terminated = false;
  const completion = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
    const capture = (chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > options.maxOutputBytes && !terminated) {
        terminated = true;
        terminateProcessTree(child);
      }
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
  });
  const timeout = setTimeout(() => {
    if (!terminated) {
      terminated = true;
      terminateProcessTree(child);
    }
  }, options.timeoutMs);
  timeout.unref();
  const exitCode = await completion.finally(() => clearTimeout(timeout));
  return !terminated && exitCode === 0;
}

async function validateOptions(
  options: RunAgentAuthoredBuildTrialOptions,
): Promise<{
  readonly trialId: string;
  readonly producerVersion: string;
  readonly brief: LoadedSource;
  readonly documents: readonly LoadedSource[];
  readonly adapterIdentity: AgentAuthoredBuildAdapterIdentity;
}> {
  const trialId = requireIdentifier(options.trialId, "trialId");
  const producerVersion = requireIdentifier(
    options.producerVersion,
    "producerVersion",
  );
  if (
    typeof options.adapter !== "object"
    || options.adapter === null
  ) {
    throw new Error("adapter must be an object.");
  }
  if (!isAdapterIdentity(options.adapter.identity)) {
    throw new Error("adapter must declare a canonical execution identity.");
  }
  if (
    !agentAuthoredBuildIsolationKinds.includes(options.adapter.isolation)
    || typeof options.adapter.run !== "function"
  ) {
    throw new Error("adapter must declare supported isolation and a run function.");
  }
  if (
    typeof options.semanticTest !== "object"
    || options.semanticTest === null
    || !agentAuthoredBuildIsolationKinds.includes(options.semanticTest.isolation)
    || typeof options.semanticTest.run !== "function"
  ) {
    throw new Error(
      "semanticTest must declare supported isolation and a run function.",
    );
  }
  if (typeof options.mensorCheck !== "function") {
    throw new Error("mensorCheck must be a function.");
  }
  const brief = await loadSource(options.brief, "brief");
  if (options.documents.length === 0) {
    throw new Error("documents must contain at least one approved document.");
  }
  const documents = await Promise.all(
    options.documents.map((document, index) =>
      loadSource(document, `documents[${index}]`)
    ),
  );
  const sortedDocuments = [...documents].sort((left, right) =>
    compareText(left.id, right.id)
  );
  const ids = new Set(sortedDocuments.map((document) => document.id));
  if (ids.size !== sortedDocuments.length) {
    throw new Error("documents must use unique IDs.");
  }
  return {
    trialId,
    producerVersion,
    brief,
    documents: sortedDocuments,
    adapterIdentity: canonicalAdapterIdentity(options.adapter.identity),
  };
}

async function loadSource(
  source: AgentAuthoredBuildSource,
  label: string,
): Promise<LoadedSource> {
  const id = requireIdentifier(source.id, `${label}.id`);
  const revision = requireIdentifier(source.revision, `${label}.revision`);
  if (!path.isAbsolute(source.sourceFile) || source.sourceFile.includes("\0")) {
    throw new Error(`${label}.sourceFile must be an absolute path.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(source.sha256)) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256 digest.`);
  }
  const stats = await lstat(source.sourceFile);
  if (
    stats.isSymbolicLink()
    || !stats.isFile()
    || stats.size > maximumInputFileBytes
  ) {
    throw new Error(`${label}.sourceFile must be a bounded real file.`);
  }
  const bytes = await readFile(source.sourceFile);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== source.sha256) {
    throw new Error(`${label} does not match its pinned SHA-256 digest.`);
  }
  return { id, revision, sha256: source.sha256, bytes };
}

function validateMensorCheckResult(
  value: AgentAuthoredMensorCheckResult,
): AgentAuthoredMensorCheckResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("Mensor check result must be an object.");
  }
  if (typeof value.completed !== "boolean" || typeof value.passed !== "boolean") {
    throw new Error("Mensor check result must declare completed and passed.");
  }
  if (
    !Array.isArray(value.diagnosticCodes)
    || value.diagnosticCodes.some((code) =>
      typeof code !== "string"
      || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(code)
    )
  ) {
    throw new Error("Mensor check result diagnostic codes are invalid.");
  }
  const diagnosticCodes = [...new Set(value.diagnosticCodes)].sort(compareText);
  if (JSON.stringify(diagnosticCodes) !== JSON.stringify(value.diagnosticCodes)) {
    throw new Error("Mensor check result diagnostic codes must be canonical.");
  }
  if (!value.completed && (value.passed || diagnosticCodes.length > 0)) {
    throw new Error("An incomplete Mensor check cannot pass or report diagnostics.");
  }
  if (value.completed && value.passed !== (diagnosticCodes.length === 0)) {
    throw new Error("Mensor check pass state must match its diagnostic codes.");
  }
  return { completed: value.completed, passed: value.passed, diagnosticCodes };
}

function classifyFailure(state: {
  readonly protectedInputChanged: boolean;
  readonly workspaceBoundaryViolated: boolean;
  readonly adapterCompleted: boolean;
  readonly semanticTestCompleted: boolean;
  readonly semanticTestsPassed: boolean;
  readonly mensorCheckCompleted: boolean;
  readonly mensorCheckPassed: boolean;
}): AgentAuthoredBuildFailureCategory | null {
  if (state.protectedInputChanged) {
    return "protected-input-changed";
  }
  if (state.workspaceBoundaryViolated) {
    return "workspace-boundary-violation";
  }
  if (!state.adapterCompleted) {
    return "agent-error";
  }
  if (!state.semanticTestCompleted || !state.semanticTestsPassed) {
    return "semantic-test-failed";
  }
  if (!state.mensorCheckCompleted || !state.mensorCheckPassed) {
    return "mensor-check-failed";
  }
  return null;
}

function sourceReference(source: LoadedSource): {
  readonly id: string;
  readonly revision: string;
  readonly sha256: string;
} {
  return { id: source.id, revision: source.revision, sha256: source.sha256 };
}

function requireIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)
  ) {
    throw new Error(`${label} must be a bounded identifier.`);
  }
  return value;
}

function isAdapterIdentity(
  value: unknown,
): value is AgentAuthoredBuildAdapterIdentity {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const identity = value as Partial<AgentAuthoredBuildAdapterIdentity>;
  return isIdentifier(identity.runnerId)
    && isIdentifier(identity.providerId)
    && isNamespacedIdentifier(identity.modelId)
    && isReasoningEffort(identity.reasoningEffort)
    && isIdentifier(identity.cohortId);
}

function canonicalAdapterIdentity(
  identity: AgentAuthoredBuildAdapterIdentity,
): AgentAuthoredBuildAdapterIdentity {
  return {
    runnerId: identity.runnerId,
    providerId: identity.providerId,
    modelId: identity.modelId,
    reasoningEffort: identity.reasoningEffort,
    cohortId: identity.cohortId,
  };
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function isNamespacedIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 255
    && /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/u.test(
      value,
    );
}

function isReasoningEffort(
  value: unknown,
): value is AgentAuthoredBuildReasoningEffort {
  return typeof value === "string" && [
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ].includes(value);
}

function requirePositiveCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function requireLimit(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function requireRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\\")
    || value.startsWith("/")
    || value.split("/").includes("..")
  ) {
    throw new Error(`${label} must be a root-relative POSIX path.`);
  }
  return value;
}

async function assertRealDirectory(root: string, label: string): Promise<void> {
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
}

function assertContained(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (
    relative.length === 0
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error("Path must remain inside its configured parent.");
  }
}

function sameRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safePrefix(trialId: string): string {
  return trialId.replaceAll(/[^A-Za-z0-9_-]/gu, "-").slice(0, 48);
}

function terminateProcessTree(child: ChildProcess): void {
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    child.kill("SIGKILL");
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    const killer = spawn(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"],
      {
        env: { SystemRoot: systemRoot },
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      },
    );
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
