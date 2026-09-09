import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function prepareHonoJsxConsumerFixture(repositoryRoot, root) {
  const original = path.join(repositoryRoot, "fixtures/valid/tiny-tasks/src/features/tasks");
  const feature = JSON.parse(await readFile(path.join(original, "feature.mensor.jsonc"), "utf8"));
  feature.actions[0].form.template = "routes/index.tsx";
  const files = {
    "mensor.project.jsonc": JSON.stringify({
      version: 1, sourceRoot: "app", featureContracts: ["app/feature.mensor.jsonc"],
      fileRoles: [{ role: "server", withinFeature: "server" }, { role: "view", withinFeature: "routes" }],
      formIndex: "mensor.form-index.json", formIndexEvidence: ["tsconfig.json", "vite.config.ts"],
    }),
    "app/feature.mensor.jsonc": JSON.stringify(feature),
    "app/server/create-task.ts": await readFile(path.join(original, "server/create-task.ts"), "utf8"),
    "app/routes/index.tsx": 'import { createRoute } from "honox/factory"; export default createRoute((c) => c.render(<><h1>Tasks</h1><form id="create-task" method="post" action="/tasks"><input type="text" name="title" required /><button>Save</button></form></>));',
    "app/routes/_renderer.tsx": 'import { jsxRenderer } from "hono/jsx-renderer"; export default jsxRenderer(({ children }) => <html><body>{children}</body></html>);',
    "tsconfig.json": '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"hono/jsx"}}',
    "vite.config.ts": 'import { defineConfig } from "vite"; import honox from "honox/vite"; export default defineConfig({plugins:[honox()],esbuild:{jsx:"automatic",jsxImportSource:"hono/jsx"}});',
  };
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
}

export async function copyHonoJsxTrial(repositoryRoot, root) {
  const original = path.join(repositoryRoot, "internal/agent-runner/trials/honox-rsvp-v1");
  for (const file of ["tsconfig.json", "vite.config.ts", "app/routes/rsvp.tsx", "app/routes/_renderer.tsx"]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(path.join(original, file), path.join(root, file));
  }
}
