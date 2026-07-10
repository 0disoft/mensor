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
      action: "/tasks",
      fields: ["notes", "title"],
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
  assert.deepEqual(facts[0]?.fields, ["query"]);
});
