# npm Release Runbook

This runbook separates the one-time `0.1.0` registry bootstrap from later
stage-only trusted publishing. npm staged publishing cannot create a package
that does not already exist, so using one path for both cases would make the
first release impossible.

## Common Gate

Run from a clean release commit with Node 22 or newer and pnpm 11.11.0:

```text
pnpm install --frozen-lockfile
pnpm run release-check -- --version 0.1.0 --tag latest
pnpm run check
pnpm run release:pack -- --version 0.1.0
```

Review `dist/release/manifest.json`, the three tarballs, package names,
versions, license files, dependency ranges, and checksums before any registry
operation. The release pack command removes and recreates only
`dist/release/`.

## One-Time Registry Bootstrap

The first version of each package must be published manually by the npm scope
owner with interactive 2FA. Publish the reviewed tarballs in dependency order:

```text
npm publish ./dist/release/0disoft-mensor-contract-0.1.0.tgz --access public --tag latest
npm publish ./dist/release/0disoft-mensor-compiler-0.1.0.tgz --access public --tag latest
npm publish ./dist/release/0disoft-mensor-cli-0.1.0.tgz --access public --tag latest
```

Do not add an automation token as a bootstrap shortcut. If a later package
fails, do not unpublish a package that consumers may already have fetched.
Repair the cause and publish a new patch version; deprecate a bad version when
consumer warning is needed.

## Trusted Publisher Setup

After all three package identities exist, configure one trusted publisher for
each package in npm with these exact bindings:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `0disoft` |
| Repository | `mensor` |
| Workflow file | `release.yml` |
| Environment | `npm-release` |
| Allowed action | staged publishing only |

Configure the GitHub `npm-release` environment before dispatching the workflow.
This repository is solo-maintained, so the runbook does not require an external
reviewer or enable a self-approval restriction that would deadlock releases.
Keep workflow dispatch manual and protect environment configuration and the
release workflow through repository administration.

For every npm package, require 2FA for package administration and disallow
ordinary automation tokens after trusted publishing is active. The workflow
uses GitHub OIDC through `id-token: write`; it must not receive `NPM_TOKEN`,
`NODE_AUTH_TOKEN`, or another registry secret.

## Later Releases

1. Update the fixed workspace version, changelog, and matching migration note.
2. Merge a commit that passes CI on every supported Node and operating-system
   lane.
3. Manually dispatch `Stage npm release` with the exact version and `latest` or
   `next` dist-tag.
4. Confirm the workflow ran from the intended commit and staged all three
   package tarballs in dependency order.
5. Inspect the staged packages in npm, then approve them with 2FA.
6. Verify registry metadata, install the CLI in a fresh consumer, create the
   matching Git tag and GitHub release, and record the remote evidence in the
   release-candidate audit.

Reject or let a staged release expire when any package, checksum, dependency,
provenance, or release-note detail is wrong. A staged package is not a release
until the maintainer approves it in npm.

## Repository Security Setup

Enable GitHub private vulnerability reporting for `0disoft/mensor`, submit a
harmless test report, and verify the maintainer notification path before the
first public release. Do not put vulnerability details in a public issue when
the private reporting UI is unavailable.
