# Hermes Maintenance Board Brief v1

- Status: Historical reconstruction
- Claim level: Exploratory only
- Published package: `@0disoft/mensor-cli@0.1.0`

This brief records the common task given to three Hermes Agent sessions. The
actual prompt differed only in the assigned workspace path. It was not pinned
by the Mensor evaluator before execution, and the host did not enforce the
filesystem or source-access restrictions below.

## Workspace

Create `{{WORKSPACE}}` as a new independent Git repository. Do not read files
outside that directory, another trial workspace, or the local Mensor source
checkout. Do not copy Mensor fixtures, examples, or internal implementation.
Use only the published npm package and public user documentation.

## Application

Build a small server-rendered facility maintenance request board:

- `GET /requests` renders existing requests and a new-request form.
- `POST /requests` stores one request and redirects to `/requests` with status
  `303`.
- The form contains `title`, a `priority` radio group with `low`, `normal`, and
  `high`, and optional `description`.
- `title` is required and at most 120 characters.
- `description` is at most 1,000 characters.
- Unknown fields, duplicate scalar fields, invalid priorities, and empty titles
  are rejected.
- Only the exact `application/x-www-form-urlencoded` media type is accepted.
- User-controlled output is HTML-escaped.
- State is in memory. Do not add a database, authentication, sessions, or a
  frontend framework.

Use Node.js 22 or newer, strict TypeScript, ESM, pnpm, static HTML, and
`@0disoft/mensor-cli@0.1.0` from the official npm registry. The application may
use `node:http` and must not make the Mensor compiler execute project source.

## Completion Evidence

The final project must install and build, run real semantic tests, and make
`pnpm exec mensor check . --json` exit `0`. Tests must cover GET rendering,
valid POST and redirect, all three priorities, empty title, unknown and
duplicate fields, invalid priority, a similar but invalid content type, and
HTML escaping. A checker pass must not be manufactured by deleting behavior or
weakening the contract.

The final report must list created files, documentation difficulties, initial
diagnostics and repairs, commands and exit results, semantic-test results, the
final Mensor report, and unclear or missing public documentation.
