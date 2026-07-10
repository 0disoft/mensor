# Libraries

- Status: Proposed

Mensor exposes a small contract package and compiler package so tests, custom
CI wrappers, and future adapters can use the same engine as the CLI. The CLI is
the first supported user journey; library exports stay deliberately narrow
until real consumers exist.

Package names use the provisional `@mensor` scope until release-name and
registry availability checks are complete. See `public-api.md` for the export
boundary and compatibility policy.
