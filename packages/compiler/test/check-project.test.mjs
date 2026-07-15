import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkProject } from "@mensor/compiler";

const fixtureRoot = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

test("returns the canonical passing report for the valid fixture", async () => {
  const result = await checkFixture("valid/tiny-tasks");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport("valid/tiny-tasks"));
  }
});

test("returns the canonical passing report for the layered valid fixture", async () => {
  const result = await checkFixture("valid/layered-tasks");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport("valid/layered-tasks"));
  }
});

test("reports a stable handler placement diagnostic without executing source", async () => {
  const fixture = "invalid/file-role-mismatch";
  const sentinel = path.join(
    fixtureRoot,
    fixture,
    "src/features/tasks/routes/compiler-executed.txt",
  );
  await assertMissing(sentinel);

  const result = await checkFixture(fixture);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
  await assertMissing(sentinel);
});

test("reports the canonical missing form field diagnostic", async () => {
  const fixture = "invalid/form-field-missing";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("does not count a required control inside a disabled fieldset", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(root, "src/features/tasks/views/index.html");
    const html = await readFile(file, "utf8");
    await writeFile(
      file,
      html.replace(
        '<input name="title" type="text" required="required" />',
        '<fieldset disabled><input name="title" type="text" required="required" /></fieldset>',
      ),
      "utf8",
    );
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.report.diagnostics.map((item) => item.code), [
        "form.field_missing",
      ]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects repeated successful controls for a scalar text binding", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(root, "src/features/tasks/views/index.html");
    const html = await readFile(file, "utf8");
    await writeFile(
      file,
      html.replace(
        '<input name="title" type="text" required="required" />',
        '<input name="title" type="text" required="required" />\n        <input name="title" type="text" />',
      ),
      "utf8",
    );
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.report.diagnostics.map((item) => item.code), [
        "form.control_codec_mismatch",
      ]);
      assert.equal(result.report.diagnostics[0]?.facts.controlCount, 2);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a radio group as one scalar text field", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(root, "src/features/tasks/views/index.html");
    const html = await readFile(file, "utf8");
    await writeFile(
      file,
      html.replace(
        '<input name="title" type="text" required="required" />',
        '<input name="title" type="radio" value="low" required="required" />\n        <input name="title" type="radio" value="high" />',
      ),
      "utf8",
    );
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "passed");
      assert.deepEqual(result.report.diagnostics, []);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ignores duplicate form ids and fields inside inert template content", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(root, "src/features/tasks/views/index.html");
    const html = await readFile(file, "utf8");
    await writeFile(
      file,
      `${html}<template><form id="create-task"><input name="prototype-only"></form></template>\n`,
      "utf8",
    );
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "passed");
      assert.deepEqual(result.report.diagnostics, []);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports the canonical unexpected form field diagnostic", async () => {
  const fixture = "invalid/form-field-unexpected";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports the canonical form method mismatch diagnostic", async () => {
  const fixture = "invalid/form-method-mismatch";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports the canonical form action mismatch diagnostic", async () => {
  const fixture = "invalid/form-action-mismatch";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("requires documentPath when a form submits to the current document", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(
      root,
      "src/features/tasks/feature.mensor.jsonc",
    );
    const contract = await readFile(file, "utf8");
    await writeFile(
      file,
      contract.replace(
        '        "id": "create-task",\n        "documentPath": "/tasks"',
        '        "id": "create-task"',
      ),
      "utf8",
    );

    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failure.kind, "configuration");
      assert.equal(result.failure.code, "form.document_path_missing");
      assert.equal(
        result.failure.file,
        "src/features/tasks/feature.mensor.jsonc",
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports a current-document action against its declared page path", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(
      root,
      "src/features/tasks/feature.mensor.jsonc",
    );
    const contract = await readFile(file, "utf8");
    await writeFile(
      file,
      contract.replace(
        '"documentPath": "/tasks"',
        '"documentPath": "/wrong-page"',
      ),
      "utf8",
    );

    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.report.diagnostics.map((item) => item.code), [
        "form.action_mismatch",
      ]);
      assert.deepEqual(result.report.diagnostics[0]?.facts, {
        actionId: "tasks.create",
        actualAction: "/wrong-page",
        actualActionSource: "current-document",
        expectedAction: "/tasks",
        formId: "create-task",
        template: "src/features/tasks/views/index.html",
      });
      assert.deepEqual(
        result.report.diagnostics[0]?.related.map((item) => item.role),
        ["form-document-path", "action-route-path"],
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts an explicitly empty action with a declared documentPath", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    const file = path.join(root, "src/features/tasks/views/index.html");
    const html = await readFile(file, "utf8");
    await writeFile(
      file,
      html.replace(
        '<form id="create-task" method="post">',
        '<form id="create-task" method="post" action="">',
      ),
      "utf8",
    );

    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "passed");
      assert.deepEqual(result.report.diagnostics, []);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports the canonical control and codec mismatch diagnostic", async () => {
  const fixture = "invalid/form-control-codec-mismatch";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports unsupported form controls instead of silently ignoring them", async () => {
  const fixture = "invalid/form-control-unsupported";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports a declared handler export that is missing from source", async () => {
  const fixture = "invalid/handler-export-missing";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("rejects a type-only declaration as a runtime handler export", async () => {
  const root = await copyFixture("valid/tiny-tasks");
  try {
    await writeFile(
      path.join(root, "src/features/tasks/server/create-task.ts"),
      "export type createTask = () => void;\n",
      "utf8",
    );
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "failed");
      assert.deepEqual(result.report.diagnostics.map((item) => item.code), [
        "handler.export_missing",
      ]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports a transitive browser-to-server import boundary", async () => {
  const fixture = "invalid/module-boundary-transitive";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("treats literal CommonJS require as a runtime boundary edge", async () => {
  const root = await copyFixture("valid/layered-tasks");
  try {
    const browserFile = path.join(root, "src/features/tasks/browser/app.ts");
    const source = await readFile(browserFile, "utf8");
    await writeFile(
      browserFile,
      `${source}\nconst secret = require("../server/secret.js");\nvoid secret;\n`,
      "utf8",
    );
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "failed");
      assert.deepEqual(result.report.diagnostics.map((item) => item.code), [
        "module.boundary_violation",
      ]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("classifies nested feature files against the longest owning root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-nested-feature-"));
  try {
    const files = nestedFeatureFiles();
    for (const [relativePath, contents] of Object.entries(files)) {
      const file = path.join(root, ...relativePath.split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents, "utf8");
    }
    const result = await checkProject({ root, producerVersion: "0.0.0-fixture" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.report.status, "failed");
      assert.deepEqual(result.report.diagnostics.map((item) => item.code), [
        "module.boundary_violation",
      ]);
      assert.equal(result.report.diagnostics[0]?.file, "src/features/nested/browser/app.ts");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports a direct route-to-database import boundary", async () => {
  const fixture = "invalid/module-boundary-direct";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports non-literal dynamic imports reached by a boundary", async () => {
  const fixture = "invalid/module-dynamic-import-unsupported";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports a feature test outside its declared ownership slot", async () => {
  const fixture = "invalid/ownership-test-slot";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("reports an i18n file outside every declared feature", async () => {
  const fixture = "invalid/ownership-i18n-unowned";
  const result = await checkFixture(fixture);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.report, await expectedReport(fixture));
  }
});

test("produces byte-identical reports from different absolute roots", async () => {
  for (const fixture of [
    "invalid/file-role-mismatch",
    "invalid/form-field-missing",
    "invalid/form-field-unexpected",
    "invalid/form-method-mismatch",
    "invalid/form-action-mismatch",
    "invalid/form-control-codec-mismatch",
    "invalid/form-control-unsupported",
    "invalid/handler-export-missing",
    "invalid/module-boundary-transitive",
    "invalid/module-boundary-direct",
    "invalid/module-dynamic-import-unsupported",
    "invalid/ownership-test-slot",
    "invalid/ownership-i18n-unowned",
  ]) {
    const temporaryRoots = await Promise.all([
      copyFixture(fixture),
      copyFixture(fixture),
    ]);
    try {
      const reports = await Promise.all(
        temporaryRoots.map((root) =>
          checkProject({ root, producerVersion: "0.0.0-fixture" }),
        ),
      );
      assert.ok(reports.every((result) => result.ok));
      const serialized = reports.map((result) =>
        result.ok ? `${JSON.stringify(result.report, null, 2)}\n` : "failed",
      );
      assert.equal(serialized[0], serialized[1], fixture);
    } finally {
      await Promise.all(
        temporaryRoots.map((root) => rm(root, { recursive: true, force: true })),
      );
    }
  }
});

test("fails closed when discovery exceeds the configured file limit", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    limits: { maxFiles: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "filesystem");
    assert.equal(result.failure.code, "discovery.file_limit_exceeded");
    assert.equal(result.failure.file, "src");
  }
});

test("fails closed when discovery exceeds the aggregate byte limit", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    limits: { maxTotalBytes: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "filesystem");
    assert.equal(result.failure.code, "discovery.total_bytes_limit_exceeded");
    assert.equal(result.failure.file, "src");
  }
});

test("fails closed when discovery exceeds the directory depth limit", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    limits: { maxDepth: 0 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "filesystem");
    assert.equal(result.failure.code, "discovery.depth_limit_exceeded");
    assert.equal(result.failure.file, "src/features");
  }
});

test("rejects invalid aggregate discovery limits", async () => {
  for (const [limits, code] of [
    [{ maxTotalBytes: 0 }, "limits.max_total_bytes_invalid"],
    [{ maxDepth: -1 }, "limits.max_depth_invalid"],
  ]) {
    const result = await checkProject({
      root: path.join(fixtureRoot, "valid/tiny-tasks"),
      limits,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failure.kind, "configuration");
      assert.equal(result.failure.code, code);
    }
  }
});

test("rejects an empty producer version before creating an invalid report", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    producerVersion: "",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "configuration");
    assert.equal(result.failure.code, "producer.version_invalid");
  }
});

test("fails closed before reading a source file above the byte limit", async () => {
  const result = await checkProject({
    root: path.join(fixtureRoot, "valid/tiny-tasks"),
    limits: { maxFileBytes: 1 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.kind, "filesystem");
    assert.equal(result.failure.code, "file.size_limit_exceeded");
    assert.equal(result.failure.file, "mensor.project.jsonc");
  }
});

async function checkFixture(relativePath) {
  return checkProject({
    root: path.join(fixtureRoot, relativePath),
    producerVersion: "0.0.0-fixture",
  });
}

async function expectedReport(relativePath) {
  return JSON.parse(
    await readFile(path.join(fixtureRoot, relativePath, "expected-report.json"), "utf8"),
  );
}

async function copyFixture(relativePath) {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-fixture-"));
  await cp(path.join(fixtureRoot, relativePath), root, { recursive: true });
  return root;
}

async function assertMissing(file) {
  await assert.rejects(access(file), { code: "ENOENT" });
}

function nestedFeatureFiles() {
  const project = {
    version: 1,
    sourceRoot: "src",
    featureContracts: [
      "src/features/feature.mensor.jsonc",
      "src/features/nested/feature.mensor.jsonc",
    ],
    fileRoles: [
      { role: "server", withinFeature: "server" },
      { role: "browser", withinFeature: "browser" },
      { role: "view", withinFeature: "views" },
    ],
    boundaries: [
      { id: "browser-no-server", mode: "transitive", from: ["browser"], deny: ["server"] },
    ],
  };
  return {
    "mensor.project.jsonc": `${JSON.stringify(project, null, 2)}\n`,
    "src/features/feature.mensor.jsonc": featureContract("parent", "/parent"),
    "src/features/views/parent.html": formHtml("parent", "/parent"),
    "src/features/server/create-task.ts": "export function createTask(): void {}\n",
    "src/features/nested/feature.mensor.jsonc": featureContract("nested", "/nested"),
    "src/features/nested/views/nested.html": formHtml("nested", "/nested"),
    "src/features/nested/server/create-task.ts": "export function createTask(): void {}\nexport const secret = 1;\n",
    "src/features/nested/browser/app.ts": "import { secret } from \"../server/create-task.js\";\nvoid secret;\n",
  };
}

function featureContract(id, route) {
  return `${JSON.stringify({
    version: 1,
    feature: { id },
    actions: [{
      id: `${id}.create`,
      route: { method: "POST", path: route },
      form: { template: `views/${id}.html`, id },
      handler: { file: "server/create-task.ts", export: "createTask", role: "server" },
      input: {
        schema: {
          kind: "object",
          properties: { title: { kind: "string" } },
          required: ["title"],
        },
        formCodec: {
          encoding: "urlencoded",
          unknownFields: "reject",
          bindings: [{
            name: "title",
            path: ["title"],
            decode: { kind: "text", trim: true, empty: "reject" },
          }],
        },
      },
    }],
  }, null, 2)}\n`;
}

function formHtml(id, route) {
  return `<!doctype html>\n<form id="${id}" method="post" action="${route}">\n  <input name="title" type="text" />\n</form>\n`;
}
