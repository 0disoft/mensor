# CLI

- Status: Active

The CLI is the first public interface. It must behave the same for a person, CI
job, and coding agent. It is a thin shell over the compiler and must not own
source parsing or rule logic.

The CLI exposes `mensor check` and the clean-check artifact command
`mensor compile`. Additional commands require a concrete workflow that cannot
be expressed through those outputs. See
`command-contract.md` for exact arguments, output, and exit status.

JSON output defaults to revision 1 for compatibility. Version `0.2.0` adds the
explicit `--report-version 2` path for consumers that need machine-readable
inspection states; it does not change human output or exit statuses.

The implementation lives in `packages/cli`. Its process entrypoint owns only
argument parsing, rendering, exit-status mapping, and atomic manifest writes;
all project inspection and manifest construction are delegated to
`@0disoft/mensor-compiler`.
