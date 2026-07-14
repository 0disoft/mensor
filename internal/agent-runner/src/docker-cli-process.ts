import { spawn } from "node:child_process";
import * as path from "node:path";

export interface DockerCliCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly input: Uint8Array;
  readonly signal: AbortSignal;
  readonly maxOutputBytes: number;
}

export interface DockerCliCommandResult {
  readonly termination: "exited" | "timeout" | "output-limit";
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly combinedOutputBytes: number;
}

export type DockerCliProcessRunner = (
  command: DockerCliCommand,
) => Promise<DockerCliCommandResult>;

export function createDockerCliProcessRunner(): DockerCliProcessRunner {
  return async (command) => runDockerCliProcess(command);
}

async function runDockerCliProcess(
  command: DockerCliCommand,
): Promise<DockerCliCommandResult> {
  validateCommand(command);
  if (command.signal.aborted) {
    return emptyResult("timeout");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, [...command.args], {
      cwd: undefined,
      detached: process.platform !== "win32",
      env: { ...command.environment },
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let combinedOutputBytes = 0;
    let termination: DockerCliCommandResult["termination"] | null = null;
    let settled = false;

    const finish = (
      callback: () => void,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      command.signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = (): void => {
      if (termination === null) {
        termination = "timeout";
        terminateProcessTree(child);
      }
    };
    const capture = (chunk: Buffer, keep: boolean): void => {
      combinedOutputBytes += chunk.byteLength;
      if (keep && stdoutBytes < command.maxOutputBytes) {
        const remaining = command.maxOutputBytes - stdoutBytes;
        const retained = chunk.subarray(0, remaining);
        stdoutChunks.push(retained);
        stdoutBytes += retained.byteLength;
      }
      if (
        combinedOutputBytes > command.maxOutputBytes &&
        termination === null
      ) {
        termination = "output-limit";
        terminateProcessTree(child);
      }
    };

    command.signal.addEventListener("abort", abort, { once: true });
    if (command.signal.aborted) {
      abort();
    }
    child.stdout.on("data", (chunk: Buffer) => capture(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => capture(chunk, false));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => resolve({
      termination: termination ?? "exited",
      exitCode: Number.isSafeInteger(code) ? code as number : 1,
      stdout: new Uint8Array(Buffer.concat(stdoutChunks)),
      combinedOutputBytes,
    })));
    child.stdin.once("error", () => undefined);
    child.stdin.end(command.input);
  });
}

function validateCommand(command: DockerCliCommand): void {
  if (
    typeof command.executable !== "string" ||
    command.executable.length === 0 ||
    !path.isAbsolute(command.executable) ||
    command.executable.includes("\0") ||
    command.args.some((argument) =>
      typeof argument !== "string" || argument.includes("\0"))
  ) {
    throw new Error("Docker CLI process command is invalid.");
  }
  for (const [name, value] of Object.entries(command.environment)) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      typeof value !== "string" ||
      value.includes("\0")
    ) {
      throw new Error("Docker CLI process environment is invalid.");
    }
  }
  if (!(command.input instanceof Uint8Array)) {
    throw new Error("Docker CLI process input must be bytes.");
  }
  if (
    !Number.isSafeInteger(command.maxOutputBytes) ||
    command.maxOutputBytes < 1 ||
    command.maxOutputBytes > 1_048_576
  ) {
    throw new Error("Docker CLI process output limit is invalid.");
  }
}

function emptyResult(
  termination: "timeout" | "output-limit",
): DockerCliCommandResult {
  return {
    termination,
    exitCode: 1,
    stdout: new Uint8Array(),
    combinedOutputBytes: 0,
  };
}

function terminateProcessTree(
  child: ReturnType<typeof spawn>,
): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn(
      "taskkill",
      ["/pid", String(child.pid), "/t", "/f"],
      { shell: false, windowsHide: true, stdio: "ignore" },
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
