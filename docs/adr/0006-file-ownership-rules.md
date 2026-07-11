# ADR-0006: File Ownership Rules

- Status: Accepted
- Owner: Maintainer

## Context

Agents frequently place tests and translations near a convenient global
directory even when a feature owns their lifecycle. The compiler can prove a
file's feature root and suffix, but it cannot safely infer an owner from a
filename or file contents.

## Decision

- Add optional project-owned rules with an id, resource kind, explicit suffix
  list, and required feature-relative directory.
- Support file-level `test` and `i18n` ownership in the MVP.
- Use the nearest declared feature root as owner; nested feature roots remain
  unsupported.
- Report matching files outside every feature as unowned.
- Do not inspect translation keys or test symbols to invent ownership.

## Consequences

- Ownership remains deterministic and cheap to evaluate from discovery facts.
- Repositories choose their own suffixes and slots.
- A global shared test or translation area must be modeled later with an
  explicit owner concept rather than an exception hidden in the checker.

## Reconsider When

- real projects require shared resource owners;
- key-level translation ownership proves necessary; or
- nested feature contracts gain a deterministic ownership model.
