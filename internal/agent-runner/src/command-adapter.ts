import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import * as path from "node:path";
import { TextDecoder } from "node:util";

import { parseDiagnosticReport, type DiagnosticReport } from "@mensor/contract";

import type {
  AgentTrialAdapter,
  AgentTrialAdapterResult,
  AgentTrialContext,
} from "@mensor/fixture-kit";

export interface CommandAgentAdapterOptions {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly timeoutMs: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly environment?: Readonly<Record<string, string>>;
}

interface CommandInput {
  readonly schemaVersion: 1;
  readonly mutationId: AgentTrialContext["mutationId"];
  readonly baselineId: AgentTrialContext["baselineId"];
  readonly diagnosticReport: DiagnosticReport;
}

export function createCommandAgentAdapter(
  options: CommandAgentAdapterOptions,
): AgentTrialAdapter {
  const normalized = validateOptions(options);
  return async (context) => runCommand(normalized, context);
}

export function commandSpecificationDigest(
  options: CommandAgentAdapterOptions,
): string {
  const normalized = validateOptions(options);
  return createHash("sha256")
    .update(JSON.stringify(normalized), "utf8")
    .digest("hex");
}

interface ValidatedOptions {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly environment: Readonly<Record<string, string>>;
}

function validateOptions(options: CommandAgentAdapterOptions): ValidatedOptions {
  if (!path.isAbsolute(options.executable) || options.executable.includes("\0")) {
    throw new Error("Agent command executable must be an absolute path without NUL bytes.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 300_000) {
    throw new Error("Agent command timeout must be an integer from 1 to 300000 milliseconds.");
  }
  if (
    !Number.isSafeInteger(options.maxInputBytes) ||
    options.maxInputBytes < 1 ||
    options.maxInputBytes > 65_536
  ) {
    throw new Error("Agent command input limit must be an integer from 1 to 65536 bytes.");
  }
  if (
    !Number.isSafeInteger(options.maxOutputBytes) ||
    options.maxOutputBytes < 1 ||
    options.maxOutputBytes > 1_048_576
  ) {
    throw new Error("Agent command output limit must be an integer from 1 to 1048576 bytes.");
  }
  const args = [...(options.args ?? [])];
  if (args.some((value) => value.includes("\0"))) {
    throw new Error("Agent command arguments must not contain NUL bytes.");
  }
  const environment = Object.fromEntries(
    Object.entries(options.environment ?? {}).sort(([left], [right]) => compareText(left, right)),
  );
  for (const [name, value] of Object.entries(environment)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || value.includes("\0")) {
      throw new Error("Agent command environment entries must use safe names and values.");
    }
  }
  return {
    executable: options.executable,
    args,
    timeoutMs: options.timeoutMs,
    maxInputBytes: options.maxInputBytes,
    maxOutputBytes: options.maxOutputBytes,
    environment,
  };
}

async function runCommand(
  options: ValidatedOptions,
  context: AgentTrialContext,
): Promise<AgentTrialAdapterResult> {
  const diagnosticReport = validateContextReport(context);
  const input: CommandInput = {
    schemaVersion: 1,
    mutationId: context.mutationId,
    baselineId: context.baselineId,
    diagnosticReport,
  };
  const inputText = `${JSON.stringify(input)}\n`;
  if (Buffer.byteLength(inputText, "utf8") > options.maxInputBytes) {
    throw new Error("Agent command input exceeded its input limit.");
  }
  const child = spawn(options.executable, options.args, {
    cwd: context.root,
    env: { ...options.environment },
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  let outputBytes = 0;
  let terminationReason: "output-limit" | "timeout" | null = null;

  const completion = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
    const capture = (chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > options.maxOutputBytes && terminationReason === null) {
        terminationReason = "output-limit";
        terminateProcessTree(child);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      capture(chunk);
      if (terminationReason === null) {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", capture);
  });

  const timeout = setTimeout(() => {
    if (terminationReason === null) {
      terminationReason = "timeout";
      terminateProcessTree(child);
    }
  }, options.timeoutMs);
  timeout.unref();

  child.stdin.end(inputText, "utf8");
  const exitCode = await completion.finally(() => clearTimeout(timeout));
  if (terminationReason === "timeout") {
    throw new Error("Agent command exceeded its timeout.");
  }
  if (terminationReason === "output-limit") {
    throw new Error("Agent command exceeded its output limit.");
  }
  if (exitCode !== 0) {
    throw new Error("Agent command exited unsuccessfully.");
  }
  return parseOutput(Buffer.concat(stdout));
}

function validateContextReport(context: AgentTrialContext): DiagnosticReport {
  const parsed = parseDiagnosticReport(JSON.stringify(context.diagnosticReport));
  if (!parsed.ok) {
    throw new Error("Agent command diagnostic report does not satisfy its contract.");
  }
  const reportCodes = parsed.value.diagnostics.map((diagnostic) => diagnostic.code);
  if (!sameStrings(reportCodes, context.diagnosticCodes)) {
    throw new Error("Agent command diagnostic report does not match its diagnostic codes.");
  }
  if (parsed.value.status !== "failed" || parsed.value.diagnostics.length === 0) {
    throw new Error("Agent command requires a failing diagnostic report.");
  }
  return parsed.value;
}

function parseOutput(bytes: Buffer): AgentTrialAdapterResult {
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new Error("Agent command output must be one valid UTF-8 JSON document.");
  }
  if (!isPlainObject(value)) {
    throw new Error("Agent command output must be a JSON object.");
  }
  const keys = Object.keys(value).sort(compareText);
  if (keys.length !== 2 || keys[0] !== "rounds" || keys[1] !== "schemaVersion") {
    throw new Error("Agent command output contains unsupported fields.");
  }
  const schemaVersion = value["schemaVersion"];
  const rounds = value["rounds"];
  if (
    schemaVersion !== 1 ||
    typeof rounds !== "number" ||
    !Number.isSafeInteger(rounds) ||
    rounds < 1
  ) {
    throw new Error("Agent command output has an invalid schema version or round count.");
  }
  return { rounds };
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    child.kill("SIGKILL");
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
    const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], {
      env: { SystemRoot: systemRoot },
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
