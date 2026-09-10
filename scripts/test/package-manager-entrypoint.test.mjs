import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isPackageManagerExecutable } from "../lib/package-manager-entrypoint.mjs";

test("package manager launch distinguishes native binaries from JavaScript entrypoints", () => {
  for (const entrypoint of ["/opt/pnpm/pnpm", "C:\\tools\\pnpm.exe", "/opt/pnpm.EXE"]) {
    assert.equal(isPackageManagerExecutable(entrypoint), true);
  }
  for (const entrypoint of ["/opt/pnpm.cjs", "C:\\tools\\pnpm.js", "/opt/pnpm.MJS"]) {
    assert.equal(isPackageManagerExecutable(entrypoint), false);
  }
});

test("package manager launch executes native and JavaScript paths without a shell", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-pm-entrypoint-"));
  try {
    const script = path.join(root, "package manager.mjs");
    await writeFile(script, "process.stdout.write(process.argv[2]);\n");
    for (const [entrypoint, args, expected] of [
      [process.execPath, ["--version"], process.version],
      [script, ["native-or-script"], "native-or-script"],
    ]) {
      const native = isPackageManagerExecutable(entrypoint);
      const result = spawnSync(native ? entrypoint : process.execPath,
        [...(native ? [] : [entrypoint]), ...args],
        { encoding: "utf8", timeout: 10000, windowsHide: true });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
