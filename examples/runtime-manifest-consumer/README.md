# RuntimeManifest Reference Consumer

This example proves the narrow execution boundary introduced by
`RuntimeManifest v1`. It is deliberately an example, not a published runtime
package or web framework.

The compiler remains a build-time dependency. A deployment compiles and
serializes a manifest after a clean Mensor check, then gives that validated data
to a host-owned consumer together with executable handlers and services.

## Runtime Boundary

`src/runtime.mjs` accepts a standard `Request` and returns a standard `Response`.
It implements only the behavior represented by RuntimeManifest v1:

1. exact static `GET` pages;
2. exact `POST` actions;
3. bounded `application/x-www-form-urlencoded` body reads;
4. text, base-10 integer, finite decimal, checkbox, enum, and repeat decoders;
5. schema length, range, and item-count constraints;
6. rejection of unknown fields and duplicate scalar values; and
7. handler lookup by stable `handlerId`.

The decoded input and ignored-field collections use frozen null-prototype
objects. Ignored fields are passed separately to the host instead of being
silently trusted or copied into typed action input.

The decimal decoder accepts the JSON number grammar and rejects non-finite
results. The integer decoder rejects signs other than `-`, leading zeroes,
decimal points, exponents, and values outside JavaScript's safe-integer range.
Required repeat bindings decode an absent wire field as an empty array, which is
then checked against `minItems` and `maxItems`.

## Host Responsibilities

Authentication, authorization, CSRF verification, sessions, persistence,
transactions, rate limiting, response security policy, deployment, and
observability remain outside this consumer. The signup handler demonstrates the
boundary by forwarding the ignored `csrf` field to a host-supplied verifier and
saving input through a host-supplied service.

The consumer bounds request bytes and field count, returns stable JSON error
codes for request failures, catches handler failures, and exposes an optional
`onError` callback without returning exception details to clients.

## Example

```js
import { fileURLToPath } from "node:url";

import { compileProject } from "@0disoft/mensor-compiler";

import { createSignupApp } from "./src/app.mjs";

const compiled = await compileProject({
  root: fileURLToPath(new URL("./", import.meta.url)),
  producerVersion: "1.0.0",
});
if (!compiled.ok) {
  throw new Error("Mensor compilation failed.");
}

const app = createSignupApp(compiled.manifest, {
  verifyCsrf: async ({ values }) => values.length === 1,
  saveSignup: async (input) => {
    // Persist through a host-owned transaction boundary.
    console.log(input);
  },
});

const response = await app(new Request("https://example.test/signup"));
```

Production deployment should serialize the build-time manifest and parse it
through `parseRuntimeManifest` when loading it. It should not run the compiler or
inspect application source in the request path.

## Validation

From the repository root:

```text
pnpm run build
node --test examples/runtime-manifest-consumer/test/*.test.mjs
```

The integration test compiles this example, feeds the emitted manifest into the
consumer, serves its static page, decodes a form submission, invokes the
registered handler, and verifies typed host input.
