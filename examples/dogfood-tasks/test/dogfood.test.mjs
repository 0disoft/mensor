import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "../../../packages/compiler/dist/src/index.js";
import { createDogfoodApp } from "../src/app.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("passes its project contract", async () => {
  const result = await checkProject({ root, producerVersion: "0.0.0-dogfood" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, JSON.parse(await readText("expected-report.json")));
  }
});

test("serves, creates, escapes, and lists tasks", async () => {
  const app = await createDogfoodApp();
  const empty = await app(request("GET"));
  assert.equal(empty.status, 200);
  assert.match(empty.headers.get("content-type"), /^text\/html/);
  assert.equal((await empty.text()).includes("data-task-id"), false);

  const created = await app(request("POST", "title=%3Cscript%3Ealert(1)%3C%2Fscript%3E"));
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/tasks");

  const listed = await app(request("GET"));
  const html = await listed.text();
  assert.match(html, /data-task-id="1"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
});

test("rejects malformed form input without changing state", async () => {
  const app = await createDogfoodApp();
  for (const body of ["", "title=one&title=two", "title=ok&rogue=value"]) {
    const response = await app(request("POST", body));
    assert.equal(response.status, 400);
  }
  const listed = await app(request("GET"));
  assert.equal((await listed.text()).includes("data-task-id"), false);
});

test("requires the exact URL-encoded media type without changing stored tasks", async () => {
  const app = await createDogfoodApp();
  for (const contentType of [
    "application/x-www-form-urlencoded-json",
    "application/x-www-form-urlencoded-extra; charset=UTF-8",
    "application/x-www-form-urlencoded, application/json",
    "text/plain",
    "",
  ]) {
    const response = await app(new Request("http://dogfood.test/tasks", {
      method: "POST",
      headers: { "content-type": contentType },
      body: "title=Must+not+be+created",
    }));
    assert.equal(response.status, 400, contentType);
  }
  assert.equal((await (await app(request("GET"))).text()).includes("data-task-id"), false);
  for (const contentType of [
    "application/x-www-form-urlencoded; charset=UTF-8",
    "APPLICATION/X-WWW-FORM-URLENCODED ; charset=UTF-8",
  ]) {
    const response = await app(new Request("http://dogfood.test/tasks", {
      method: "POST",
      headers: { "content-type": contentType },
      body: "title=Valid+task",
    }));
    assert.equal(response.status, 303, contentType);
  }
  const listed = await (await app(request("GET"))).text();
  assert.equal((listed.match(/data-task-id=/gu) ?? []).length, 2);
  assert.equal(listed.includes("Must not be created"), false);
});

function request(method, body) {
  return new Request("http://dogfood.test/tasks", {
    method,
    ...(body === undefined
      ? {}
      : {
          body,
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
  });
}

async function readText(relativePath) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(root, relativePath), "utf8");
}
