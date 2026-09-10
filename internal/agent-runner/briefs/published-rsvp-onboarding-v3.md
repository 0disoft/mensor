# Published Mensor Onboarding Brief: RSVP v3

## Goal

Author a fresh dependency-free Node.js ESM RSVP application using the published
Mensor 0.10.0 package set. This is one exploratory onboarding trial, not a JSX
compatibility trial. The evaluator installs packages and judges runtime behavior
separately from Mensor. Do not copy earlier RSVP applications.

## Interface and Behavior

- Export `createRsvpApp({ templateHtml })` from `src/app.mjs`. Return an object
  with `fetch(request)` accepting a Web Request and returning a Response or
  promise. Each instance owns independent in-memory state.
- `GET /rsvp` returns HTML from the supplied template, replacing only the exact
  marker `{{responses}}` with escaped response markup.
- The complete page is `src/features/rsvp/views/index.html`. Its form has id
  `rsvp-response`, method `post`, action `/rsvp`, and exactly three wire fields:
  text `name`, email `email`, and radio group `attendance` (`yes`, `no`, `maybe`).
- Trim all values. Reject missing, blank, duplicate, unknown, or invalid
  attendance values with a 4xx response and no state change.
- Accept only `application/x-www-form-urlencoded`, optionally with parameters.
  Reject JSON, multipart and lookalike media types with 4xx and no state change.
- Each valid POST adds exactly one response and returns 303 with Location `/rsvp`.
  Render submitted name, email and attendance; escape untrusted HTML characters.
- Unknown paths return 404. Unsupported methods return 4xx without changing state.
- No authentication, persistence, network calls, server listener or deployment.

## Package Contract

Create a private ESM `package.json` with `packageManager: "pnpm@12.3.4"` and
exactly these devDependencies:

```json
{
  "@0disoft/mensor-cli": "0.10.0",
  "@0disoft/mensor-compiler": "0.10.0",
  "@0disoft/mensor-contract": "0.10.0",
  "@0disoft/mensor-reference-runtime": "0.10.0"
}
```

No runtime dependencies, lifecycle scripts, workspaces, registry overrides,
local/Git dependencies, lockfile or vendored packages. The exact versions are
experimental input controls, not a general dependency-update policy.

## Mensor Contract

Create `mensor.project.jsonc` and `src/features/rsvp/feature.mensor.jsonc`.
Declare distinct feature-relative server, route and view roles and a real
exported server handler used by the application. Use the supplied public
contract documentation to declare the POST route, required form fields,
trimmed scalar text decoding, unknown-field rejection and radio enum.
Do not duplicate the form or weaken behavior to obtain a clean report.
RouteIndex is optional; its absence must be reported as not configured, not
as verified application routing. Static HTML is intentional in this trial.

## Independence and Output

Use only this brief and the supplied public documentation and response-artifact
v1 transport. Do not access tools, filesystem, network, credentials, source,
fixtures, examples, tests, oracles, Git history or other trial outputs.
Return only one response-artifact JSON document with UTF-8 LF-terminated files.
Optional self-authored tests do not count as evaluator evidence.

The evaluator reviews the artifact before any execution, installs the exact
public packages with lifecycle scripts disabled, runs its protected semantic
oracle, then the installed CLI. At most one diagnostic-only correction is
allowed. A checker-clean application may still fail semantics. Prompt-only
tool restrictions are not a sandbox or proof of filesystem isolation.
