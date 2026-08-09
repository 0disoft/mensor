import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import { lstat, open, readdir, type FileHandle } from "node:fs/promises";
import * as path from "node:path";

export interface WorkspaceSnapshotLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly maxDepth: number;
}

export type WorkspaceSnapshot = Readonly<Record<string, string>>;

export interface WorkspaceSnapshotFileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
  readonly size: bigint;
  readonly modifiedNanoseconds: bigint;
  readonly changedNanoseconds: bigint;
}

const defaultLimits: WorkspaceSnapshotLimits = {
  maxFiles: 10_000,
  maxFileBytes: 1_048_576,
  maxTotalBytes: 67_108_864,
  maxDepth: 64,
};

export async function captureWorkspaceSnapshot(
  root: string,
  limits: Partial<WorkspaceSnapshotLimits> = {},
): Promise<WorkspaceSnapshot> {
  const validated = validateLimits({ ...defaultLimits, ...limits });
  const snapshot: Record<string, string> = {};
  const budget = { files: 0, bytes: 0 };
  await walk(root, "", 0, validated, budget, snapshot);
  return snapshot;
}

export function compareWorkspaceSnapshots(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
): readonly { readonly file: string; readonly beforeSha256: string | null; readonly afterSha256: string | null }[] {
  const files = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareText);
  return files.flatMap((file) => {
    const beforeSha256 = before[file] ?? null;
    const afterSha256 = after[file] ?? null;
    return beforeSha256 === afterSha256 ? [] : [{ file, beforeSha256, afterSha256 }];
  });
}

export function workspaceSnapshotDigest(snapshot: WorkspaceSnapshot): string {
  const entries = Object.entries(snapshot).sort(([left], [right]) =>
    compareText(left, right),
  );
  if (JSON.stringify(entries.map(([file]) => file)) !== JSON.stringify(Object.keys(snapshot))) {
    throw new Error("Workspace snapshot paths must use canonical ordering.");
  }
  return createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex");
}

async function walk(
  root: string,
  relativeDirectory: string,
  depth: number,
  limits: WorkspaceSnapshotLimits,
  budget: { files: number; bytes: number },
  snapshot: Record<string, string>,
): Promise<void> {
  if (depth > limits.maxDepth) {
    throw new Error("Workspace snapshot exceeded its directory depth limit.");
  }
  const directory = path.join(root, ...relativeDirectory.split("/").filter(Boolean));
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    compareText(left.name, right.name),
  );
  for (const entry of entries) {
    const relativePath = relativeDirectory.length === 0
      ? entry.name
      : `${relativeDirectory}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    const stat = await lstat(absolutePath, { bigint: true });
    if (stat.isSymbolicLink()) {
      throw new Error(`Workspace snapshot does not permit symbolic links: ${relativePath}`);
    }
    if (stat.isDirectory()) {
      await walk(root, relativePath, depth + 1, limits, budget, snapshot);
      continue;
    }
    if (!stat.isFile()) {
      throw new Error(`Workspace snapshot does not permit special files: ${relativePath}`);
    }
    budget.files += 1;
    if (budget.files > limits.maxFiles) {
      throw new Error("Workspace snapshot exceeded its file count limit.");
    }
    if (stat.size > BigInt(limits.maxFileBytes)) {
      throw new Error(`Workspace snapshot file exceeded its byte limit: ${relativePath}`);
    }
    if (budget.bytes + Number(stat.size) > limits.maxTotalBytes) {
      throw new Error("Workspace snapshot exceeded its total byte limit.");
    }
    const hashed = await hashWorkspaceSnapshotFile(
      absolutePath,
      relativePath,
      fileIdentity(stat),
      limits.maxFileBytes,
    );
    budget.bytes += hashed.bytes;
    snapshot[relativePath] = hashed.sha256;
  }
}

export async function hashWorkspaceSnapshotFile(
  file: string,
  relativePath: string,
  expectedIdentity: WorkspaceSnapshotFileIdentity,
  maxFileBytes: number,
): Promise<{ readonly bytes: number; readonly sha256: string }> {
  const handle = await open(file, "r");
  try {
    const before = fileIdentity(await handle.stat({ bigint: true }));
    if (!sameFileIdentity(expectedIdentity, before)) {
      throw workspaceChanged(relativePath);
    }
    if (before.size > BigInt(maxFileBytes)) {
      throw new Error(`Workspace snapshot file exceeded its byte limit: ${relativePath}`);
    }
    const hashed = await hashOpenFile(handle, maxFileBytes);
    const after = fileIdentity(await handle.stat({ bigint: true }));
    if (!sameFileIdentity(before, after) || BigInt(hashed.bytes) !== after.size) {
      throw workspaceChanged(relativePath);
    }
    const pathIdentity = fileIdentity(await lstat(file, { bigint: true }));
    if (!sameFileIdentity(after, pathIdentity)) {
      throw workspaceChanged(relativePath);
    }
    return hashed;
  } finally {
    await handle.close();
  }
}

async function hashOpenFile(
  handle: FileHandle,
  maxFileBytes: number,
): Promise<{ readonly bytes: number; readonly sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = handle.createReadStream({ autoClose: false });
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxFileBytes) {
      stream.destroy();
      throw new Error("Workspace snapshot file grew beyond its byte limit.");
    }
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function fileIdentity(stat: BigIntStats): WorkspaceSnapshotFileIdentity {
  return {
    device: stat.dev,
    inode: stat.ino,
    size: stat.size,
    modifiedNanoseconds: stat.mtimeNs,
    changedNanoseconds: stat.ctimeNs,
  };
}

function sameFileIdentity(
  left: WorkspaceSnapshotFileIdentity,
  right: WorkspaceSnapshotFileIdentity,
): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.size === right.size
    && left.modifiedNanoseconds === right.modifiedNanoseconds
    && left.changedNanoseconds === right.changedNanoseconds;
}

function workspaceChanged(relativePath: string): Error {
  return new Error(`Workspace changed while it was being snapshotted: ${relativePath}`);
}

function validateLimits(limits: WorkspaceSnapshotLimits): WorkspaceSnapshotLimits {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Workspace snapshot ${name} must be a positive safe integer.`);
    }
  }
  return limits;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
