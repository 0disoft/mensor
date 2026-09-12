# Command Contract

- Status: Active
- Owner: Maintainer

## Runtime Target

The initial implementation targets Node.js 22 or newer and ESM. The runtime
floor was checked against the official Node.js release schedule when the
toolchain decision was recorded. Future CI must test the minimum supported
major and one newer supported major; package metadata alone is not compatibility
evidence.

## Commands

```text
mensor check [root] [--config <path>] [--json] [--report-version <1|2>] [--sarif]
mensor compile [root] [--config <path>] [--out <path>] [--json]
mensor index-hono-routes [root] --source <path> --receiver <name> [--out <path>] [--json]
mensor index-ts-forms [root] --source <path> --tag <identifier> [--out <path>] [--json]
mensor index-hono-jsx-forms [root] --source <path> --jsx-config <path> --build-config <path> --renderer <path> [--out <path>] [--json]
```

- `root` defaults to the current working directory.
- `--config` defaults to `mensor.project.jsonc` inside `root`.
- `--json` selects the canonical machine-readable report.
- `--sarif` selects deterministic SARIF 2.1.0 output for a completed check. It
  is mutually exclusive with `--json` and `--report-version`.
- `--report-version` selects JSON revision `1` or `2` and is invalid without
  `--json`. The default is revision `1`. It is valid only for `check`.
- `--out` selects the artifact path relative to `root` and defaults to
  `.mensor/manifest.json` for `compile`, `mensor.route-index.json` for
  `index-hono-routes`, and `mensor.form-index.json` for both form index commands.
- `--source` is repeatable for index commands. `--receiver` is
  repeatable only for `index-hono-routes`; `--tag` is repeatable only for
  `index-ts-forms`. Each command requires all of its named inputs.
- `--jsx-config`, `--build-config` and `--renderer` are required only for
  `index-hono-jsx-forms` and rejected by other commands.
- Paths supplied through flags must resolve inside `root`.
- Environment variables do not alter contract or rule behavior in the MVP.
- The CLI applies compiler defaults of 10,000 discovered files, 1 MiB per
  source file, 64 MiB across the discovered source tree, and 64 directory
  levels below `sourceRoot`.

`fix`, `watch`, `init`, generic provider discovery, and plugin commands are not
part of the current CLI.

## Output

Human mode writes concise diagnostics for a terminal. JSON mode writes exactly
one JSON document followed by one LF newline to stdout. JSON mode does not emit
progress, color codes, banners, timing, or debug logs to stdout.

For an invalid feature contract, human mode retains the configuration error
line and may append up to three sorted, deduplicated decoder-path hints to
stderr. An otherwise-valid enum decoder rejected only for additional properties
gets a reminder that only `kind` and `values` are allowed; `trim` and `empty`
belong to text decoders. Ambiguous decoder candidates and malformed enum values
do not receive this hint. These hints use existing schema issues, without
rereading input files. JSON failure envelopes, error codes and exit codes are
unchanged.

When `check` or `compile` cannot find the selected project contract or one of
its parent directories, human mode adds the root-relative contract path and
suggests checking the selected root, `--config`, or creating the project and
referenced feature contracts. Installation does not create these files. The
hint is not used for a missing root, unrelated feature files, unreadable files
or wrong filesystem types. No extra filesystem reads or writes are performed.
The existing `filesystem` failure, `path.missing` code and exit status `3`
are preserved, as are JSON failure envelopes.

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

On a clean `compile`, human mode names the root-relative artifact path and JSON
mode writes the canonical RuntimeManifest v1 bytes after the same bytes have
been committed to disk. The CLI creates a temporary file in the destination
directory, flushes it, and renames it over the target. Compilation diagnostics,
invalid output paths, and write failures do not replace an existing artifact.
The destination parent must resolve inside `root`; directory and symbolic-link
targets are rejected.

On a clean `index-hono-routes`, human mode names the root-relative RouteIndex
path and JSON mode writes the canonical RouteIndex v1 bytes after the same
bytes are committed to disk. The command reads only explicitly listed source
files, matches only explicitly named receiver identifiers, and never imports
application modules. Direct and chained static `get` and `post` calls are the
entire supported syntax. Dynamic paths, mounted/composed routers, `on`, `all`,
optional chains, invalid UTF-8, syntax errors, unsafe paths, and empty results
are configuration failures and preserve existing output.

On a clean `index-ts-forms`, human mode names the root-relative FormIndex path
and JSON mode writes the canonical FormIndex v1 bytes after the same bytes are
committed to disk. The command reads only explicitly listed TypeScript or
JavaScript files and matches only explicitly named identifier tags. Static
no-substitution tagged templates use the compiler's pure HTML extractor.
Interpolation marks the source document incomplete rather than executing or
guessing the expression. Syntax errors, invalid UTF-8, unsafe paths, missing
tags, and any explicit source with no selected template are configuration
failures and preserve existing output. Tag matching is syntactic and does not
resolve aliases or shadowed bindings.

## Exit Status

`index-hono-jsx-forms` follows the same canonical output and atomic replacement
contract. It accepts only the explicit static HonoX subset in
[Hono JSX FormIndex v1](../architecture/hono-jsx-form-index-v1.md). It binds the
selected renderer and both configuration files into the artifact so stale
activation evidence fails consumer freshness checks. Unsupported form syntax
produces incomplete evidence, not a guessed complete form. Inputs are never
executed; successful indexing is not a runtime-behavior attestation.

JSX activation/input failures use status `2`; atomic output failures use `3`.
Its output must be a portable relative `.json` path distinct from every input.

- `0`: checking or compilation completed with no error diagnostics
- `1`: project contract violations were found; compile output was not replaced
- `2`: CLI arguments or project configuration are invalid
- `3`: an unexpected filesystem, parser, manifest-write, or internal failure
  prevented completion

Warnings alone do not produce exit status `1`. A failure before a report can be
constructed still respects `--json` by emitting a documented machine-readable
error envelope.

The failure envelope is:

```json
{
  "schemaVersion": 1,
  "producer": {
    "name": "mensor",
    "version": "0.10.2"
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
Human-mode setup failures go to stderr.

SARIF mode writes one SARIF 2.1.0 run for a completed report. Diagnostic
errors still produce exit status 1. Failures before report construction use
the normal human stderr path and do not fabricate a SARIF run.

## Failure Separation

Project violations are expected compiler results and prevent compile output.
Invalid configuration is a user-correctable setup failure. Filesystem and
internal failures must remain distinguishable so automation does not mistake a
broken checker or failed manifest write for a clean project.

## Compatibility

Command names, flag meaning, JSON field meaning, and exit statuses are public
contracts after the first preview release. Help text and prose may improve in a
patch release, but automation-facing meaning requires compatibility treatment.
