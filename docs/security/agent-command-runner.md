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
- Timeout and output overflow terminate the process group on POSIX and the
  process tree through `taskkill` on Windows.

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

The descriptor deliberately records `process-only` isolation and
`not-enforced` network control. Callers cannot relabel the current runner as a
sandbox. Artifact hashes are identifiers, not proof that the referenced bytes
were reviewed or contained no secrets.

## Remaining Boundary

The runner does not provide an OS sandbox, network namespace, filesystem
allowlist, token broker, provider authentication, or cost limit. A real
provider command must run in an external sandbox with separately controlled
credentials and network access before its results can support a repair-rate
claim.
