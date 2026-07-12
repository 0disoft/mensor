import { cp, lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  captureWorkspaceSnapshot,
  workspaceSnapshotDigest,
  type MutationBaselineId,
  type WorkspaceSnapshotLimits,
} from "@mensor/fixture-kit";

import type { AgentSuiteWorkspaceProvider } from "./command-suite.js";

export interface VerifiedBaseline {
  readonly root: string;
  readonly snapshotSha256: string;
}

export interface VerifiedWorkspaceProviderOptions {
  readonly baselines: Readonly<Record<MutationBaselineId, VerifiedBaseline>>;
  readonly temporaryRoot?: string;
  readonly snapshotLimits?: Partial<WorkspaceSnapshotLimits>;
}

export function createVerifiedWorkspaceProvider(
  options: VerifiedWorkspaceProviderOptions,
): AgentSuiteWorkspaceProvider {
  const temporaryRoot = path.resolve(options.temporaryRoot ?? tmpdir());
  const ownedRoots = new Set<string>();
  validateBaselines(options.baselines);

  return {
    async create(baselineId, _mutationId, trialId) {
      const baseline = options.baselines[baselineId];
      await assertRealDirectory(baseline.root, "Baseline root");
      const sourceSnapshot = await captureWorkspaceSnapshot(
        baseline.root,
        options.snapshotLimits,
      );
      assertDigest(
        workspaceSnapshotDigest(sourceSnapshot),
        baseline.snapshotSha256,
        `Baseline ${baselineId}`,
      );

      const workspaceRoot = await mkdtemp(
        path.join(temporaryRoot, `mensor-${safePrefix(trialId)}-`),
      );
      const canonicalRoot = path.resolve(workspaceRoot);
      assertContained(temporaryRoot, canonicalRoot);
      ownedRoots.add(canonicalRoot);
      try {
        await copyDirectoryContents(baseline.root, canonicalRoot);
        const copiedSnapshot = await captureWorkspaceSnapshot(
          canonicalRoot,
          options.snapshotLimits,
        );
        assertDigest(
          workspaceSnapshotDigest(copiedSnapshot),
          baseline.snapshotSha256,
          `Copied baseline ${baselineId}`,
        );
        return canonicalRoot;
      } catch (error) {
        ownedRoots.delete(canonicalRoot);
        await rm(canonicalRoot, { recursive: true, force: true });
        throw error;
      }
    },
    async dispose(root) {
      const canonicalRoot = path.resolve(root);
      assertContained(temporaryRoot, canonicalRoot);
      if (!ownedRoots.delete(canonicalRoot)) {
        throw new Error("Workspace provider can dispose only a live workspace it created.");
      }
      await rm(canonicalRoot, { recursive: true, force: false });
    },
  };
}

async function copyDirectoryContents(source: string, destination: string): Promise<void> {
  const entries = (await readdir(source)).sort(compareText);
  for (const entry of entries) {
    await cp(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
  }
}

function validateBaselines(
  baselines: Readonly<Record<MutationBaselineId, VerifiedBaseline>>,
): void {
  for (const baselineId of ["layered-tasks", "tiny-tasks"] as const) {
    const baseline = baselines[baselineId];
    if (typeof baseline?.root !== "string" || baseline.root.length === 0) {
      throw new Error(`Baseline ${baselineId} must declare a root.`);
    }
    if (!/^[a-f0-9]{64}$/.test(baseline.snapshotSha256)) {
      throw new Error(`Baseline ${baselineId} must declare a lowercase SHA-256 digest.`);
    }
  }
}

async function assertRealDirectory(root: string, label: string): Promise<void> {
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
}

function assertDigest(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} does not match its pinned workspace digest.`);
  }
}

function assertContained(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative.length === 0 || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Workspace path must remain inside the configured temporary root.");
  }
}

function safePrefix(trialId: string): string {
  const prefix = trialId.replaceAll(/[^A-Za-z0-9_-]/g, "-").slice(0, 48);
  return prefix.length === 0 ? "trial" : prefix;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
