import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";

import { checkProject } from "@mensor/compiler";
import {
  captureWorkspaceSnapshot,
  compareWorkspaceSnapshots,
  type WorkspaceSnapshotLimits,
} from "./workspace-snapshot.js";
import { withWorkspaceLease } from "./workspace-lease.js";

export interface CaptureRepairBaselineOptions {
  readonly root: string;
  readonly protectedFiles: readonly string[];
}

export interface RepairBaseline {
  readonly protectedDigests: Readonly<Record<string, string>>;
}

export interface EvaluateRepairOptions {
  readonly root: string;
  readonly baseline: RepairBaseline;
  readonly semanticCheck: () => boolean | Promise<boolean>;
  readonly snapshotLimits?: Partial<WorkspaceSnapshotLimits>;
}

export interface RepairEvaluation {
  readonly success: boolean;
  readonly checkPassed: boolean;
  readonly diagnosticCodes: readonly string[];
  readonly protectedFilesChanged: readonly string[];
  readonly semanticCheckPassed: boolean;
}

export async function captureRepairBaseline(
  options: CaptureRepairBaselineOptions,
): Promise<RepairBaseline> {
  const protectedDigests: Record<string, string> = {};
  for (const file of [...options.protectedFiles].sort(compareText)) {
    const safeFile = assertRelativePath(file);
    protectedDigests[safeFile] = await digestFile(options.root, safeFile);
  }
  return { protectedDigests };
}

export async function evaluateRepair(
  options: EvaluateRepairOptions,
): Promise<RepairEvaluation> {
  return withWorkspaceLease(options.root, () => evaluateRepairInLeasedWorkspace(options));
}

export async function evaluateRepairInLeasedWorkspace(
  options: EvaluateRepairOptions,
): Promise<RepairEvaluation> {
  const beforeSemantic = await captureWorkspaceSnapshot(options.root, options.snapshotLimits);
  const semanticResult = await options.semanticCheck();
  const afterSemantic = await captureWorkspaceSnapshot(options.root, options.snapshotLimits);
  const result = await checkProject({ root: options.root, producerVersion: "0.0.0-repair-eval" });
  const diagnosticCodes = result.ok
    ? result.report.diagnostics.map((diagnostic) => diagnostic.code)
    : [result.failure.code];
  const checkPassed = result.ok && result.report.summary.errorCount === 0;
  const protectedFilesChanged: string[] = [];
  for (const [file, baselineDigest] of Object.entries(
    options.baseline.protectedDigests,
  ).sort(([left], [right]) => compareText(left, right))) {
    const currentDigest = await digestFileOrMissing(options.root, file);
    if (currentDigest !== baselineDigest) {
      protectedFilesChanged.push(file);
    }
  }
  const afterVerification = await captureWorkspaceSnapshot(options.root, options.snapshotLimits);
  const semanticCheckPassed = semanticResult &&
    compareWorkspaceSnapshots(beforeSemantic, afterSemantic).length === 0 &&
    compareWorkspaceSnapshots(afterSemantic, afterVerification).length === 0;
  return {
    success:
      checkPassed &&
      protectedFilesChanged.length === 0 &&
      semanticCheckPassed,
    checkPassed,
    diagnosticCodes,
    protectedFilesChanged,
    semanticCheckPassed,
  };
}

function assertRelativePath(file: string): string {
  if (
    file.length === 0 ||
    file.includes("\\") ||
    path.posix.isAbsolute(file) ||
    file.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Protected file must be a root-relative POSIX path: ${file}`);
  }
  return file;
}

async function digestFile(root: string, file: string): Promise<string> {
  const bytes = await readFile(path.join(root, ...file.split("/")));
  return createHash("sha256").update(bytes).digest("hex");
}

async function digestFileOrMissing(root: string, file: string): Promise<string> {
  try {
    return await digestFile(root, assertRelativePath(file));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
