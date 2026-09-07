import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const scenarios = [
  { name: "forms-heavy", features: 24, actions: 4, modules: 8 },
  { name: "module-graph", features: 16, actions: 2, modules: 64 },
  { name: "mixed", features: 32, actions: 3, modules: 16 },
];

export async function createPerformanceProject(root, shape) {
  const files = new Map();
  const contracts = [];
  for (let featureIndex = 0; featureIndex < shape.features; featureIndex += 1) {
    const id = `feature${String(featureIndex).padStart(3, "0")}`;
    const prefix = `src/features/${id}`;
    const contractPath = `${prefix}/feature.mensor.jsonc`;
    contracts.push(contractPath);
    const actions = [];
    for (let actionIndex = 0; actionIndex < shape.actions; actionIndex += 1) {
      const name = `create${actionIndex}`;
      const route = `/${id}/${name}`;
      actions.push({
        id: `${id}.${name}`,
        route: { method: "POST", path: route },
        form: { template: `views/${name}.html`, id: name },
        handler: { file: `server/${name}.ts`, export: name, role: "server" },
        input: {
          schema: {
            kind: "object",
            properties: {
              title: { kind: "string", minLength: 1, maxLength: 120 },
              count: { kind: "integer", minimum: 1, maximum: 100 },
              done: { kind: "boolean" },
            },
            required: ["title", "count", "done"],
          },
          formCodec: {
            encoding: "urlencoded", unknownFields: "reject",
            bindings: [
              { name: "title", path: ["title"], decode: { kind: "text", trim: true, empty: "reject" } },
              { name: "count", path: ["count"], decode: { kind: "integer-base10" } },
              { name: "done", path: ["done"], decode: { kind: "checkbox", trueValues: ["on"], missing: false } },
            ],
          },
        },
      });
      files.set(`${prefix}/views/${name}.html`, `<!doctype html><form id="${name}" method="post" action="${route}"><input name="title" required><input name="count" type="number" required><input name="done" type="checkbox" value="on"></form>\n`);
      files.set(`${prefix}/server/${name}.ts`, `import { value } from "../shared/domain/model/module-0.js";\nexport function ${name}(input) { return { ...input, value }; }\n`);
    }
    files.set(contractPath, `${JSON.stringify({ version: 1, feature: { id }, actions }, null, 2)}\n`);
    for (let moduleIndex = 0; moduleIndex < shape.modules; moduleIndex += 1) {
      const dependency = moduleIndex + 1 < shape.modules
        ? `import { value as next } from "./module-${moduleIndex + 1}.js";\n`
        : "const next = 0;\n";
      files.set(`${prefix}/shared/domain/model/module-${moduleIndex}.ts`, `${dependency}export const value = next + 1;\nexport interface Entry { id: string; title: string; count: number; done: boolean; }\nexport function summarize(entries: readonly Entry[]) { return entries.filter(entry => !entry.done).map(entry => entry.title).join(", "); }\n`);
    }
  }
  const project = {
    version: 1, sourceRoot: "src", featureContracts: contracts,
    fileRoles: [
      { role: "server", withinFeature: "server" },
      { role: "shared", withinFeature: "shared" },
      { role: "view", withinFeature: "views" },
    ],
    boundaries: [
      { id: "shared-no-server", mode: "direct", from: ["shared"], deny: ["server"] },
      { id: "server-no-view", mode: "transitive", from: ["server"], deny: ["view"] },
    ],
  };
  const directories = new Set([...files.keys()].map(file => path.dirname(path.join(root, file))));
  for (const directory of directories) await mkdir(directory, { recursive: true });
  await writeFile(path.join(root, "mensor.project.jsonc"), `${JSON.stringify(project, null, 2)}\n`);
  const entries = [...files];
  for (let start = 0; start < entries.length; start += 32) {
    await Promise.all(entries.slice(start, start + 32).map(([file, text]) => writeFile(path.join(root, file), text)));
  }
  return {
    ...shape,
    sourceFileCount: files.size,
    sourceBytes: [...files.values()].reduce((total, text) => total + Buffer.byteLength(text), 0),
    templateCount: shape.features * shape.actions,
    firstTemplate: "src/features/feature000/views/create0.html",
  };
}
