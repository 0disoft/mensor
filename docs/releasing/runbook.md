# npm Release Runbook

This runbook separates the one-time `0.1.0` registry bootstrap from later
stage-only trusted publishing. npm staged publishing cannot create a package
that does not already exist, so using one path for both cases would make the
first release impossible.

Registry commands in this document are maintainer-only operations. Coding
agents may prepare and inspect local artifacts through configured intents, but
must not publish, approve, reject, change package access, or configure a trust
relationship.

## Common Gate

Run from a clean release commit with Node 22 or newer and pnpm 11.11.0:

```text
pnpm install --frozen-lockfile
pnpm run release-check -- --version 0.2.0 --tag latest
pnpm run check
pnpm run release:pack -- --version 0.2.0
```

Review `dist/release/manifest.json`, the three tarballs, package names,
versions, license files, dependency ranges, and checksums before any registry
operation. The release pack command removes and recreates only
`dist/release/`.

## One-Time Registry Bootstrap

The first version of each package must be published manually by the npm scope
owner with interactive 2FA. Publish the reviewed tarballs in dependency order:

```text
npm publish ./dist/release/0disoft-mensor-contract-0.1.0.tgz --access public --tag latest --provenance=false
npm publish ./dist/release/0disoft-mensor-compiler-0.1.0.tgz --access public --tag latest --provenance=false
npm publish ./dist/release/0disoft-mensor-cli-0.1.0.tgz --access public --tag latest --provenance=false
```

Before entering an OTP, verify that the checkout is the exact remotely tested
release commit, the Git worktree is clean, `npm whoami` names the expected scope
owner, each package identity is still absent, and the tarball hashes still
match `dist/release/manifest.json`. Stop if any identity already exists or any
artifact differs.

The package manifests request provenance for normal automated releases, but
npm can generate provenance only from a supported cloud CI runner. The
one-time local bootstrap therefore overrides that setting with
`--provenance=false`. Version `0.1.0` will not carry provenance; later releases
staged through the trusted GitHub publisher will receive it automatically.

After each successful publish, verify the exact package version in the public
registry before publishing its dependent:

```text
npm view @0disoft/mensor-contract@0.1.0 version --json
npm view @0disoft/mensor-compiler@0.1.0 version --json
npm view @0disoft/mensor-cli@0.1.0 version --json
```

After all three packages are visible, run the configured
`mensor_registry_smoke` intent. It installs the exact workspace version from
the official registry in a temporary consumer with lifecycle scripts disabled,
then verifies the contract API and valid/invalid CLI behavior. This networked
check is deliberately separate from aggregate `check` and requires explicit
network approval.

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

Staged publishing requires npm 11.15.0 or newer and Node 22.14.0 or newer. The
release workflow deliberately pins Node 24 and npm 11.18.0. Enter only the
workflow filename `release.yml`, including its extension, rather than the full
`.github/workflows/` path.

Configure the GitHub `npm-release` environment before dispatching the workflow.
This repository is solo-maintained, so the runbook does not require an external
reviewer or enable a self-approval restriction that would deadlock releases.
Keep workflow dispatch manual and protect environment configuration and the
release workflow through repository administration.

Package access may retain npm's 2FA-or-granular-token option. This does not
change the release workflow: it uses GitHub OIDC through `id-token: write` and
must not receive `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or another registry secret.
Any separately created token remains a maintainer-owned credential outside the
release path and must be scoped, short-lived, and rotated independently.

## Later Releases

1. Update the fixed workspace version, changelog, and matching migration note.
2. Merge a commit that passes CI on every supported Node and operating-system
   lane.
3. Manually dispatch `Stage npm release` with the exact version and `latest` or
   `next` dist-tag.
4. Confirm the workflow ran from the intended commit and staged all three
   package tarballs in dependency order.
5. Use `npm stage list`, `npm stage view`, and `npm stage download` or the npm
   website to inspect every staged package and downloaded tarball.
6. Approve each verified stage with `npm stage approve` or the npm website;
   approval requires interactive 2FA.
7. Verify registry metadata, install the CLI in a fresh consumer, create the
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
