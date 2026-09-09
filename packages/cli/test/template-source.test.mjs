import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeSourcePath, readSource } from "../dist/src/template-source.js";

test("shared template reader preserves exact UTF-8 bytes including BOM", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "mensor-template-reader-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const text = '\uFEFFexport const value = "ok";\r\n';
  await writeFile(path.join(root, "view.tsx"), text);
  const actual = await readSource(root, "view.tsx");
  assert.equal(actual.text, text);
  assert.equal(actual.digest, `sha256:${createHash("sha256").update(await readFile(path.join(root, "view.tsx"))).digest("hex")}`);
  await writeFile(path.join(root, "bad.tsx"), Buffer.from([0xff]));
  await assert.rejects(readSource(root, "bad.tsx"), { code: "form_indexer.source_encoding_invalid" });
  await writeFile(path.join(root, "large.tsx"), " ".repeat(1_048_577));
  await assert.rejects(readSource(root, "large.tsx"), { code: "form_indexer.source_too_large" });
});

test("shared template reader rejects nonportable paths and linked directory components", async (context) => {
  for (const value of ["../view.tsx", "C:stream.tsx", "view.tsx:stream", "a//b.tsx", "CON.tsx", "a./b.tsx"]) {
    assert.throws(() => normalizeSourcePath(value), { code: "form_indexer.source_path_invalid" });
  }
  const root = await mkdtemp(path.join(tmpdir(), "mensor-template-reader-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "real"));
  await writeFile(path.join(root, "real/view.tsx"), "export {};\n");
  await symlink(path.join(root, "real"), path.join(root, "linked"), "junction");
  await assert.rejects(readSource(root, "linked/view.tsx"), { code: "form_indexer.source_symlink" });
});
