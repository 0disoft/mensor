import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createBoundedChildSettlement } from "../dist/src/process-termination.js";

test("settles after the kill grace when a process never closes", async () => {
  const child = fakeChild();
  let terminationRequests = 0;
  const settlement = createBoundedChildSettlement(child, {
    graceMs: 10,
    terminate() {
      terminationRequests += 1;
    },
  });

  settlement.requestTermination();
  assert.deepEqual(await settlement.promise, { kind: "termination-failed" });
  assert.equal(terminationRequests, 1);
  assert.equal(child.stdin.destroyed, true);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test("prefers a close event that arrives inside the kill grace", async () => {
  const child = fakeChild();
  const settlement = createBoundedChildSettlement(child, {
    graceMs: 50,
    terminate() {},
  });

  settlement.requestTermination();
  child.emit("close", 137);

  assert.deepEqual(await settlement.promise, { kind: "closed", exitCode: 137 });
});

function fakeChild() {
  const child = new EventEmitter();
  child.pid = undefined;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}
