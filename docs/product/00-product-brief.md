# Product Brief

- Status: Proposed
- Owner: Maintainer
- Working name: Mensor

## Product

Mensor is a deterministic contract checker for small server-rendered HTML
applications that are edited by people and coding agents.

Its first consumer is a coding agent because agents expose implicit project
knowledge quickly: they put handlers in the wrong layer, connect forms to the
wrong input shape, import server-only code into browser code, or detach tests
and translations from their owning feature. The product must remain useful
without an LLM, so every check runs locally and in CI with the same result.

## User Problem

Maintainers carry rules such as "this module is server-only" or "this form field
must decode into this action input" in their heads. Those rules are hard for a
new contributor or agent to infer, and ordinary type checking cannot connect
HTML, source layout, transport decoding, and architectural ownership.

Mensor makes only the non-inferable decisions explicit, derives the rest from
source files, and reports a precise repair target when the two disagree.

## Users

- Primary: maintainers using coding agents on TypeScript server-rendered apps
- Secondary: contributors and CI systems enforcing the same contracts
- Later: adapter authors for additional template or source languages

## Value

- Catch cross-file and cross-language contract drift before runtime.
- Produce deterministic evidence that tools can consume without log scraping.
- Tell a repairer what failed while preserving the architectural rule that
  must not be weakened.
- Add checks to an existing stack instead of requiring a new application
  framework.

## MVP Outcome

Given a small TypeScript project containing a static HTML form and an action
contract, `mensor check --json` identifies field and codec mismatches with a
relative source location, structured facts, related locations, and a repair
hint. The same input produces byte-identical output across repeated runs and
different absolute checkout paths.

## Success Measures

- Every required invalid fixture produces its intended diagnostic.
- Valid fixtures produce no error diagnostics.
- Canonical JSON is byte-identical for identical input and tool version.
- The compiler does not execute project code or access the network.
- A repair trial fixes the fixture without changing the contract or deleting
  the tested behavior.
- Contract authoring stays smaller than duplicating the implementation facts
  already present in HTML and TypeScript.

## Non-goals

- Building or replacing a web framework, router, template engine, or ORM
- Running production HTTP traffic
- Generating application features
- Hosting source code, diagnostics, or repair sessions in a cloud service
- Supporting every template language in the first release
- Autofix, inline suppression, and a general plugin lifecycle

## Naming

`Mensor` is a codename, not a cleared release name. Repository, package,
domain, and trademark availability must be checked before a public release.
