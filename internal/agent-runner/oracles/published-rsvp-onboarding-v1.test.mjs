import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("declares the exact published Mensor CLI dependency", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), "package.json"), "utf8"),
  );
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.packageManager, "pnpm@11.11.0");
  assert.deepEqual(packageJson.devDependencies, {
    "@0disoft/mensor-cli": "0.1.0",
  });
  assert.equal(Object.hasOwn(packageJson, "dependencies"), false);
  assert.equal(Object.hasOwn(packageJson, "workspaces"), false);
  assert.equal(Object.hasOwn(packageJson, "pnpm"), false);
  for (const name of Object.keys(packageJson.scripts ?? {})) {
    assert.doesNotMatch(name, /^(?:pre|post)?(?:install|pack|publish|prepare)$/u);
  }
});

await import("./rsvp-v2.test.mjs");
