import assert from "node:assert/strict";
import { lstat, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { hashWorkspaceSnapshotFile } from "../dist/src/workspace-snapshot.js";

test("rejects a same-size path replacement after snapshot discovery", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-snapshot-"));
  const target = path.join(root, "target.txt");
  const replacement = path.join(root, "replacement.txt");
  try {
    await writeFile(target, "aaaa", "utf8");
    const discovered = identity(await lstat(target, { bigint: true }));
    await writeFile(replacement, "bbbb", "utf8");
    await rename(replacement, target);

    await assert.rejects(
      hashWorkspaceSnapshotFile(target, "target.txt", discovered, 16),
      /changed while it was being snapshotted/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function identity(stat) {
  return {
    device: stat.dev,
    inode: stat.ino,
    size: stat.size,
    modifiedNanoseconds: stat.mtimeNs,
    changedNanoseconds: stat.ctimeNs,
  };
}
