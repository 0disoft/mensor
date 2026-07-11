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
- timeout, input-byte, and output-byte limits enforced by the command runner.

The descriptor omits executable paths, arguments, environment names and
values, credentials, raw prompts, source text, transcripts, timestamps, and
hostnames. SHA-256 references are comparison keys, not redaction or provenance
proof. The producer must hash reviewed canonical artifact bytes.

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

`mergeAgentTrialEvidence` is the only supported cohort merger. It validates
every input again, requires byte-identical descriptors and fingerprints,
requires one report producer version, rejects duplicate trial IDs and empty
cohorts, and derives the combined report from trial records. Input ordering
does not change canonical output.
