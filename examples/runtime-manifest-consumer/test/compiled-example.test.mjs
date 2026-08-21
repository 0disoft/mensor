import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileProject } from "../../../packages/compiler/dist/src/index.js";
import { createSignupApp } from "../src/app.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("compiles the example and serves the emitted RuntimeManifest", async () => {
  const result = await compileProject({
    root,
    producerVersion: "0.0.0-runtime-example",
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    result.manifest.pages.map(({ method, path }) => ({ method, path })),
    [{ method: "GET", path: "/signup" }],
  );
  assert.deepEqual(
    result.manifest.actions.map(({ handlerId, method, path }) => ({
      handlerId,
      method,
      path,
    })),
    [{ handlerId: "signup.register", method: "POST", path: "/signup" }],
  );

  const saved = [];
  const app = createSignupApp(result.manifest, {
    async verifyCsrf({ values }) {
      return values.length === 1 && values[0] === "accepted";
    },
    async saveSignup(input) {
      saved.push({ ...input, topics: [...input.topics] });
    },
  });

  const page = await app(new Request("https://runtime.test/signup"));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<form id="signup-form" method="post" action="\/signup">/u);

  const created = await app(new Request("https://runtime.test/signup", {
    method: "POST",
    body: "csrf=accepted&name=Lin&seats=3&budget=99.95&plan=free&topics=tooling",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }));
  assert.equal(created.status, 303);
  assert.deepEqual(saved, [{
    name: "Lin",
    seats: 3,
    budget: 99.95,
    newsletter: false,
    plan: "free",
    topics: ["tooling"],
  }]);
});
