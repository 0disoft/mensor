import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { withWorkspaceLease } from "../dist/src/workspace-lease.js";

test("rejects parent and child workspace leases in either acquisition order", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "mensor-lease-"));
  const child = path.join(parent, "child");
  await mkdir(child);
  try {
    await assertOverlapRejected(parent, child);
    await assertOverlapRejected(child, parent);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("allows sibling workspace leases", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "mensor-lease-"));
  const left = path.join(parent, "left");
  const right = path.join(parent, "right");
  await Promise.all([mkdir(left), mkdir(right)]);
  try {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let entered;
    const active = new Promise((resolve) => {
      entered = resolve;
    });
    const held = withWorkspaceLease(left, async () => {
      entered();
      await gate;
    });
    await active;
    await withWorkspaceLease(right, () => undefined);
    release();
    await held;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

async function assertOverlapRejected(first, second) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const active = new Promise((resolve) => {
    entered = resolve;
  });
  const held = withWorkspaceLease(first, async () => {
    entered();
    await gate;
  });
  await active;
  try {
    await assert.rejects(
      withWorkspaceLease(second, () => undefined),
      /already in use/,
    );
  } finally {
    release();
    await held;
  }
}
