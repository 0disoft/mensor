# Validation

- Status: Active

## Validation Source of Truth

This document owns stable validation names for this scaffold.

## Standard Validation Names

- format
- lint
- typecheck
- test
- contract
- migration-check
- smoke
- package-smoke
- benchmark
- performance
- adoption
- docker-integration
- docs
- check

## Required Final Report

Final responses must list executed validations, passed validations, skipped validations, skip reasons, and remaining risk.

## Runner Policy

Task runner files are optional. Runner `none` means no executable task runner is generated.
If a runner is generated, runner command names must match this document.
Unconfigured runner commands must fail, not pass with a fake success.

The root `package.json` currently configures every standard validation name.
`pnpm run check` is the aggregate local gate. Individual names remain runnable
for narrower evidence.

`check:text` names the text-hygiene implementation behind the stable `format`
slot. `check:structure` names the workspace-contract implementation behind the
stable `lint` slot. Neither is a semantic TypeScript linter. Adding one requires
an explicit dependency and rule-policy decision rather than silently changing
what the stable scaffold names mean.

`package-smoke` builds and packs the contract, compiler, and CLI packages,
forces those local tarballs into an isolated consumer while allowing normal
resolution of public third-party dependencies, and verifies the installed CLI
against both a valid and an invalid fixture. Build output is cleaned first and
must exactly match the current source graph before packaging.

`migration-check` currently validates immutable revision-1 schema identifiers
and runs every maintained contract and report fixture through its exact parser.
No revision-to-revision migration exists yet; the name is the stable scaffold
gate, not a claim that a migration engine has shipped.

`benchmark` emits the deterministic mutation-detection report. It does not run
an agent and must not be reported as repair-rate evidence.

`performance` creates bounded temporary projects with 1,000, 5,000, and 10,000
source files. Each case runs in two isolated Node processes and reports elapsed
time, peak RSS, template document and byte counts, and exclusive durations for
discovery, source reads, TypeScript extraction, HTML reads, HTML extraction,
FormIndex validation, semantic rules, and other compiler work. The first and
immediate repeat runs do not flush the host OS filesystem cache, so the output
is a local engineering baseline rather than a portable cold/warm performance
claim or a pass/fail budget.

The aggregate `check` command runs `performance:smoke`, which uses the same
measurement path with only 1,000 source files. Full scale measurement remains an
explicit `performance` command so ordinary validation does not absorb volatile
10,000-file timing cost.

`adoption` measures project-level fixed contract cost, feature-level marginal
contract cost, and application line counts across the runnable Hono task and
dependency-free Node RSVP fixtures. It checks one form-field drift and one
application-route drift per target, proving stale-index rejection before
regenerating each RouteIndex and expecting `route.missing`. It reports local
diagnostic latency samples. It is a maintained two-fixture probe, not a
framework support matrix, false-positive rate, adapter-quality claim, or
external-user study.

`docker-integration` builds the private runner, explicitly preloads one
digest-pinned public probe image when absent, and exercises success, timeout,
output-limit, and nonzero-exit paths against a real Docker daemon. It requires
an approved absolute Docker CLI path, uses an empty temporary Docker config,
and fails if any Mensor-owned container exists before or remains after the run.
This is daemon integration evidence, not independent attestation or an LLM
repair-rate measurement.

## Hygiene Validation

Repository hygiene file changes must check line-ending churn, binary diff pollution,
tracked secret files, ignored build/cache artifacts, and generated-output drift.

## Scope

general validation routes must stay stack-neutral unless a runner file explicitly defines a command.

## Repository Shape

monorepo, cli-tool, library validation must stay repository-shape focused and must not imply generated application source code.
