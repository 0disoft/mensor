import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewedInput, assertPackageContract, inputIdentity, runBounded, sha256 } from "../lib/onboarding-v3-evaluation.mjs";

test("review binds exact response and protected input identity", () => {
  const input = { profileSha256: "profile", documents: [{ file: "brief", sha256: "brief", text: "private" }], oracleDigests: [{ file: "oracle", sha256: "oracle" }] };
  const raw = "response";
  const receipt = { cohortId: "published-onboarding-v3", executionReview: "approved-no-external-effects", responseSha256: sha256(raw), input: inputIdentity(input), baselineCommit: "a".repeat(40), agentId: "test-agent" };
  assert.doesNotThrow(() => assertReviewedInput(receipt, input, raw));
  assert.throws(() => assertReviewedInput(receipt, input, raw + "changed"));
  assert.throws(() => assertReviewedInput(receipt, { ...input, oracleDigests: [] }, raw));
  assert.throws(() => assertReviewedInput({ ...receipt, executionReview: "pending" }, input, raw));
});

test("package gate rejects old packages and install hooks before execution", () => {
  const metadata = { private: true, type: "module", packageManager: "pnpm@12.3.4", devDependencies: Object.fromEntries(["cli", "compiler", "contract", "reference-runtime"].map((name) => [`@0disoft/mensor-${name}`, "0.10.0"])) };
  const artifact = (value, extra = []) => ({ files: [{ path: "package.json", content: JSON.stringify(value) }, ...extra] });
  assert.doesNotThrow(() => assertPackageContract(artifact(metadata)));
  assert.throws(() => assertPackageContract(artifact({ ...metadata, scripts: { postinstall: "node malicious.js" } })));
  assert.throws(() => assertPackageContract(artifact({ ...metadata, dependencies: {} })));
  assert.throws(() => assertPackageContract(artifact({ ...metadata, devDependencies: { "@0disoft/mensor-cli": "0.9.0" } })));
  assert.throws(() => assertPackageContract(artifact(metadata, [{ path: ".npmrc", content: "registry=elsewhere" }])));
});

test("bounded process distinguishes ordinary failure from timeout and overflow", () => {
  const run = (code, timeout = 3000, bytes = 65536) => runBounded(process.execPath, ["-e", code], process.cwd(), {}, timeout, bytes);
  assert.equal(run("process.exit(1)").outcome, "completed");
  assert.equal(run("process.exit(1)").code, 1);
  assert.equal(run("setInterval(() => {}, 1000)", 300).outcome, "timeout");
  assert.equal(run("process.stdout.write('x'.repeat(100000))", 3000, 1024).outcome, "output-limit");
});
