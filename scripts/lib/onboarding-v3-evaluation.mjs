import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function inputIdentity(input) {
  return {
    profileSha256: input.profileSha256,
    documents: input.documents.map(({ file, sha256 }) => ({ file, sha256 })),
    oracleDigests: input.oracleDigests,
  };
}

export function assertReviewedInput(receipt, input, raw) {
  assert.equal(receipt.cohortId, "published-onboarding-v3");
  assert.equal(receipt.executionReview, "approved-no-external-effects");
  assert.equal(receipt.responseSha256, sha256(raw));
  assert.deepEqual(receipt.input, inputIdentity(input));
  assert.match(receipt.baselineCommit, /^[a-f0-9]{40}$/u);
  assert.equal(typeof receipt.agentId, "string");
  assert.ok(receipt.agentId.length > 0);
}

export function assertPackageContract(artifact) {
  const metadata = JSON.parse(artifact.files.find((file) => file.path === "package.json")?.content ?? "null");
  assert.equal(metadata?.private, true);
  assert.equal(metadata.type, "module");
  assert.equal(metadata.packageManager, "pnpm@12.3.4");
  assert.deepEqual(metadata.devDependencies, Object.fromEntries(
    ["cli", "compiler", "contract", "reference-runtime"].map((name) => [`@0disoft/mensor-${name}`, "0.10.0"]),
  ));
  for (const field of ["dependencies", "workspaces", "pnpm", "overrides", "resolutions"]) {
    assert.equal(Object.hasOwn(metadata, field), false);
  }
  for (const name of Object.keys(metadata.scripts ?? {})) {
    assert.doesNotMatch(name, /^(?:pre|post)?(?:install|pack|publish|prepare)$/u);
  }
  for (const file of artifact.files) {
    assert.ok(file.path === "package.json" || file.path === "mensor.project.jsonc" || file.path.startsWith("src/"), "Unexpected install or configuration input");
    assert.doesNotMatch(file.path, /(?:^|\/)(?:node_modules|\.npmrc|\.pnpmfile\.cjs|pnpm-lock\.yaml|package-lock\.json)(?:\/|$)/u);
  }
}

export function runBounded(command, args, cwd, env, timeout, maxBuffer = 65536) {
  const result = spawnSync(command, args, {
    cwd, env, timeout, maxBuffer, encoding: "utf8", shell: false,
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  return {
    code: result.status,
    outcome: result.error?.code === "ETIMEDOUT" ? "timeout"
      : result.error?.code === "ENOBUFS" ? "output-limit"
        : result.error ? "spawn-error" : result.signal ? "signal" : "completed",
    stdout: result.stdout ?? "", stderr: result.stderr ?? "",
  };
}
