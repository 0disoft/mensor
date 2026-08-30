# @0disoft/mensor-reference-runtime

Bounded reference consumer for a clean Mensor RuntimeManifest v1 artifact.
It serves embedded static GET pages and dispatches URL-encoded POST actions to
an exact host-supplied handler registry.

The package is a conformance consumer, not a production web framework. It does
not own authentication, CSRF tokens, sessions, cookies, persistence, template
rendering, deployment, or source discovery. An `actionGuard` is mandatory when
the manifest contains actions.

```js
import { createReferenceRuntime } from "@0disoft/mensor-reference-runtime";

const runtime = createReferenceRuntime({
  manifest,
  actionGuard: ({ fields }) => ({
    allowed: fields._csrf?.[0] === expectedToken,
    status: 403,
  }),
  handlers: {
    "tasks.create": async ({ input }) => {
      await createTask(input);
      return { kind: "redirect", location: "/tasks" };
    },
  },
});

const response = await runtime.handle(request);
```

The runtime accepts only `application/x-www-form-urlencoded` action bodies,
enforces bounded body and field sizes, rejects unknown and duplicate scalar
fields, decodes every Feature Contract v1 codec, validates the decoded schema,
and returns generic client errors without source or exception details.
