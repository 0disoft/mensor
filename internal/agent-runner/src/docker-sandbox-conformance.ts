import { createHash } from "node:crypto";

import {
  validateDockerSandboxCollectorRef,
  type DockerSandboxCollectorRef,
} from "./docker-sandbox-attestation.js";
import {
  createDockerSandboxPlan,
  dockerSandboxPlanDigest,
  type DockerSandboxPlan,
} from "./docker-sandbox-plan.js";
import {
  runDockerSandbox,
  type DockerSandboxExecutionPort,
} from "./docker-sandbox-runner.js";

export const dockerSandboxConformanceCaseIds = [
  "success",
  "timeout",
  "output-limit",
  "nonzero-exit",
] as const;

export type DockerSandboxConformanceCaseId =
  (typeof dockerSandboxConformanceCaseIds)[number];

export interface DockerSandboxConformanceReport {
  readonly schemaVersion: 1;
  readonly contractId: "docker-sandbox-execution-port/v1";
  readonly adapter: DockerSandboxCollectorRef;
  readonly probe: {
    readonly protocol: "mensor-docker-conformance/v1";
    readonly image: string;
    readonly executable: string;
    readonly basePlanSha256: string;
    readonly successOutputSha256: string;
  };
  readonly cases: readonly {
    readonly id: DockerSandboxConformanceCaseId;
    readonly planSha256: string;
    readonly passed: boolean;
  }[];
  readonly summary: {
    readonly caseCount: 4;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly conformant: boolean;
  };
}

export interface RunDockerSandboxConformanceOptions {
  readonly adapter: DockerSandboxCollectorRef;
  readonly collector: DockerSandboxCollectorRef;
  readonly plan: DockerSandboxPlan;
  readonly workspaceRoot: string;
  readonly input: Uint8Array;
  readonly expectedSuccessOutput: Uint8Array;
  readonly port: DockerSandboxExecutionPort;
  readonly cleanupTimeoutMs?: number;
}

export async function runDockerSandboxConformance(
  options: RunDockerSandboxConformanceOptions,
): Promise<DockerSandboxConformanceReport> {
  const adapter = validateDockerSandboxCollectorRef(options.adapter);
  validateDockerSandboxCollectorRef(options.collector);
  dockerSandboxPlanDigest(options.plan);
  if (!(options.input instanceof Uint8Array)) {
    throw new Error("Docker conformance input must be bytes.");
  }
  if (!(options.expectedSuccessOutput instanceof Uint8Array)) {
    throw new Error("Docker conformance expected output must be bytes.");
  }
  const expectedSuccessOutput = new Uint8Array(options.expectedSuccessOutput);
  const cases = [];
  for (const id of dockerSandboxConformanceCaseIds) {
    const plan = conformancePlan(options.plan, id);
    const lifecycle = instrumentPort(options.port);
    let behaviorPassed = false;
    try {
      const result = await runDockerSandbox({
        plan,
        collector: options.collector,
        workspaceRoot: options.workspaceRoot,
        input: options.input,
        port: lifecycle.port,
        ...(options.cleanupTimeoutMs === undefined
          ? {}
          : { cleanupTimeoutMs: options.cleanupTimeoutMs }),
      });
      behaviorPassed = id === "success" && bytesEqual(
        result.stdout,
        expectedSuccessOutput,
      );
    } catch (error) {
      behaviorPassed = expectedFailure(id, error);
    }
    cases.push({
      id,
      planSha256: dockerSandboxPlanDigest(plan),
      passed: behaviorPassed && lifecycle.createdCount() === 1 && lifecycle.removedCount() === 1,
    });
  }
  return createDockerSandboxConformanceReport({
    adapter,
    plan: options.plan,
    expectedSuccessOutput,
    cases,
  });
}

export function parseDockerSandboxConformanceReport(
  text: string,
): DockerSandboxConformanceReport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Docker conformance report must contain valid JSON.");
  }
  return validateDockerSandboxConformanceReport(value);
}

export function serializeDockerSandboxConformanceReport(
  report: DockerSandboxConformanceReport,
): string {
  return `${JSON.stringify(validateDockerSandboxConformanceReport(report), null, 2)}\n`;
}

export function dockerSandboxConformanceReportDigest(
  report: DockerSandboxConformanceReport,
): string {
  return createHash("sha256")
    .update(serializeDockerSandboxConformanceReport(report), "utf8")
    .digest("hex");
}

export function validateDockerSandboxConformanceReport(
  value: unknown,
): DockerSandboxConformanceReport {
  const report = requireRecord(value, "Docker conformance report");
  requireKeys(report, ["schemaVersion", "contractId", "adapter", "probe", "cases", "summary"]);
  requireConstant(report["schemaVersion"], 1, "schemaVersion");
  requireConstant(report["contractId"], "docker-sandbox-execution-port/v1", "contractId");
  const adapter = validateDockerSandboxCollectorRef(report["adapter"]);
  const probe = requireRecord(report["probe"], "probe");
  requireKeys(probe, [
    "protocol", "image", "executable", "basePlanSha256", "successOutputSha256",
  ]);
  requireConstant(probe["protocol"], "mensor-docker-conformance/v1", "probe.protocol");
  const image = requireImageReference(probe["image"]);
  const executable = requireAbsolutePosixPath(probe["executable"]);
  const basePlanSha256 = requireDigest(probe["basePlanSha256"], "probe.basePlanSha256");
  const successOutputSha256 = requireDigest(
    probe["successOutputSha256"],
    "probe.successOutputSha256",
  );
  if (!Array.isArray(report["cases"]) || report["cases"].length !== 4) {
    throw new Error("Docker conformance report must contain every required case.");
  }
  const cases = report["cases"].map((item, index) => {
    const record = requireRecord(item, `cases[${index}]`);
    requireKeys(record, ["id", "planSha256", "passed"]);
    const expectedId = dockerSandboxConformanceCaseIds[index];
    if (expectedId === undefined) {
      throw new Error("Docker conformance case index is unsupported.");
    }
    return {
      id: requireConstant(record["id"], expectedId, `cases[${index}].id`),
      planSha256: requireDigest(record["planSha256"], `cases[${index}].planSha256`),
      passed: requireBoolean(record["passed"], `cases[${index}].passed`),
    };
  });
  const summary = requireRecord(report["summary"], "summary");
  requireKeys(summary, ["caseCount", "passedCount", "failedCount", "conformant"]);
  const passedCount = cases.filter((item) => item.passed).length;
  const canonical: DockerSandboxConformanceReport = {
    schemaVersion: 1,
    contractId: "docker-sandbox-execution-port/v1",
    adapter,
    probe: {
      protocol: "mensor-docker-conformance/v1",
      image,
      executable,
      basePlanSha256,
      successOutputSha256,
    },
    cases,
    summary: {
      caseCount: 4,
      passedCount,
      failedCount: 4 - passedCount,
      conformant: passedCount === 4,
    },
  };
  if (JSON.stringify(value) !== JSON.stringify(canonical)) {
    throw new Error("Docker conformance report must match canonical derived fields and ordering.");
  }
  return canonical;
}

function createDockerSandboxConformanceReport(options: {
  readonly adapter: DockerSandboxCollectorRef;
  readonly plan: DockerSandboxPlan;
  readonly expectedSuccessOutput: Uint8Array;
  readonly cases: DockerSandboxConformanceReport["cases"];
}): DockerSandboxConformanceReport {
  const passedCount = options.cases.filter((item) => item.passed).length;
  return validateDockerSandboxConformanceReport({
    schemaVersion: 1,
    contractId: "docker-sandbox-execution-port/v1",
    adapter: options.adapter,
    probe: {
      protocol: "mensor-docker-conformance/v1",
      image: options.plan.image,
      executable: options.plan.agent.executable,
      basePlanSha256: dockerSandboxPlanDigest(options.plan),
      successOutputSha256: digestBytes(options.expectedSuccessOutput),
    },
    cases: options.cases,
    summary: {
      caseCount: 4,
      passedCount,
      failedCount: 4 - passedCount,
      conformant: passedCount === 4,
    },
  });
}

function conformancePlan(
  plan: DockerSandboxPlan,
  id: DockerSandboxConformanceCaseId,
): DockerSandboxPlan {
  return createDockerSandboxPlan({
    dockerExecutable: plan.dockerExecutable,
    image: plan.image,
    agentExecutable: plan.agent.executable,
    agentArgs: ["mensor-docker-conformance/v1", id],
    ...plan.limits,
  });
}

function instrumentPort(port: DockerSandboxExecutionPort): {
  readonly port: DockerSandboxExecutionPort;
  readonly createdCount: () => number;
  readonly removedCount: () => number;
} {
  let created = 0;
  let removed = 0;
  return {
    port: {
      async create(plan, workspaceRoot, signal) {
        const handle = await port.create(plan, workspaceRoot, signal);
        created += 1;
        return handle;
      },
      inspect: (handle, signal) => port.inspect(handle, signal),
      start: (handle, input, signal) => port.start(handle, input, signal),
      async remove(handle, signal) {
        removed += 1;
        await port.remove(handle, signal);
      },
    },
    createdCount: () => created,
    removedCount: () => removed,
  };
}

function expectedFailure(id: DockerSandboxConformanceCaseId, error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  switch (id) {
    case "timeout":
      return error.message === "Docker sandbox execution exceeded its timeout.";
    case "output-limit":
      return error.message === "Docker sandbox execution exceeded its output limit.";
    case "nonzero-exit":
      return error.message === "Docker sandbox execution exited unsuccessfully.";
    case "success":
      return false;
  }
}

function digestBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (JSON.stringify(Object.keys(value).sort(compareText)) !== JSON.stringify([...expected].sort(compareText))) {
    throw new Error("Docker conformance report contains unsupported or missing fields.");
  }
}

function requireConstant<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} has an unsupported value.`);
  }
  return expected;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be boolean.`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireImageReference(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("probe.image must use an immutable lowercase SHA-256 digest.");
  }
  return value;
}

function requireAbsolutePosixPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) {
    throw new Error("probe.executable must be an absolute POSIX path without NUL.");
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
