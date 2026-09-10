import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
function start(context, port) {
  const child = spawn(process.execPath, ["serve.mjs"], { cwd, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (value) => { output += value; });
  child.stderr.on("data", (value) => { output += value; });
  const exited = once(child, "exit");
  context.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; });
  return { child, exited, output: () => output };
}

test("loopback server supports submission, rejects port conflicts and releases its port", { timeout: 20000 }, async (context) => {
  const active = start(context, 0);
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not become ready")), 10000);
    active.child.once("error", reject);
    active.child.once("exit", () => { clearTimeout(timer); reject(new Error(active.output())); });
    active.child.stdout.on("data", () => {
      const match = active.output().match(/http:\/\/127\.0\.0\.1:\d+\/rsvp/u);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  assert.equal((await fetch(url)).status, 200);
  const response = await fetch(url, { method: "POST", body: new URLSearchParams({ name: "<b>Browser</b>", email: "browser@example.test", attendance: "yes" }), redirect: "manual" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/rsvp");
  assert.match(await (await fetch(url)).text(), /&lt;b&gt;Browser&lt;\/b&gt;/u);
  const port = Number(new URL(url).port);
  const conflict = start(context, port);
  assert.equal((await conflict.exited)[0], 1);
  assert.match(conflict.output(), /Port already in use/u);
  active.child.kill();
  await active.exited;
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); });
  await new Promise((resolve) => probe.close(resolve));
});

test("server rejects invalid ports without starting a listener", { timeout: 10000 }, async (context) => {
  const invalid = start(context, "invalid");
  assert.equal((await invalid.exited)[0], 1);
  assert.match(invalid.output(), /PORT must be/u);
});
