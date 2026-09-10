import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../examples/honox-guarded-rsvp/", import.meta.url));
const child = spawn(process.execPath, ["serve.mjs"], { cwd, env: { ...process.env, PORT: "0" }, windowsHide: true, stdio: ["ignore", "inherit", "inherit"] });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
try {
  await once(child, "exit");
  if (!timedOut) throw new Error("Browser session server exited before its bounded window ended");
  console.log("Browser session ended; child server reaped.");
} finally {
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) child.kill();
}
