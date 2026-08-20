import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFormIndex,
  serializeFormIndex,
} from "@0disoft/mensor-contract";

const digest = `sha256:${"0".repeat(64)}`;

test("canonicalizes public FormIndex v1 values", () => {
  const index = validIndex();
  index.documents.push(emptyDocument("src/a.html"));
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

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value.documents.map((document) => document.path), [
      "src/a.html",
      "src/z.html",
    ]);
    assert.deepEqual(
      parsed.value.documents[1].forms.map((form) => form.range.start.line),
      [1, 4],
    );
    assert.deepEqual(
      parsed.value.documents[1].forms[0].controls.map(
        (control) => control.range.start.character,
      ),
      [2, 5],
    );
    assert.equal(serializeFormIndex(parsed.value), text);
  }
});

test("preserves incomplete, dynamic, and unsupported evidence", () => {
  const index = validIndex();
  index.documents[0].inspection = {
    state: "incomplete",
    reason: "provider-resource-limit",
  };
  index.documents[0].forms[0].identity = {
    state: "dynamic",
    reason: "dynamic-interpolation",
    range: range(4, 6, 4, 15),
  };
  index.documents[0].forms[0].controls[0].successful = {
    state: "unsupported",
    reason: "unsupported-control-kind",
    range: range(4, 16, 4, 36),
  };

  const parsed = parseFormIndex(serializeFormIndex(index));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.documents[0].inspection.state, "incomplete");
    assert.equal(parsed.value.documents[0].forms[0].identity.state, "dynamic");
    assert.equal(
      parsed.value.documents[0].forms[0].controls[0].successful.state,
      "unsupported",
    );
  }
});

test("rejects noncanonical JSON and unknown host metadata", () => {
  const canonical = serializeFormIndex(validIndex());
  assert.equal(parseFormIndex(canonical).ok, true);
  assert.equal(parseFormIndex(canonical.trimEnd()).ok, false);
  assert.equal(parseFormIndex(`// generated\n${canonical}`).ok, false);

  const metadata = validIndex();
  metadata.generatedAt = "2026-08-20T00:00:00Z";
  assert.throws(
    () => serializeFormIndex(metadata),
    /cannot be serialized/u,
  );
});

test("rejects nonportable document paths and malformed digests", () => {
  for (const candidate of [
    "/tmp/form.html",
    "../form.html",
    "src/../form.html",
    "C:/form.html",
    "src\\form.html",
    "src/con.html",
    "src/form.html.",
  ]) {
    const index = validIndex();
    index.documents[0].path = candidate;
    assert.throws(
      () => serializeFormIndex(index),
      /cannot be serialized/u,
    );

    const parsed = parseFormIndex(`${JSON.stringify(index, null, 2)}\n`);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(
        parsed.issues.some((issue) => issue.instancePath === "/documents/0/path"),
        true,
      );
    }
  }

  const invalidDigest = validIndex();
  invalidDigest.documents[0].contentDigest = "sha256:ABC";
  assert.throws(
    () => serializeFormIndex(invalidDigest),
    /cannot be serialized/u,
  );
});

test("rejects duplicate paths, form ranges, and control ranges", () => {
  const caseCollision = validIndex();
  caseCollision.documents.push(emptyDocument("SRC/Z.HTML"));
  assert.throws(
    () => serializeFormIndex(caseCollision),
    /collides/u,
  );

  const duplicateForm = validIndex();
  duplicateForm.documents[0].forms.push(
    structuredClone(duplicateForm.documents[0].forms[0]),
  );
  assert.throws(
    () => serializeFormIndex(duplicateForm),
    /form ranges must be unique/u,
  );

  const duplicateControl = validIndex();
  duplicateControl.documents[0].forms[0].controls.push(
    structuredClone(duplicateControl.documents[0].forms[0].controls[0]),
  );
  assert.throws(
    () => serializeFormIndex(duplicateControl),
    /control ranges must be unique/u,
  );
});

test("rejects reversed ranges with stable semantic issue locations", () => {
  const index = validIndex();
  index.documents[0].forms[0].range = range(5, 0, 4, 0);
  const text = `${JSON.stringify(index, null, 2)}\n`;
  const parsed = parseFormIndex(text);

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.deepEqual(parsed.issues.map((issue) => issue.instancePath), [
      "/documents/0/forms/0/range",
    ]);
  }
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
        contentDigest: digest,
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

function emptyDocument(path) {
  return {
    path,
    contentDigest: digest,
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
