# CLI

- Status: Active

The CLI is the first public interface. It must behave the same for a person, CI
job, and coding agent. It is a thin shell over the compiler and must not own
source parsing or rule logic.

The MVP exposes only `mensor check`. Additional commands require a concrete
workflow that cannot be expressed through check output. See
`command-contract.md` for exact arguments, output, and exit status.

JSON output defaults to revision 1 for compatibility. Version `0.2.0` adds the
explicit `--report-version 2` path for consumers that need machine-readable
inspection states; it does not change human output or exit statuses.

The implementation lives in `packages/cli`. Its process entrypoint owns only
argument parsing, rendering, and exit-status mapping; all project inspection is
delegated to `@0disoft/mensor-compiler`.
