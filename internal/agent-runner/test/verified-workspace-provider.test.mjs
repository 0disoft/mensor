import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  captureWorkspaceSnapshot,
  workspaceSnapshotDigest,
} from "@mensor/fixture-kit";
import { createVerifiedWorkspaceProvider } from "../dist/src/index.js";

const tinyTasks = fileURLToPath(
  new URL("../../../fixtures/valid/tiny-tasks/", import.meta.url),
);
const layeredTasks = fileURLToPath(
  new URL("../../../fixtures/valid/layered-tasks/", import.meta.url),
);

test("creates a digest-verified workspace and disposes it exactly once", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-provider-parent-"));
  try {
    const provider = createVerifiedWorkspaceProvider({
      baselines: await baselines(),
      temporaryRoot,
    });
    const root = await provider.create(
      "tiny-tasks",
      "form-field-missing",
      "verified.trial.1",
    );
    assert.equal(
      await readFile(path.join(root, "mensor.project.jsonc"), "utf8"),
      await readFile(path.join(tinyTasks, "mensor.project.jsonc"), "utf8"),
    );
    await provider.dispose(root);
    await assert.rejects(readFile(path.join(root, "mensor.project.jsonc")), { code: "ENOENT" });
    await assert.rejects(provider.dispose(root), /only a live workspace/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects baseline drift before creating a workspace", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "mensor-provider-drift-"));
  try {
    const definitions = await baselines();
    const provider = createVerifiedWorkspaceProvider({
      baselines: {
        ...definitions,
        "tiny-tasks": { ...definitions["tiny-tasks"], snapshotSha256: "0".repeat(64) },
      },
      temporaryRoot,
    });
    await assert.rejects(
      provider.create("tiny-tasks", "form-field-missing", "drift.1"),
      /does not match its pinned workspace digest/,
    );
    assert.deepEqual(await readDirectoryNames(temporaryRoot), []);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects symbolic links in a baseline snapshot", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-provider-symlink-"));
  try {
    await writeFile(path.join(root, "target.txt"), "target\n", "utf8");
    try {
      await symlink(path.join(root, "target.txt"), path.join(root, "link.txt"), "file");
    } catch (error) {
      if (error?.code === "EPERM") {
        context.skip("The Windows host does not grant symbolic-link creation.");
        return;
      }
      throw error;
    }
    await assert.rejects(
      captureWorkspaceSnapshot(root),
      /does not permit symbolic links/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function baselines() {
  return {
    "layered-tasks": {
      root: layeredTasks,
      snapshotSha256: workspaceSnapshotDigest(await captureWorkspaceSnapshot(layeredTasks)),
    },
    "tiny-tasks": {
      root: tinyTasks,
      snapshotSha256: workspaceSnapshotDigest(await captureWorkspaceSnapshot(tinyTasks)),
    },
  };
}

async function readDirectoryNames(root) {
  const { readdir } = await import("node:fs/promises");
  return readdir(root);
}
