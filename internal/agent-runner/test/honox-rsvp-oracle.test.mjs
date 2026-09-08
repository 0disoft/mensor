import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const oracle = fileURLToPath(new URL("../oracles/honox-rsvp-v1.test.mjs", import.meta.url));
const reference = new URL("../../../fixtures/valid/node-static-rsvp/src/app.mjs", import.meta.url);
const template = (await readFile(new URL(
  "../../../fixtures/valid/node-static-rsvp/src/features/rsvp/views/index.html", import.meta.url,
), "utf8")).replace(' action="/rsvp"', "");

// This Node fixture validates the oracle, not HonoX integration or an agent trial.
for (const mode of ["reference", "shared-state", "wrong-redirect", "media-prefix", "mutate-on-rejection"]) {
  test(`HonoX semantic oracle ${mode === "reference" ? "accepts" : "rejects"} ${mode}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "mensor-honox-oracle-"));
    try {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/app.mjs"), `
import { createRsvpApp as createReference } from ${JSON.stringify(reference.href)};
const templateHtml = ${JSON.stringify(template)};
const mode = ${JSON.stringify(mode)};
let shared;
export async function createRsvpApp() {
  const app = mode === "shared-state"
    ? (shared ??= createReference({ templateHtml })) : createReference({ templateHtml });
  return { async fetch(request) {
    if (mode === "media-prefix" && request.headers.get("content-type") === "application/x-www-form-urlencoded-evil") {
      const headers = new Headers(request.headers);
      headers.set("content-type", "application/x-www-form-urlencoded");
      request = new Request(request.url, { method: "POST", headers, body: await request.text() });
    }
    const response = await app.fetch(request);
    if (mode === "wrong-redirect" && response.status === 303) {
      return new Response(null, { status: 303, headers: { location: "/wrong" } });
    }
    if (mode === "mutate-on-rejection" && request.method === "POST" && response.status >= 400) {
      await app.fetch(new Request("http://local/rsvp", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "name=unexpected&email=unexpected%40example.test&attendance=yes",
      }));
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
