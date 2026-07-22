# Published Mensor Onboarding Brief: RSVP v1

## Goal

Build a complete dependency-free Node.js ESM RSVP application while adopting
Mensor through its published `@0disoft/mensor-cli` package. The evaluator owns
the semantic oracle and the final Mensor invocation.

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
  marker `{{responses}}` with rendered response markup.

## Product Behavior

- `GET /rsvp` returns the supplied HTML page containing the RSVP form and all
  responses created by the current application instance.
- The static form submits `POST /rsvp` as
  `application/x-www-form-urlencoded`.
- The form has exact id `rsvp-response` and exactly three application-owned
  named fields: `name`, `email`, and `attendance`.
- `attendance` is one radio group with exact values `yes`, `no`, and `maybe`.
- `POST /rsvp` trims all values; rejects missing, empty, duplicate, unknown, or
  invalid values without changing state; creates one response on valid input;
  and returns a `303` redirect to `/rsvp`.
- Rendered name, email, and attendance values are HTML-escaped.
- Unsupported paths return `404`. Unsupported methods and POST body encodings
  are rejected without changing state.
- Authentication, persistence, browser JavaScript, multipart input, cookies,
  and deployment are out of scope.

## Published Package Contract

Create `package.json` with all of these properties:

- `private` is `true`;
- `type` is `module`;
- `packageManager` is `pnpm@11.11.0`;
- `devDependencies` contains exactly
  `"@0disoft/mensor-cli": "0.1.0"`;
- no runtime dependency, lifecycle script, workspace link, file dependency,
  Git dependency, or registry override is present.

The evaluator installs this exact dependency from
`https://registry.npmjs.org/` with lifecycle scripts disabled. Do not include a
lockfile or vendored package content.

## Mensor Contract

- Use root `mensor.project.jsonc` and feature contract
  `src/features/rsvp/feature.mensor.jsonc`.
- Keep the complete page and form in
  `src/features/rsvp/views/index.html`, including exact marker
  `{{responses}}`.
- Declare one `POST /rsvp` action linked to form `rsvp-response`.
- Declare `name`, `email`, and `attendance` as required string properties
  decoded by the scalar text codec with trimming and empty-value rejection.
- Preserve the three same-name radio controls as one mutually exclusive wire
  field.
- Put the action handler in the declared server role and export it as a runtime
  value.
- Keep routes, server code, and views in distinct declared feature-relative
  role directories.
- RouteIndex is optional and is not required in this trial.

## Required Files

- `package.json` with the exact published package contract;
- `src/app.mjs` implementing the evaluator interface;
- `src/features/rsvp/views/index.html`;
- `mensor.project.jsonc`;
- `src/features/rsvp/feature.mensor.jsonc`;
- the declared server handler and route source files.

Agent-authored tests are optional and never count as evaluator evidence.

## Constraints

- Use only the supplied brief and documentation text.
- Do not read or copy Mensor source, fixtures, examples, tests, Git history,
  another model workspace, or another trial workspace.
- Do not access the filesystem, install dependencies, access the network,
  execute commands, call tools, or add credentials.
- Return the project only through the supplied response-artifact transport.
- Keep every generated file UTF-8 text with LF line endings and one final
  newline.

## Completion Evidence

The evaluator validates and materializes the response into an empty temporary
project, verifies package metadata, installs the exact public CLI package, then
runs the protected semantic oracle and installed Mensor CLI independently.
Both must pass. Agent-authored tests and completion claims are not evidence.
