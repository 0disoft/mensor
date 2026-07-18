# Agent-Authored Dogfood Protocol

- Status: Evaluator-owned semantic oracle implemented; controlled provider run pending
- Owner: Maintainer
- External maintainer participation: Not planned
- Current brief: `internal/agent-runner/briefs/guestbook-v2.md`
- Historical first brief: `internal/agent-runner/briefs/guestbook-v1.md`
- Second brief: `internal/agent-runner/briefs/rsvp-v1.md`
- Current model cohort: `internal/agent-runner/cohorts/codex-subagents-v2.json`
- Historical model cohort: `internal/agent-runner/cohorts/codex-subagents-v1.json`
- Current semantic oracle: `internal/agent-runner/oracles/guestbook-v3.test.mjs`
- Response transport: `internal/agent-runner/briefs/response-artifact-v1.md`
- Response cohort: `internal/agent-runner/cohorts/codex-subagents-response-v1.json`
- Corrected replay cohort: `internal/agent-runner/cohorts/codex-subagents-response-v1-oracle-v3-replay.json`

## Purpose

This protocol measures whether a coding agent can learn Mensor's project
contract from maintained documentation and build a small compliant application
from an empty workspace. It replaces the previously considered external
maintainer recruitment path.

The result is agent-authored synthetic dogfood. It does not prove external
adoption, human authoring ergonomics, market demand, or general framework
compatibility.

## Trial Input

Each trial receives:

1. a fresh empty workspace;
2. a versioned application brief describing one small form-backed feature;
3. the maintained Mensor product, contract, CLI, and security documentation;
4. built local Mensor packages or an explicitly pinned published version;
5. the command names required to check the project and run its semantic tests;
   and
6. an explicit prohibition on reading or copying existing Mensor fixtures,
   examples, golden reports, test implementations, or another trial workspace;
   and
7. a versioned evaluator-owned semantic oracle copied into protected input.

The brief may name an allowed runtime such as plain Node or Hono, but it must
stay inside the implemented TypeScript, static HTML, URL-encoded form, and
static GET/POST boundary. A separate approved trial is required before a
dynamic template source can be treated as supported input.

The first maintained brief is `guestbook-v1`. It requests a dependency-free
Node ESM guestbook with a static URL-encoded form, in-memory state, independent
semantic tests, strict malformed-input handling, and HTML escaping. It does not
reuse the existing task fixtures.

The second maintained brief is `rsvp-v1`. It changes the domain and requires a
three-control radio group to remain one scalar wire field. It probes whether an
agent can apply the documented control-shape contract instead of copying the
guestbook structure. Checkbox decoding remains outside the implemented codec
boundary and is intentionally absent from this brief.

## Required Output

The agent must produce a complete runnable project containing:

- application source;
- one project contract and the necessary feature contracts;
- static HTML owned by the generated application;
- optional agent-authored tests that never count as evaluator evidence; and
- no credentials, network dependency, generated lockfile from an unapproved
  install, copied upstream source, or hidden fixture dependency.

The generated project belongs to the trial workspace. It becomes a maintained
repository fixture only after source review, license review, deterministic
reproduction, and an explicit maintainer decision.

The evaluator-owned oracle is pinned before generation, remains under
protected input, and runs after workspace-boundary and input-integrity checks.
An agent cannot certify its own behavior by writing a weak test.

## Evaluation Order

1. Validate the brief and agent execution configuration before workspace
   mutation.
2. Record the exact brief revision, Mensor version, model identifier, adapter,
   process limits, and execution cohort without storing credentials or raw
   prompts in canonical results.
3. Let the agent build the project without access to existing Mensor examples.
4. Run the protected evaluator-owned semantic oracle first. A checker-clean
   project with missing behavior fails the trial. Agent-authored tests do not
   affect this verdict.
5. Run Mensor and retain only diagnostic codes and bounded final-state facts.
6. Permit bounded correction rounds using diagnostics, not private fixture
   hints.
7. Re-run semantic tests and Mensor after the final agent change.
8. Reject a result that weakens the contract, removes the requested behavior,
   changes protected trial instructions, or depends on another trial's state.
9. Dispose the trial workspace after bounded result extraction unless its
   source is explicitly accepted as a reviewed fixture.

## Response Artifact Transport

The preferred host integration asks the model for one
`agent-authored-project-artifact` JSON document instead of giving the model a
writable project path. The model receives pinned brief and documentation text.
The host validates the complete response, canonicalizes file order, and writes
only portable bounded UTF-8 text files into a real empty project root.

This removes model-chosen filesystem paths from the normal generation path.
It does not upgrade a Codex subagent run to sandbox evidence when the host still
advertises tools and relies on a prompt instruction not to call them. Record
that distinction in the cohort and result wording.

## Measurements

Keep generation and checker measurements separate:

- whether the requested application semantics passed;
- whether the final Mensor check passed;
- diagnostic codes produced before the final correction;
- correction rounds;
- application and contract file and non-empty-line counts;
- changed files attributable to the agent;
- contract weakening or semantic regression;
- unsupported input encountered; and
- bounded process outcome and resource-limit failures.

Do not turn one successful run into a percentage. Repeated trials must use
fresh workspaces and comparable execution cohorts. Pass-at-least-once and
all-runs-pass answer different questions and must remain separate.

## Codex Subagent Cohort v2

The corrected provider-backed cohort uses fresh Codex subagents with no inherited
conversation and the same pinned brief, documentation set, correction limit,
semantic oracle, and Mensor version for every model:

- `umans/umans-glm-5.2` with reasoning effort `high`;
- `umans/umans-kimi-k2.7` with reasoning effort `high`;
- `opencode-go/minimax-m3` with reasoning effort `high`; and
- `opencode-go/deepseek-v4-flash` with reasoning effort `high`.

Each result records the runner, provider, exact model identifier, reasoning
effort, and cohort identifier. A model that the current Codex subagent host
does not advertise is recorded as unavailable and skipped. It must not be
silently replaced by another provider, model, main-thread run, or inherited
agent. Results are reported per model; the first four runs are smoke evidence,
not a cross-model ranking or a repair-rate percentage.

Version 1 is historical protocol evidence. It let each agent author the test
that judged its own application and therefore cannot support semantic success
claims. Version 2 pins `guestbook-v2.test.mjs` and requires a stable
`src/app.mjs` Web Request/Response interface so the evaluator owns behavior
checks.

Host-native subagent execution is exploratory until the host can bind each
subagent to the fresh trial workspace without exposing the Mensor repository,
other trial workspaces, or inherited conversation. Prompt instructions alone
do not prove that isolation. Such runs must not claim
`sandboxed-workspace-only` merely because the subagent used a separate task.

Current exploratory response-artifact runs use
`agent-authored-build-exploratory-observation-v4.schema.json`. That observation
records the baseline commit, exact adapter identity, brief, semantic-oracle,
and output-transport digests, artifact response digest, artifact acceptance,
generated project-relative files, semantic result, and Mensor diagnostic codes. Its
environment and claim level are fixed to `not-enforced` and `exploratory-only`.
It cannot be relabeled as sandbox evidence, and it excludes prompt text, model
response text, absolute paths, command output, environment values, and source
content.

Versions 2 and 3 remain immutable historical schemas. Version 2 does not bind
an output transport or artifact-acceptance gate. Version 3 adds those facts but
does not bind the exact model response bytes, so it cannot support artifact
replay. Neither should be used for current response-only observations.

## Privacy and Security

- Trial inputs are project-owned synthetic briefs, not third-party source.
- Mensor's compiler remains offline and does not execute generated source.
- Application semantic tests execute only inside the approved bounded trial
  environment.
- API credentials are injected only into the agent adapter and never copied to
  the generated project, report, diagnostic, or transcript artifact.
- Canonical results exclude source text, absolute paths, environment values,
  raw prompts, raw model responses, and command stderr.
- Network access belongs to the model adapter only. The generated application,
  compiler, and semantic tests remain networkless unless a later trial contract
  explicitly changes that boundary.

## Current Harness Boundary

`runAgentAuthoredBuildTrial` in the private agent runner implements the local
workflow shell. Before creating mutable state it validates SHA-256 commitments
for the brief, semantic oracle, and allowed documents. It then creates a fresh
workspace with protected `input/` and empty `project/` directories, invokes an
injected agent port, rejects protected-input or root-boundary writes, runs
separate semantic and Mensor check ports, returns only bounded final-state
facts, and disposes the workspace on every outcome.

The adapter identity is part of the canonical result. This prevents results
from different Codex runners, providers, model aliases, reasoning settings, or
cohorts from being merged after the fact.

The exploratory observation parser and serializer are separate from the
sandbox trial evidence contracts. A successful exploratory observation proves
only that the generated final state passed the two local oracles under the
recorded baseline. It does not prove repository invisibility, network denial,
credential containment, or trajectory compliance.

`createProtectedNodeSemanticTestPort` runs one protected-input Node test file
against the generated project with a closed stdin, empty environment, timeout,
and combined output limit. `createNodeSemanticTestPort` remains available for
non-authoritative project-owned smoke tests. Both ports have
`process-only` isolation: they do not enforce network denial or host-filesystem
isolation and cannot support a sandbox claim. The current end-to-end tests use
`injected-test` agents. A provider-backed trial must use an approved adapter
and must record `sandboxed-workspace-only` only when that isolation is actually
enforced.

The project-owned smoke-test port result never replaces the protected oracle
verdict.

`validateAgentAuthoredProjectArtifact` and
`materializeAgentAuthoredProjectArtifact` own the response-only write boundary.
They reject the entire artifact before writing on contract, path, text, size,
or target-root failure. ADR-0032 records why this is preferred to asking a
host-native model to write directly into the workspace.

## Stop Conditions

Stop without a successful result when:

- the agent needs existing fixtures or upstream application source to proceed;
- the requested application falls outside the implemented input boundary;
- semantic tests cannot prove the requested behavior;
- a dependency install, runtime, or network effect lacks an approved command
  contract;
- the agent edits protected contracts or trial instructions to manufacture a
  pass;
- secrets or private host data enter generated files or canonical results; or
- workspace cleanup or execution attribution becomes uncertain.

## Decision Gate

Agent-authored dogfood may guide documentation, diagnostics, contract
ergonomics, and fixture coverage. It cannot support claims about external
maintainer adoption or human usability.

The local guestbook v2 vertical slice is implemented with a fake injected
agent and protected oracle. Run the next provider-backed trial only after its
allowed documentation set, model adapter, credential boundary, sandbox
enforcement, process limits, and result wording are reviewed together. Do not
add a new evidence or attestation layer merely to start it; reuse the existing
private fixture-kit and bounded agent-runner boundaries where they fit.
