# Agent Command Runner Security

- Status: Experimental
- Owner: Maintainer

The private agent runner executes an explicitly configured command inside a
temporary mutated workspace. It is test and evaluation infrastructure, not a
general process API.

## Process Boundary

- The executable must be an absolute path.
- Arguments are passed directly with `shell: false` and may not contain NUL.
- The child working directory is the trial workspace.
- No parent environment variable is inherited. Callers provide an explicit
  allowlist of safe names and values.
- Input is one bounded protocol document on stdin containing schema, mutation
  and baseline identifiers, plus the validated canonical diagnostic report.
  It contains no source snippet, absolute path, environment value, prompt, or
  transcript.
- Combined stdout and stderr have a byte limit.
- Execution has a bounded timeout.
- Timeout and output overflow terminate the original process group on POSIX and
  request process-tree termination through `taskkill` on Windows. Command pipes
  are detached at the limit so an escaped descendant cannot delay adapter
  return merely by retaining inherited stdout or stderr handles.

## Output Boundary

Successful stdout must be one UTF-8 JSON object containing exactly
`schemaVersion` and `rounds`. Exit failures, stderr, malformed output, timeout,
and overflow become generic adapter errors. Raw output is never copied into an
agent trial result.

`internal/agent-runner/spec/agent-command-input-v1.schema.json` and
`agent-command-output-v1.schema.json` define the wire shapes. Before spawning,
the runner requires a failing non-empty report and verifies that its diagnostic
codes match the provider-neutral trial context. Malformed, passing, mismatched,
or oversized reports fail closed.

## Evidence Boundary

The runner can create a canonical execution descriptor and bind it to one
validated trial report. The descriptor records artifact hashes and enforced
limits without copying executable paths, arguments, environment values,
credentials, prompts, source, transcripts, or provider output.

The descriptor also records a SHA-256 commitment to the validated command
specification. This prevents accidental cohort merging when executable,
arguments, environment, or limits drift, but it is not a safe publication
mechanism for guessable low-entropy secrets.

The descriptor deliberately records `process-only` isolation and
`not-enforced` network control. Callers cannot relabel the current runner as a
sandbox. Artifact hashes are identifiers, not proof that the referenced bytes
were reviewed or contained no secrets.

## Remaining Boundary

The runner does not provide an OS sandbox, PID namespace, Windows Job Object,
network namespace, filesystem
allowlist, token broker, provider authentication, or cost limit. A real
provider command must run in an external sandbox with separately controlled
credentials and network access before its results can support a repair-rate
claim. A descendant that creates a new process group or session may outlive the
adapter; process-group termination is defense in depth, not an isolation proof.

## Claim Assessment

`agent-evidence-assessment/v1` derives the only supported claim level for the
current runner: `protocol-integrity-only`. It marks public repair-rate
eligibility false and records missing filesystem, process, network, and
credential enforcement. Callers cannot override those facts. Supporting public
metrics requires a new descriptor revision backed by an actual sandbox, not a
configuration label on the local runner.

## Docker Plan

The internal Docker planner accepts only immutable image digests and derives a
networkless, non-root, read-only, capability-free command with one writable
workspace mount and explicit CPU, memory, PID, I/O, and timeout limits. It is a
validated plan, not runtime attestation.

`docker-sandbox-plan-commitment/v1` is the portable form of that plan. It hashes
the absolute host Docker executable path and the complete agent argument list
separately while retaining the image, container executable, derived security
settings, and limits. Runtime artifacts use the commitment digest rather than
hashing or embedding the raw plan. These hashes prove equality only; low-entropy
paths and arguments may still be guessed and must never contain credentials.

## Runtime Attestation

`docker-sandbox-runtime-attestation/v1` binds a plan digest to normalized Docker
engine, image, security, mount, temporary-filesystem, credential-injection, and
resource-limit observations. It excludes workspace paths, container IDs,
timestamps, command arguments, environment values, and raw inspection output.

The attestation parser proves canonical structure and plan consistency only. It
does not prove who collected the observations. Until an atomic runner owns
container launch, inspect collection, cleanup, and attestation creation, this
artifact cannot remove any public repair-rate blocker.

## Atomic Lifecycle

`runDockerSandbox` owns the fixed `validate`, `create`, `inspect`, `attest`,
`start`, and `remove` sequence around an injected execution port. Inspection
must pass before start. Every handle returned by a successful create is sent to
remove exactly once, and cleanup failure prevents a success result. Execution
and cleanup use separate bounded abort signals.

The port receives no ambient credentials from the runner and raw port errors
are replaced with fixed lifecycle errors. The repository ships a private Docker
CLI execution-port adapter and a dedicated real-daemon integration gate. A port
must honor abort signals and preserve the lifecycle contract before its output
can be treated as executed sandbox evidence.

## Docker CLI Adapter

The private Docker CLI adapter uses an absolute executable path and an explicit
environment instead of inheriting the host process environment. Container
creation uses `--pull=never`, an unpredictable per-container name, and owner,
nonce, and plan-digest labels. The adapter tracks returned handles in memory and
rechecks all three labels before start or removal. A failed or ambiguous create
triggers bounded best-effort inspection and removes only a matching owned
container.

The subprocess boundary closes stdin, bounds combined stdout and stderr, retains
stdout only, honors abort signals, and attempts process-tree termination. Raw
stderr and Docker inspection payloads are not copied into public errors or
evidence. Failed Docker commands may emit only a fixed failure category plus
stage, termination, and exit code to the non-canonical integration log.
The category is an advisory troubleshooting hint derived from unstable CLI
prose. It is never attestation input, never changes cleanup behavior, and must
fall back to `other` instead of inventing a trusted cause.
Inspection still has to reproduce the requested network, root
filesystem, user, capability, mount, tmpfs, and resource limits before start.

The `docker-integration` gate explicitly preloads a digest-pinned public image,
exercises success and three failure paths against a real daemon, and queries the
daemon independently after each case for remaining Mensor-owned containers.
The gate uses a temporary empty Docker configuration and never receives registry
credentials. This proves the tested daemon path, but it is not independent
attestation and does not enable a public repair-rate claim.

## Port Conformance

The conformance harness runs one immutable probe image in `success`, `timeout`,
`output-limit`, and `nonzero-exit` modes. Each mode must pass through the atomic
lifecycle and produce one create/remove pair. Reports contain only artifact,
plan, and expected-output digests plus derived case outcomes.

This checks behavior visible through the injected port. It cannot prove that a
port faithfully represented Docker daemon state or removed the real container,
so a conformant report does not change repair-rate eligibility.

## Execution Descriptor v2

Descriptor v2 commits to the publish-safe plan commitment, runtime attestation, and port
conformance digests. Sandbox adapter and collector identities must agree with
their evidence artifacts, and observed engine, image, and limits must agree
with the attestation and plan.

The descriptor labels this `port-conformance-only`. Standalone parsing checks
shape and ordering; evidence consumers must run binding validation with all
referenced artifacts. Descriptor v2 is not accepted by the current v1 evidence
assessment and cannot enable a public repair-rate claim.

## Trial Evidence v2

`agent-trial-evidence/v2` carries descriptor v2, the publish-safe plan
commitment, runtime attestation, port-conformance report, and canonical trial
report. Validation recomputes descriptor and artifact digests, checks attested
resource limits against the commitment, and derives every conformance case plan
from the public commitment. Artifacts from different plans fail closed.

The envelope omits host executable paths, raw agent arguments, workspace paths,
container handles, raw inspection output, and process output.

`runSandboxAgentTrial` is the authoritative atomic constructor. It validates
the plan, conformance, metadata, port, workspace, cleanup budget, and producer
before mutation; then owns sandbox invocation, final-state verification,
report creation, and envelope construction. Cleanup or final binding failure
returns no evidence.

Its canonical failure receipt contains only a stage, category, and optional
validated trial report. Raw port errors are never copied. A successful outcome
means evidence creation succeeded, while the embedded report determines whether
the agent repaired the mutation.

The injected port is still a trust boundary. The configured real-daemon gate
narrows the missing-evidence set to independent provenance, credential-scope
attestation, and actual agent repair trials. Atomic construction alone still
does not establish public repair-rate eligibility.

## Sandbox Claim Assessment

`sandbox-evidence-assessment/v2` validates the complete v2 evidence envelope
before deriving a fixed `sandbox-artifact-integrity-only` claim. It records the
descriptor's `port-conformance-only` level but deliberately sets
`atomicConstructionProven` to false: portable JSON cannot prove that it passed
through the authoritative in-process constructor. Construction provenance,
credential scope, Docker daemon fidelity, and runtime-observation provenance
remain mandatory blockers. The parser rejects attempts to remove those
blockers or relabel the evidence as publicly eligible.
