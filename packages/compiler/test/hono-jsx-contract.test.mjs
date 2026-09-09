import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "@typescript/typescript6";

import { parseFormIndex as parsePublicFormIndex } from "@0disoft/mensor-contract";
import { formFactsForLinkedForm } from "../dist/src/form-index-semantics.js";
import { extractHonoJsxFormDocument } from "../dist/src/hono-jsx-form-index.js";
import {
  createContentDigest, parseFormIndex, serializeFormIndex,
  verifyExternalFormIndex, verifyFormIndexContent,
} from "../dist/src/form-index.js";

const fixtureRoot = new URL("../../../fixtures/contracts/hono-jsx-v1/", import.meta.url);
const ledger = JSON.parse(await readFile(new URL("expectations.json", fixtureRoot), "utf8"));
assert.equal(ledger.schemaVersion, "mensor.hono-jsx-fixtures/v1");
assert.equal(new Set(ledger.cases.map(({ id }) => id)).size, ledger.cases.length);
const cases = await Promise.all(ledger.cases.map(async (entry) => {
  assert.match(entry.id, /^[a-z0-9-]+$/u);
  return { ...entry, source: await readFile(new URL(`${entry.id}.tsx`, fixtureRoot), "utf8") };
}));

// Keep the hand-authored oracle independent from the extractor under test.
function expectedIndex(entries) {
  return {
    schemaVersion: 1,
    producer: { name: "mensor/hono-jsx", version: "0.0.0-fixture" },
    documents: entries.map((entry) => ({
      path: `app/routes/${entry.id}.tsx`,
      contentDigest: createContentDigest(entry.source),
      sourceKind: "mensor/hono-jsx",
      ...structuredClone(entry.expected),
    })),
  };
}

for (const entry of cases) {
  test(`Hono JSX expected contract: ${entry.id}`, () => {
    const sourceFile = ts.createSourceFile(`${entry.id}.tsx`, entry.source,
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(sourceFile.parseDiagnostics, [], "Fixture must be syntactically valid TSX");
    const openings = new Set();
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        openings.add(JSON.stringify({
          start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)),
          end: sourceFile.getLineAndCharacterOfPosition(node.end),
        }));
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    const index = expectedIndex([entry]);
    assert.deepEqual(extractHonoJsxFormDocument(index.documents[0].path, entry.source), index.documents[0]);
    const text = serializeFormIndex(index);
    assert.equal(parsePublicFormIndex(text).ok, true, "Existing public schema must accept the oracle");
    const parsed = parseFormIndex(text);
    assert.equal(serializeFormIndex(parsed), text);
    verifyFormIndexContent(parsed, () => entry.source);
    const document = parsed.documents[0];
    if (entry.fields === null) {
      assert.equal(document.inspection.state, "incomplete");
      assert.deepEqual(document.forms, [], "Unsupported documents cannot silently report complete forms");
      const range = document.inspection.range;
      assert.ok(sourceFile.getPositionOfLineAndCharacter(range.end.line, range.end.character)
        > sourceFile.getPositionOfLineAndCharacter(range.start.line, range.start.character));
      assert.throws(() => formFactsForLinkedForm(parsed, document.path, "signup"), {
        code: "form_index.inspection_incomplete",
      });
    } else {
      const form = document.forms[0];
      for (const value of [form, ...form.controls]) {
        assert.ok(openings.has(JSON.stringify(value.range)), "Range must identify a real opening element");
      }
      const facts = formFactsForLinkedForm(parsed, document.path, "signup");
      assert.equal(facts.length, 1);
      assert.deepEqual(facts[0].fields.map(({ name }) => name).sort(), entry.fields);
      assert.deepEqual(facts[0].unsupportedControls, []);
      if (entry.id === "current-document-static-controls") {
        assert.equal(facts[0].fields[0].controls.length, 2, "Radio group must retain both controls");
      }
    }
  });
}

test("Hono JSX expected ranges use UTF-16 rather than Unicode code points", () => {
  const entry = cases.find(({ id }) => id === "empty-action-utf16");
  const range = entry.expected.forms[0].range;
  const line = entry.source.split("\n")[range.start.line];
  assert.equal(range.start.character, line.indexOf("<form"));
  assert.equal([...line.slice(0, range.start.character)].length + 1, range.start.character);
  assert.equal(entry.expected.forms[0].action.state, "current-document");
});

test("expected JSX artifacts remain canonical and source-bound across two physical roots", async () => {
  const roots = [];
  const artifacts = [];
  try {
    for (let i = 0; i < 2; i += 1) {
      const root = await mkdtemp(path.join(tmpdir(), `mensor-jsx-${i}-`));
      roots.push(root);
      const index = expectedIndex(i === 0 ? cases : [...cases].reverse());
      for (const entry of cases) {
        const file = path.join(root, "app", "routes", `${entry.id}.tsx`);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, entry.source);
      }
      const extracted = { ...index, documents: await Promise.all(index.documents.map(async (document) =>
        extractHonoJsxFormDocument(document.path, await readFile(path.join(root, document.path), "utf8")))) };
      assert.equal(serializeFormIndex(extracted), serializeFormIndex(index));
      const verified = await verifyExternalFormIndex({
        value: extracted,
        discovered: new Set(index.documents.map(({ path: file }) => file)),
        readSource: (file) => readFile(path.join(root, file), "utf8"),
      });
      artifacts.push(serializeFormIndex(verified));
      assert.equal(artifacts[i].includes(root), false);
      const changed = index.documents[0];
      await writeFile(path.join(root, changed.path), "// drift\n");
      await assert.rejects(verifyExternalFormIndex({
        value: index,
        discovered: new Set(index.documents.map(({ path: file }) => file)),
        readSource: (file) => readFile(path.join(root, file), "utf8"),
      }), { code: "form_index.digest_mismatch" });
    }
    assert.equal(artifacts[0], artifacts[1]);
  } finally {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  }
});

test("JSX parsing rejects malformed, oversized and nonportable inputs without executing source", () => {
  assert.throws(() => extractHonoJsxFormDocument("app/broken.tsx", "const view = <form>"), { code: "hono_jsx.syntax_invalid" });
  assert.throws(() => extractHonoJsxFormDocument("app/large.tsx", " ".repeat(1_048_577)), { code: "hono_jsx.source_limit" });
  assert.throws(() => extractHonoJsxFormDocument("../escape.tsx", cases[0].source));
  assert.throws(() => extractHonoJsxFormDocument("app/view.ts", cases[0].source), { code: "hono_jsx.source_kind" });
  const source = 'globalThis.__mensorJsxExecuted = true;\n<form id="signup" />;';
  delete globalThis.__mensorJsxExecuted;
  assert.equal(extractHonoJsxFormDocument("app/view.tsx", source).inspection.state, "complete");
  assert.equal(globalThis.__mensorJsxExecuted, undefined);
});

test("JSX parsing does not confuse opaque or repeated sibling content with escaped text", () => {
  for (const expression of [
    '{items.map((item) => <form id="nested" />)}',
    '{items.map((item) => buildContent(item))}',
    '{renderOtherForm()}',
  ]) {
    const source = `const items = ["one"]; <><form id="signup" />${expression}</>;`;
    assert.equal(extractHonoJsxFormDocument("app/view.tsx", source).inspection.state, "incomplete");
  }
  const mutated = 'const items = ["one"]; items.push(<input />); <><form id="signup" />{items.map((item) => <li>{item}</li>)}</>;';
  assert.equal(extractHonoJsxFormDocument("app/view.tsx", mutated).inspection.state, "incomplete");
  for (const source of [
    'const view = visible && <form id="signup" />;',
    'const views = items.map(() => <form id="signup" />);',
    'for (const item of items) { result.push(<form id="signup" />); }',
  ]) assert.equal(extractHonoJsxFormDocument("app/view.tsx", source).inspection.state, "incomplete");
});

test("JSX parsing preserves the first unsupported cause and rejects unimplemented literal semantics", () => {
  for (const markup of [
    '<form id="signup"><fieldset disabled><input name="name" /></fieldset></form>',
    '<form id="signup"><form id="nested" /></form>',
    '<form id="signup"><input name="a&amp;b" /></form>',
    '<form id="signup"><input name="name" name="other" /></form>',
    '<form id="signup"><input disabled={false} /></form>',
    '<form id="signup"><input type="email" multiple="true" /></form>',
    '<form id="signup" enctype="multipart/form-data" />',
    '<form id="signup" encType="multipart/form-data" />',
    '<form id="signup"><button formAction="/other" /></form>',
    '<form id="" />',
  ]) assert.equal(extractHonoJsxFormDocument("app/view.tsx", markup).inspection.state, "incomplete");
  const first = extractHonoJsxFormDocument("app/view.tsx", '<form id="signup" {...props}><NameField /></form>');
  assert.equal(first.inspection.reason, "computed-attribute");
  const file = extractHonoJsxFormDocument("app/view.tsx", '<form id="signup"><input type="file" value={data} /></form>');
  assert.equal(file.inspection.reason, "file-input");
});

test("empty control names produce valid absent evidence and no submitted field", () => {
  const document = extractHonoJsxFormDocument("app/view.tsx", '<form id="signup"><input name="" /></form>');
  const index = { schemaVersion: 1, producer: { name: "mensor/hono-jsx", version: "0.0.0-fixture" }, documents: [document] };
  assert.equal(parsePublicFormIndex(serializeFormIndex(index)).ok, true);
  assert.equal(document.forms[0].controls[0].name.state, "absent");
  assert.equal(document.forms[0].controls[0].successful.value, false);
  assert.deepEqual(formFactsForLinkedForm(index, document.path, "signup")[0].fields, []);
});

test("expected JSX artifacts reject missing discovery and out-of-source ranges", async () => {
  const entry = cases[0];
  const index = expectedIndex([entry]);
  await assert.rejects(verifyExternalFormIndex({
    value: index, discovered: new Set(), readSource: async () => entry.source,
  }), { code: "form_index.source_not_discovered" });
  index.documents[0].forms[0].range.end = { line: 999, character: 0 };
  assert.throws(() => verifyFormIndexContent(index, () => entry.source), {
    code: "form_index.range_invalid",
  });
});
