import assert from "node:assert/strict";
import test from "node:test";

import { createDockerCliProcessRunner } from "../dist/src/index.js";

test("runs a bounded Docker CLI subprocess without inheriting environment", async () => {
  const runner = createDockerCliProcessRunner();
  const result = await runner(command(
    ["-e", "process.stdin.pipe(process.stdout)"],
    new TextEncoder().encode("hello\n"),
  ));

  assert.equal(result.termination, "exited");
  assert.equal(result.exitCode, 0);
  assert.equal(new TextDecoder().decode(result.stdout), "hello\n");
  assert.equal(result.combinedOutputBytes, 6);
  assert.equal(Object.hasOwn(result, "stderr"), false);
});

test("bounds combined Docker CLI output and omits stderr bytes", async () => {
  const runner = createDockerCliProcessRunner();
  const result = await runner({
    ...command([
      "-e",
      "process.stdout.write('a'.repeat(64)); process.stderr.write('secret-detail')",
    ]),
    maxOutputBytes: 8,
  });

  assert.equal(result.termination, "output-limit");
  assert.ok(result.combinedOutputBytes > 8);
  assert.ok(result.stdout.byteLength <= 8);
  assert.equal(JSON.stringify(result).includes("secret-detail"), false);
});

test("terminates a Docker CLI subprocess when its signal aborts", async () => {
  const runner = createDockerCliProcessRunner();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30);
  try {
    const result = await runner({
      ...command(["-e", "setInterval(() => undefined, 1000)"]),
      signal: controller.signal,
    });
    assert.equal(result.termination, "timeout");
  } finally {
    clearTimeout(timeout);
  }
});

test("rejects a relative Docker CLI executable before spawning", async () => {
  const runner = createDockerCliProcessRunner();

  await assert.rejects(
    runner({
      ...command(["--version"]),
      executable: "docker",
    }),
    /process command is invalid/,
  );
});

function command(args, input = new Uint8Array()) {
  return {
    executable: process.execPath,
    args,
    environment: {},
    input,
    signal: new AbortController().signal,
    maxOutputBytes: 1_024,
  };
}
