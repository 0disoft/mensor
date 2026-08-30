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
mensor check [root] [--config <path>] [--json] [--report-version <1|2>]
mensor compile [root] [--config <path>] [--out <path>] [--json]
```

- `root` defaults to the current working directory.
- `--config` defaults to `mensor.project.jsonc` inside `root`.
- `--json` selects the canonical machine-readable report.
- `--report-version` selects JSON revision `1` or `2` and is invalid without
  `--json`. The default is revision `1`. It is valid only for `check`.
- `--out` selects the compile artifact path relative to `root` and defaults to
  `.mensor/manifest.json`. It is valid only for `compile`.
- Paths supplied through flags must resolve inside `root`.
- Environment variables do not alter contract or rule behavior in the MVP.
- The CLI applies compiler defaults of 10,000 discovered files, 1 MiB per
  source file, 64 MiB across the discovered source tree, and 64 directory
  levels below `sourceRoot`.

`fix`, `watch`, `init`, and plugin commands are not part of the current CLI.

## Output

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

On a clean `compile`, human mode names the root-relative artifact path and JSON
mode writes the canonical RuntimeManifest v1 bytes after the same bytes have
been committed to disk. The CLI creates a temporary file in the destination
directory, flushes it, and renames it over the target. Compilation diagnostics,
invalid output paths, and write failures do not replace an existing artifact.
The destination parent must resolve inside `root`; directory and symbolic-link
targets are rejected.

## Exit Status

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
    "version": "0.5.0"
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

## Failure Separation

Project violations are expected compiler results and prevent compile output.
Invalid configuration is a user-correctable setup failure. Filesystem and
internal failures must remain distinguishable so automation does not mistake a
broken checker or failed manifest write for a clean project.

## Compatibility

Command names, flag meaning, JSON field meaning, and exit statuses are public
contracts after the first preview release. Help text and prose may improve in a
patch release, but automation-facing meaning requires compatibility treatment.
