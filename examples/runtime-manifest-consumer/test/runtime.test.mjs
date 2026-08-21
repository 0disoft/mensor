import assert from "node:assert/strict";
import test from "node:test";

import { createSignupApp } from "../src/app.mjs";
import { createRuntimeManifestConsumer } from "../src/runtime.mjs";

const manifest = createManifest();

test("serves exact GET routes and reports missing or disallowed routes", async () => {
  const app = createSignupApp(manifest, services());

  const page = await app(new Request("https://runtime.test/signup?source=test"));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await page.text(), "<h1>Signup</h1>\n");

  const disallowed = await app(new Request("https://runtime.test/signup", { method: "PUT" }));
  assert.equal(disallowed.status, 405);
  assert.equal(disallowed.headers.get("allow"), "GET, POST");
  assert.equal(await problemCode(disallowed), "runtime.method_not_allowed");

  const missing = await app(new Request("https://runtime.test/missing"));
  assert.equal(missing.status, 404);
  assert.equal(await problemCode(missing), "runtime.route_not_found");
});

test("decodes every RuntimeManifest v1 form codec and preserves host fields", async () => {
  const saved = [];
  const csrfValues = [];
  const app = createSignupApp(manifest, services({ saved, csrfValues }));
  const response = await app(formRequest(
    "csrf=accepted&name=+Ada+&seats=2&budget=125.50&newsletter=yes&plan=pro&topics=security&topics=tooling",
  ));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/signup");
  assert.deepEqual(csrfValues, [["accepted"]]);
  assert.deepEqual(saved, [{
    name: "Ada",
    seats: 2,
    budget: 125.5,
    newsletter: true,
    plan: "pro",
    topics: ["security", "tooling"],
  }]);
});

test("uses the checkbox missing value when the control is not submitted", async () => {
  const saved = [];
  const app = createSignupApp(manifest, services({ saved }));
  const response = await app(formRequest(
    "csrf=accepted&name=Grace&seats=1&budget=0&plan=free&topics=performance",
  ));

  assert.equal(response.status, 303);
  assert.equal(saved[0]?.newsletter, false);
});

test("rejects unknown, missing, repeated, and invalid field values", async () => {
  const app = createSignupApp(manifest, services());
  const cases = [
    [
      "csrf=accepted&name=Ada&seats=2&budget=10&plan=pro&topics=security&rogue=value",
      "runtime.form_field_unknown",
    ],
    [
      "csrf=accepted&name=Ada&name=Grace&seats=2&budget=10&plan=pro&topics=security",
      "runtime.form_field_repeated",
    ],
    [
      "csrf=accepted&name=Ada&seats=02&budget=10&plan=pro&topics=security",
      "runtime.form_value_invalid",
    ],
    [
      "csrf=accepted&name=Ada&seats=2&budget=10&plan=enterprise&topics=security",
      "runtime.form_value_invalid",
    ],
    [
      "csrf=accepted&name=Ada&seats=2&budget=10&plan=pro",
      "runtime.form_value_invalid",
    ],
    [
      "csrf=accepted&name=%E0%A4%A&seats=2&budget=10&plan=pro&topics=security",
      "runtime.form_encoding_invalid",
    ],
  ];

  for (const [body, expectedCode] of cases) {
    const response = await app(formRequest(body));
    assert.equal(response.status, 400, body);
    assert.equal(await problemCode(response), expectedCode, body);
  }
});

test("enforces content type, body byte, and field-count limits", async () => {
  const defaultApp = createSignupApp(manifest, services());
  const unsupported = await defaultApp(new Request("https://runtime.test/signup", {
    method: "POST",
    body: "name=Ada",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(unsupported.status, 415);
  assert.equal(await problemCode(unsupported), "runtime.content_type_unsupported");

  const boundedBodyApp = createSignupApp(manifest, services(), { maxBodyBytes: 8 });
  const oversized = await boundedBodyApp(formRequest("name=too-long"));
  assert.equal(oversized.status, 413);
  assert.equal(await problemCode(oversized), "runtime.body_too_large");

  const boundedFieldsApp = createSignupApp(manifest, services(), { maxFields: 2 });
  const tooManyFields = await boundedFieldsApp(formRequest("name=Ada&seats=2&budget=10"));
  assert.equal(tooManyFields.status, 400);
  assert.equal(await problemCode(tooManyFields), "runtime.form_field_limit_exceeded");
});

test("leaves CSRF authorization with the host", async () => {
  const saved = [];
  const app = createSignupApp(manifest, services({ saved, acceptCsrf: false }));
  const response = await app(formRequest(
    "csrf=rejected&name=Ada&seats=2&budget=10&plan=pro&topics=security",
  ));

  assert.equal(response.status, 403);
  assert.deepEqual(saved, []);
});

test("contains handler failures and reports them through the host hook", async () => {
  const errors = [];
  const app = createRuntimeManifestConsumer({
    manifest,
    handlers: new Map([["signup.register", async () => {
      throw new Error("database unavailable");
    }]]),
    onError(error, context) {
      errors.push({ error, actionId: context.action.id });
    },
  });
  const response = await app(formRequest(
    "csrf=accepted&name=Ada&seats=2&budget=10&plan=pro&topics=security",
  ));

  assert.equal(response.status, 500);
  assert.equal(await problemCode(response), "runtime.handler_failed");
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.error.message, "database unavailable");
  assert.equal(errors[0]?.actionId, "signup.register");
});

test("fails during construction when a manifest handler is not registered", () => {
  assert.throws(
    () => createRuntimeManifestConsumer({ manifest, handlers: new Map() }),
    /No handler function is registered/u,
  );
});

function formRequest(body) {
  return new Request("https://runtime.test/signup", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
  });
}

function services(options = {}) {
  const saved = options.saved ?? [];
  const csrfValues = options.csrfValues ?? [];
  return {
    async verifyCsrf({ values }) {
      csrfValues.push([...values]);
      return options.acceptCsrf ?? (values.length === 1 && values[0] === "accepted");
    },
    async saveSignup(input) {
      saved.push({
        ...input,
        topics: [...input.topics],
      });
    },
  };
}

async function problemCode(response) {
  return (await response.json()).error.code;
}

function createManifest() {
  return {
    manifestVersion: 1,
    producer: { name: "mensor", version: "0.0.0-test" },
    pages: [
      {
        id: "signup.form.signup-form",
        method: "GET",
        path: "/signup",
        html: "<h1>Signup</h1>\n",
      },
    ],
    actions: [
      {
        id: "signup.register",
        method: "POST",
        path: "/signup",
        handlerId: "signup.register",
        input: {
          schema: {
            kind: "object",
            properties: {
              name: { kind: "string", minLength: 1, maxLength: 80 },
              seats: { kind: "integer", minimum: 1, maximum: 20 },
              budget: { kind: "number", minimum: 0, maximum: 10000 },
              newsletter: { kind: "boolean" },
              plan: { kind: "enum", values: ["free", "pro"] },
              topics: {
                kind: "array",
                items: {
                  kind: "enum",
                  values: ["security", "performance", "tooling"],
                },
                minItems: 1,
                maxItems: 3,
              },
            },
            required: ["name", "seats", "budget", "newsletter", "plan", "topics"],
          },
          formCodec: {
            encoding: "urlencoded",
            unknownFields: "reject",
            bindings: [
              {
                name: "name",
                path: ["name"],
                decode: { kind: "text", trim: true, empty: "reject" },
              },
              {
                name: "seats",
                path: ["seats"],
                decode: { kind: "integer-base10" },
              },
              {
                name: "budget",
                path: ["budget"],
                decode: { kind: "decimal" },
              },
              {
                name: "newsletter",
                path: ["newsletter"],
                decode: { kind: "checkbox", trueValues: ["yes"], missing: false },
              },
              {
                name: "plan",
                path: ["plan"],
                decode: { kind: "enum", values: ["free", "pro"] },
              },
              {
                name: "topics",
                path: ["topics"],
                decode: {
                  kind: "repeat",
                  items: {
                    kind: "enum",
                    values: ["security", "performance", "tooling"],
                  },
                },
              },
            ],
            ignoredFields: [
              { name: "csrf", consumer: "host-csrf-verifier" },
            ],
          },
        },
      },
    ],
  };
}
