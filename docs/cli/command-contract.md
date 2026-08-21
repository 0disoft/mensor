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
mensor compile [root] [--config <path>] [--output <path>]
```

Both commands use these rules:

- `root` defaults to the current working directory.
- `--config` defaults to `mensor.project.jsonc` inside `root`.
- Config paths must resolve inside `root`.
- Environment variables do not alter contract or rule behavior.
- Compiler defaults allow 10,000 discovered files, 1 MiB per source file,
  64 MiB across the discovered source tree, and 64 directory levels below
  `sourceRoot`.

`check` accepts these report options:

- `--json` selects the canonical machine-readable report.
- `--report-version` selects JSON revision `1` or `2` and is invalid without
  `--json`. The default is revision `1`.

`compile` accepts one artifact option:

- `--output` writes RuntimeManifest v1 to a project-root-relative portable POSIX
  file path. It is invalid with `check`.
- Output paths reject absolute paths, backslashes, empty segments, current or
  parent directory segments, and parent symlinks that resolve outside `root`.
- Missing output directories are created below the verified project root.
- An existing regular output file is replaced. Directories, symbolic links,
  and other special files are rejected.

`fix`, `watch`, `init`, and plugin commands are not part of the current command
surface.

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

## Compile Output

`compile` runs the same complete revision-1 analysis as `check`. It emits a
RuntimeManifest only when the analysis completed with zero diagnostics. The
manifest contains static GET page HTML, POST action routes, stable handler ids,
and serializable form input contracts. It contains no executable handler,
source path, parser object, timestamp, or random identifier.

Without `--output`, success writes exactly one canonical RuntimeManifest v1 JSON
document and one LF to stdout. With `--output`, success writes no stdout or
stderr. The destination is replaced through a same-directory temporary file:
write, file sync, close, then rename. A failed compile or failed output write
does not replace the destination, and temporary files are removed after handled
failures.

When diagnostics prevent compilation, `compile` writes canonical
DiagnosticReport v1 JSON to stdout and exits `1`; it does not create or replace
the selected output file. Configuration, filesystem, and internal failures use
the revision-1 failure envelope on stdout. Compile output is already canonical
JSON, so `--json` and `--report-version` are invalid with `compile`.

Static HTML is embedded in the manifest. Consumers must treat the file as
deployable application data rather than a harmless diagnostic report.

## Exit Status

- `0`: checking passed, or a RuntimeManifest was emitted or written.
- `1`: project diagnostics were found; compilation produced no manifest.
- `2`: CLI arguments, project configuration, or output-path policy is invalid.
- `3`: a filesystem, parser, output-write, or internal failure prevented the
  operation.

Warnings alone do not produce exit status `1` for `check`. `compile` is stricter:
any diagnostic prevents a manifest because RuntimeManifest is a clean-check
artifact.

A failure before a check report can be constructed respects `--json` by emitting
a machine-readable error envelope. Compile failures always use that JSON
envelope because compile is a machine-output command.

The revision-1 failure envelope is:

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

When revision 2 was selected successfully for `check`, pre-report failures use
the same failure shape with `schemaVersion: 2`. Error envelopes never contain
`inspection`. An unsupported revision cannot select its own envelope and is
reported as a revision-1 usage failure.

`file` and `issues` are present only when the failure owns those facts. Revision
2 omits `file` when the rejected value is absolute, backslash-delimited, or
root-escaping rather than copying a non-canonical path into the envelope. JSON
failures go to stdout with one LF and no stderr output. Human-mode check setup
failures go to stderr.

## Failure Separation

Project violations are expected compiler results. Invalid configuration is a
user-correctable setup failure. Filesystem and internal failures remain
distinguishable so automation does not mistake a broken checker or failed
artifact write for a clean project.

## Compatibility

Command names, flag meaning, JSON field meaning, output-file replacement, and
exit statuses are public contracts after release. Help text and prose may
improve in a patch release, but automation-facing meaning requires compatibility
treatment.
