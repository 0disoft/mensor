import assert from "node:assert/strict";
import test from "node:test";

import { extractFormFacts } from "../dist/src/html-forms.js";

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
      action: "/tasks",
      actionRange: {
        start: { line: 1, character: 30 },
        end: { line: 1, character: 45 },
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
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 46 },
      },
    },
  ]);
});

test("uses GET and an empty action when attributes are omitted", () => {
  const facts = extractFormFacts('<form id="search"><input name="query"></form>');

  assert.equal(facts[0]?.method, "GET");
  assert.equal(facts[0]?.action, "");
  assert.deepEqual(facts[0]?.fields.map((field) => field.name), ["query"]);
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
