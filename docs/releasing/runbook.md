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

Run from a clean release commit with Node 24 and pnpm 12.3.4. The contributor
minimum remains Node 22.13; the Node 22 CI lane protects public runtime support:

```text
pnpm install --frozen-lockfile
pnpm run release-check -- --version 0.10.0 --tag latest
pnpm run check
pnpm run release:pack -- --version 0.10.0
```

Review `dist/release/manifest.json`, the four tarballs, package names,
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

The reference runtime first appears in `0.4.0` and needs the same one-time
identity bootstrap before staged publishing can manage later versions:

```text
npm publish ./dist/release/0disoft-mensor-reference-runtime-0.4.0.tgz --access public --tag latest --provenance=false
```

For that release only, publish the reviewed reference-runtime tarball first,
then dispatch the workflow for `0.4.0` with `stage_reference_runtime` disabled
so the existing three packages are staged without attempting to replace the
already published runtime version. From `0.5.0` onward, leave it enabled.

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
npm view @0disoft/mensor-reference-runtime@0.4.0 version --json
```

After all four packages are visible, run the configured
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

After all four package identities exist, configure one trusted publisher for
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
4. Confirm the workflow ran from the intended commit and staged all four
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

## Dependency Update Checklist

The 0.9.1 dependency pass covers reviewed entries in
[Dependency Dashboard #4](https://github.com/0disoft/mensor/issues/4).

- `fast-uri` 3.1.7 -> 4.1.4 is an AJV transitive override across a major boundary.
  [Version 4](https://github.com/fastify/fast-uri/releases/tag/v4.0.0) removes
  deprecated type names and changes escaping. Validate AJV schema references,
  contract parsers, declarations with library checks enabled, and packaged
  consumers. The workspace override does not update consumer locks.
- Hono 4.12.34 -> 4.13.7 is a fixture/development dependency. The
  [upstream fix](https://github.com/honojs/hono/releases/tag/v4.13.7) concerns JSX
  boundary escaping; the maintained static HTML fixture does not use that path.
  Validate Hono route extraction and fixture behavior without claiming exploitability.
- pnpm 11.26.0 -> 12.3.4 uses a platform-native executable. The
  [major migration](https://github.com/pnpm/pnpm/releases/tag/v12.0.0) tightens
  workspace-setting validation and changes peer-cycle resolution and hosted Git
  dependency transport. This workspace has no Git dependencies or custom settings;
  review the regenerated graph without deleting the lockfile. The package-manager
  installer provisions its platform binary; do not disable supply-chain checks.
- Node types 22.20.1 -> 26.5.0 affect development declarations, not the application's
  runtime. Their undici-types dependency also changes major. Keep strict type
  checking and the Node 22 runtime lane; do not add Node 26-only runtime calls.
  TypeScript remains on its 6.x JavaScript compiler API compatibility package.
  pnpm records a release-age exception for the explicitly reviewed 26.5.0 package
  only: its official registry metadata supplies integrity and signatures and no
  installation scripts. No wildcard exception or global age reduction is added.
- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1),
  [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0),
  and [pnpm action-setup v6.1.0](https://github.com/pnpm/action-setup/releases/tag/v6.1.0)
  are pinned to the release commit SHAs. The v7 actions run on the runner's
  Node 24 runtime independently of the application's Node matrix; keep GitHub-hosted
  runners current and verify Node 24 action support before using self-hosted runners.
  Existing checkout and cache inputs remain supported. Checkout rejects unsafe
  `pull_request_target` defaults; these workflows use `pull_request`, `push`, or
  `workflow_dispatch`, with no unsafe opt-in. Permissions and triggers are unchanged.
- Same-major Hono and fast-uri updates are permitted by caret ranges, with exact
  graph resolution in the lockfile. Tool and action pins remain reviewable by
  Renovate rather than floating at execution time.
- Node 24 is primary on Linux, Windows, Docker integration, and release jobs;
  Node 22 remains a Linux compatibility lane. This is not a public Node support
  removal. New major updates require another compatibility review; do not approve
  every future dashboard entry at once.

Before publication, run hosted CI on the exact commit; local checks do not
execute GitHub Actions. Rollback restores this dependency commit's manifests,
lockfile, and workflow revisions together, followed by a frozen install. Do not
mark the remote dashboard resolved until the changes are pushed and Renovate
has observed them.

During the local Windows migration, pnpm 12 stopped while removing the old
modules layout, leaving `node_modules/hono` linked to an already removed 4.13.7
store entry. Only that verified dangling link was unlinked before reinstalling;
no running process or source directory was removed. The new lockfile includes
a separate YAML document for pnpm's platform packages. Preserve both documents
when reviewing or processing the lockfile.
