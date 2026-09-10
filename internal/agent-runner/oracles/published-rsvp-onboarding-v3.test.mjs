import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("declares the controlled public 0.10.0 package set", async () => {
  const metadata = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(metadata.private, true);
  assert.equal(metadata.type, "module");
  assert.equal(metadata.packageManager, "pnpm@12.3.4");
  assert.deepEqual(metadata.devDependencies, Object.fromEntries(
    ["cli", "compiler", "contract", "reference-runtime"].map((name) => [`@0disoft/mensor-${name}`, "0.10.0"]),
  ));
  for (const field of ["dependencies", "workspaces", "pnpm", "overrides"]) {
    assert.equal(Object.hasOwn(metadata, field), false);
  }
  for (const name of Object.keys(metadata.scripts ?? {})) {
    assert.doesNotMatch(name, /^(?:pre|post)?(?:install|pack|publish|prepare)$/u);
  }
});

// Reuse the immutable runtime contract without exposing its implementation to the agent.
await import("./rsvp-v2.test.mjs");

test("keeps instance state independent and returns HTML", async () => {
  const { createRsvpApp } = await import(pathToFileURL(path.join(process.cwd(), "src/app.mjs")).href);
  const templateHtml = await readFile(path.join(process.cwd(), "src/features/rsvp/views/index.html"), "utf8");
  const first = createRsvpApp({ templateHtml });
  const second = createRsvpApp({ templateHtml });
  const before = await second.fetch(new Request("http://local/rsvp"));
  assert.match(before.headers.get("content-type") ?? "", /^text\/html(?:;|$)/iu);
  const original = await before.text();
  const response = await first.fetch(new Request("http://local/rsvp", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "name=Isolated&email=isolated%40example.test&attendance=yes",
  }));
  assert.equal(response.status, 303);
  assert.equal(await (await second.fetch(new Request("http://local/rsvp"))).text(), original);
});

test("rejects invalid requests with client errors rather than successful pages", async () => {
  const { createRsvpApp } = await import(pathToFileURL(path.join(process.cwd(), "src/app.mjs")).href);
  const templateHtml = await readFile(path.join(process.cwd(), "src/features/rsvp/views/index.html"), "utf8");
  const app = createRsvpApp({ templateHtml });
  const valid = "name=Ada&email=a%40example.test&attendance=yes";
  for (const [method, contentType, body] of [
    ["PUT", "application/x-www-form-urlencoded", valid],
    ["POST", "application/json", valid],
    ["POST", "multipart/form-data", valid],
    ["POST", "application/x-www-form-urlencoded-evil", valid],
    ["POST", "application/x-www-form-urlencoded", "name=Ada"],
    ["POST", "application/x-www-form-urlencoded", `${valid}&name=Duplicate`],
  ]) {
    const before = await (await app.fetch(new Request("http://local/rsvp"))).text();
    const response = await app.fetch(new Request("http://local/rsvp", {
      method, headers: { "content-type": contentType }, body,
    }));
    assert.ok(response.status >= 400 && response.status < 500, `${method} ${contentType}`);
    assert.equal(await (await app.fetch(new Request("http://local/rsvp"))).text(), before);
  }
});
