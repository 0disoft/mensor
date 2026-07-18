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
  "guestbook",
  "views",
  "index.html",
);
const { createGuestbookApp } = await import(pathToFileURL(appFile).href);
const sourceTemplate = await readFile(templateFile, "utf8");

test("uses the supplied static template for the GET page", async () => {
  const sentinel = "evaluator-owned-template-sentinel";
  const templateHtml = sourceTemplate.replace(
    "</body>",
    `<p>${sentinel}</p></body>`,
  );
  assert.notEqual(templateHtml, sourceTemplate);
  const app = createGuestbookApp({ templateHtml });
  assert.equal(typeof app?.fetch, "function");
  assert.ok(Array.isArray(app?.entries));

  const response = await app.fetch(new Request("http://local/guestbook"));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, new RegExp(sentinel));
  assert.match(html, /<form[^>]*\bid=["']create-entry["']/i);
  assert.match(html, /\bname=["']author["']/i);
  assert.match(html, /\bname=["']message["']/i);
});
test("creates, redirects, persists, and escapes one valid entry", async () => {
  const app = createGuestbookApp({ templateHtml: sourceTemplate });
  const created = await app.fetch(new Request("http://local/guestbook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "author=%3Cb%3EAda%3C%2Fb%3E&message=Hello+%26+welcome",
  }));
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/guestbook");
  assert.deepEqual(app.entries, [{
    author: "<b>Ada</b>",
    message: "Hello & welcome",
  }]);

  const rendered = await app.fetch(new Request("http://local/guestbook"));
  assert.equal(rendered.status, 200);
  const html = await rendered.text();
  assert.match(html, /&lt;b&gt;Ada&lt;\/b&gt;/);
  assert.match(html, /Hello &amp; welcome/);
  assert.doesNotMatch(html, /<b>Ada<\/b>/);
});

test("trims values and rejects malformed forms without changing state", async () => {
  const app = createGuestbookApp({ templateHtml: sourceTemplate });
  const valid = await app.fetch(new Request("http://local/guestbook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "author=+Ada+&message=+Hello+",
  }));
  assert.equal(valid.status, 303);
  assert.deepEqual(app.entries, [{ author: "Ada", message: "Hello" }]);

  const before = structuredClone(app.entries);
  for (const body of [
    "author=Ada&author=Grace&message=Hello",
    "author=Ada&message=Hello&message=Again",
    "author=Ada&message=Hello&extra=value",
    "author=+&message=Hello",
    "author=Ada&message=+",
    "author=Ada",
    "message=Hello",
  ]) {
    const response = await app.fetch(new Request("http://local/guestbook", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }));
    assert.notEqual(response.status, 303);
    assert.deepEqual(app.entries, before);
  }
});

test("rejects unsupported methods, paths, and body encodings", async () => {
  const app = createGuestbookApp({ templateHtml: sourceTemplate });
  assert.equal(
    (await app.fetch(new Request("http://local/elsewhere"))).status,
    404,
  );
  assert.equal(
    (await app.fetch(new Request("http://local/guestbook", {
      method: "PUT",
    }))).status,
    404,
  );
  for (const contentType of [
    "application/json",
    "application/x-www-form-urlencoded-evil",
    "text/application/x-www-form-urlencoded",
  ]) {
    const wrongEncoding = await app.fetch(new Request("http://local/guestbook", {
      method: "POST",
      headers: { "content-type": contentType },
      body: "author=Ada&message=Hello",
    }));
    assert.notEqual(wrongEncoding.status, 303);
    assert.deepEqual(app.entries, []);
  }
});
