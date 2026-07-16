import assert from "node:assert/strict";
import test from "node:test";

import { formFactsForLinkedForm } from "../dist/src/form-index-semantics.js";
import {
  parseFormIndex,
  serializeFormIndex,
} from "../dist/src/form-index.js";
import {
  createStaticHtmlFormIndexProvider,
} from "../dist/src/html-forms.js";

const documentPath = "src/features/tasks/views/index.html";
const html = `<form id="task" method="post" action="/tasks">
  <input type="radio" name="priority" value="low">
  <input type="radio" name="priority" value="high">
  <input name="disabled" disabled>
  <input name="attachment" type="file">
  <button name="intent" type="submit">Save</button>
  <button type="submit" formaction="/other">Other</button>
</form>
<template><form id="task"><input name="prototype-only"></form></template>
`;

test("built-in provider emits a canonical source-bound FormIndex once per document", async () => {
  let reads = 0;
  const provider = createStaticHtmlFormIndexProvider({
    producerVersion: "0.0.0-test",
    async readSource(requestedPath) {
      reads += 1;
      assert.equal(requestedPath, documentPath);
      return html;
    },
  });

  const first = await provider.getIndex([documentPath, documentPath]);
  const second = await provider.getIndex([documentPath]);
  const serialized = serializeFormIndex(first);

  assert.equal(reads, 1);
  assert.equal(serializeFormIndex(second), serialized);
  assert.deepEqual(parseFormIndex(serialized), first);
  assert.equal(first.documents.length, 1);
  assert.equal(first.documents[0].forms.length, 1);
  assert.deepEqual(
    first.documents[0].forms[0].controls.map((control) => ({
      name: control.name.state === "known" ? control.name.value : undefined,
      multiplicity: control.multiplicity.state === "known"
        ? control.multiplicity.value
        : undefined,
      successful: control.successful.state === "known"
        ? control.successful.value
        : control.successful.reason,
    })),
    [
      { name: "priority", multiplicity: "mutually-exclusive", successful: true },
      { name: "priority", multiplicity: "mutually-exclusive", successful: true },
      { name: "disabled", multiplicity: "scalar", successful: false },
      { name: "attachment", multiplicity: "scalar", successful: "file-input" },
      { name: "intent", multiplicity: "scalar", successful: "named-submitter" },
      { name: undefined, multiplicity: "scalar", successful: "submitter-route-override" },
    ],
  );
});

test("semantic form facts preserve current diagnostics through the index", async () => {
  const provider = createStaticHtmlFormIndexProvider({
    producerVersion: "0.0.0-test",
    readSource: async () => html,
  });
  const index = await provider.getIndex([documentPath]);
  const forms = formFactsForLinkedForm(index, documentPath, "task");

  assert.equal(forms.length, 1);
  assert.deepEqual(forms[0].fields.map((field) => ({
    name: field.name,
    types: field.controls.map((control) => control.inputType),
  })), [
    { name: "priority", types: ["radio", "radio"] },
  ]);
  assert.deepEqual(forms[0].unsupportedControls.map((control) => control.reason), [
    "submitter-route-override",
    "file-input",
    "named-submitter",
  ]);
});

test("semantic rules fail closed on incomplete and unresolved index evidence", async () => {
  const provider = createStaticHtmlFormIndexProvider({
    producerVersion: "0.0.0-test",
    readSource: async () => html,
  });
  const complete = await provider.getIndex([documentPath]);

  const incomplete = structuredClone(complete);
  incomplete.documents[0].inspection = {
    state: "incomplete",
    reason: "provider-resource-limit",
  };
  assertInputFailure(
    () => formFactsForLinkedForm(incomplete, documentPath, "task"),
    "form_index.inspection_incomplete",
  );

  const dynamicIdentity = structuredClone(complete);
  dynamicIdentity.documents[0].forms[0].identity = {
    state: "dynamic",
    reason: "dynamic-interpolation",
    range: dynamicIdentity.documents[0].forms[0].range,
  };
  assertInputFailure(
    () => formFactsForLinkedForm(dynamicIdentity, documentPath, "task"),
    "form_index.identity_unresolved",
  );

  const genericUnsupported = structuredClone(complete);
  genericUnsupported.documents[0].forms[0].controls[0].successful = {
    state: "unsupported",
    reason: "unsupported-control-kind",
    range: genericUnsupported.documents[0].forms[0].controls[0].range,
  };
  assertInputFailure(
    () => formFactsForLinkedForm(genericUnsupported, documentPath, "task"),
    "form_index.control_unresolved",
  );
});

function assertInputFailure(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error.name, "InputFailure");
    assert.equal(error.code, code);
    assert.equal(error.kind, "configuration");
    assert.equal(error.file, documentPath);
    return true;
  });
}
