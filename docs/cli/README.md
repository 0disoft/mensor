# CLI

- Status: Active

The CLI is the first public interface. It must behave the same for a person, CI
job, and coding agent. Checking and compilation remain thin shells over the
compiler. The separately invoked Hono RouteIndex producer owns only its narrow
source syntax and does not add rule logic to the CLI.

The CLI exposes `mensor check`, the clean-check artifact command
`mensor compile`, and the explicit `mensor index-hono-routes` producer.
Additional commands require a concrete workflow that cannot be expressed
through those outputs. See
`command-contract.md` for exact arguments, output, and exit status.

JSON output defaults to revision 1 for compatibility. Version `0.2.0` adds the
explicit `--report-version 2` path for consumers that need machine-readable
inspection states; it does not change human output or exit statuses.

The implementation lives in `packages/cli`. Its process entrypoint owns
argument parsing, rendering, exit-status mapping, and atomic artifact writes.
Project inspection and manifest construction are delegated to
`@0disoft/mensor-compiler`; the Hono producer reads only explicitly supplied
sources and writes only serialized RouteIndex facts.
