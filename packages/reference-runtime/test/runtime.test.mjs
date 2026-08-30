import assert from "node:assert/strict";
import test from "node:test";

import {
  ReferenceRuntimeConfigurationError,
  createReferenceRuntime,
} from "@0disoft/mensor-reference-runtime";

function manifest() {
  return {
    manifestVersion: 1,
    producer: { name: "mensor", version: "0.4.0-test" },
    pages: [
      {
        id: "tasks.form.create",
        method: "GET",
        path: "/tasks",
        html: "<!doctype html><form></form>\n",
      },
    ],
    actions: [
      {
        id: "tasks.create",
        method: "POST",
        path: "/tasks",
        handlerId: "tasks.create",
        input: {
          schema: {
            kind: "object",
            properties: {
              title: { kind: "string", minLength: 1, maxLength: 20 },
              count: { kind: "integer", minimum: 1, maximum: 10 },
              ratio: { kind: "number", minimum: 0, maximum: 1 },
              done: { kind: "boolean" },
              priority: { kind: "enum", values: ["low", "high"] },
              tags: {
                kind: "array",
                items: { kind: "string", maxLength: 8 },
                minItems: 1,
                maxItems: 3,
              },
            },
            required: ["title", "count", "ratio", "done", "priority", "tags"],
          },
          formCodec: {
            encoding: "urlencoded",
            unknownFields: "reject",
            bindings: [
              { name: "title", path: ["title"], decode: { kind: "text", trim: true, empty: "reject" } },
              { name: "count", path: ["count"], decode: { kind: "integer-base10" } },
              { name: "ratio", path: ["ratio"], decode: { kind: "decimal" } },
              { name: "done", path: ["done"], decode: { kind: "checkbox", trueValues: ["on"], missing: false } },
              { name: "priority", path: ["priority"], decode: { kind: "enum", values: ["low", "high"] } },
              { name: "tag", path: ["tags"], decode: { kind: "repeat", items: { kind: "text", trim: true, empty: "reject" } } },
            ],
            ignoredFields: [{ name: "_csrf", consumer: "action-guard" }],
          },
        },
      },
    ],
  };
}

function request(body, options = {}) {
  return new Request("https://example.test/tasks?source=test", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-request-id": "request-1",
      ...options.headers,
    },
    body,
  });
}

test("serves exact GET pages and reports route method boundaries", async () => {
  const runtime = createReferenceRuntime({
    manifest: manifest(),
    actionGuard: () => ({ allowed: true }),
    handlers: { "tasks.create": () => ({ kind: "redirect", location: "/tasks" }) },
  });

  const page = await runtime.handle(new Request("https://example.test/tasks"));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(await page.text(), /<form>/u);

  const wrongMethod = await runtime.handle(new Request("https://example.test/tasks", { method: "PUT" }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET, POST");
  assert.equal((await runtime.handle(new Request("https://example.test/missing"))).status, 404);
});

test("decodes every codec and separates the guard from the handler", async () => {
  let observed;
  const runtime = createReferenceRuntime({
    manifest: manifest(),
    actionGuard: ({ fields, request: metadata }) => {
      assert.deepEqual(fields._csrf, ["token"]);
      assert.deepEqual(metadata.query.source, ["test"]);
      return { allowed: true, securityContext: { subject: "maintainer" } };
    },
    handlers: {
      "tasks.create": (context) => {
        observed = context;
        return { kind: "redirect", location: "/tasks" };
      },
    },
  });
  const response = await runtime.handle(request(
    "title=%20Ship%20&count=2&ratio=0.5&done=on&priority=high&tag=runtime&tag=tests&_csrf=token",
  ));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/tasks");
  assert.deepEqual(observed.input, {
    title: "Ship",
    count: 2,
    ratio: 0.5,
    done: true,
    priority: "high",
    tags: ["runtime", "tests"],
  });
  assert.deepEqual(observed.securityContext, { subject: "maintainer" });
  assert.equal(observed.request.headers["x-request-id"][0], "request-1");
});

test("uses the checkbox missing value", async () => {
  let input;
  const runtime = createReferenceRuntime({
    manifest: manifest(),
    actionGuard: () => ({ allowed: true }),
    handlers: {
      "tasks.create": (context) => {
        input = context.input;
        return { kind: "html", body: "ok" };
      },
    },
  });
  const response = await runtime.handle(request(
    "title=Ship&count=2&ratio=0.5&priority=low&tag=runtime&_csrf=token",
  ));
  assert.equal(response.status, 200);
  assert.equal(input.done, false);
});

test("fails closed on media type, unknown fields, duplicates, and schema violations", async () => {
  let calls = 0;
  const runtime = createReferenceRuntime({
    manifest: manifest(),
    actionGuard: () => ({ allowed: true }),
    handlers: {
      "tasks.create": () => {
        calls += 1;
        return { kind: "html", body: "ok" };
      },
    },
  });
  const unsupported = await runtime.handle(request("title=x", { headers: { "content-type": "application/json" } }));
  assert.equal(unsupported.status, 415);

  for (const body of [
    "title=Ship&count=2&ratio=0.5&priority=low&tag=x&extra=x",
    "title=Ship&title=Again&count=2&ratio=0.5&priority=low&tag=x",
    "title=Ship&count=02&ratio=0.5&priority=low&tag=x",
    "title=Ship&count=2&ratio=0.5&priority=urgent&tag=x",
    "title=This-title-is-far-too-long&count=2&ratio=0.5&priority=low&tag=x",
    "__proto__=x&title=Ship&count=2&ratio=0.5&priority=low&tag=x",
  ]) {
    const response = await runtime.handle(request(body));
    assert.equal(response.status, 400, body);
  }
  assert.equal(calls, 0);
});

test("enforces body and field limits before handler execution", async () => {
  const runtime = createReferenceRuntime({
    manifest: manifest(),
    actionGuard: () => ({ allowed: true }),
    handlers: { "tasks.create": () => ({ kind: "html", body: "ok" }) },
    limits: { maxBodyBytes: 16, maxFields: 2, maxFieldBytes: 8 },
  });
  assert.equal((await runtime.handle(request("title=abcdefghijklmnop"))).status, 413);
  assert.equal((await runtime.handle(request("a=1&b=2&c=3"))).status, 413);
});

test("requires an exact registry and an action guard", () => {
  assert.throws(
    () => createReferenceRuntime({ manifest: manifest(), handlers: {} }),
    ReferenceRuntimeConfigurationError,
  );
  assert.throws(
    () => createReferenceRuntime({
      manifest: manifest(),
      actionGuard: () => ({ allowed: true }),
      handlers: {
        "tasks.create": () => ({ kind: "html", body: "ok" }),
        extra: () => ({ kind: "html", body: "extra" }),
      },
    }),
    /exactly match/u,
  );
});

test("supports a page-only manifest without an action guard", async () => {
  const value = manifest();
  const runtime = createReferenceRuntime({
    manifest: { ...value, actions: [] },
    handlers: {},
  });
  assert.equal((await runtime.handle(new Request("https://example.test/tasks"))).status, 200);
});

test("keeps guard, handler, redirect, and header failures generic", async () => {
  const denied = createReferenceRuntime({
    manifest: manifest(),
    actionGuard: () => ({ allowed: false, status: 403 }),
    handlers: { "tasks.create": () => ({ kind: "html", body: "not called" }) },
  });
  assert.equal((await denied.handle(request(
    "title=Ship&count=2&ratio=0.5&priority=low&tag=x&_csrf=token",
  ))).status, 403);

  for (const handler of [
    () => { throw new Error("secret"); },
    () => ({ kind: "redirect", location: "https://evil.test" }),
    () => ({ kind: "html", body: "x", headers: { "set-cookie": "secret=1" } }),
  ]) {
    const runtime = createReferenceRuntime({
      manifest: manifest(),
      actionGuard: () => ({ allowed: true }),
      handlers: { "tasks.create": handler },
    });
    const response = await runtime.handle(request(
      "title=Ship&count=2&ratio=0.5&priority=low&tag=x&_csrf=token",
    ));
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Internal server error.\n");
  }
});
