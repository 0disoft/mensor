# Libraries

- Status: Proposed

Mensor exposes a small contract package and compiler package so tests, custom
CI wrappers, and future adapters can use the same engine as the CLI. The CLI is
the first supported user journey; library exports stay deliberately narrow
until real consumers exist.

Public package names use the account-controlled `@0disoft` scope and the
`mensor-` prefix. See `public-api.md` for the export boundary and compatibility
policy. Internal test packages retain private workspace-only names.
