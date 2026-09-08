import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const { createRsvpApp } = await import(
  pathToFileURL(path.join(process.cwd(), "src", "app.mjs")).href
);

test("serves the RSVP form with current-document submission", async () => {
  const app = await createRsvpApp();
  assert.equal(typeof app?.fetch, "function");
  const response = await app.fetch(new Request("http://local/rsvp"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html(?:;|$)/iu);
  const html = await response.text();
  const form = html.match(/<form\b(?=[^>]*\bid=["']rsvp-response["'])[^>]*>/iu)?.[0];
  assert.ok(form, "Missing RSVP form");
  assert.match(form, /\bmethod=["']post["']/iu);
  assert.doesNotMatch(form, /\baction\s*=\s*["'][^"']+/iu);
  for (const field of ["name", "email"]) {
    assert.match(html, new RegExp(`<input\\b[^>]*\\bname=["']${field}["']`, "iu"));
  }
  const values = [...html.matchAll(
    /<input\b(?=[^>]*\bname=["']attendance["'])(?=[^>]*\btype=["']radio["'])(?=[^>]*\bvalue=["'](yes|no|maybe)["'])[^>]*>/giu,
  )].map((match) => match[1]).sort();
  assert.deepEqual(values, ["maybe", "no", "yes"]);
});

test("persists valid submissions, escapes values, and isolates instances", async () => {
  const app = await createRsvpApp();
  for (const attendance of ["yes", "no", "maybe"]) {
    const body = new URLSearchParams({
      name: ` <b>oracle-${attendance}</b> `,
      email: ` oracle-${attendance}&co@example.test `,
      attendance: ` ${attendance} `,
    });
    const response = await post(app, body.toString());
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/rsvp");
  }
  const rendered = await page(app);
  for (const attendance of ["yes", "no", "maybe"]) {
    const name = `&lt;b&gt;oracle-${attendance}&lt;/b&gt;`;
    assert.equal(rendered.split(name).length - 1, 1, "Response must appear exactly once");
    assert.ok(rendered.includes(`oracle-${attendance}&amp;co@example.test`));
    assert.ok(!rendered.includes(`<b>oracle-${attendance}</b>`));
  }
  const fresh = await createRsvpApp();
  assert.doesNotMatch(await page(fresh), /oracle-(?:yes|no|maybe)/u);
});

test("rejects malformed submissions without state changes", async () => {
  const valid = "name=Ada&email=ada%40example.test&attendance=yes";
  const bodies = [
    "email=ada%40example.test&attendance=yes",
    "name=Ada&attendance=yes",
    "name=Ada&email=ada%40example.test",
    valid.replace("name=Ada", "name=+"),
    valid.replace("email=ada%40example.test", "email=+"),
    valid.replace("attendance=yes", "attendance=+"),
    valid.replace("attendance=yes", "attendance=unknown"),
    `${valid}&name=Grace`, `${valid}&email=grace%40example.test`,
    `${valid}&attendance=no`, `${valid}&unknown=value`,
  ];
  const app = await createRsvpApp();
  assert.equal((await post(app, valid)).status, 303);
  for (const body of bodies) {
    const before = await page(app);
    const response = await post(app, body);
    assert.ok(response.status >= 400 && response.status < 500, body);
    assert.equal(await page(app), before, body);
  }
});

test("rejects unsupported media, paths, and methods without mutation", async () => {
  const app = await createRsvpApp();
  const before = await page(app);
  for (const mediaType of [
    "application/json", "multipart/form-data; boundary=oracle",
    "application/x-www-form-urlencoded-evil", "text/application/x-www-form-urlencoded",
  ]) {
    const response = await post(app, "name=Ada&email=a%40example.test&attendance=yes", mediaType);
    assert.ok(response.status >= 400 && response.status < 500, mediaType);
    assert.equal(await page(app), before, mediaType);
  }
  assert.equal((await app.fetch(new Request("http://local/missing"))).status, 404);
  const response = await app.fetch(new Request("http://local/rsvp", { method: "PUT" }));
  assert.ok(response.status >= 400 && response.status < 500);
  assert.equal(await page(app), before);
});

async function page(app) {
  const response = await app.fetch(new Request("http://local/rsvp"));
  assert.equal(response.status, 200);
  return response.text();
}

async function post(app, body, contentType = "application/x-www-form-urlencoded; charset=UTF-8") {
  return app.fetch(new Request("http://local/rsvp", {
    method: "POST", headers: { "content-type": contentType }, body,
  }));
}
