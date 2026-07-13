# Agent Execution Descriptor

- Status: Experimental
- Owner: Maintainer

## Purpose

An execution descriptor separates comparable trial evidence from anonymous
JSON logs. Results may be compared or aggregated only when their canonical
execution fingerprint matches.

`internal/agent-runner/spec/agent-execution-descriptor-v1.schema.json` records:

- descriptor, provider, model, and optional model-revision identifiers;
- adapter, prompt, toolset, and dataset IDs, revisions, and SHA-256 references;
- runner kind, platform, architecture, Node version, isolation, and network
  control; and
- a SHA-256 commitment to the validated executable path, argument list,
  environment map, and enforced command limits; and
- timeout, input-byte, and output-byte limits enforced by the command runner.

The descriptor omits executable paths, arguments, environment names and
values, credentials, raw prompts, source text, transcripts, timestamps, and
hostnames. Command values are included only in the canonical digest, so changing
the actual process specification starts a new cohort. SHA-256 references are
comparison keys, not redaction or provenance proof. Low-entropy secret values
can still be guessed from a digest and must not be published as evidence inputs.
The producer must hash reviewed canonical artifact bytes.

## Evidence Envelope

`agent-trial-evidence/v1` embeds one descriptor and one canonical trial report.
Its `executionFingerprint` is derived from canonical descriptor bytes and is
validated on read. Unknown fields, non-canonical ordering, unsupported values,
and fingerprint drift fail closed.

The current runner records `process-only` isolation and `not-enforced` network
control. This evidence can exercise the protocol but cannot support a claim
that provider traffic or filesystem access was sandboxed.

`runCommandAgentTrial` is the authoritative constructor for command-backed
evidence. It validates the command adapter and descriptor from the same options
before applying a mutation, runs the trial, creates its report, and binds the
result to the descriptor. Independently combining low-level adapter and
descriptor constructors is not accepted as execution evidence.

## Comparison Rule

Do not merge reports with different execution fingerprints. A model, prompt,
toolset, dataset, adapter, platform, runtime, isolation, network-control, or
limit change starts a new comparison cohort. Cost and latency need separate
bounded measurement contracts and are not inferred from this descriptor.

Descriptor v2 binds a publish-safe plan-commitment digest,
runtime-attestation digest, and port-conformance digest plus sandbox adapter and
collector identities. The plan commitment replaces the host Docker executable
path and agent arguments with separate SHA-256 values; those hashes are
comparison keys, not encryption. The injected-port lifecycle makes
launch, observation, execution, and cleanup atomic from the runner's
perspective, but it is not a Docker daemon implementation. Port conformance
shows only behavior visible through that API and cannot prove daemon state or
actual container removal.

`parseSandboxExecutionDescriptor` validates standalone shape only. Evidence
consumers must also call `validateSandboxExecutionDescriptorBindings` with the
private canonical plan and referenced artifacts, or
`validateSandboxExecutionDescriptorEvidenceBindings` with the publish-safe plan
commitment and referenced artifacts. The descriptor therefore remains
`port-conformance-only`; the v1 trial-evidence envelope and cohort merger do not
accept descriptor v2, and public repair-rate eligibility does not change.

`agent-trial-evidence/v2` embeds descriptor v2, the plan commitment, runtime
attestation, port-conformance report, and one canonical trial report. Parsing
recomputes every digest and cross-artifact binding, including attested limits
and the derived plan digest for every conformance case. The v2 cohort merger
requires byte-identical execution and sandbox artifacts.

Hand-built v2 envelopes remain binding containers rather than execution
receipts. `runSandboxAgentTrial` is the authoritative single-trial constructor:
it validates all static execution inputs before mutation, uses the sandbox as
the trial adapter, captures that invocation's runtime attestation, derives the
final-state report, and creates the descriptor and envelope in one workflow.

`sandbox-agent-trial-outcome/v1` separates evidence creation from infrastructure
failure. `ok: true` means canonical evidence was created, not that the agent
repaired the mutation. The embedded report owns the repair verdict. `ok: false`
contains only a bounded stage, category, and optional canonical report; raw port
errors, paths, handles, output, and inspection data are omitted. Cleanup or
binding failure never returns partial evidence.

The atomic constructor still consumes an injected port and a precomputed
conformance report. It cannot independently prove daemon fidelity, so its
evidence remains `port-conformance-only` and cannot support a public repair-rate
claim.

`mergeAgentTrialEvidence` is the only supported cohort merger. It validates
every input again, requires byte-identical descriptors and fingerprints,
requires one report producer version, rejects duplicate trial IDs and empty
cohorts, and derives the combined report from trial records. Input ordering
does not change canonical output.

`assessAgentTrialEvidence` derives a separate claim boundary from validated
evidence. Descriptor v1 can prove protocol integrity but cannot support a
public repair-rate claim because filesystem, process, network, and credential
enforcement are not attested. The assessment is canonical and callers cannot
override eligibility or remove blockers.

`runCommandAgentSuite` is the repeated-evaluation entrypoint. It validates the
whole plan before requesting a workspace, assigns deterministic trial IDs, and
runs every attempt in a caller-provided fresh workspace that is disposed even
on failure. It remains serial so command trials cannot compete for shared host
budgets. The workspace provider and external sandbox must enforce isolation
outside the Node.js process.

The repository-provided `createVerifiedWorkspaceProvider` pins each baseline to
a canonical snapshot digest, rejects symbolic links and special files, verifies
the copy, and deletes only live paths it created below its temporary root.
Callers should use this provider for controlled fixture suites instead of an ad
hoc copy callback.
