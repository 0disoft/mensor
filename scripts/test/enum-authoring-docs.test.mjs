import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../../packages/contract/package.json", import.meta.url));
const { Ajv2020 } = require("ajv/dist/2020.js");
const guide = await readFile(new URL("../../packages/contract/spec/README.md", import.meta.url), "utf8");
const sourceSchema = JSON.parse(await readFile(new URL("../../packages/contract/spec/feature-contract-v1.schema.json", import.meta.url), "utf8"));
const input = JSON.parse(guide.split("### Enum Authoring")[1].match(/```json\s*\n([\s\S]*?)\n```/u)[1]);
const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(sourceSchema);
const feature = (value) => ({
  version: 1, feature: { id: "attendance" }, actions: [{
    id: "attendance.respond", route: { method: "POST", path: "/attendance" },
    form: { template: "views/index.html", id: "attendance" },
    handler: { file: "server/respond.js", export: "respond", role: "server" }, input: value,
  }],
});

test("complete enum input example validates against the source contract schema", () => {
  assert.equal(validate(feature(input)), true, JSON.stringify(validate.errors));
  assert.deepEqual(input.schema.properties.attendance.values, input.formCodec.bindings[0].decode.values);
  assert.deepEqual(Object.keys(input.formCodec.bindings[0].decode).sort(), ["kind", "values"]);
});

for (const [field, value] of [["trim", true], ["empty", "reject"]]) {
  test(`source schema rejects the observed text-only ${field} option on enum`, () => {
    const invalid = structuredClone(input);
    invalid.formCodec.bindings[0].decode[field] = value;
    assert.equal(validate(feature(invalid)), false);
    assert.ok(validate.errors.some((error) => error.keyword === "additionalProperties" && error.params.additionalProperty === field));
  });
}
