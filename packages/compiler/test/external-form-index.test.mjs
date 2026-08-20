import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject, compileProject } from "@0disoft/mensor-compiler";
import { serializeFormIndex } from "@0disoft/mensor-contract";

const fixtureRoot = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

test("checks a non-HTML template through a public external FormIndex", async () => {
  const root = await externalFormIndexFixture();
  try {
    const result = await checkProject({
      root,
      producerVersion: "0.0.0-fixture",
      reportVersion: 2,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "passed");
      assert.deepEqual(result.report.diagnostics, []);
      assert.deepEqual(result.report.inspection.forms, {
        state: "checked",
        basis: "external-form-index",
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when an external FormIndex source digest is stale", async () => {
  const root = await externalFormIndexFixture();
  try {
    const template = path.join(root, "src/features/tasks/views/index.ts");
    await writeFile(
      template,
      `${await readFile(template, "utf8")}\n`,
      "utf8",
    );

    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failure.kind, "configuration");
      assert.equal(result.failure.code, "form_index.digest_mismatch");
      assert.equal(result.failure.file, "src/features/tasks/views/index.ts");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps non-HTML templates behind the explicit FormIndex boundary", async () => {
  const root = await externalFormIndexFixture();
  try {
    const projectFile = path.join(root, "mensor.project.jsonc");
    const project = JSON.parse(await readFile(projectFile, "utf8"));
    delete project.formIndex;
    await writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");

    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failure.kind, "configuration");
      assert.equal(result.failure.code, "form.template_kind_unsupported");
      assert.equal(result.failure.file, "src/features/tasks/views/index.ts");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not embed non-HTML external template source into RuntimeManifest", async () => {
  const root = await externalFormIndexFixture();
  try {
    const result = await compileProject({
      root,
      producerVersion: "0.0.0-fixture",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, "failure");
      if (result.kind === "failure") {
        assert.equal(result.failure.code, "runtime_manifest.template_kind_unsupported");
        assert.equal(
          result.failure.file,
          "src/features/tasks/views/index.ts",
        );
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function externalFormIndexFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-external-form-index-"));
  await cp(path.join(fixtureRoot, "valid/tiny-tasks"), root, { recursive: true });

  const projectFile = path.join(root, "mensor.project.jsonc");
  const project = JSON.parse(await readFile(projectFile, "utf8"));
  project.formIndex = "mensor.form-index.json";
  await writeFile(projectFile, `${JSON.stringify(project, null, 2)}\n`, "utf8");

  const featureFile = path.join(
    root,
    "src/features/tasks/feature.mensor.jsonc",
  );
  const feature = JSON.parse(await readFile(featureFile, "utf8"));
  feature.actions[0].form.template = "views/index.ts";
  await writeFile(featureFile, `${JSON.stringify(feature, null, 2)}\n`, "utf8");

  const source = "export const template = '<form id=\"create-task\" method=\"post\"><input name=\"title\" type=\"text\"></form>';\n";
  const projectTemplate = "src/features/tasks/views/index.ts";
  await writeFile(path.join(root, projectTemplate), source, "utf8");
  await writeFile(
    path.join(root, "mensor.form-index.json"),
    serializeFormIndex(formIndexForSource(projectTemplate, source)),
    "utf8",
  );
  return root;
}

function formIndexForSource(documentPath, source) {
  const formTag = '<form id="create-task" method="post">';
  const form = '<form id="create-task" method="post"><input name="title" type="text"></form>';
  const control = '<input name="title" type="text">';
  const formRange = rangeFor(source, form);
  const formTagRange = rangeFor(source, formTag);
  const controlRange = rangeFor(source, control);

  return {
    schemaVersion: 1,
    producer: {
      name: "example/typescript-template",
      version: "1.0.0",
    },
    documents: [
      {
        path: documentPath,
        contentDigest: contentDigest(source),
        sourceKind: "example/typescript-template",
        inspection: { state: "complete" },
        forms: [
          {
            identity: {
              state: "known",
              value: "create-task",
              range: rangeFor(source, 'id="create-task"'),
            },
            method: {
              state: "known",
              value: "post",
              range: rangeFor(source, 'method="post"'),
            },
            action: {
              state: "current-document",
              range: formTagRange,
            },
            range: formRange,
            controls: [
              {
                name: {
                  state: "known",
                  value: "title",
                  range: rangeFor(source, 'name="title"'),
                },
                controlKind: {
                  state: "known",
                  value: "input",
                  range: controlRange,
                },
                inputType: {
                  state: "known",
                  value: "text",
                  range: rangeFor(source, 'type="text"'),
                },
                multiple: {
                  state: "known",
                  value: false,
                  range: controlRange,
                },
                multiplicity: {
                  state: "known",
                  value: "scalar",
                  range: controlRange,
                },
                successful: {
                  state: "known",
                  value: true,
                  range: controlRange,
                },
                range: controlRange,
              },
            ],
          },
        ],
      },
    ],
  };
}

function contentDigest(source) {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function rangeFor(source, needle) {
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `Missing source fragment ${JSON.stringify(needle)}`);
  return {
    start: positionAt(source, start),
    end: positionAt(source, start + needle.length),
  };
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset);
  const lines = prefix.split(/\r\n|\n|\r/u);
  return {
    line: lines.length - 1,
    character: lines.at(-1)?.length ?? 0,
  };
}
