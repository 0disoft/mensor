# SonicJS Adoption Study

- Status: External input eligibility measured
- Evidence date: 2026-07-15
- Upstream: `SonicJs-Org/sonicjs`
- Upstream revision: `10163d20aa70c2d7e875880d7b31450066f87af8`
- License observed: MIT
- Upstream participation: read-only study; no maintainer opt-in obtained

## Selection

SonicJS is an independently maintained, public Hono-based CMS with active
server-rendered and HTMX administration surfaces. It is a materially stronger
adoption target than another repository-owned task fixture or an official Hono
example. The study used a shallow clone at the pinned revision and did not run
upstream source, install its dependencies, or copy its code into Mensor.

Primary references:

- <https://github.com/SonicJs-Org/sonicjs/tree/10163d20aa70c2d7e875880d7b31450066f87af8>
- <https://github.com/SonicJs-Org/sonicjs/blob/10163d20aa70c2d7e875880d7b31450066f87af8/LICENSE>
- <https://github.com/SonicJs-Org/sonicjs/blob/10163d20aa70c2d7e875880d7b31450066f87af8/packages/core/package.json>

## Eligibility Method

The scan counted `<form` occurrences under `packages/core/src` and
`packages/templates/src` in `.ts`, `.tsx`, and `.html` files. It then scanned
repository static HTML separately while excluding the generated Playwright
report. Counts describe source representation, not unique runtime forms or
route coverage.

| Surface | Result |
| --- | ---: |
| Form occurrences | 92 |
| Files containing forms | 53 |
| TypeScript files containing forms | 52 |
| TSX files containing forms | 1 |
| Static HTML files containing forms | 0 |
| Forms eligible for current Mensor extraction | 0 of 92 |

The representative RBAC route contains seven form occurrences and nine Hono
route declarations in one TypeScript module. Forms include generated identifiers,
dynamic action segments, GET filters, and POST actions. The route group is
mounted under `/admin/rbac` from the application assembly.

- [RBAC forms and handlers](https://github.com/SonicJs-Org/sonicjs/blob/10163d20aa70c2d7e875880d7b31450066f87af8/packages/core/src/routes/admin-rbac.ts#L252)
- [RBAC route mount](https://github.com/SonicJs-Org/sonicjs/blob/10163d20aa70c2d7e875880d7b31450066f87af8/packages/core/src/app.ts)

## Result

The current compiler cannot perform the same contract-cost, false-positive, or
first-diagnostic measurements used by the synthetic Hono pilot. SonicJS has no
contract-bearing static HTML form to link from `form.template`. Authoring a
contract anyway would require copying or rewriting upstream templates, which
would measure a migration invented for the study rather than adoption of the
existing application.

This is an input eligibility failure, not a compiler false negative. Mensor's
documented MVP accepts static `.html`, while the upstream forms are TypeScript
template strings and TSX. Dynamic action segments and generated controls would
also exceed the current static route and control boundary.

During the study, contract validation was found to accept a non-HTML template
path even though the product specification was static-HTML-only. That allowed a
TypeScript template string to be offered to the HTML parser and risked false
confidence. Version `0.0.51` closes the mismatch by requiring `.html` template
paths before source parsing.

## Product Consequences

1. Do not describe the synthetic static HTML fixture as representative Hono
   adoption evidence.
2. Static HTML remains a valid narrow integration style, but it excludes the
   observed SonicJS form corpus completely.
3. Contract verbosity is secondary when the existing template source is not
   eligible at all.
4. A future Hono experiment needs a serialized `FormIndex` boundary before a
   `RouteIndex`; neither justifies a generic in-process plugin API.
5. Any TypeScript template extractor must preserve explicit unsupported facts
   for interpolation, loops, generated identifiers, dynamic actions, and custom
   helpers instead of pretending they are static HTML.
6. HonoX extraction remains separately gated on maintainer opt-in and renderer
   proof. SonicJS uses Hono templates and does not satisfy that gate.

## Provenance Boundary

No upstream source or prose was copied into Mensor. This document records
repository-native observations, counts, paths, and permalinks. The temporary
clone was used read-only and is not part of repository or release artifacts.
