import assert from "node:assert/strict";
import test from "node:test";

import { formFactsForLinkedForm } from "../dist/src/form-index-semantics.js";
import { extractStaticHtmlFormDocument } from "../dist/src/html-forms.js";

const documentPath = "src/features/test/views/index.html";

function extractFormFacts(html) {
  const document = extractStaticHtmlFormDocument(documentPath, html);
  const index = {
    schemaVersion: 1,
    producer: { name: "mensor/static-html", version: "0.0.0-test" },
    documents: [document],
  };
  const formIds = [...new Set(document.forms.flatMap((form) =>
    form.identity.state === "known" ? [form.identity.value] : [],
  ))];
  return formIds.flatMap((formId) =>
    formFactsForLinkedForm(index, documentPath, formId),
  );
}

test("normalizes static forms and successful named field candidates", () => {
  const facts = extractFormFacts(`<!doctype html>
<form id="task" method="post" action="/tasks">
  <input name="title">
  <input name="ignored-disabled" disabled>
  <button name="submitter" type="submit">Save</button>
</form>
<textarea name="notes" form="task"></textarea>
`);

  assert.deepEqual(facts, [
    {
      id: "task",
      method: "POST",
      methodRange: {
        start: { line: 1, character: 16 },
        end: { line: 1, character: 29 },
      },
      action: {
        kind: "literal",
        value: "/tasks",
        range: {
          start: { line: 1, character: 30 },
          end: { line: 1, character: 45 },
        },
      },
      fields: [
        {
          name: "notes",
          controls: [
            {
              kind: "textarea",
              inputType: "",
              multiple: false,
              range: {
                start: { line: 6, character: 0 },
                end: { line: 6, character: 35 },
              },
            },
          ],
          range: {
            start: { line: 6, character: 0 },
            end: { line: 6, character: 35 },
          },
        },
        {
          name: "title",
          controls: [
            {
              kind: "input",
              inputType: "text",
              multiple: false,
              range: {
                start: { line: 2, character: 2 },
                end: { line: 2, character: 22 },
              },
            },
          ],
          range: {
            start: { line: 2, character: 2 },
            end: { line: 2, character: 22 },
          },
        },
      ],
      unsupportedControls: [
        {
          kind: "button",
          inputType: "submit",
          name: "submitter",
          reason: "named-submitter",
          range: {
            start: { line: 4, character: 2 },
            end: { line: 4, character: 41 },
          },
        },
      ],
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 46 },
      },
    },
  ]);
});

test("extracts unsupported file and submitter controls explicitly", () => {
  const facts = extractFormFacts(`<form id="upload">
  <input name="attachment" type="file">
  <button name="intent" type="submit">Save</button>
  <button type="submit" formaction="/other">Other</button>
</form>`);

  assert.deepEqual(
    facts[0]?.unsupportedControls.map((control) => ({
      kind: control.kind,
      inputType: control.inputType,
      name: control.name,
      reason: control.reason,
    })),
    [
      {
        kind: "button",
        inputType: "submit",
        name: "",
        reason: "submitter-route-override",
      },
      {
        kind: "input",
        inputType: "file",
        name: "attachment",
        reason: "file-input",
      },
      {
        kind: "button",
        inputType: "submit",
        name: "intent",
        reason: "named-submitter",
      },
    ],
  );
});

test("preserves an omitted action as current-document", () => {
  const facts = extractFormFacts('<form id="search"><input name="query"></form>');

  assert.equal(facts[0]?.method, "GET");
  assert.deepEqual(facts[0]?.action, {
    kind: "current-document",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 18 },
    },
  });
  assert.deepEqual(facts[0]?.fields.map((field) => field.name), ["query"]);
});

test("preserves an empty action as current-document at its attribute range", () => {
  const facts = extractFormFacts('<form id="search" action=""><input name="query"></form>');

  assert.deepEqual(facts[0]?.action, {
    kind: "current-document",
    range: {
      start: { line: 0, character: 18 },
      end: { line: 0, character: 27 },
    },
  });
});

test("keeps one source location for repeated wire field names", () => {
  const facts = extractFormFacts(`<form id="filters">
  <input name="tag">
  <input name="tag">
</form>`);

  assert.equal(facts[0]?.fields.length, 1);
  assert.equal(facts[0]?.fields[0]?.name, "tag");
  assert.equal(facts[0]?.fields[0]?.controls.length, 2);
  assert.deepEqual(facts[0]?.fields[0]?.range, {
    start: { line: 1, character: 2 },
    end: { line: 1, character: 20 },
  });
});

test("preserves control shape needed for codec compatibility", () => {
  const facts = extractFormFacts(`<form id="settings">
  <input name="enabled" type="checkbox">
  <select name="labels" multiple><option>A</option></select>
</form>`);

  assert.deepEqual(
    facts[0]?.fields.map((field) => ({
      name: field.name,
      kind: field.controls[0]?.kind,
      inputType: field.controls[0]?.inputType,
      multiple: field.controls[0]?.multiple,
    })),
    [
      { name: "enabled", kind: "input", inputType: "checkbox", multiple: false },
      { name: "labels", kind: "select", inputType: "", multiple: true },
    ],
  );
});

test("preserves radio controls as one mutually exclusive wire field", () => {
  const facts = extractFormFacts(`<form id="priority">
  <input type="radio" name="priority" value="low">
  <input type="radio" name="priority" value="high">
</form>`);

  assert.equal(facts[0]?.fields.length, 1);
  assert.deepEqual(
    facts[0]?.fields[0]?.controls.map((control) => control.inputType),
    ["radio", "radio"],
  );
});

test("ignores inert forms and controls inside template content", () => {
  const facts = extractFormFacts(`<form id="task"><input name="title"></form>
<template>
  <form id="task"><input name="prototype-only"></form>
</template>`);

  assert.equal(facts.length, 1);
  assert.deepEqual(facts[0]?.fields.map((field) => field.name), ["title"]);
});

test("walks deeply nested HTML without exhausting the call stack", () => {
  const depth = 3_000;
  const facts = extractFormFacts(
    `${"<div>".repeat(depth)}<form id="deep"><input name="value"></form>${"</div>".repeat(depth)}`,
  );

  assert.equal(facts.length, 1);
  assert.deepEqual(facts[0]?.fields.map((field) => field.name), ["value"]);
});

test("applies disabled fieldset inheritance and the first legend exception", () => {
  const facts = extractFormFacts(`<form id="settings">
  <fieldset disabled>
    <legend><input name="legend-value"></legend>
    <input name="disabled-value">
  </fieldset>
</form>`);

  assert.deepEqual(facts[0]?.fields.map((field) => field.name), ["legend-value"]);
});

test("uses the first tree-order id element for explicit form ownership", () => {
  const facts = extractFormFacts(`<div id="owner"></div>
<form id="owner"><input name="nested"></form>
<input name="external" form="owner">`);

  assert.deepEqual(facts[0]?.fields.map((field) => field.name), ["nested"]);
});

test("associates explicit controls with the first duplicate form id", () => {
  const facts = extractFormFacts(`<form id="owner"></form>
<form id="owner"></form>
<input name="external" form="owner">`);

  assert.deepEqual(facts.map((form) => form.fields.map((field) => field.name)), [
    ["external"],
    [],
  ]);
});

test("normalizes invalid control types and ignores non-submitter buttons", () => {
  const document = extractStaticHtmlFormDocument(documentPath, `<form id="types">
  <button type="button" name="plain">Plain</button>
  <button type="reset" name="reset">Reset</button>
  <button type="invalid" name="fallback">Fallback</button>
  <input type="invalid" name="textual">
</form>`);
  const controls = document.forms[0]?.controls ?? [];

  assert.deepEqual(
    controls.map((control) => ({
      inputType: control.inputType.state === "known" ? control.inputType.value : "",
      name: control.name.state === "known" ? control.name.value : "",
      successful: control.successful.state,
    })),
    [
      { inputType: "button", name: "plain", successful: "known" },
      { inputType: "reset", name: "reset", successful: "known" },
      { inputType: "submit", name: "fallback", successful: "unsupported" },
      { inputType: "text", name: "textual", successful: "known" },
    ],
  );
  assert.deepEqual(extractFormFacts(`<form id="types">
    <button type="button" name="plain">Plain</button>
    <button type="reset" name="reset">Reset</button>
    <input type="invalid" name="textual">
  </form>`)[0]?.fields.map((field) => field.name), ["textual"]);
});

test("indexes large form documents without repeated global control scans", () => {
  const formCount = 1_000;
  const controlsPerForm = 10;
  const html = Array.from({ length: formCount }, (_, formIndex) =>
    `<form id="form-${formIndex}">${Array.from(
      { length: controlsPerForm },
      (_, controlIndex) => `<input name="field-${controlIndex}">`,
    ).join("")}</form>`,
  ).join("");

  const document = extractStaticHtmlFormDocument(documentPath, html);
  assert.equal(document.forms.length, formCount);
  assert.equal(
    document.forms.reduce((count, form) => count + form.controls.length, 0),
    formCount * controlsPerForm,
  );
});
