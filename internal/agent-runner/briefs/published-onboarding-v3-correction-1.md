# Published Onboarding v3: Correction 1

This is the sole allowed correction to your original RSVP response artifact.
It continues the same trial, not a fresh independent sample. Return one complete
response-artifact v1 JSON document without Markdown or commentary. Do not call
tools, read files, access a network, or execute commands. Finish within 300 seconds.

The installed public Mensor 0.10.0 CLI returned exit 2, `contract.invalid`, for
`src/features/rsvp/feature.mensor.jsonc`. The reported location is
`/actions/0/input/formCodec/bindings/2/decode`; its enum decoder has additional
properties that the schema rejects.

The following public guidance was added to the contract specification guide in
commit `8453542`: an enum decoder accepts exactly `kind` and `values`, and its
values must match the enum schema in the same order. The `trim` and `empty`
properties belong to text decoders and are not accepted by enum decoders.

The valid attendance schema and matching decoder are:

```json
{
  "schema": { "kind": "enum", "values": ["yes", "no", "maybe"] },
  "decode": { "kind": "enum", "values": ["yes", "no", "maybe"] }
}
```

Correct the configuration error while preserving the original application,
package versions, required fields, enum values, route, handler and form bindings.
Do not weaken validation, replace enum with unrestricted text, remove behavior,
or reformat unrelated files. Preserve all runtime and template files byte for
byte. The evaluator will compare the full artifacts before executing the
corrected one. No further correction will be requested after this attempt.
