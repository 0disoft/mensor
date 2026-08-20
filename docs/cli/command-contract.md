# Command Contract

- Status: Active
- Owner: Maintainer

## Runtime Target

The initial implementation targets Node.js 22 or newer and ESM. The runtime
floor was checked against the official Node.js release schedule when the
toolchain decision was recorded. Future CI must test the minimum supported
major and one newer supported major; package metadata alone is not compatibility
evidence.

## Check Command

```text
mensor check [root] [--config <path>] [--json] [--report-version <1|2>]
```

- `root` defaults to the current working directory.
- `--config` defaults to `mensor.project.jsonc` inside `root`.
- `--json` selects the canonical machine-readable report.
- `--report-version` selects JSON revision `1` or `2` and is invalid without
  `--json`. The default is revision `1`.
- Paths supplied through flags must resolve inside `root`.
- Environment variables do not alter contract or rule behavior in the MVP.
- The CLI applies compiler defaults of 10,000 discovered files, 1 MiB per
  source file, 64 MiB across the discovered source tree, and 64 directory
  levels below `sourceRoot`.

## Init Command

```text
mensor init [root]
  --feature-root <path>
  --feature-id <id>
  --handler-role <role>
  [--source-root <path>]
  [--config <path>]
  [--action-id <id>]
  [--document-path <path>]
  [--form-file <path> --form-id <id>]
  [--handler-file <path> --handler-export <name>]
```

`init` creates one project contract draft and one feature contract draft. It is
an onboarding aid, not an architecture inference engine.

- `root` defaults to the current working directory.
- `--source-root` defaults to `src`.
- `--config` defaults to `mensor.project.jsonc`.
- `--feature-root` is project-relative, must be inside `sourceRoot`, and owns
  the generated `feature.mensor.jsonc`.
- `--feature-id` and `--handler-role` are required because source files cannot
  prove product identity or architectural policy.
- `--form-file` and `--form-id` must be supplied together when more than one
  eligible form exists. Their path is project-relative.
- `--handler-file` and `--handler-export` must be supplied together when more
  than one named runtime export exists. Their path is project-relative.
- `--document-path` is required when the selected form has an omitted or empty
  action and therefore submits to the current document.
- `--action-id` overrides the deterministic id derived from the feature and form
  ids.

The compiler performs bounded, offline discovery. It accepts only a static HTML
form with an id, an explicit `POST` method, a static root-relative action or an
explicit current-document route, supported named controls, and one explicit
named TypeScript or JavaScript runtime export. It never imports application
modules, executes configuration, launches framework tooling, installs packages,
or accesses the network.

The draft copies facts that source owns and leaves policy conservative. Scalar
fields become optional text values. Repeated controls become optional arrays of
text values. Requiredness, trimming, typed decoders, checkbox true values,
ignored host fields, additional roles, boundaries, ownership rules, and
RouteIndex remain maintainer decisions. Generated JSONC comments call out that
review boundary.

Both outputs are validated through the public contract parsers before writing.
The CLI uses create-only publication and never overwrites an existing path. If
publication of the second draft fails, it removes the first draft before
returning. Parent directories are not created implicitly. `init` has human
output only; `--json` and `--report-version` are rejected.

`compile`, `fix`, `watch`, and plugin commands are not part of the MVP.

## Check Output

Human mode writes concise diagnostics for a terminal. JSON mode writes exactly
one JSON document followed by one LF newline to stdout. JSON mode does not emit
progress, color codes, banners, timing, or debug logs to stdout.

The default revision-1 report envelope contains:

```text
schemaVersion
producer
status
diagnostics
summary
```

`status: "passed"` means every check enabled by the supplied project contract
completed without an error diagnostic. It is not a coverage declaration. In
particular, omitting `ProjectContract.routeIndex` disables application-route
verification and the `route.missing` rule. Mensor does not execute the
application, so runtime behavior remains the application's semantic-test
responsibility even when diagnostics are empty.

Revision 2 is opt-in and inserts a required `inspection` object between
`status` and `diagnostics`. Its fixed domains report `checked`,
`not-configured`, or `out-of-scope` with a closed machine-readable basis. A
checked domain may still contain diagnostics; `status` and `summary` own the
verdict. Invalid or stale configured evidence fails before an inspection object
is emitted.

The normative diagnostic fields are in
`packages/contract/spec/diagnostic-report-v1.schema.json`; Check Output v2 is
in `packages/contract/spec/check-output-v2.schema.json`. Product-level
canonicalization and determinism rules remain in `docs/product/02-spec.md`.

## Exit Status

- `0`: checking completed with no error diagnostics, or both init drafts were
  created
- `1`: project contract violations were found by `check`
- `2`: CLI arguments or project configuration are invalid, or `init` would
  overwrite an existing output
- `3`: an unexpected filesystem, parser, publication, rollback, or internal
  failure prevented completion

Warnings alone do not produce exit status `1`. A check failure before a report
can be constructed still respects `--json` by emitting a documented
machine-readable error envelope.

The check failure envelope is:

```json
{
  "schemaVersion": 1,
  "producer": {
    "name": "mensor",
    "version": "0.3.0"
  },
  "status": "error",
  "failure": {
    "kind": "configuration",
    "code": "path.invalid",
    "message": "configFile contains an empty, current-directory, or parent-directory segment.",
    "file": "../outside.jsonc"
  }
}
```

When revision 2 was selected successfully, pre-report failures use the same
failure shape with `schemaVersion: 2`. Error envelopes never contain
`inspection`. An unsupported revision cannot select its own envelope and is
reported as a revision-1 usage failure.

`file` and `issues` are present only when the compiler failure owns those
facts. Revision 2 omits `file` when the rejected value is absolute,
backslash-delimited, or root-escaping rather than copying a non-canonical path
into the envelope. JSON failures go to stdout with one LF and no stderr output.
Human-mode setup and init failures go to stderr.

## Failure Separation

Project violations are expected compiler results. Invalid configuration is a
user-correctable setup failure. Filesystem and internal failures must remain
distinguishable so automation does not mistake a broken checker for a clean
project. A failed init must not leave a newly generated partial contract pair;
a rollback failure is reported separately because manual cleanup remains.

## Compatibility

Command names, flag meaning, JSON field meaning, and exit statuses are public
contracts after the first preview release. Help text and prose may improve in a
patch release, but automation-facing meaning requires compatibility treatment.
The init draft contents are review scaffolding rather than a serialized public
wire contract; their accepted project and feature schemas remain the public
compatibility boundary.
