# CLI

- Status: Active

The CLI is a public interface. It must behave the same for a person, CI job,
and coding agent. It remains a thin shell over the compiler and must not own
source parsing, semantic rules, or RuntimeManifest construction.

The executable exposes two commands:

```text
mensor check [root] [--config <path>] [--json] [--report-version <1|2>]
mensor compile [root] [--config <path>] [--output <path>]
```

`check` reports configured contract violations. JSON output defaults to
revision 1 for compatibility; `--report-version 2` adds machine-readable
inspection states without changing human output or exit statuses.

`compile` calls the compiler's existing clean-check API and emits canonical
RuntimeManifest v1. Without `--output` it writes the manifest to stdout. With
`--output` the CLI validates a project-root-relative portable path and replaces
the destination through a same-directory temporary file. Diagnostics remain
DiagnosticReport v1 JSON and prevent every artifact write.

The implementation lives in `packages/cli`. Its process entrypoint owns
argument parsing, rendering, output-path confinement, atomic file replacement,
and exit-status mapping. All project inspection and manifest construction stay
in `@0disoft/mensor-compiler`. See `command-contract.md` for exact arguments,
output, rollback behavior, and exit status.
