import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkProject,
  draftProjectContracts,
} from "@0disoft/mensor-compiler";
import {
  parseFeatureContract,
  parseProjectContract,
} from "@0disoft/mensor-contract";

test("drafts deterministic contracts from one static form and runtime export", async (t) => {
  const roots = [await createProject(), await createProject()];
  t.after(async () => {
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
  });

  const results = await Promise.all(roots.map((root) => draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
  })));

  assert.equal(results[0]?.ok, true);
  assert.equal(results[1]?.ok, true);
  if (results[0]?.ok && results[1]?.ok) {
    assert.equal(results[0].project.content, results[1].project.content);
    assert.equal(results[0].feature.content, results[1].feature.content);
    assert.equal(results[0].project.path, "mensor.project.jsonc");
    assert.equal(
      results[0].feature.path,
      "src/features/guestbook/feature.mensor.jsonc",
    );

    const project = parseProjectContract(results[0].project.content);
    const feature = parseFeatureContract(results[0].feature.content);
    assert.equal(project.ok, true);
    assert.equal(feature.ok, true);
    if (project.ok && feature.ok) {
      assert.deepEqual(project.value.fileRoles, [
        { role: "server", withinFeature: "server" },
      ]);
      const action = feature.value.actions[0];
      assert.equal(action?.id, "guestbook.create-entry");
      assert.equal(action?.route.path, "/guestbook");
      assert.deepEqual(action?.input.schema.required, []);
      assert.deepEqual(action?.input.schema.properties, {
        author: { kind: "string" },
        tags: { kind: "array", items: { kind: "string" } },
      });
      assert.deepEqual(
        action?.input.formCodec.bindings.map((binding) => binding.decode.kind),
        ["text", "repeat"],
      );
    }

    await writeFile(
      path.join(roots[0], results[0].project.path),
      results[0].project.content,
      "utf8",
    );
    await writeFile(
      path.join(roots[0], results[0].feature.path),
      results[0].feature.content,
      "utf8",
    );
    const checked = await checkProject({ root: roots[0] });
    assert.equal(checked.ok, true);
    if (checked.ok) {
      assert.equal(checked.report.status, "passed");
    }
  }
});

test("requires the page route for a current-document form", async (t) => {
  const root = await createProject({ action: "" });
  t.after(() => rm(root, { force: true, recursive: true }));

  const missing = await draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.failure.code, "init.document_path_required");
  }

  const supplied = await draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
    documentPath: "/guestbook",
  });
  assert.equal(supplied.ok, true);
  if (supplied.ok) {
    const feature = parseFeatureContract(supplied.feature.content);
    assert.equal(feature.ok, true);
    if (feature.ok) {
      assert.equal(feature.value.actions[0]?.route.path, "/guestbook");
      assert.equal(
        feature.value.actions[0]?.form.documentPath,
        "/guestbook",
      );
    }
  }
});

test("requires selectors when forms and runtime exports are ambiguous", async (t) => {
  const root = await createProject({
    extraForm: true,
    extraHandlerExport: true,
  });
  t.after(() => rm(root, { force: true, recursive: true }));

  const ambiguousForm = await draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
  });
  assert.equal(ambiguousForm.ok, false);
  if (!ambiguousForm.ok) {
    assert.equal(ambiguousForm.failure.code, "init.form_ambiguous");
  }

  const ambiguousHandler = await draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
    form: {
      file: "src/features/guestbook/views/index.html",
      id: "create-entry",
    },
  });
  assert.equal(ambiguousHandler.ok, false);
  if (!ambiguousHandler.ok) {
    assert.equal(ambiguousHandler.failure.code, "init.handler_ambiguous");
  }

  const selected = await draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
    form: {
      file: "src/features/guestbook/views/index.html",
      id: "create-entry",
    },
    handler: {
      file: "src/features/guestbook/server/create-entry.ts",
      export: "createEntry",
    },
  });
  assert.equal(selected.ok, true);
  if (selected.ok) {
    assert.deepEqual(selected.selection, {
      actionId: "guestbook.create-entry",
      form: {
        file: "src/features/guestbook/views/index.html",
        id: "create-entry",
      },
      handler: {
        file: "src/features/guestbook/server/create-entry.ts",
        export: "createEntry",
      },
    });
  }
});

test("rejects checkbox semantics instead of inventing true values", async (t) => {
  const root = await createProject({ checkbox: true });
  t.after(() => rm(root, { force: true, recursive: true }));

  const result = await draftProjectContracts({
    root,
    featureRoot: "src/features/guestbook",
    featureId: "guestbook",
    handlerRole: "server",
    form: {
      file: "src/features/guestbook/views/index.html",
      id: "create-entry",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "init.form_unsupported");
    assert.match(result.failure.message, /explicit true-value decision/u);
  }
});

async function createProject(options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-init-"));
  const featureRoot = path.join(root, "src/features/guestbook");
  await mkdir(path.join(featureRoot, "server"), { recursive: true });
  await mkdir(path.join(featureRoot, "views"), { recursive: true });
  const action = options.action === "" ? "" : "/guestbook";
  const checkbox = options.checkbox
    ? '<input name="subscribed" type="checkbox" value="yes">'
    : '<input name="author"><select name="tags" multiple><option>one</option></select>';
  const extraForm = options.extraForm
    ? '\n<form id="delete-entry" method="post" action="/guestbook/delete"><input name="id"></form>'
    : "";
  await writeFile(
    path.join(featureRoot, "views/index.html"),
    `<form id="create-entry" method="post" action="${action}">${checkbox}</form>${extraForm}\n`,
    "utf8",
  );
  const extraExport = options.extraHandlerExport
    ? "\nexport function deleteEntry() {}\n"
    : "\n";
  await writeFile(
    path.join(featureRoot, "server/create-entry.ts"),
    `throw new Error("source modules must not execute");\nexport function createEntry() {}${extraExport}`,
    "utf8",
  );
  return root;
}
