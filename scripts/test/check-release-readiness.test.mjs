import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = path.join(repositoryRoot, "scripts", "check-release-readiness.mjs");

test("release check accepts the pnpm argument separator", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--", "--version", "0.2.0", "--tag", "latest"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
});

test("release check rejects a duplicate argument separator", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--", "--", "--version", "0.2.0", "--tag", "latest"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown release-check option "--"/u);
});
