# Contributing

Mensor accepts focused bug fixes, tests, documentation improvements, and
changes that preserve the product and architecture boundaries in this
repository.

## Before Opening a Pull Request

1. Read `AGENTS.md` and the source-of-truth document for the area you are
   changing.
2. Keep the change scoped and include tests for changed behavior.
3. Do not weaken project contracts, diagnostics, security limits, or semantic
   application tests to make a check pass.
4. Run `pnpm install --frozen-lockfile` and `pnpm run check` from the repository
   root.
5. Report security vulnerabilities through the private process in
   `SECURITY.md`, not through a public issue or pull request.

AI-assisted contributions are allowed, but the contributor remains responsible
for correctness, provenance, licensing, and every submitted line.

## Developer Certificate of Origin

Contributions use the Developer Certificate of Origin 1.1 in `DCO.txt`. Add a
sign-off to every commit:

```text
git commit --signoff
```

The sign-off certifies that you have the right to submit the contribution under
the repository's Apache License 2.0 terms. It is not a claim that the project
maintainer wrote or independently verified the contribution.

## License

Unless explicitly stated otherwise, contributions accepted into this
repository are licensed under the Apache License, Version 2.0. See `LICENSE`.
