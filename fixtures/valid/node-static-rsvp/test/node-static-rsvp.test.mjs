import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "../../../../packages/compiler/dist/src/index.js";
import { createNodeStaticRsvpApp } from "../src/app.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("checks a dependency-free Node RSVP application without executing it", async () => {
  const result = await checkProject({
    root,
    producerVersion: "0.0.0-rsvp-pilot",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, JSON.parse(await readText("expected-report.json")));
  }
});

test("accepts one radio value and escapes every rendered value", async () => {
  const app = await createNodeStaticRsvpApp();
  const created = await post(
    app,
    "name=%3Cb%3EAda%3C%2Fb%3E&email=ada%26co%40example.test&attendance=maybe",
  );
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/rsvp");

  const listed = await app(new Request("http://local.test/rsvp"));
  assert.equal(listed.status, 200);
  const html = await listed.text();
  assert.match(html, /data-rsvp-id="1"/);
  assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/);
  assert.match(html, /ada&amp;co@example\.test/);
  assert.match(html, />maybe</);
  assert.equal(html.includes("<b>Ada</b>"), false);
});

test("rejects malformed form bodies without mutating state", async () => {
  const invalidBodies = [
    "email=a%40example.test&attendance=yes",
    "name=Ada&name=Grace&email=a%40example.test&attendance=yes",
    "name=Ada&email=a%40example.test&attendance=yes&rogue=value",
    "name=Ada&email=a%40example.test&attendance=yes&attendance=no",
    "name=Ada&email=a%40example.test&attendance=unknown",
  ];

  for (const body of invalidBodies) {
    const app = await createNodeStaticRsvpApp();
    assert.equal((await post(app, body)).status, 400);
    const listed = await app(new Request("http://local.test/rsvp"));
    assert.equal((await listed.text()).includes("data-rsvp-id"), false);
  }
});

test("requires the exact URL-encoded media type token", async () => {
  for (const contentType of [
    "application/json",
    "application/x-www-form-urlencoded-evil",
    "text/application/x-www-form-urlencoded",
  ]) {
    const app = await createNodeStaticRsvpApp();
    const response = await post(
      app,
      "name=Ada&email=a%40example.test&attendance=yes",
      contentType,
    );
    assert.equal(response.status, 415);
  }

  const app = await createNodeStaticRsvpApp();
  const accepted = await post(
    app,
    "name=Ada&email=a%40example.test&attendance=yes",
    "Application/X-WWW-Form-Urlencoded; charset=UTF-8",
  );
  assert.equal(accepted.status, 303);
});

async function post(app, body, contentType = "application/x-www-form-urlencoded") {
  return app(new Request("http://local.test/rsvp", {
    method: "POST",
    body,
    headers: { "content-type": contentType },
  }));
}

async function readText(relativePath) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(root, relativePath), "utf8");
}
