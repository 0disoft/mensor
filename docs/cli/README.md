# CLI

- Status: Active

The CLI is the first public interface. It must behave the same for a person, CI
job, and coding agent. Checking and compilation remain thin shells over the
compiler. The separately invoked Hono RouteIndex producer owns only its narrow
source syntax and does not add rule logic to the CLI.

The CLI exposes `mensor check`, the clean-check artifact command
`mensor compile`, and explicit `mensor index-hono-routes` and
`mensor index-ts-forms` producers.
Additional commands require a concrete workflow that cannot be expressed
through those outputs. See
`command-contract.md` for exact arguments, output, and exit status.

JSON output defaults to revision 1 for compatibility. Version `0.2.0` adds the
explicit `--report-version 2` path for consumers that need machine-readable
inspection states; it does not change human output or exit statuses.

Version `0.9.0` adds opt-in `check --sarif` interoperability output. SARIF is
a deterministic projection of completed diagnostics, not a replacement for
Mensor JSON or inspection coverage.

The implementation lives in `packages/cli`. Its process entrypoint owns
argument parsing, rendering, exit-status mapping, and atomic artifact writes.
Project inspection and manifest construction are delegated to
`@0disoft/mensor-compiler`; both producers read only explicitly supplied
sources and write only serialized RouteIndex or FormIndex facts.
