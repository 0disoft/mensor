# Agent-Authored Application Brief: Guestbook v2

## Goal

Build a complete dependency-free Node.js ESM guestbook application in the
empty `project/` directory. The evaluator owns the semantic oracle; do not
create, replace, or weaken its tests.

## Required Application Interface

- Create `src/app.mjs`.
- Export a runtime function named `createGuestbookApp`.
- It accepts one object `{ templateHtml }`, where `templateHtml` is the complete
  HTML page source supplied by the evaluator.
- It returns `{ fetch, entries }`.
- `fetch(request)` accepts a Web `Request` and returns a `Response` or a promise
  of one.
- `entries` is the mutable in-memory array owned by that application instance.
- Each stored entry is exactly `{ author, message }` after trimming. Do not add
  timestamps, generated ids, request metadata, or other fields.
- GET rendering must use the supplied `templateHtml`. Replace only the exact
  marker `<!-- entries -->` with rendered entry markup. Do not reconstruct the
  form in JavaScript or ignore the supplied template.

## Product Behavior

- `GET /guestbook` returns the supplied HTML page containing the guestbook form
  and all entries created by the current application instance.
- The static form submits `POST /guestbook` as
  `application/x-www-form-urlencoded`.
- The form has exact id `create-entry` and exactly two application-owned named
  fields: `author` and `message`.
- `POST /guestbook` trims both values, rejects missing, empty, duplicate, and
  unknown fields without changing state, creates one entry on valid input, and
  returns a `303` redirect to `/guestbook`.
- Rendered author and message values are HTML-escaped.
- Unsupported paths and methods return `404`. Unsupported POST body encodings
  are rejected without changing state.

## Mensor Contract

- Use root `mensor.project.jsonc` and feature contract
  `src/features/guestbook/feature.mensor.jsonc`.
- Keep the complete page and form in
  `src/features/guestbook/views/index.html`, including exact marker
  `<!-- entries -->`. Do not generate the form from JavaScript.
- Declare one `POST /guestbook` action linked to form `create-entry`.
- Declare `author` and `message` as required string properties decoded by the
  scalar text codec with trimming and empty-value rejection.
- Put the action handler in the declared server role and export it as a runtime
  value.
- Keep routes, server code, and views in distinct feature-relative role
  directories.

## Required Files

- `src/app.mjs` implementing the evaluator interface;
- runnable application source and static HTML;
- Mensor project and feature contracts; and
- minimal Node ESM package metadata without dependencies or lifecycle scripts.

An agent-authored test file is optional and never counts as evaluator evidence.

## Constraints

- Read only the supplied `input/` files.
- Do not read Mensor source, fixtures, examples, golden reports, tests, Git
  history, another model workspace, or another trial workspace.
- Do not install dependencies, access the network, execute shell scripts, or
  add credentials.
- Do not edit `input/`, the brief, documentation, or semantic oracle.
- Write only inside `project/`.
- Keep every generated file UTF-8 text with LF line endings and one final
  newline.

## Completion Evidence

The evaluator runs its protected semantic oracle and Mensor independently.
Both must pass. Agent-authored tests and completion claims are not evidence.
