# Agent-Authored Application Brief: HonoX RSVP v1

## Goal

Create an original, server-rendered HonoX RSVP application from an empty
workspace. This trial explores a possible JSX FormIndex producer; it is not
an instruction to implement that producer or claim existing JSX support.

## Application Interface

- Use HonoX file-based routing with `app/routes/rsvp.tsx`, the Hono JSX renderer,
  and an application entrypoint. Do not substitute a plain Hono or Node router.
- Export `createRsvpApp()` from `src/app.mjs`. It may return a promise and must
  produce `{ fetch }`, accepting Web Requests and returning Responses.
- This small adapter must call the real built application and its route handlers,
  not a second test-only implementation. Every instance owns independent memory.
- Supply a bounded one-shot build command. The evaluator reviews and runs the
  build before invoking its protected oracle; no server or watcher is needed.
- The evaluator supplies a reviewed, locked Hono/HonoX/Vite toolchain. Do not
  install packages, execute build tools, or fetch dependencies during generation.

## Behavior

- `GET /rsvp` returns HTML containing the form and the current instance's responses.
- The form has literal id `rsvp-response`, method `post`, and an omitted or empty
  action, so a browser submits to the current `/rsvp` document without JavaScript.
- Use intrinsic JSX form controls with literal structural attributes: text input
  `name`, email input `email`, and radio group `attendance` with `yes`, `no`, `maybe`.
- All three fields are required. Trim their values. Reject missing, empty,
  duplicate, unknown, or invalid attendance values without changing state.
- Accept exactly the URL-encoded media type, optionally with parameters. Reject
  lookalike media types, JSON, and multipart bodies without changing state.
- A valid `POST /rsvp` adds exactly one response and returns `303` to `/rsvp`.
- Render every response with HTML-escaped name, email, and attendance values.
- Unknown paths return `404`; unsupported methods must return a 4xx response and
  must not mutate state. GET responses use an HTML content type.

## Bounded JSX Shape

Keep contract-bearing form elements directly visible in the route's JSX. Do not
hide them behind components, spreads, expressions, loops, conditionals, islands,
or client handlers. Dynamic rendering of the response list outside the form is
allowed. Do not use raw-HTML insertion for user input. Authentication, cookies,
persistence, uploads, dynamic routes, and deployment are outside this trial.

## Mensor Evidence

Keep source JSX as the source of truth. Do not duplicate the form in static HTML,
fabricate a FormIndex, or weaken a contract merely to make the current CLI green.
Record the current JSX inspection gap separately from application semantics.
This trial does not require a passing current Mensor form check. The evaluator
will inventory actual JSX constructs and unsupported syntax before proposing
an extractor contract with source ranges and freshness checks.

## Independence and Completion

Do not read or copy Mensor fixtures, source, tests, oracles, repository history,
another model's output, or framework example applications. Only the versioned
brief and evaluator-approved API documentation may be supplied to the agent.
Do not create credentials or change evaluator inputs. Generated files are UTF-8
text with LF endings. Agent-authored tests are optional and never certify success.

Completion has separate gates: fresh-workspace provenance, reviewed dependency
and build execution, real HonoX routing/renderer source inspection, protected
HTTP semantic tests, and a JSX capability inventory. The semantic oracle alone
cannot prove framework usage, no browser-JavaScript dependency, source coverage,
or isolation. No provider run is authorized solely by the existence of this brief.
