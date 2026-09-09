import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "@0disoft/mensor-cli";
import { checkProject } from "@0disoft/mensor-compiler";
import { parseProjectContract, serializeFormIndex } from "@0disoft/mensor-contract";

async function fixture(context) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-jsx-evidence-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const feature = JSON.parse(await readFile(new URL("../../../fixtures/valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc", import.meta.url), "utf8"));
  feature.actions[0].form.template = "routes/index.tsx";
  const files = {
    "app/feature.mensor.jsonc": JSON.stringify(feature),
    "app/server/create-task.ts": await readFile(new URL("../../../fixtures/valid/tiny-tasks/src/features/tasks/server/create-task.ts", import.meta.url), "utf8"),
    "app/routes/index.tsx": 'import { createRoute } from "honox/factory"; export default createRoute((c) => c.render(<form id="create-task" method="post" action="/tasks"><input type="text" name="title" required /><button>Save</button></form>));',
    "app/routes/_renderer.tsx": 'import { jsxRenderer } from "hono/jsx-renderer"; export default jsxRenderer(({ children }) => <html><body>{children}</body></html>);',
    "tsconfig.json": '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"hono/jsx"}}',
    "vite.config.ts": 'import { defineConfig } from "vite"; import honox from "honox/vite"; export default defineConfig({plugins:[honox()],esbuild:{jsx:"automatic",jsxImportSource:"hono/jsx"}});',
  };
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  const contract = {
    version: 1, sourceRoot: "app", featureContracts: ["app/feature.mensor.jsonc"],
    fileRoles: [{ role: "server", withinFeature: "server" }, { role: "view", withinFeature: "routes" }],
    formIndex: "mensor.form-index.json", formIndexEvidence: ["tsconfig.json", "vite.config.ts"],
  };
  await writeFile(path.join(root, "mensor.project.jsonc"), JSON.stringify(contract));
  let output = "";
  const code = await runCli({ cwd: root, argv: ["index-hono-jsx-forms", "--source", "app/routes/index.tsx", "--renderer", "app/routes/_renderer.tsx", "--jsx-config", "tsconfig.json", "--build-config", "vite.config.ts", "--json"], stdout: (text) => { output += text; }, stderr: (text) => assert.fail(text) });
  assert.equal(code, 0, output);
  return { root, files, contract, index: JSON.parse(output) };
}

async function expectFailure(root, code, limits) {
  const result = await checkProject({ root, ...(limits ? { limits } : {}) });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.failure.code, code, JSON.stringify(result));
}

test("explicit FormIndex evidence works at the application root and remains source-bound", async (context) => {
  const { root, files, contract } = await fixture(context);
  const passed = await checkProject({ root });
  assert.equal(passed.ok, true, JSON.stringify(passed));
  assert.equal(passed.report.summary.errorCount, 0);
  for (const file of contract.formIndexEvidence) {
    await writeFile(path.join(root, file), files[file] + "\n");
    await expectFailure(root, "form_index.digest_mismatch");
    await writeFile(path.join(root, file), files[file]);
  }
  await writeFile(path.join(root, "tsconfig.json"), files["tsconfig.json"] + " ".repeat(600_000));
  await expectFailure(root, "file.size_limit_exceeded", { maxFileBytes: 524_288 });
  await writeFile(path.join(root, "tsconfig.json"), files["tsconfig.json"]);
  delete contract.formIndexEvidence;
  await writeFile(path.join(root, "mensor.project.jsonc"), JSON.stringify(contract));
  await expectFailure(root, "form_index.source_not_discovered");
});

test("evidence cannot carry forms, disappear from the index or bypass aggregate limits", async (context) => {
  const { root, files, index } = await fixture(context);
  const sourceBytes = Object.entries(files).filter(([file]) => file.startsWith("app/")).reduce((sum, [, text]) => sum + Buffer.byteLength(text), 0);
  await expectFailure(root, "discovery.file_limit_exceeded", { maxFiles: 5 });
  const bounded = await checkProject({ root, limits: { maxFiles: 6 } });
  assert.equal(bounded.ok, true, JSON.stringify(bounded));
  await expectFailure(root, "discovery.total_bytes_limit_exceeded", { maxTotalBytes: sourceBytes });
  const evidence = index.documents.find((document) => document.path === "tsconfig.json");
  evidence.forms = structuredClone(index.documents.find((document) => document.path.endsWith("index.tsx")).forms);
  await writeFile(path.join(root, "mensor.form-index.json"), serializeFormIndex(index));
  await expectFailure(root, "form_index.evidence_invalid");
  index.documents = index.documents.filter((document) => document.path !== "tsconfig.json");
  await writeFile(path.join(root, "mensor.form-index.json"), serializeFormIndex(index));
  await expectFailure(root, "form_index.evidence_invalid");
});

test("explicit evidence rejects linked parents and does not become a template source", async (context) => {
  const { root, contract, index } = await fixture(context);
  await mkdir(path.join(root, "settings"));
  await writeFile(path.join(root, "settings/tsconfig.json"), await readFile(path.join(root, "tsconfig.json")));
  await symlink(path.join(root, "settings"), path.join(root, "linked"), "junction");
  contract.formIndexEvidence[0] = "linked/tsconfig.json";
  index.documents.find((document) => document.path === "tsconfig.json").path = "linked/tsconfig.json";
  await writeFile(path.join(root, "mensor.project.jsonc"), JSON.stringify(contract));
  await writeFile(path.join(root, "mensor.form-index.json"), serializeFormIndex(index));
  await expectFailure(root, "path.symlink_forbidden");
  contract.formIndexEvidence[0] = "tsconfig.json";
  contract.formIndexEvidence.push("outside.tsx");
  await writeFile(path.join(root, "outside.tsx"), "const view = <form />;");
  const feature = JSON.parse(await readFile(path.join(root, "app/feature.mensor.jsonc"), "utf8"));
  feature.actions[0].form.template = "../outside.tsx";
  await writeFile(path.join(root, "app/feature.mensor.jsonc"), JSON.stringify(feature));
  await writeFile(path.join(root, "mensor.project.jsonc"), JSON.stringify(contract));
  const result = await checkProject({ root });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "contract.invalid");
  assert.equal(result.failure.file, "app/feature.mensor.jsonc");
});

test("evidence declarations are bounded, unique and require a FormIndex", async (context) => {
  const { contract } = await fixture(context);
  assert.equal(parseProjectContract(JSON.stringify(contract)).ok, true);
  for (const list of [[], ["tsconfig.json", "tsconfig.json"], ["../outside.json"], Array.from({ length: 17 }, (_, n) => `config-${n}.json`)]) {
    assert.equal(parseProjectContract(JSON.stringify({ ...contract, formIndexEvidence: list })).ok, false);
  }
  delete contract.formIndex;
  assert.equal(parseProjectContract(JSON.stringify(contract)).ok, false);
});
