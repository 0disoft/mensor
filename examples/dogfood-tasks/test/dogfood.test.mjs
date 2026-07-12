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
