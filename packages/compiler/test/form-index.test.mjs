import assert from "node:assert/strict";
import test from "node:test";

import {
  FormIndexFailure,
  createContentDigest,
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

test("binds a validated FormIndex to current source bytes", () => {
  const index = validIndex();
  const verified = verifyFormIndexContent(index, (documentPath) =>
    documentPath === "src/z.html" ? source : undefined,
  );

  assert.equal(verified.documents[0].contentDigest, createContentDigest(source));
});

test("fails closed when indexed source is missing or stale", () => {
  assertFailure(
    () => verifyFormIndexContent(validIndex(), () => undefined),
    "form_index.source_missing",
    "src/z.html",
  );
  assertFailure(
    () => verifyFormIndexContent(validIndex(), () => "changed\n"),
    "form_index.digest_mismatch",
    "src/z.html",
  );
});

test("rejects ranges outside current source bytes", () => {
  const index = validIndex();
  index.documents[0].forms[0].range = range(99, 0, 99, 1);

  assertFailure(
    () => verifyFormIndexContent(index, () => source),
    "form_index.range_invalid",
    "src/z.html",
  );
});

test("rejects invalid UTF-8 source before trusting ranges", () => {
  const bytes = Uint8Array.from([0xff]);
  const index = validIndex();
  index.documents[0].contentDigest = createContentDigest(bytes);

  assertFailure(
    () => verifyFormIndexContent(index, () => bytes),
    "form_index.source_encoding_invalid",
    "src/z.html",
  );
});

function validIndex() {
  return {
    schemaVersion: 1,
    producer: {
      name: "mensor/static-html",
      version: "1.0.0",
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
                inputType: {
                  state: "known",
                  value: "text",
                  range: range(4, 16, 4, 36),
                },
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

function range(startLine, startCharacter, endLine, endCharacter) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

function assertFailure(callback, code, file) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof FormIndexFailure, true);
    assert.equal(error.code, code);
    assert.equal(error.file, file);
    return true;
  });
}
