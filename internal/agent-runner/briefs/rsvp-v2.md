# Agent-Authored Application Brief: RSVP v2

## Goal

Build a complete dependency-free Node.js ESM RSVP application. The evaluator
owns the semantic oracle; do not create, replace, or weaken its tests.

## Required Application Interface

- Create `src/app.mjs`.
- Export a runtime function named `createRsvpApp`.
- It accepts one object `{ templateHtml }`, where `templateHtml` is the complete
  HTML page source supplied by the evaluator.
- It returns an object `{ fetch }`.
- `fetch(request)` accepts a Web `Request` and returns a `Response` or a promise
  of one.
- Each application instance owns independent in-memory RSVP state.
- GET rendering must use the supplied `templateHtml`. Replace only the exact
  marker `{{responses}}` with rendered response markup. Do not reconstruct the
  form in JavaScript or ignore the supplied template.

## Product Behavior

- `GET /rsvp` returns the supplied HTML page containing the RSVP form and all
  responses created by the current application instance.
- The static form submits `POST /rsvp` as
  `application/x-www-form-urlencoded`.
- The form has exact id `rsvp-response` and exactly three application-owned
  named fields: `name`, `email`, and `attendance`.
- `attendance` is one radio group with exact values `yes`, `no`, and `maybe`.
  Exactly one selected value is accepted per request.
- `POST /rsvp` trims all three values; rejects missing, empty, duplicate,
  unknown, or invalid attendance values without changing state; creates one
  response on valid input; and returns a `303` redirect to `/rsvp`.
- Rendered name, email, and attendance values are HTML-escaped.
- Unsupported paths return `404`. Unsupported methods and POST body encodings
  are rejected without changing state.
- Authentication, persistence, browser JavaScript, multipart input, cookies,
  and deployment are out of scope.

## Mensor Contract

- Use root `mensor.project.jsonc` and feature contract
  `src/features/rsvp/feature.mensor.jsonc`.
- Keep the complete page and form in
  `src/features/rsvp/views/index.html`, including exact marker
  `{{responses}}`. Do not generate the form from JavaScript.
- Declare one `POST /rsvp` action linked to form `rsvp-response`.
- Declare `name`, `email`, and `attendance` as required string properties
  decoded by the scalar text codec with trimming and empty-value rejection.
- Preserve the three same-name radio controls as one mutually exclusive wire
  field. Do not replace them with differently named fields.
- Put the action handler in the declared server role and export it as a runtime
  value.
- Keep routes, server code, and views in distinct declared feature-relative
  role directories.
- RouteIndex is optional and is not required in this trial.

## Required Files

- `src/app.mjs` implementing the evaluator interface;
- runnable application source and static HTML;
- Mensor project and feature contracts; and
- minimal Node ESM package metadata without dependencies or lifecycle scripts.

An agent-authored test file is optional and never counts as evaluator evidence.

## Constraints

- Do not read or copy Mensor source, fixtures, examples, golden reports, tests,
  Git history, another model workspace, or another trial workspace.
- Do not install dependencies, access the network, execute shell scripts, call
  tools, or add credentials.
- Keep every generated file UTF-8 text with LF line endings and one final
  newline.

## Completion Evidence

The evaluator materializes the bounded response artifact, then runs its
protected semantic oracle and Mensor independently. Both must pass.
Agent-authored tests and completion claims are not evidence.
