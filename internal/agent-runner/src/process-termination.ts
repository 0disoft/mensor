import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";

export type ChildProcessSettlement =
  | { readonly kind: "closed"; readonly exitCode: number }
  | { readonly kind: "spawn-error" }
  | { readonly kind: "termination-failed" };

export interface BoundedChildSettlement {
  readonly promise: Promise<ChildProcessSettlement>;
  readonly requestTermination: () => void;
}

const defaultTerminationGraceMs = 1_000;

export function createBoundedChildSettlement(
  child: ChildProcess,
  options: {
    readonly graceMs?: number;
    readonly terminate?: (child: ChildProcess) => void;
  } = {},
): BoundedChildSettlement {
  const graceMs = options.graceMs ?? defaultTerminationGraceMs;
  if (!Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 10_000) {
    throw new Error("Process termination grace must be an integer from 1 to 10000 milliseconds.");
  }
  let settled = false;
  let terminationRequested = false;
  let graceTimer: NodeJS.Timeout | undefined;
  let resolvePromise: (result: ChildProcessSettlement) => void = () => undefined;
  const promise = new Promise<ChildProcessSettlement>((resolve) => {
    resolvePromise = resolve;
  });
  const settle = (result: ChildProcessSettlement): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
    }
    resolvePromise(result);
  };
  child.once("error", () => settle({ kind: "spawn-error" }));
  child.once("close", (code) => settle({
    kind: "closed",
    exitCode: Number.isSafeInteger(code) ? code as number : 1,
  }));
  return {
    promise,
    requestTermination() {
      if (settled || terminationRequested) {
        return;
      }
      terminationRequested = true;
      (options.terminate ?? terminateProcessTree)(child);
      graceTimer = setTimeout(() => {
        destroyProcessStreams(child);
        settle({ kind: "termination-failed" });
      }, graceMs);
    },
  };
}

function terminateProcessTree(child: ChildProcess): void {
  destroyProcessStreams(child);
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    child.kill("SIGKILL");
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    const killer = spawn(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"],
      {
        env: { SystemRoot: systemRoot },
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      },
    );
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function destroyProcessStreams(child: ChildProcess): void {
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
}
