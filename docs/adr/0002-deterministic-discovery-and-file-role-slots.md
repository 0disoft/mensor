# ADR-0002: Deterministic Discovery and File-Role Slots

- Status: Accepted
- Owner: Maintainer

## Context

The first compiler slice must prove that project contracts can be linked to
real files without executing untrusted source. Handler placement also needs a
stable role model before import graphs and HTML extraction are added.

Starting with arbitrary glob semantics would make precedence, negation, and
cross-platform path behavior part of the first public contract. Hard-coding
`server/` or `routes/` inside the compiler would hide project policy in code.

## Decision

- `ProjectContract.fileRoles` declares non-overlapping feature-relative
  directories using `{ role, withinFeature }` entries.
- An action handler declares `file`, `export`, and expected `role`.
- The compiler classifies a handler only when its relative path is below a
  declared directory boundary.
- Discovery sorts directory entries by JavaScript code-unit order before
  recursion and emits project-relative POSIX paths.
- Discovery skips symlinks and rejects configured paths containing symlinks.
- The default discovery limit is 10,000 files and callers may lower it through
  `limits.maxFiles`.
- The compiler reads contract files but never imports inspected source modules.
- A role mismatch emits `file.role_mismatch` with stable facts, a related
  contract range, and repair constraints.

## Consequences

- Role meaning remains project-owned without introducing a glob language.
- Nested or overlapping role directories are rejected as configuration errors,
  so one file cannot receive multiple roles.
- File-level placement can use a zero range in the implementation file while
  the related location points to the exact handler path in JSONC.
- More expressive matching may be added only with explicit precedence and
  compatibility rules.
- Missing handler exports, HTML forms, import graphs, and CLI output remain
  later slices.

## Reconsider When

- a real project cannot express its architecture with non-overlapping feature
  directories;
- framework adapters provide normalized roles that are not directory-based; or
- measured repositories require a different default file-count limit.
