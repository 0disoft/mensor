# Published Onboarding v3 Result

- Date: 2026-09-11
- Status: One fresh artifact evaluated; no successful-adoption claim
- Dispatch baseline: `57ef6f4e2f46cb8c3ee25b2742fcef30f45a231b`
- Evaluator implementation: `9cd4395`, with pnpm script entrypoint `24663b5`
- Classification: Exploratory, no host-enforced isolation or model ranking
- Model: Host-inherited; the spawn tool did not return resolved model/provider
  or reasoning identity, so these fields remain null
- Agent id: `01a08f3d-5f8c-70c1-9d9e-de72de7b7364`

The [original observation](../../internal/agent-runner/observations/published-onboarding-v3/trial-1.json)
records input and response hashes, seven generated paths and separate verdicts.
The agent received only the five approved documents with no inherited conversation.
The response was reviewed before execution; its application uses local imports,
in-memory state and Web Request/Response objects, with no filesystem, external
network or subprocess effects. Prompt restrictions are not a sandbox claim.
The temporary installed project was removed after evaluation. Raw response and
review receipt remain in ignored v3 staging; no generated app was promoted to a
maintained fixture. Historical v1/v2 inputs and results were not modified.

## Actual Results

| Gate | Result |
| --- | --- |
| Artifact transport and package declaration | Accepted |
| Official-registry install of all four exact 0.10.0 packages | Passed |
| Protected semantic tests | 6 passed, 1 failed |
| Installed Mensor check, report v2 | Exit 2, `contract.invalid` |
| Corrections | 0; original output preserved |

There was one evaluator startup failure before installation: `pnpm exec` did not
provide `npm_execpath`. Switching the configured entrypoint to `pnpm run` resolved
it. No observation existed at that point; the actual artifact was evaluated once.

## Interpretation

The semantic failure is an oracle false rejection, not evidence that attendance
was omitted. The immutable RSVP v2 test requires `/>maybe</`, whereas the valid
rendered response contains `... - maybe</li>`. The brief requires rendering the
value but never requires a standalone text element. Other assertions in that test
passed through redirect, persistence and escaped name/email before this assertion.
This limits the semantic verdict: do not silently turn the original failed
observation into a success or ask the agent to match hidden markup requirements.

The Mensor failure is a real authoring error. The generated enum decoder contains
`trim` and `empty`; `enumDecoder` accepts only `kind` and `values`. The supplied
documentation illustrates text decoding and lists enum support, but does not
provide a complete enum decoder example or explicitly distinguish those options.
This is one observed documentation friction point, not a measured failure rate.
The CLI also emits unrelated `oneOf` branch details, including checkbox and
integer decoder errors, before the final contract failure. No inspection coverage
was produced because configuration validation failed first.

## Next Bounded Change

Create a new oracle revision that checks rendered response content without fixing
the surrounding markup. Add paragraph/list positive controls and a missing-value
negative control. Preserve the original oracle, its input hashes and this verdict;
any evaluation of the retained artifact with the new oracle must be a separately
labelled replay, not another independent onboarding sample.

Then add one exact enum schema/decoder authoring example, explicitly stating that
text-decoder options are not enum-decoder properties. This may be supplied only
to a new revision or recorded correction, never retroactively included in this
trial's input. General JSX expansion and additional model cohorts remain deferred.
