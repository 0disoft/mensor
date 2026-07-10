# Command Contract

- Status: Proposed
- Owner: Maintainer

## Runtime Target

The initial implementation targets Node.js 22 or newer and ESM. This is a
selected compatibility floor, not a claim about the current Node.js release or
LTS schedule. Before package metadata or CI is added, the floor must be checked
against current official runtime support and recorded in the implementation
decision.

## MVP Command

```text
mensor check [root] [--config <path>] [--json]
```

- `root` defaults to the current working directory.
- `--config` defaults to `mensor.project.jsonc` inside `root`.
- `--json` selects the canonical machine-readable report.
- Paths supplied through flags must resolve inside `root`.
- Environment variables do not alter contract or rule behavior in the MVP.

`compile`, `fix`, `watch`, `init`, and plugin commands are not part of the MVP.

## Output

Human mode writes concise diagnostics for a terminal. JSON mode writes exactly
one JSON document followed by one LF newline to stdout. JSON mode does not emit
progress, color codes, banners, timing, or debug logs to stdout.

The report envelope contains:

```text
schemaVersion
producer
status
diagnostics
summary
```

The normative diagnostic fields and canonicalization rules live in
`docs/product/02-spec.md` until a machine-readable schema is introduced.

## Exit Status

- `0`: checking completed with no error diagnostics
- `1`: project contract violations were found
- `2`: CLI arguments or project configuration are invalid
- `3`: an unexpected filesystem, parser, or internal failure prevented checking

Warnings alone do not produce exit status `1`. A failure before a report can be
constructed still respects `--json` by emitting a documented machine-readable
error envelope.

## Failure Separation

Project violations are expected compiler results. Invalid configuration is a
user-correctable setup failure. Filesystem and internal failures must remain
distinguishable so automation does not mistake a broken checker for a clean
project.

## Compatibility

Command names, flag meaning, JSON field meaning, and exit statuses are public
contracts after the first preview release. Help text and prose may improve in a
patch release, but automation-facing meaning requires compatibility treatment.
