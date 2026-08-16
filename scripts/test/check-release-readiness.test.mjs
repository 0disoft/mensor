import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateReleaseReadme } from "../lib/release-readme-contract.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = path.join(repositoryRoot, "scripts", "check-release-readiness.mjs");

test("release check accepts the pnpm argument separator", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--", "--version", "0.3.0", "--tag", "latest"],
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
    [script, "--", "--", "--version", "0.3.0", "--tag", "latest"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown release-check option "--"/u);
});

test("release README contract accepts synchronized consumer guidance", () => {
  const readme = `# Mensor

## Status

Version \`0.3.0\` is the current public preview.

## Registry Installation

\`pnpm add --save-dev @0disoft/mensor-cli@0.3.0\`

See docs/releasing/0.3.0.md.
`;

  assert.deepEqual(validateReleaseReadme({ readme, version: "0.3.0" }), []);
});

test("release README contract rejects stale status, install, and migration versions", () => {
  const readme = `# Mensor

## Status

Version \`0.2.0\` is the current public preview.

## Registry Installation

\`pnpm add --save-dev @0disoft/mensor-cli@0.2.0\`

See docs/releasing/0.2.0.md.
`;

  assert.deepEqual(validateReleaseReadme({ readme, version: "0.3.0" }), [
    "README.md Status must identify 0.3.0 as the current public preview.",
    'README.md Registry Installation must contain "pnpm add --save-dev @0disoft/mensor-cli@0.3.0".',
    "README.md Registry Installation must link to docs/releasing/0.3.0.md.",
  ]);
});
