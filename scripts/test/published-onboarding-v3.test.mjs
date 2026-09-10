import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareInput } from "../prepare-published-onboarding-v3.mjs";

const oracle = fileURLToPath(new URL("../../internal/agent-runner/oracles/published-rsvp-onboarding-v3.test.mjs", import.meta.url));
const reference = new URL("../../fixtures/valid/node-static-rsvp/src/app.mjs", import.meta.url);
const template = await readFile(new URL("../../fixtures/valid/node-static-rsvp/src/features/rsvp/views/index.html", import.meta.url), "utf8");

test("prepares distinct input without leaking protected oracle or fixture text", async () => {
  const input = await prepareInput();
  assert.equal(input.documents.length, 5);
  assert.equal(input.oracleDigests.length, 2);
  assert.equal(input.profile.classification, "exploratory-not-sandbox-evidence");
  assert.equal(input.profile.status, "prepared-not-run");
  for (const doc of input.documents) {
    assert.doesNotMatch(doc.file, /(?:fixtures|oracles|examples)\//u);
    assert.match(doc.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(doc.text.length > 0);
  }
  assert.ok(input.oracleDigests.every((entry) => !Object.hasOwn(entry, "text")));
  assert.equal(input.profile.rawResponsePath.includes("published-v2"), false);
  assert.equal(input.profile.observationPath.includes("onboarding-v2"), false);
});

// Reference controls validate the protected oracle only; never supply these to the agent.
for (const mode of ["reference", "old-package", "shared-state", "wrong-redirect", "successful-rejection"]) {
  test(`published v3 oracle ${mode === "reference" ? "accepts" : "rejects"} ${mode}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mensor-onboarding-v3-control-"));
    try {
      await mkdir(path.join(root, "src/features/rsvp/views"), { recursive: true });
      await writeFile(path.join(root, "src/features/rsvp/views/index.html"), template);
      await writeFile(path.join(root, "package.json"), JSON.stringify({
        private: true, type: "module", packageManager: "pnpm@12.3.4",
        devDependencies: Object.fromEntries(["cli", "compiler", "contract", "reference-runtime"].map(
          (name) => [`@0disoft/mensor-${name}`, mode === "old-package" ? "0.9.0" : "0.10.0"],
        )),
      }));
      await writeFile(path.join(root, "src/app.mjs"), `
import { createRsvpApp as reference } from ${JSON.stringify(reference.href)};
const mode = ${JSON.stringify(mode)};
let shared;
export function createRsvpApp(options) {
  const app = mode === "shared-state" ? (shared ??= reference(options)) : reference(options);
  return { async fetch(request) {
    const response = await app.fetch(request);
    if (mode === "wrong-redirect" && response.status === 303) {
      return new Response(null, { status: 303, headers: { location: "/wrong" } });
    }
    if (mode === "successful-rejection" && response.status >= 400) {
      return new Response(await response.text(), { status: 200 });
    }
    return response;
  } };
}
`.trimStart());
      const result = spawnSync(process.execPath, ["--test", oracle], {
        cwd: root, env: {}, encoding: "utf8", timeout: 10_000,
        maxBuffer: 65_536, windowsHide: true,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, mode === "reference" ? 0 : 1, `${result.stdout}${result.stderr}`);
      if (mode !== "reference") assert.match(result.stdout, /AssertionError|ERR_ASSERTION/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
