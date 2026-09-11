# Published Onboarding v3: One-Correction Closure

- Date: 2026-09-11
- Status: Closed after the single permitted guided correction
- Evaluator implementation: `341994b`
- Agent: Continued `01a08f3d-5f8c-70c1-9d9e-de72de7b7364`, not a new sample
- Model/provider/reasoning identity: Not returned by the host; remains null

The [correction observation](../../internal/agent-runner/observations/published-onboarding-v3/correction-1.json)
records the successful installed-package and semantic verdicts. It references the
original observation and response hashes, the additional correction input and
the revised oracle hashes. The original failure and oracle-only replay remain
unchanged in their own files.

## Change and Guidance

The same agent received the actual `contract.invalid` location and the updated
public enum-decoder guidance in the
[recorded correction input](../../internal/agent-runner/briefs/published-onboarding-v3-correction-1.md).
The guidance explicitly explains the two unsupported properties. This is a
guided repair with updated documentation, not autonomous discovery of the fix
or a new trial of the original documentation alone.

The agent changed only `src/features/rsvp/feature.mensor.jsonc`, removing `trim`
and `empty` from the attendance enum decoder. The evaluator compares the parsed
contract against exactly that change and compares all other files byte for byte.
Required fields, enum values, unknown-field rejection, form bindings, route,
handler, application code, HTML and package versions are preserved. Three focused
gate tests also reject runtime changes, file additions/removals and contract
weakening before execution.

Original response SHA-256:
`d12677d1499e8ac89fa15ad7ef265e3eb57b411b760640c17be742169c5a53c2`

Corrected response SHA-256:
`3c1e9fb47bed9e4f7dd92e5fc6da4d0cdff537f61b647db7cb168e94caf23cf6`

## Actual Evaluation

| Gate | Result |
| --- | --- |
| Exact allowed change and unchanged runtime/template | Passed |
| Official-registry install, all four exact 0.10.0 packages | Passed |
| Full revised protected semantic oracle | 7/7 passed, exit 0 |
| Installed Mensor, report v2 | Passed, exit 0, zero diagnostics |
| Corrections consumed | 1; no further correction permitted |

Mensor reports file placement, static HTML forms and handlers as checked.
Module boundaries, ownership and RouteIndex are not configured. Runtime
semantics remain outside Mensor and were checked by the separate protected
oracle. This does not claim static route coverage, general framework support,
external adoption, a model ranking, a repair-rate percentage or host-enforced
isolation. The materialized temporary project and isolated package store were
removed after evaluation; raw correction and review metadata remain ignored.

The sequence is complete: the original trial exposed one authoring error and
one oracle false rejection; the oracle-only replay clarified the runtime result;
one explicitly guided contract correction then passed both gates. Further model
calls or repeated runs are not part of this trial.
