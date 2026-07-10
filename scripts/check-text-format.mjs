import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const checkedExtensions = new Set([
  ".html",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".ts",
  ".yaml",
]);
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const failures = [];

for (const path of await walk(root)) {
  if (!checkedExtensions.has(extname(path.pathname))) {
    continue;
  }
  const text = await readFile(path, "utf8");
  const displayPath = relative(root.pathname, path.pathname).replaceAll("\\", "/");
  if (text.includes("\r")) {
    failures.push(`${displayPath}: contains CR line endings`);
  }
  if (text.length > 0 && !text.endsWith("\n")) {
    failures.push(`${displayPath}: missing final newline`);
  }
  text.split("\n").forEach((line, index) => {
    if (/[ \t]+$/u.test(line)) {
      failures.push(`${displayPath}:${index + 1}: trailing whitespace`);
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      files.push(...(await walk(child)));
    } else {
      files.push(child);
    }
  }
  return files.sort((left, right) => left.href.localeCompare(right.href));
}
