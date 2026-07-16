# External Static HTML Candidate Search

- Status: No qualifying application found
- Search date: 2026-07-15
- Scope: independently maintained TypeScript applications with native static
  HTML forms that submit to repository-owned server handlers

## Qualification Contract

A repository qualified only when all of these conditions held at the inspected
revision:

1. It was public, independently maintained, and not an official framework
   example or a Mensor-owned fixture.
2. TypeScript owned the server-side request handler.
3. A source `.html` file owned a native form submission.
4. The form used a current Mensor transport boundary: `GET` or `POST` with
   `application/x-www-form-urlencoded` controls.
5. The form action resolved to the repository-owned handler without client
   JavaScript replacing the submission with JSON or another method.

License status was recorded separately. Missing or reciprocal licensing did not
prevent read-only inspection, but it blocks copying source into Mensor and may
prevent a later adoption patch.

## Search Method

GitHub repository search produced maintained TypeScript, Hono, Express, and HTMX
candidates. GitHub code search then checked those repositories for `<form` in
`.html` files. Shortlisted repositories were shallow-cloned at a fixed revision
and inspected without installing dependencies or executing source.

The broader screen included `SonicJs-Org/sonicjs`,
`Sleeping-Bear-Systems/todo-app-node`, `MainListActivity/ma_hono`,
`kosmicjs/kosmic-docs`, two maintained `kazurayam` Hono/HTMX applications,
`dragnet-dev/port`, `AkayShin/rpgchecker`, `tjakoen/batch`, `deco-cx/deco`,
`jtekt/web-based-approval-system`, `Capgemini/gov-prototype-by-prompt`,
`h1n054ur/cf-astro-blog-starter`, `skelpo/cms`, and
`ewrogers/hyper-calendar`. None supplied a qualifying static HTML form. The
separate SonicJS study records its TypeScript-template result in detail.

This was a bounded candidate search, not proof that no qualifying repository
exists anywhere on GitHub.

## Shortlist Results

| Repository | Revision | License observed | Static form surface | Decision |
| --- | --- | --- | --- | --- |
| `Hebububu/static-htmx-ecommerce` | `b28cbb6eeab2d8c4713ad9a85a1d7377f41bceb6` | None detected | Two GET search forms in one HTML component | Reject |
| `FormBee/FormBee` | `afd53c971dd6b36719eb24baae7d33ebc1a45e6a` | MIT | One multipart usage demo and one Angular reactive template | Reject |
| `cnrkuo/shortener` | `d1f784d9513c1539fb5d90e32f11d5c5327b5218` | AGPL-3.0-only | One static HTML form intercepted by Alpine | Reject |

### `static-htmx-ecommerce`

The repository contains 42 HTML files, 11 TypeScript files, and two form
occurrences. Both forms are GET search controls in the same header component.
The project is a Vite-built static frontend with no repository-owned TypeScript
server handler, so it cannot exercise form-to-action or import-boundary
contracts. No repository license was detected.

- <https://github.com/Hebububu/static-htmx-ecommerce/tree/b28cbb6eeab2d8c4713ad9a85a1d7377f41bceb6>
- <https://github.com/Hebububu/static-htmx-ecommerce/blob/b28cbb6eeab2d8c4713ad9a85a1d7377f41bceb6/src/components/layout/header.html>

### `FormBee`

The repository has a TypeScript Express server and tests, but its plain static
HTML form is a usage demo with `multipart/form-data`, which is outside the MVP.
The other HTML form is an Angular reactive component and does not own a native
action or method. Treating either as a supported static form would change the
experiment instead of measuring the existing application.

- <https://github.com/FormBee/FormBee/tree/afd53c971dd6b36719eb24baae7d33ebc1a45e6a>
- <https://github.com/FormBee/FormBee/blob/afd53c971dd6b36719eb24baae7d33ebc1a45e6a/_UsageDemos/submissiontest.html>
- <https://github.com/FormBee/FormBee/blob/afd53c971dd6b36719eb24baae7d33ebc1a45e6a/server/formbee/src/index.ts>

### `shortener`

The source HTML contains one form, but Alpine intercepts submission, prevents
the browser default, and sends a JSON `PUT` request to `/api/v0/shorten`.
Mensor would see HTML controls that do not represent the actual wire contract.
The repository is useful evidence for a future client-mediated form fact, not a
valid current dogfood target.

- <https://github.com/cnrkuo/shortener/tree/d1f784d9513c1539fb5d90e32f11d5c5327b5218>
- <https://github.com/cnrkuo/shortener/blob/d1f784d9513c1539fb5d90e32f11d5c5327b5218/www/index.html>

## Decision

The external static HTML dogfood gate remains blocked. Do not satisfy it with a
frontend-only repository, a usage demo, a dynamic framework template, or a
client-mediated JSON form. Those substitutions would produce attractive
metrics for a contract that the upstream application does not actually own.

The product decision had two honest paths:

1. Keep native static HTML as the product boundary and recruit maintainers who
   explicitly use or want that architecture.
2. Introduce a serialized `FormIndex` boundary and separately approve one
   narrow template extractor without executing application source.

ADR-0030 selected the second architectural boundary while deliberately
deferring the extractor. The built-in static HTML provider now passes through
the private index with byte-identical diagnostics. The external dogfood gate
and separate extractor approval remain blocked; completing the internal
boundary does not supply either missing input.

No generic plugin API, TypeScript renderer execution, or copied upstream
fixture follows from this search.

## Provenance Boundary

No upstream code or prose was copied into Mensor. This report contains
repository-native observations, counts, revision identifiers, and permalinks.
Temporary clones were read-only research inputs and are not release artifacts.
