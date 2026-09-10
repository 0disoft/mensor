import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const profilePath = "internal/agent-runner/cohorts/published-onboarding-v3.json";
const allowedDocumentation = [
  "docs/cli/command-contract.md", "docs/library/public-api.md", "packages/contract/spec/README.md",
];
const digest = (text) => createHash("sha256").update(text).digest("hex");

export async function prepareInput() {
  const profileText = await readFile(path.join(root, profilePath), "utf8");
  const profile = JSON.parse(profileText);
  assert.equal(profile.cohortId, "published-onboarding-v3");
  assert.equal(profile.status, "prepared-not-run");
  assert.equal(profile.packageVersion, "0.10.0");
  assert.equal(profile.packageManager, "pnpm@12.3.4");
  assert.equal(profile.trialCount, 1);
  assert.equal(profile.correctionLimit, 1);
  assert.deepEqual(profile.documentation, allowedDocumentation);
  assert.equal(profile.brief, "internal/agent-runner/briefs/published-rsvp-onboarding-v3.md");
  assert.equal(profile.transport, "internal/agent-runner/briefs/response-artifact-v1.md");
  assert.equal(profile.oracle, "internal/agent-runner/oracles/published-rsvp-onboarding-v3.test.mjs");
  assert.equal(profile.rawResponsePath, "dist/agent-onboarding/published-v3/raw/trial-1.txt");
  assert.equal(profile.observationPath, "internal/agent-runner/observations/published-onboarding-v3/trial-1.json");
  const documents = [];
  for (const file of [profile.brief, profile.transport, ...allowedDocumentation]) {
    const text = await readFile(path.join(root, file), "utf8");
    documents.push({ file, sha256: digest(text), text });
  }
  const oracleDigests = [];
  for (const file of [profile.oracle, "internal/agent-runner/oracles/rsvp-v2.test.mjs"]) {
    oracleDigests.push({ file, sha256: digest(await readFile(path.join(root, file), "utf8")) });
  }
  return { profile, profileSha256: digest(profileText), documents, oracleDigests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every((arg) => arg === "--bundle"), "Unknown preparation argument");
  const input = await prepareInput();
  const output = process.argv.includes("--bundle") ? input : {
    ...input, documents: input.documents.map(({ file, sha256 }) => ({ file, sha256 })),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
