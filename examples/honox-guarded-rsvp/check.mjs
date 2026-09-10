import { fileURLToPath } from "node:url";
import { runCli } from "../../packages/cli/dist/src/index.js";

const cwd = fileURLToPath(new URL(".", import.meta.url));
for (const argv of [
  ["index-hono-jsx-forms", "--source", "app/routes/rsvp.tsx", "--renderer", "app/routes/_renderer.tsx", "--jsx-config", "tsconfig.json", "--build-config", "vite.config.ts"],
  ["check", "--json", "--report-version", "2"],
]) {
  const code = await runCli({ cwd, argv, stdout: (value) => process.stdout.write(value), stderr: (value) => process.stderr.write(value) });
  if (code !== 0) { process.exitCode = code; break; }
}
