import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkProject } from "@0disoft/mensor-compiler";
import { cliVersion, runCli } from "@0disoft/mensor-cli";
import { humanFailureHints } from "../dist/src/human-failure-hints.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const decoderPath = "/actions/0/input/formCodec/bindings/0/decode";
const hint = `${decoderPath}: enum decoders accept only "kind" and "values"; ` +
  `"trim" and "empty" are text-decoder options.`;

async function invalidFixture(context, decoders) {
  const root = await mkdtemp(path.join(repositoryRoot, ".tmp-cli-hints-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(repositoryRoot, "fixtures/valid/tiny-tasks"), root, { recursive: true });
  const file = path.join(root, "src/features/tasks/feature.mensor.jsonc");
  const contract = JSON.parse(await readFile(file, "utf8"));
  const binding = contract.actions[0].input.formCodec.bindings[0];
  contract.actions[0].input.formCodec.bindings = decoders.map((decode) => ({ ...binding, decode }));
  await writeFile(file, `${JSON.stringify(contract)}\n`);
  const result = await checkProject({ root });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "contract.invalid");
  return { root, failure: result.failure };
}

async function invoke(root, argv) {
  let stdout = "";
  let stderr = "";
  const code = await runCli({ argv, cwd: root,
    stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout, stderr };
}

test("check and compile explain otherwise-valid enum decoders with extra properties", async (context) => {
  const { root, failure } = await invalidFixture(context, [
    { kind: "enum", values: ["yes", "no"], trim: true, empty: "reject" },
  ]);
  for (const command of ["check", "compile"]) {
    const result = await invoke(root, [command]);
    assert.deepEqual(result, { code: 2, stdout: "",
      stderr: `mensor: contract.invalid: ${failure.message}\n  hint: ${hint}\n` });
  }
});

test("enum guidance leaves JSON revisions and compiler failures unchanged", async (context) => {
  const { root, failure } = await invalidFixture(context, [
    { kind: "enum", values: ["yes"], trim: true },
  ]);
  const before = structuredClone(failure);
  assert.deepEqual(humanFailureHints(failure), [hint]);
  assert.deepEqual(failure, before);
  for (const schemaVersion of [1, 2]) {
    const result = await invoke(root, ["check", "--json", "--report-version", String(schemaVersion)]);
    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `${JSON.stringify({ schemaVersion,
      producer: { name: "mensor", version: cliVersion }, status: "error", failure }, null, 2)}\n`);
  }
});

test("other oneOf candidates and malformed enum values do not receive misleading hints", async (context) => {
  for (const decode of [
    { kind: "text", values: ["yes"], trim: true, empty: "reject" },
    { kind: "unknown", values: ["yes"], trim: true },
    { values: ["yes"], trim: true },
    { kind: "enum", trim: true },
    { kind: "enum", values: 42, trim: true },
    { kind: "enum", values: [42], trim: true },
  ]) {
    const { root, failure } = await invalidFixture(context, [decode]);
    assert.deepEqual(humanFailureHints(failure), [], JSON.stringify(decode));
    const result = await invoke(root, ["check"]);
    assert.equal(result.code, 2);
    assert.equal(result.stderr, `mensor: contract.invalid: ${failure.message}\n`);
  }
  assert.deepEqual(humanFailureHints({ kind: "configuration", code: "cli.usage_invalid", message: "usage" }), []);
  assert.deepEqual(humanFailureHints({ kind: "configuration", code: "contract.invalid", message: "invalid" }), []);
});

test("hints are deduplicated, sorted and capped at three decoder paths", async (context) => {
  const { failure } = await invalidFixture(context, Array.from({ length: 4 }, () =>
    ({ kind: "enum", values: ["yes"], trim: true, empty: "reject" })));
  const expected = [0, 1, 2].map((index) => hint.replace("bindings/0", `bindings/${index}`));
  assert.deepEqual(humanFailureHints(failure), expected);
  assert.deepEqual(humanFailureHints({ ...failure, issues: [...failure.issues].reverse() }), expected);
});
