import assert from "node:assert/strict";
import test from "node:test";

import {
  FormIndexFailure,
  createContentDigest,
  parseFormIndex,
  serializeFormIndex,
  verifyFormIndexContent,
} from "../dist/src/form-index.js";

const source = [
  "",
  "",
  "",
  "",
  '<form id="task"><input name="title"></form>',
  "",
].join("\n");

test("canonicalizes FormIndex objects and round-trips strict JSON", () => {
  const index = validIndex();
  index.documents.push(emptyDocument("src/a.html", "a\n"));
  index.documents[0].forms.push({
    ...index.documents[0].forms[0],
    range: range(1, 0, 1, 8),
    controls: [
      {
        ...index.documents[0].forms[0].controls[0],
        range: range(1, 5, 1, 8),
      },
      {
        ...index.documents[0].forms[0].controls[0],
        range: range(1, 2, 1, 4),
      },
    ],
  });

  const text = serializeFormIndex(index);
  const parsed = parseFormIndex(text);

  assert.equal(text.endsWith("\n"), true);
  assert.deepEqual(parsed.documents.map((document) => document.path), [
    "src/a.html",
    "src/z.html",
  ]);
  assert.deepEqual(
    parsed.documents[1].forms.map((form) => form.range.start.line),
    [1, 4],
  );
  assert.deepEqual(
    parsed.documents[1].forms[0].controls.map(
      (control) => control.range.start.character,
    ),
    [2, 5],
  );
  assert.equal(serializeFormIndex(parsed), text);
});

test("requires explicit incomplete inspection instead of an ambiguous empty index", () => {
  const index = validIndex();
  index.documents[0] = {
    ...index.documents[0],
    inspection: {
      state: "incomplete",
      reason: "provider-resource-limit",
    },
    forms: [],
  };

  const parsed = parseFormIndex(serializeFormIndex(index));
  assert.deepEqual(parsed.documents[0].inspection, {
    state: "incomplete",
    reason: "provider-resource-limit",
  });

  const ambiguous = validIndex();
  delete ambiguous.documents[0].inspection;
  assertFailure(
    () => serializeFormIndex(ambiguous),
    "form_index.shape_invalid",
    "/documents/0/inspection",
  );
});

test("preserves dynamic and unsupported evidence without source snippets", () => {
  const index = validIndex();
  const form = index.documents[0].forms[0];
  form.identity = {
    state: "dynamic",
    reason: "dynamic-interpolation",
    range: range(0, 6, 0, 15),
  };
  form.controls[0].successful = {
    state: "unsupported",
    reason: "unsupported-control-kind",
    range: range(0, 16, 0, 36),
  };

  const text = serializeFormIndex(index);
  const parsed = parseFormIndex(text);
  assert.equal(parsed.documents[0].forms[0].identity.state, "dynamic");
  assert.equal(
    parsed.documents[0].forms[0].controls[0].successful.state,
    "unsupported",
  );
  assert.equal(text.includes("<form"), false);
});

test("rejects root-escaping and non-portable document paths", () => {
  for (const candidate of [
    "/tmp/form.html",
    "../form.html",
    "src/../form.html",
    "C:/form.html",
    "C:form.html",
    "src\\form.html",
    "src/con.html",
    "src/form.html.",
  ]) {
    const index = validIndex();
    index.documents[0].path = candidate;
    assertFailure(
      () => serializeFormIndex(index),
      "form_index.path_invalid",
      "/documents/0/path",
    );
  }
});

test("rejects malformed digests and invalid source ranges", () => {
  const badDigest = validIndex();
  badDigest.documents[0].contentDigest = "sha256:ABC";
  assertFailure(
    () => serializeFormIndex(badDigest),
    "form_index.digest_invalid",
    "/documents/0/contentDigest",
  );

  const badRange = validIndex();
  badRange.documents[0].forms[0].range = range(2, 0, 1, 0);
  assertFailure(
    () => serializeFormIndex(badRange),
    "form_index.range_invalid",
    "/documents/0/forms/0/range",
  );
});

test("rejects duplicate and case-colliding document paths", () => {
  for (const duplicate of ["src/z.html", "SRC/Z.HTML"]) {
    const index = validIndex();
    index.documents.push(emptyDocument(duplicate, "other\n"));
    assertFailure(
      () => serializeFormIndex(index),
      "form_index.duplicate",
    );
  }
});

test("rejects duplicate form and control ranges", () => {
  const duplicateForm = validIndex();
  duplicateForm.documents[0].forms.push({
    ...duplicateForm.documents[0].forms[0],
  });
  assertFailure(
    () => serializeFormIndex(duplicateForm),
    "form_index.duplicate",
  );

  const duplicateControl = validIndex();
  duplicateControl.documents[0].forms[0].controls.push({
    ...duplicateControl.documents[0].forms[0].controls[0],
  });
  assertFailure(
    () => serializeFormIndex(duplicateControl),
    "form_index.duplicate",
  );
});

test("rejects host metadata and every unknown property", () => {
  const rootMetadata = validIndex();
  rootMetadata.timestamp = "2026-07-15T00:00:00Z";
  assertFailure(
    () => serializeFormIndex(rootMetadata),
    "form_index.shape_invalid",
    "/timestamp",
  );

  const documentMetadata = validIndex();
  documentMetadata.documents[0].hostname = "developer-machine";
  assertFailure(
    () => serializeFormIndex(documentMetadata),
    "form_index.shape_invalid",
    "/documents/0/hostname",
  );
});

test("parses only canonical strict JSON", () => {
  assertFailure(
    () => parseFormIndex("{not-json}"),
    "form_index.json_invalid",
  );

  const canonical = serializeFormIndex(validIndex());
  assertFailure(
    () => parseFormIndex(canonical.trimEnd()),
    "form_index.noncanonical",
  );
  assertFailure(
    () => parseFormIndex(canonical.replace(
      '"schemaVersion": 1,',
      '"schemaVersion": 1,\n  "schemaVersion": 1,',
    )),
    "form_index.noncanonical",
  );
});

test("binds indexed documents to current source bytes", () => {
  const index = validIndex();
  const verified = verifyFormIndexContent(index, (documentPath) =>
    documentPath === "src/z.html" ? source : undefined,
  );
  assert.equal(verified.documents[0].contentDigest, createContentDigest(source));

  assertFailure(
    () => verifyFormIndexContent(index, () => undefined),
    "form_index.source_missing",
    "/documents/0/path",
  );
  assertFailure(
    () => verifyFormIndexContent(index, () => "changed\n"),
    "form_index.digest_mismatch",
    "/documents/0/contentDigest",
  );

  const outsideSource = validIndex();
  outsideSource.documents[0].forms[0].range = range(99, 0, 99, 1);
  assertFailure(
    () => verifyFormIndexContent(outsideSource, () => source),
    "form_index.range_invalid",
    "/documents/0/forms/0/range/start",
  );

  const invalidUtf8 = Uint8Array.from([0xff]);
  const invalidEncoding = validIndex();
  invalidEncoding.documents[0].contentDigest = createContentDigest(invalidUtf8);
  assertFailure(
    () => verifyFormIndexContent(invalidEncoding, () => invalidUtf8),
    "form_index.source_encoding_invalid",
    "/documents/0",
  );
});

function validIndex() {
  return {
    schemaVersion: 1,
    producer: {
      name: "mensor/static-html",
      version: "0.0.55",
    },
    documents: [
      {
        path: "src/z.html",
        contentDigest: createContentDigest(source),
        sourceKind: "mensor/static-html",
        inspection: { state: "complete" },
        forms: [
          {
            identity: {
              state: "known",
              value: "task",
              range: range(4, 6, 4, 15),
            },
            method: {
              state: "absent",
              range: range(4, 0, 4, 16),
            },
            action: {
              state: "current-document",
              range: range(4, 0, 4, 16),
            },
            range: range(4, 0, 4, 16),
            controls: [
              {
                name: {
                  state: "known",
                  value: "title",
                  range: range(4, 23, 4, 35),
                },
                controlKind: {
                  state: "known",
                  value: "input",
                  range: range(4, 16, 4, 36),
                },
                inputType: { state: "absent" },
                multiple: {
                  state: "known",
                  value: false,
                  range: range(4, 16, 4, 36),
                },
                multiplicity: {
                  state: "known",
                  value: "scalar",
                  range: range(4, 16, 4, 36),
                },
                successful: {
                  state: "known",
                  value: true,
                  range: range(4, 16, 4, 36),
                },
                range: range(4, 16, 4, 36),
              },
            ],
          },
        ],
      },
    ],
  };
}

function emptyDocument(documentPath, text) {
  return {
    path: documentPath,
    contentDigest: createContentDigest(text),
    sourceKind: "mensor/static-html",
    inspection: { state: "complete" },
    forms: [],
  };
}

function range(startLine, startCharacter, endLine, endCharacter) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

function assertFailure(callback, code, instancePath) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof FormIndexFailure, true);
    assert.equal(error.code, code);
    if (instancePath !== undefined) {
      assert.equal(error.instancePath, instancePath);
    }
    return true;
  });
}
