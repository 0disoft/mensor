import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "@0disoft/mensor-cli";
import { parseFormIndex } from "@0disoft/mensor-contract";
import { verifyExternalFormIndex } from "../../compiler/dist/src/form-index.js";
import { extractHonoJsxFormDocument } from "@0disoft/mensor-compiler/hono-jsx";
import { assertHonoJsxBuild, assertHonoJsxRenderer, assertHonoJsxRoute } from "../dist/src/hono-jsx-activation.js";

const files = {
  "tsconfig.json": JSON.stringify({ compilerOptions: { jsx: "react-jsx", jsxImportSource: "hono/jsx" } }),
  "vite.config.ts": 'import { defineConfig } from "vite"; import honox from "honox/vite"; export default defineConfig({ plugins: [honox()], esbuild: { jsx: "automatic", jsxImportSource: "hono/jsx" } });',
  "app/routes/_renderer.tsx": 'import { jsxRenderer } from "hono/jsx-renderer"; export default jsxRenderer(({ children }) => <html><body>{children}</body></html>);',
  "app/routes/index.tsx": 'import { createRoute } from "honox/factory"; export default createRoute((c) => c.render(<form id="signup" method="post" action="/signup"><input name="email" type="email" required /><button>Join</button></form>));',
};
const args = ["index-hono-jsx-forms", "--source", "app/routes/index.tsx", "--jsx-config", "tsconfig.json", "--build-config", "vite.config.ts", "--renderer", "app/routes/_renderer.tsx", "--json"];

async function project(context) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-jsx-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "app/routes"), { recursive: true });
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(root, file), text);
  return root;
}

async function invoke(root, argv = args) {
  let stdout = "";
  let stderr = "";
  const code = await runCli({ cwd: root, argv, stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout, stderr };
}

test("JSX CLI writes canonical source and activation evidence independent of checkout path", async (context) => {
  const first = await project(context);
  const second = await project(context);
  const result = await invoke(first);
  assert.equal(result.code, 0, result.stdout);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, await readFile(path.join(first, "mensor.form-index.json"), "utf8"));
  assert.equal(result.stdout, (await invoke(second)).stdout);
  assert.equal(parseFormIndex(result.stdout).ok, true);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.documents.map((document) => document.path), Object.keys(files).sort());
  const route = value.documents.find((document) => document.path.endsWith("index.tsx"));
  assert.deepEqual(route.inspection, { state: "complete" });
  assert.equal(route.forms.length, 1);
  assert.equal(route.forms[0].identity.value, "signup");
  assert.equal(route.forms[0].controls[0].name.value, "email");
  const options = { value, discovered: new Set(Object.keys(files)), readSource: (file) => readFile(path.join(first, file), "utf8") };
  await verifyExternalFormIndex(options);
  for (const file of Object.keys(files)) {
    await writeFile(path.join(first, file), files[file] + "\n");
    await assert.rejects(verifyExternalFormIndex(options), { code: "form_index.digest_mismatch" });
    await writeFile(path.join(first, file), files[file]);
  }
});

test("JSX CLI rejects unverified configuration and renderer semantics without replacing output", async (context) => {
  const root = await project(context);
  await writeFile(path.join(root, "mensor.form-index.json"), "previous\n");
  const cases = [
    ["tsconfig.json", '{"extends":"./base.json","compilerOptions":{"jsx":"react-jsx","jsxImportSource":"hono/jsx"}}', "hono_jsx.configuration_unsupported"],
    ["tsconfig.json", files["tsconfig.json"].replace("hono/jsx", "react"), "hono_jsx.configuration_unsupported"],
    ["vite.config.ts", files["vite.config.ts"].replace("plugins: [honox()]", "plugins: [honox(), other()]") , "hono_jsx.build_plugin_unsupported"],
    ["vite.config.ts", files["vite.config.ts"].replace('jsxImportSource: "hono/jsx"', 'jsxImportSource: "react"'), "hono_jsx.runtime_mismatch"],
    ["app/routes/_renderer.tsx", files["app/routes/_renderer.tsx"].replace("{children}", "{children}{children}")],
    ["app/routes/_renderer.tsx", files["app/routes/_renderer.tsx"].replaceAll("body", "title")],
    ["app/routes/_renderer.tsx", files["app/routes/_renderer.tsx"].replace("<body>", '<body onClick="custom">')],
    ["app/routes/_renderer.tsx", files["app/routes/_renderer.tsx"].replace("<body>", "<form>").replace("</body>", "</form>")],
    ["app/routes/index.tsx", files["app/routes/index.tsx"].replace("createRoute((c)", "createRoute(custom, (c)")],
    ["app/routes/index.tsx", '/** @jsxImportSource react */\n' + files["app/routes/index.tsx"], "hono_jsx.runtime_mismatch"],
    ["app/routes/index.tsx", 'const unused = <form id="unused" />;\n' + files["app/routes/index.tsx"]],
    ["app/routes/index.tsx", 'import { createRoute } from "honox/factory"; const view = <form />; export default createRoute((c) => c.render(view));'],
    ["app/routes/index.tsx", "globalThis.__mensorJsxExecuted = true; this is not valid TSX <"],
  ];
  for (const [file, text, code = "hono_jsx.activation_invalid"] of cases) {
    await writeFile(path.join(root, file), text);
    const result = await invoke(root);
    assert.equal(result.code, 2, `${file}: ${result.stdout}`);
    assert.equal(JSON.parse(result.stdout).failure.code, code);
    assert.equal(result.stderr, "");
    assert.equal(await readFile(path.join(root, "mensor.form-index.json"), "utf8"), "previous\n");
    assert.equal(globalThis.__mensorJsxExecuted, undefined);
    await writeFile(path.join(root, file), files[file]);
  }
});

test("JSX CLI admits literal const preludes without resolving dynamic JSX", async (context) => {
  const root = await project(context);
  const source = files["app/routes/index.tsx"].replace('=> c.render(', '=> { const label = "Join", count = 2; const enabled = true; const hidden = false; const empty = null; const hint = `hello`; return c.render(').replace('</form>));', '</form>); });');
  await writeFile(path.join(root, "app/routes/index.tsx"), source);
  const result = await invoke(root);
  assert.equal(result.code, 0, result.stdout);
  const route = JSON.parse(result.stdout).documents.find((document) => document.path.endsWith("index.tsx"));
  assert.deepEqual(route.inspection, { state: "complete" });
  assert.equal(route.forms[0].controls[0].name.value, "email");
  await writeFile(path.join(root, "app/routes/index.tsx"), source.replace('name="email"', 'name={label}'));
  const dynamic = await invoke(root);
  assert.equal(dynamic.code, 0, dynamic.stdout);
  const incomplete = JSON.parse(dynamic.stdout).documents.find((document) => document.path.endsWith("index.tsx"));
  assert.equal(incomplete.inspection.reason, "computed-attribute");
  assert.deepEqual(incomplete.forms, []);
});

test("JSX CLI rejects effectful, aliased and shadowing route preludes without replacing output", async (context) => {
  const root = await project(context);
  const output = path.join(root, "mensor.form-index.json");
  await writeFile(output, "previous\n");
  for (const prelude of [
    'const values = getStore(c);', 'const value = c.get("value");',
    'const alias = c;', 'let label = "Join";', 'var label = "Join";',
    'const c = "shadow";', 'const x = 1; const x = 2;',
    'const { render } = c;', 'const x = { get value() { c.setRenderer(other); } };',
    'const x = `hello ${c.get("name")}`;', 'const x = 1, y = change(c);',
    'c.setRenderer(other);', 'return other;', 'if (flag) return other;',
    'using resource = acquire();',
  ]) {
    const source = files["app/routes/index.tsx"].replace('=> c.render(', `=> { ${prelude} return c.render(`).replace('</form>));', '</form>); });');
    await writeFile(path.join(root, "app/routes/index.tsx"), source);
    const result = await invoke(root);
    assert.equal(result.code, 2, `${prelude}: ${result.stdout}`);
    assert.equal(JSON.parse(result.stdout).failure.code, "hono_jsx.route_prelude_unsupported", prelude);
    assert.equal(await readFile(output, "utf8"), "previous\n");
  }
});

test("read-only context helpers admit opaque data but reject mutation and escape", async (context) => {
  const root = await project(context);
  const helper = 'function getStore(ctx: any) { return ctx.get("entries"); }';
  const route = files["app/routes/index.tsx"].replace('=> c.render(', '=> { const entries = getStore(c); return c.render(').replace('</form>));', '</form>); });');
  await writeFile(path.join(root, "app/routes/index.tsx"), helper + route);
  const valid = await invoke(root);
  assert.equal(valid.code, 0, valid.stdout);
  assert.deepEqual(JSON.parse(valid.stdout).documents.find((entry) => entry.path.endsWith("index.tsx")).inspection, { state: "complete" });
  const output = path.join(root, "mensor.form-index.json");
  const previous = await readFile(output, "utf8");
  const rejected = [
    helper.replace('return ctx.get', 'ctx.setRenderer(other); return ctx.get') + route,
    helper.replace('return ctx.get("entries")', 'return consume(ctx)') + route,
    helper.replace('return ctx.get("entries")', 'return ctx') + route,
    helper.replace('"entries"', 'key') + route,
    helper.replace('function ', 'async function ') + route,
    helper.replace('ctx: any', 'ctx: any = acquire()') + route,
    helper.replace('return ctx.get', 'return ctx?.get') + route,
    helper + 'getStore = other;' + route,
    helper + 'const escaped = getStore;' + route,
    helper + route.replace('const entries =', 'const getStore ='),
    helper + route.replace('const entries =', 'const getStore = "shadow"; const entries ='),
    helper + 'initialize();' + route,
    helper + 'import "./patch-context.js";' + route,
    helper + 'function createRoute(callback) { return patch(callback); }' + route,
    helper + 'createRoute = other;' + route,
  ];
  for (const source of rejected) {
    await writeFile(path.join(root, "app/routes/index.tsx"), source);
    const result = await invoke(root);
    assert.equal(result.code, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).failure.code, "hono_jsx.route_prelude_unsupported");
    assert.equal(await readFile(output, "utf8"), previous);
  }
});

test("unchanged real RSVP passes read-only activation but retains incomplete dynamic list evidence", async () => {
  const trial = new URL("../../../internal/agent-runner/trials/honox-rsvp-v1/", import.meta.url);
  const build = await readFile(new URL("vite.config.ts", trial), "utf8");
  const renderer = await readFile(new URL("app/routes/_renderer.tsx", trial), "utf8");
  const route = await readFile(new URL("app/routes/rsvp.tsx", trial), "utf8");
  assert.doesNotThrow(() => assertHonoJsxBuild("vite.config.ts", build));
  assert.doesNotThrow(() => assertHonoJsxRenderer("app/routes/_renderer.tsx", renderer));
  assert.doesNotThrow(() => assertHonoJsxRoute("app/routes/rsvp.tsx", route));
  for (const mutated of [
    route.replace("const value =", "c.setRenderer(other); const value ="),
    route.replace("return value as RsvpEntry[]", "return change(c)"),
    route.replace("return []", "return leak(c)"),
    route.replace("Array.isArray(value)", "customGuard(value)"),
    route.replace("Array.isArray(value)", "Array.isArray(c)"),
    route.replace("return []", "return [c]"),
    route + '\nArray.isArray = other;',
    route + '\nfunction modify(Array: any) { return Array; }',
    route + '\nfunction modify() { globalThis["Array"].isArray = other; }',
  ]) {
    assert.throws(() => assertHonoJsxRoute("app/routes/rsvp.tsx", mutated), { code: "hono_jsx.route_prelude_unsupported" });
  }
  const extracted = extractHonoJsxFormDocument("app/routes/rsvp.tsx", route);
  assert.equal(extractHonoJsxFormDocument("headings.tsx", 'const view = <><h1>Title</h1><h2>Details</h2><form id="signup" /></>;').inspection.state, "complete");
  assert.equal(extracted.inspection.state, "incomplete");
  assert.equal(extracted.inspection.reason, "repeated-generation");
  assert.deepEqual(extracted.forms, []);
  for (const replacement of ["() => 'server.js'", "chooseName()"] ) {
    assert.throws(() => assertHonoJsxBuild("vite.config.ts", build.replace("'server.js'", replacement)), { code: "hono_jsx.build_settings_unsupported" });
  }
  assert.throws(() => assertHonoJsxBuild("vite.config.ts", build.replace("entryFileNames:", "plugins:")), { code: "hono_jsx.build_settings_unsupported" });
  assert.equal(await readFile(new URL("app/routes/rsvp.tsx", trial), "utf8"), route);
});

test("read-only helper analysis bounds distinct helpers while reusing repeated calls", () => {
  const helpers = Array.from({ length: 17 }, (_, index) => `function read${index}(ctx: any) { return ctx.get("entries"); }`);
  const declaration = (index) => `const entries${index} = read${index}(c);`;
  const route = (prelude) => helpers.join("\n") + files["app/routes/index.tsx"].replace('=> c.render(', `=> { ${prelude} return c.render(`).replace('</form>));', '</form>); });');
  assert.doesNotThrow(() => assertHonoJsxRoute("route.tsx", route(Array.from({ length: 16 }, (_, index) => declaration(index)).join("\n"))));
  assert.throws(() => assertHonoJsxRoute("route.tsx", route(Array.from({ length: 17 }, (_, index) => declaration(index)).join("\n"))), { code: "hono_jsx.route_prelude_unsupported" });
  assert.doesNotThrow(() => assertHonoJsxRoute("route.tsx", route(Array.from({ length: 20 }, (_, index) => `const entries${index} = read0(c);`).join("\n"))));
});

test("JSX CLI artifact is consumed by check and rejects a stale renderer", async (context) => {
  const app = await project(context);
  const root = await mkdtemp(path.join(tmpdir(), "mensor-jsx-consumer-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await cp(app, path.join(root, "site"), { recursive: true });
  await mkdir(path.join(root, "site/server"));
  await cp(new URL("../../../fixtures/valid/tiny-tasks/src/features/tasks/server/create-task.ts", import.meta.url), path.join(root, "site/server/create-task.ts"));
  await writeFile(path.join(root, "mensor.project.jsonc"), JSON.stringify({
    version: 1, sourceRoot: "site", formIndex: "mensor.form-index.json",
    featureContracts: ["site/feature.mensor.jsonc"],
    fileRoles: [{ role: "server", withinFeature: "server" }, { role: "view", withinFeature: "app/routes" }],
  }));
  const featurePath = path.join(root, "site/feature.mensor.jsonc");
  const feature = JSON.parse(await readFile(new URL("../../../fixtures/valid/tiny-tasks/src/features/tasks/feature.mensor.jsonc", import.meta.url), "utf8"));
  feature.actions[0].form.template = "app/routes/index.tsx";
  await writeFile(featurePath, JSON.stringify(feature));
  const view = "site/app/routes/index.tsx";
  const renderer = "site/app/routes/_renderer.tsx";
  await writeFile(path.join(root, view), files["app/routes/index.tsx"].replaceAll("signup", "create-task").replace('action="/create-task"', 'action="/tasks"').replaceAll("email", "title").replace('type="title"', 'type="text"'));
  await writeFile(path.join(root, renderer), files["app/routes/_renderer.tsx"]);
  const selected = args.map((arg) => Object.hasOwn(files, arg) ? `site/${arg}` : arg);
  assert.equal((await invoke(root, selected)).code, 0);
  const checked = await invoke(root, ["check", "--json", "--report-version", "2"]);
  assert.equal(checked.code, 0, checked.stdout);
  assert.deepEqual(JSON.parse(checked.stdout).inspection.forms, { state: "checked", basis: "form-index" });
  await writeFile(path.join(root, renderer), files["app/routes/_renderer.tsx"] + "\n");
  const stale = await invoke(root, ["check", "--json"]);
  assert.equal(stale.code, 2, stale.stdout);
  assert.equal(JSON.parse(stale.stdout).failure.code, "form_index.digest_mismatch");
});

test("JSX CLI keeps unsupported form syntax incomplete and requires explicit command inputs", async (context) => {
  const root = await project(context);
  await writeFile(path.join(root, "app/routes/index.tsx"), files["app/routes/index.tsx"].replace('name="email"', "name={field}"));
  const result = await invoke(root);
  assert.equal(result.code, 0, result.stdout);
  const route = JSON.parse(result.stdout).documents.find((document) => document.path.endsWith("index.tsx"));
  assert.equal(route.inspection.state, "incomplete");
  assert.equal(route.inspection.reason, "computed-attribute");
  assert.deepEqual(route.forms, []);
  for (const argv of [["index-hono-jsx-forms", "--json"], [...args, "--tag", "html"], [...args, "--config", "other.json"], [...args, "--sarif"], ["check", "--renderer", "app/routes/_renderer.tsx", "--json"]]) {
    assert.equal((await invoke(root, argv)).code, 2);
  }
});

test("JSX CLI rejects unsafe inputs and outputs, preserving source and prior artifacts", async (context) => {
  const root = await project(context);
  await writeFile(path.join(root, "mensor.form-index.json"), "previous\n");
  for (const output of ["tsconfig.json", "app/routes/index.tsx", "../escape.json", "bad.json:stream"]) {
    assert.equal((await invoke(root, [...args, "--out", output])).code, 2);
    assert.equal(await readFile(path.join(root, "tsconfig.json"), "utf8"), files["tsconfig.json"]);
  }
  await writeFile(path.join(root, "app/routes/index.tsx"), Buffer.from([0xff]));
  assert.equal(JSON.parse((await invoke(root)).stdout).failure.code, "form_indexer.source_encoding_invalid");
  await writeFile(path.join(root, "app/routes/index.tsx"), " ".repeat(1_048_577));
  assert.equal(JSON.parse((await invoke(root)).stdout).failure.code, "form_indexer.source_too_large");
  await writeFile(path.join(root, "app/routes/index.tsx"), files["app/routes/index.tsx"]);
  await symlink(path.join(root, "app"), path.join(root, "linked"), "junction");
  const linked = args.map((arg) => Object.hasOwn(files, arg) ? `linked/${arg}` : arg);
  assert.equal(JSON.parse((await invoke(root, linked)).stdout).failure.code, "form_indexer.source_symlink");
  await mkdir(path.join(root, "directory.json"));
  assert.equal((await invoke(root, [...args, "--out", "directory.json"])).code, 3);
  assert.equal(await readFile(path.join(root, "mensor.form-index.json"), "utf8"), "previous\n");
  assert.equal((await readdir(root)).some((file) => file.endsWith(".tmp")), false);
});
