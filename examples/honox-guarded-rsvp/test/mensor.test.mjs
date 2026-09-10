import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../../../packages/cli/dist/src/index.js";

const example = fileURLToPath(new URL("../", import.meta.url));
const indexArgs = ["index-hono-jsx-forms", "--source", "app/routes/rsvp.tsx", "--renderer", "app/routes/_renderer.tsx", "--jsx-config", "tsconfig.json", "--build-config", "vite.config.ts", "--json"];
async function invoke(cwd, argv) {
  let stdout = "";
  const code = await runCli({ cwd, argv, stdout: (value) => { stdout += value; }, stderr: (value) => assert.fail(value) });
  return { code, output: JSON.parse(stdout) };
}

test("guarded RSVP checks its form and handler, rejects stale evidence and detects regenerated drift", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-guarded-example-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ["app", "tsconfig.json", "vite.config.ts", "mensor.project.jsonc"]) {
    await cp(path.join(example, file), path.join(root, file), { recursive: true });
  }
  const index = await invoke(root, indexArgs);
  assert.equal(index.code, 0, JSON.stringify(index.output));
  const check = () => invoke(root, ["check", "--json", "--report-version", "2"]);
  const passed = await check();
  assert.equal(passed.code, 0, JSON.stringify(passed.output));
  assert.deepEqual(passed.output.inspection.forms, { state: "checked", basis: "form-index" });
  assert.equal(passed.output.inspection.routes.state, "not-configured");
  const routePath = path.join(root, "app/routes/rsvp.tsx");
  const source = await readFile(routePath, "utf8");
  await writeFile(routePath, source.replace('name="email"', 'name="contact"'));
  const stale = await check();
  assert.equal(stale.code, 2, JSON.stringify(stale.output));
  assert.equal(stale.output.failure.code, "form_index.digest_mismatch");
  assert.equal((await invoke(root, indexArgs)).code, 0);
  const drifted = await check();
  assert.equal(drifted.code, 1, JSON.stringify(drifted.output));
  assert.ok(drifted.output.diagnostics.some((entry) => entry.code === "form.field_missing" && entry.facts.fieldName === "email"));
  await writeFile(routePath, source);
  assert.equal((await invoke(root, indexArgs)).code, 0);
  await writeFile(path.join(root, "app/routes/_renderer.tsx"), (await readFile(path.join(root, "app/routes/_renderer.tsx"), "utf8")) + "\n");
  assert.equal((await check()).output.failure.code, "form_index.digest_mismatch");
});
