import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { checkProject } from "@mensor/compiler";

export type MutationId =
  | "form-action-mismatch"
  | "form-control-codec-mismatch"
  | "form-field-missing"
  | "form-field-unexpected"
  | "form-method-mismatch"
  | "handler-export-missing";

export interface MutationDefinition {
  readonly id: MutationId;
  readonly expectedDiagnosticCodes: readonly string[];
  readonly changedFiles: readonly string[];
}

export interface MutationFileChange {
  readonly file: string;
  readonly beforeSha256: string;
  readonly afterSha256: string;
}

export interface MutationApplication {
  readonly mutationId: MutationId;
  readonly expectedDiagnosticCodes: readonly string[];
  readonly changes: readonly MutationFileChange[];
}

export interface MutationBenchmarkCase extends MutationApplication {
  readonly actualDiagnosticCodes: readonly string[];
  readonly detectionPassed: boolean;
}

export interface MutationBenchmarkReport {
  readonly schemaVersion: 1;
  readonly producerVersion: string;
  readonly cases: readonly MutationBenchmarkCase[];
  readonly summary: {
    readonly caseCount: number;
    readonly detectionPassedCount: number;
    readonly detectionFailedCount: number;
  };
}

const template = "src/features/tasks/views/index.html";
const handler = "src/features/tasks/server/create-task.ts";

export const mutationCatalog: readonly MutationDefinition[] = [
  definition("form-action-mismatch", "form.action_mismatch", template),
  definition("form-control-codec-mismatch", "form.control_codec_mismatch", template),
  definition("form-field-missing", "form.field_missing", template),
  definition("form-field-unexpected", "form.field_unexpected", template),
  definition("form-method-mismatch", "form.method_mismatch", template),
  definition("handler-export-missing", "handler.export_missing", handler),
];

export async function applyMutation(
  root: string,
  mutationId: MutationId,
): Promise<MutationApplication> {
  const definition = mutationCatalog.find((item) => item.id === mutationId);
  if (definition === undefined) {
    throw new Error(`Unknown mutation: ${mutationId}`);
  }

  const changes: MutationFileChange[] = [];
  for (const file of definition.changedFiles) {
    const absoluteFile = path.join(root, ...file.split("/"));
    const before = await readFile(absoluteFile, "utf8");
    const after = mutateSource(mutationId, before);
    await writeFile(absoluteFile, after, "utf8");
    changes.push({
      file,
      beforeSha256: digest(before),
      afterSha256: digest(after),
    });
  }

  return {
    mutationId,
    expectedDiagnosticCodes: definition.expectedDiagnosticCodes,
    changes,
  };
}

export async function runMutationCase(
  root: string,
  mutationId: MutationId,
): Promise<MutationBenchmarkCase> {
  const application = await applyMutation(root, mutationId);
  const result = await checkProject({
    root,
    producerVersion: "0.0.0-mutation-benchmark",
  });
  const actualDiagnosticCodes = result.ok
    ? result.report.diagnostics.map((diagnostic) => diagnostic.code)
    : [result.failure.code];
  return {
    ...application,
    actualDiagnosticCodes,
    detectionPassed: sameStrings(
      application.expectedDiagnosticCodes,
      actualDiagnosticCodes,
    ),
  };
}

export function createMutationBenchmarkReport(
  cases: readonly MutationBenchmarkCase[],
  producerVersion: string,
): MutationBenchmarkReport {
  if (producerVersion.length === 0) {
    throw new Error("Mutation benchmark producer version must not be empty.");
  }
  const sortedCases = [...cases].sort((left, right) =>
    compareText(left.mutationId, right.mutationId),
  );
  const detectionPassedCount = sortedCases.filter(
    (item) => item.detectionPassed,
  ).length;
  return {
    schemaVersion: 1,
    producerVersion,
    cases: sortedCases,
    summary: {
      caseCount: sortedCases.length,
      detectionPassedCount,
      detectionFailedCount: sortedCases.length - detectionPassedCount,
    },
  };
}

function definition(
  id: MutationId,
  diagnosticCode: string,
  file: string,
): MutationDefinition {
  return { id, expectedDiagnosticCodes: [diagnosticCode], changedFiles: [file] };
}

function mutateSource(mutationId: MutationId, source: string): string {
  switch (mutationId) {
    case "form-action-mismatch":
      return replaceExactly(source, 'action="/tasks"', 'action="/wrong-tasks"');
    case "form-control-codec-mismatch":
      return replaceExactly(source, 'name="title" type="text"', 'name="title" type="checkbox"');
    case "form-field-missing":
      return replaceExactly(
        source,
        '        <input name="title" type="text" required="required" />\n',
        "",
      );
    case "form-field-unexpected":
      return replaceExactly(
        source,
        '      <button type="submit">',
        '      <input name="rogue" type="text" />\n      <button type="submit">',
      );
    case "form-method-mismatch":
      return replaceExactly(source, 'method="post"', 'method="get"');
    case "handler-export-missing":
      return replaceExactly(source, "export function createTask", "export function renamedCreateTask");
  }
}

function replaceExactly(source: string, search: string, replacement: string): string {
  const first = source.indexOf(search);
  const last = source.lastIndexOf(search);
  if (first === -1 || first !== last) {
    throw new Error(`Mutation marker must occur exactly once: ${JSON.stringify(search)}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
