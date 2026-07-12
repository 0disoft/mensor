import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const projects = [
  "packages/contract",
  "packages/compiler",
  "packages/cli",
  "internal/fixture-kit",
  "internal/agent-runner",
];

for (const project of projects) {
  await rm(path.join(root, ...project.split("/"), "dist"), {
    recursive: true,
    force: true,
  });
}
