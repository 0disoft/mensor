import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { responseText } from "../lib/rsvp-response-content.mjs";

const oracle = fileURLToPath(new URL("../../internal/agent-runner/oracles/published-rsvp-onboarding-v4.test.mjs", import.meta.url));
const historicalOracle = fileURLToPath(new URL("../../internal/agent-runner/oracles/published-rsvp-onboarding-v3.test.mjs", import.meta.url));
const reference = new URL("../../fixtures/valid/node-static-rsvp/src/app.mjs", import.meta.url);
const template = await readFile(new URL("../../fixtures/valid/node-static-rsvp/src/features/rsvp/views/index.html", import.meta.url), "utf8");

test("reads response text rather than static form values or hidden markup", () => {
  const source = '<form><input value="maybe"></form><ul>{{responses}}</ul>';
  const render = (fragment) => source.replace("{{responses}}", fragment);
  for (const fragment of ["<li>Ada - maybe</li>", "<p>Ada - ma&#121;be</p>", "<p><em>may</em>be</p>"]) {
    assert.match(responseText(source, render(fragment)), /\bmaybe\b/u);
  }
  for (const fragment of ["<li>Ada</li>", '<li data-attendance="maybe">Ada</li>', "<script>maybe</script>", "<template>maybe</template>", "<p hidden>maybe</p>"]) {
    assert.doesNotMatch(responseText(source, render(fragment)), /\bmaybe\b/u);
  }
  assert.throws(() => responseText(source, "<p>maybe</p>"));
});

for (const mode of ["reference", "joined-list", "paragraph", "missing-value", "script-only"]) {
  test(`revised oracle ${["reference", "joined-list", "paragraph"].includes(mode) ? "accepts" : "rejects"} ${mode}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mensor-rsvp-v4-control-"));
    try {
      await mkdir(path.join(root, "src/features/rsvp/views"), { recursive: true });
      await writeFile(path.join(root, "src/features/rsvp/views/index.html"), template);
      await writeFile(path.join(root, "package.json"), JSON.stringify({
        private: true, type: "module", packageManager: "pnpm@12.3.4",
        devDependencies: Object.fromEntries(["cli", "compiler", "contract", "reference-runtime"].map((name) => [`@0disoft/mensor-${name}`, "0.10.0"])),
      }));
      await writeFile(path.join(root, "src/app.mjs"), `
import { createRsvpApp as reference } from ${JSON.stringify(reference.href)};
const mode = ${JSON.stringify(mode)};
export function createRsvpApp(options) {
  const app = reference(options);
  return { async fetch(request) {
    const response = await app.fetch(request);
    if (request.method !== "GET" || response.status !== 200) return response;
    let html = await response.text();
    if (mode === "joined-list" || mode === "paragraph") html = html.replace(new RegExp("<span>(yes|no|maybe)</span>", "g"), " - $1");
    if (mode === "paragraph") html = html.replace(/<li[^>]*>/g, "<p>").replaceAll("</li>", "</p>");
    if (mode === "missing-value") html = html.replace("<span>maybe</span>", "");
    if (mode === "script-only") html = html.replace("<span>maybe</span>", "<script>maybe</script>");
    return new Response(html, { status: response.status, headers: response.headers });
  } };
}
`.trimStart());
      const run = (file) => spawnSync(process.execPath, ["--test", file], { cwd: root, env: {}, encoding: "utf8", timeout: 10000, maxBuffer: 65536, windowsHide: true });
      const result = run(oracle);
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, ["reference", "joined-list", "paragraph"].includes(mode) ? 0 : 1, result.stdout + result.stderr);
      if (mode === "joined-list") {
        const old = run(historicalOracle);
        assert.equal(old.status, 1);
        assert.match(old.stdout, /did not match the regular expression/u);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
