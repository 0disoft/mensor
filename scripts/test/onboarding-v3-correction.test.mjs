import assert from "node:assert/strict";
import test from "node:test";
import { assertAllowedCorrection } from "../lib/onboarding-v3-correction.mjs";

const contractPath = "src/features/rsvp/feature.mensor.jsonc";
const feature = {
  actions: [{ route: { method: "POST", path: "/rsvp" }, input: {
    schema: { required: ["attendance"], properties: { attendance: { kind: "enum", values: ["yes", "no", "maybe"] } } },
    formCodec: { unknownFields: "reject", bindings: [{ name: "attendance", path: ["attendance"], decode: { kind: "enum", values: ["yes", "no", "maybe"], trim: true, empty: "reject" } }] },
  } }],
};
const original = { files: [{ path: "src/app.mjs", content: "export const marker = 1;\n" }, { path: contractPath, content: JSON.stringify(feature) }] };
function corrected(mutate = () => {}) {
  const value = structuredClone(feature);
  delete value.actions[0].input.formCodec.bindings[0].decode.trim;
  delete value.actions[0].input.formCodec.bindings[0].decode.empty;
  mutate(value);
  return { files: [original.files[0], { path: contractPath, content: JSON.stringify(value, null, 2) }] };
}

test("accepts only the exact enum correction, independent of JSON formatting", () => {
  assert.deepEqual(assertAllowedCorrection(original, corrected()), [contractPath]);
  assert.throws(() => assertAllowedCorrection(original, original));
});

test("rejects required-field, enum, unknown-field and route weakening", () => {
  for (const mutate of [
    (value) => { value.actions[0].input.schema.required = []; },
    (value) => { value.actions[0].input.formCodec.bindings[0].decode = { kind: "text", trim: true, empty: "reject" }; },
    (value) => { value.actions[0].input.formCodec.unknownFields = "ignore"; },
    (value) => { value.actions[0].route.path = "/elsewhere"; },
  ]) assert.throws(() => assertAllowedCorrection(original, corrected(mutate)));
});

test("rejects runtime changes and file additions or removals", () => {
  const changed = corrected();
  changed.files[0] = { ...changed.files[0], content: "export const marker = 2;\n" };
  assert.throws(() => assertAllowedCorrection(original, changed));
  assert.throws(() => assertAllowedCorrection(original, { files: corrected().files.slice(1) }));
  assert.throws(() => assertAllowedCorrection(original, { files: [...corrected().files, { path: "src/new.mjs", content: "new" }] }));
});
