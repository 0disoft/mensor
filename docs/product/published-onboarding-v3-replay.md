# Published Onboarding v3: Corrected Oracle Replay

- Date: 2026-09-11
- Oracle implementation: `82dad96`
- Result: 7 of 7 revised protected tests passed
- Classification: Replay of the original artifact, not a new independent sample

The [replay observation](../../internal/agent-runner/observations/published-onboarding-v3/oracle-v4-replay.json)
binds the original observation and response hashes to the new oracle files and
workspace dependency lock. The response hash remains
`d12677d1499e8ac89fa15ad7ef265e3eb57b411b760640c17be742169c5a53c2`.
No application or contract file was changed, no model was called, and no
correction round was consumed. The temporary replay project was cleaned up.

The new oracle extracts only the content substituted for `{{responses}}` and
uses the compiler workspace's existing parse5 dependency to inspect text. It
does not count attendance options elsewhere in the static form, attributes,
script/style/template content or `hidden` elements. This is structural HTML
evidence, not browser layout, CSS visibility or accessibility verification.

Six focused control tests passed. They accept the original reference, joined
list text and paragraph text, while rejecting missing values and script-only
values. Additional cases cover entities, inline text fragments, static form
values, attributes and hidden/template content. The same joined-list control
still fails the historical oracle, reproducing the false rejection without
altering its recorded inputs.

The old `trial-1.json` remains failed and unchanged. The new 7/7 semantic verdict
supersedes only the interpretation of its markup-specific semantic failure;
it does not turn the complete onboarding trial into a success. Package
installation and Mensor checking were not repeated. The original Mensor
`contract.invalid` result still applies to the unchanged enum decoder, and its
configuration failure produced no inspection coverage.

The remaining authoring issue is addressed by a complete enum input example in
the contract specification guide. That documentation change is future guidance,
not a retroactive change to the original agent input or a repair of its artifact.
