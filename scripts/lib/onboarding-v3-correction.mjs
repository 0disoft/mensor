import assert from "node:assert/strict";

const contractPath = "src/features/rsvp/feature.mensor.jsonc";

export function assertAllowedCorrection(original, corrected) {
  const before = new Map(original.files.map((file) => [file.path, file.content]));
  const after = new Map(corrected.files.map((file) => [file.path, file.content]));
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), "Correction must preserve every file");
  for (const [file, content] of before) {
    if (file !== contractPath) assert.equal(after.get(file), content, `Unrelated change: ${file}`);
  }
  const expected = JSON.parse(before.get(contractPath));
  const decoder = expected.actions[0].input.formCodec.bindings.find((binding) => binding.name === "attendance").decode;
  assert.equal(decoder.kind, "enum");
  assert.equal(decoder.trim, true);
  assert.equal(decoder.empty, "reject");
  delete decoder.trim;
  delete decoder.empty;
  assert.deepEqual(JSON.parse(after.get(contractPath)), expected, "Only the unsupported enum decoder options may change");
  return [contractPath];
}
