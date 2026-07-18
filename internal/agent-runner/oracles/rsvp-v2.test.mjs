import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const appFile = path.join(projectRoot, "src", "app.mjs");
const templateFile = path.join(
  projectRoot,
  "src",
  "features",
  "rsvp",
  "views",
  "index.html",
);
const { createRsvpApp } = await import(pathToFileURL(appFile).href);
const sourceTemplate = await readFile(templateFile, "utf8");

test("uses the supplied static template and preserves one radio group", async () => {
  const sentinel = "evaluator-owned-rsvp-template-sentinel";
  const templateHtml = sourceTemplate.replace(
    "</body>",
    `<p>${sentinel}</p></body>`,
  );
  assert.notEqual(templateHtml, sourceTemplate);
  const app = createRsvpApp({ templateHtml });
  assert.equal(typeof app?.fetch, "function");

  const response = await app.fetch(new Request("http://local/rsvp"));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, new RegExp(sentinel));
  assert.match(html, /<form[^>]*\bid=["']rsvp-response["']/i);
  const radioValues = [...html.matchAll(
    /<input(?=[^>]*\bname=["']attendance["'])(?=[^>]*\btype=["']radio["'])(?=[^>]*\bvalue=["'](yes|no|maybe)["'])[^>]*>/giu,
  )].map((match) => match[1]).sort();
  assert.deepEqual(radioValues, ["maybe", "no", "yes"]);
  assert.match(html, /\bname=["']name["']/i);
  assert.match(html, /\bname=["']email["']/i);
});

test("creates, redirects, persists, and escapes one response", async () => {
  const app = createRsvpApp({ templateHtml: sourceTemplate });
  const created = await post(
    app,
    "name=+%3Cb%3EAda%3C%2Fb%3E+&email=+ada%26co%40example.test+&attendance=+maybe+",
  );
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/rsvp");

  const rendered = await app.fetch(new Request("http://local/rsvp"));
  assert.equal(rendered.status, 200);
  const html = await rendered.text();
  assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/);
  assert.match(html, /ada&amp;co@example\.test/);
  assert.match(html, />maybe</);
  assert.doesNotMatch(html, /<b>Ada<\/b>/);
});

test("rejects malformed forms without changing state", async () => {
  const invalidBodies = [
    "email=a%40example.test&attendance=yes",
    "name=Ada&attendance=yes",
    "name=Ada&email=a%40example.test",
    "name=+&email=a%40example.test&attendance=yes",
    "name=Ada&email=+&attendance=yes",
    "name=Ada&email=a%40example.test&attendance=+",
    "name=Ada&name=Grace&email=a%40example.test&attendance=yes",
    "name=Ada&email=a%40example.test&email=b%40example.test&attendance=yes",
    "name=Ada&email=a%40example.test&attendance=yes&attendance=no",
    "name=Ada&email=a%40example.test&attendance=unknown",
    "name=Ada&email=a%40example.test&attendance=yes&rogue=value",
  ];

  for (const body of invalidBodies) {
    const app = createRsvpApp({ templateHtml: sourceTemplate });
    const before = await page(app);
    assert.notEqual((await post(app, body)).status, 303, body);
    assert.equal(await page(app), before, body);
  }
});

test("rejects unsupported paths, methods, and media types", async () => {
  const app = createRsvpApp({ templateHtml: sourceTemplate });
  const before = await page(app);
  assert.equal(
    (await app.fetch(new Request("http://local/elsewhere"))).status,
    404,
  );
  assert.notEqual(
    (await app.fetch(new Request("http://local/rsvp", { method: "PUT" }))).status,
    303,
  );
  for (const contentType of [
    "application/json",
    "application/x-www-form-urlencoded-evil",
    "text/application/x-www-form-urlencoded",
  ]) {
    const response = await post(
      app,
      "name=Ada&email=a%40example.test&attendance=yes",
      contentType,
    );
    assert.notEqual(response.status, 303, contentType);
  }
  assert.equal(await page(app), before);
});

async function post(
  app,
  body,
  contentType = "application/x-www-form-urlencoded; charset=UTF-8",
) {
  return app.fetch(new Request("http://local/rsvp", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  }));
}

async function page(app) {
  return (await app.fetch(new Request("http://local/rsvp"))).text();
}
