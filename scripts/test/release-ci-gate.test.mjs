import assert from "node:assert/strict";
import { test } from "node:test";
import { assertReleaseCi } from "../lib/release-ci-gate.mjs";

const sha = "a".repeat(40);
const valid = () => ({
  sha, ref: "refs/heads/main", repository: "0disoft/mensor", mainSha: sha,
  runs: ["ci.yml", "guarded-rsvp.yml"].map((workflow, id) => ({
    id, path: `.github/workflows/${workflow}`, event: "push", head_branch: "main",
    head_sha: sha, status: "completed", conclusion: "success",
  })),
});

test("release CI gate accepts only successful required workflows for current main", () => {
  assert.doesNotThrow(() => assertReleaseCi(valid()));
  for (const change of [{ ref: "refs/heads/other" }, { repository: "other/mensor" },
    { mainSha: "b".repeat(40) }, { sha: "invalid" }, { runs: [] }]) {
    assert.throws(() => assertReleaseCi({ ...valid(), ...change }));
  }
});

test("release CI gate rejects wrong source, incomplete, failed and newer failed runs", () => {
  for (const change of [{ event: "pull_request" }, { head_branch: "other" },
    { head_sha: "b".repeat(40) }, { path: ".github/workflows/impostor.yml" },
    { status: "in_progress" }, { conclusion: "failure" }, { conclusion: "cancelled" }]) {
    const input = valid();
    Object.assign(input.runs[0], change);
    assert.throws(() => assertReleaseCi(input));
  }
  const input = valid();
  input.runs.push({ ...input.runs[0], id: 100, conclusion: "failure" });
  assert.throws(() => assertReleaseCi(input));
});
