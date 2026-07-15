import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "../../../../packages/compiler/dist/src/index.js";
import { createHonoStaticTasksApp } from "../src/app.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("checks a runnable Hono application without executing it", async () => {
  const result = await checkProject({
    root,
    producerVersion: "0.0.0-hono-pilot",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, JSON.parse(await readText("expected-report.json")));
  }
});

test("serves and mutates state through Hono routes", async () => {
  const app = await createHonoStaticTasksApp();
  const empty = await app.request("/tasks");
  assert.equal(empty.status, 200);
  assert.equal((await empty.text()).includes("data-task-id"), false);

  const created = await app.request("/tasks", {
    method: "POST",
    body: "title=%3Cstrong%3Eship%3C%2Fstrong%3E",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.equal(created.status, 303);
  assert.equal(created.headers.get("location"), "/tasks");

  const listed = await app.request("/tasks");
  const html = await listed.text();
  assert.match(html, /data-task-id="1"/);
  assert.match(html, /&lt;strong&gt;ship&lt;\/strong&gt;/);
  assert.equal(html.includes("<strong>ship</strong>"), false);
});

test("rejects duplicate and unknown fields", async () => {
  const app = await createHonoStaticTasksApp();
  for (const body of ["title=one&title=two", "title=ok&rogue=value"]) {
    const response = await app.request("/tasks", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    assert.equal(response.status, 400);
  }
});

async function readText(relativePath) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(root, relativePath), "utf8");
}
