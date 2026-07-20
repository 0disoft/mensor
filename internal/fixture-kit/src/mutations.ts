import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { checkProject } from "@0disoft/mensor-compiler";
import type { DiagnosticReport } from "@0disoft/mensor-contract";
import { withWorkspaceLease } from "./workspace-lease.js";

export type MutationId =
  | "browser-commonjs-server-require"
  | "browser-direct-server-import"
  | "browser-dynamic-import"
  | "browser-transitive-server-import"
  | "dogfood-form-field-missing"
  | "dogfood-disabled-fieldset"
  | "dogfood-repeated-scalar-control"
  | "form-action-mismatch"
  | "form-control-codec-mismatch"
  | "form-field-missing"
  | "form-field-unexpected"
  | "form-method-mismatch"
  | "handler-export-missing"
  | "handler-type-only-export"
  | "ownership-i18n-outside-feature"
  | "ownership-test-outside-slot"
  | "route-direct-database-import";

export const mutationBaselineIds = [
  "dogfood-tasks",
  "layered-tasks",
  "tiny-tasks",
] as const;

export type MutationBaselineId = (typeof mutationBaselineIds)[number];

export interface MutationDefinition {
  readonly id: MutationId;
  readonly baselineId: MutationBaselineId;
  readonly expectedDiagnosticCodes: readonly string[];
  readonly changedFiles: readonly string[];
}

export interface MutationFileChange {
  readonly file: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
}

export interface MutationApplication {
  readonly mutationId: MutationId;
  readonly baselineId: MutationBaselineId;
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

export interface MutationCheckResult {
  readonly benchmarkCase: MutationBenchmarkCase;
  readonly diagnosticReport: DiagnosticReport | null;
}

const template = "src/features/tasks/views/index.html";
const handler = "src/features/tasks/server/create-task.ts";
const browser = "src/features/tasks/browser/app.ts";
const shared = "src/features/tasks/shared/task.ts";
const route = "src/features/tasks/routes/create.ts";
const ownedTest = "src/features/tasks/tests/create.test.ts";
const misplacedTest = "src/features/tasks/create.test.ts";
const ownedMessages = "src/features/tasks/i18n/tasks.messages.json";
const unownedMessages = "src/translations/tasks.messages.json";

export const mutationCatalog: readonly MutationDefinition[] = [
  definition("browser-commonjs-server-require", "module.boundary_violation", "layered-tasks", browser),
  definition("browser-direct-server-import", "module.boundary_violation", "layered-tasks", browser),
  definition("browser-dynamic-import", "module.dynamic_import_unsupported", "layered-tasks", browser),
  definition("browser-transitive-server-import", "module.boundary_violation", "layered-tasks", shared),
  definition("dogfood-disabled-fieldset", "form.field_missing", "dogfood-tasks", template),
  definition("dogfood-form-field-missing", "form.field_missing", "dogfood-tasks", template),
  definition("dogfood-repeated-scalar-control", "form.control_codec_mismatch", "dogfood-tasks", template),
  definition("form-action-mismatch", "form.action_mismatch", "tiny-tasks", template),
  definition("form-control-codec-mismatch", "form.control_codec_mismatch", "tiny-tasks", template),
  definition("form-field-missing", "form.field_missing", "tiny-tasks", template),
  definition("form-field-unexpected", "form.field_unexpected", "tiny-tasks", template),
  definition("form-method-mismatch", "form.method_mismatch", "tiny-tasks", template),
  definition("handler-export-missing", "handler.export_missing", "tiny-tasks", handler),
  definition("handler-type-only-export", "handler.export_missing", "tiny-tasks", handler),
  definition(
    "ownership-i18n-outside-feature",
    "file.ownership_mismatch",
    "layered-tasks",
    ownedMessages,
    unownedMessages,
  ),
  definition(
    "ownership-test-outside-slot",
    "file.ownership_mismatch",
    "layered-tasks",
    ownedTest,
    misplacedTest,
  ),
  definition("route-direct-database-import", "module.boundary_violation", "layered-tasks", route),
];

export async function applyMutation(
  root: string,
  mutationId: MutationId,
): Promise<MutationApplication> {
  return withWorkspaceLease(root, () => applyMutationInLeasedWorkspace(root, mutationId));
}

export async function applyMutationInLeasedWorkspace(
  root: string,
  mutationId: MutationId,
): Promise<MutationApplication> {
  const definition = mutationCatalog.find((item) => item.id === mutationId);
  if (definition === undefined) {
    throw new Error(`Unknown mutation: ${mutationId}`);
  }

  if (
    mutationId === "ownership-i18n-outside-feature" ||
    mutationId === "ownership-test-outside-slot"
  ) {
    return applyMoveMutation(root, definition);
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
    baselineId: definition.baselineId,
    expectedDiagnosticCodes: definition.expectedDiagnosticCodes,
    changes,
  };
}

export async function runMutationCase(
  root: string,
  mutationId: MutationId,
): Promise<MutationBenchmarkCase> {
  return (await runMutationCheck(root, mutationId)).benchmarkCase;
}

export async function runMutationCheck(
  root: string,
  mutationId: MutationId,
): Promise<MutationCheckResult> {
  return withWorkspaceLease(root, () => runMutationCheckInLeasedWorkspace(root, mutationId));
}

export async function runMutationCheckInLeasedWorkspace(
  root: string,
  mutationId: MutationId,
): Promise<MutationCheckResult> {
  const application = await applyMutationInLeasedWorkspace(root, mutationId);
  const result = await checkProject({
    root,
    producerVersion: "0.0.0-mutation-benchmark",
  });
  const actualDiagnosticCodes = result.ok
    ? result.report.diagnostics.map((diagnostic) => diagnostic.code)
    : [result.failure.code];
  return {
    benchmarkCase: {
      ...application,
      actualDiagnosticCodes,
      detectionPassed: sameStrings(
        application.expectedDiagnosticCodes,
        actualDiagnosticCodes,
      ),
    },
    diagnosticReport: result.ok ? result.report : null,
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
  baselineId: MutationBaselineId,
  ...changedFiles: readonly string[]
): MutationDefinition {
  return { id, baselineId, expectedDiagnosticCodes: [diagnosticCode], changedFiles };
}

function mutateSource(mutationId: MutationId, source: string): string {
  switch (mutationId) {
    case "browser-commonjs-server-require":
      return replaceExactly(
        source,
        "void taskLabel;",
        'void taskLabel;\nconst secret = require("../server/secret.js");\nvoid secret;',
      );
    case "browser-direct-server-import":
      return replaceExactly(
        source,
        'import { taskLabel } from "../shared/task.js";',
        'import { taskLabel } from "../shared/task.js";\nimport type { ServerSecret } from "../server/secret.js";\n\nvoid (undefined as ServerSecret | undefined);',
      );
    case "browser-dynamic-import":
      return replaceExactly(
        source,
        "void taskLabel;",
        'void taskLabel;\nconst runtimeTarget = "../server/secret.js";\nvoid import(runtimeTarget);',
      );
    case "browser-transitive-server-import":
      return replaceExactly(
        source,
        'export const taskLabel = "tasks";',
        'import type { ServerSecret } from "../server/secret.js";\n\nexport const taskLabel: ServerSecret | string = "tasks";',
      );
    case "form-action-mismatch":
      return replaceExactly(
        source,
        '<form id="create-task" method="post">',
        '<form id="create-task" method="post" action="/wrong-tasks">',
      );
    case "form-control-codec-mismatch":
      return replaceExactly(source, 'name="title" type="text"', 'name="title" type="checkbox"');
    case "dogfood-form-field-missing":
      return replaceExactly(
        source,
        '          <input name="title" type="text" required="required" maxlength="120" />\n',
        "",
      );
    case "dogfood-disabled-fieldset":
      return replaceExactly(
        source,
        '          <input name="title" type="text" required="required" maxlength="120" />',
        '          <fieldset disabled>\n            <input name="title" type="text" required="required" maxlength="120" />\n          </fieldset>',
      );
    case "dogfood-repeated-scalar-control":
      return replaceExactly(
        source,
        '          <input name="title" type="text" required="required" maxlength="120" />',
        '          <input name="title" type="text" required="required" maxlength="120" />\n          <input name="title" type="text" />',
      );
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
    case "handler-type-only-export":
      return replaceExactly(
        source,
        "export function createTask(): void {\n  // Synthetic fixture handler. The compiler must discover, not execute, it.\n}\n",
        "export type createTask = () => void;\n",
      );
    case "ownership-i18n-outside-feature":
    case "ownership-test-outside-slot":
      throw new Error(`Move mutation cannot be applied as source replacement: ${mutationId}`);
    case "route-direct-database-import":
      return replaceExactly(
        source,
        'import { createTask } from "../server/create-task.js";',
        'import { createTask } from "../server/create-task.js";\nimport { db } from "../database/client.js";\n\nvoid db;',
      );
  }
}

async function applyMoveMutation(
  root: string,
  definition: MutationDefinition,
): Promise<MutationApplication> {
  const [sourceFile, destinationFile] = definition.changedFiles;
  if (sourceFile === undefined || destinationFile === undefined) {
    throw new Error(`Move mutation requires source and destination: ${definition.id}`);
  }
  const source = path.join(root, ...sourceFile.split("/"));
  const destination = path.join(root, ...destinationFile.split("/"));
  const bytes = await readFile(source);
  await assertFileMissing(destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(source, destination);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    mutationId: definition.id,
    baselineId: definition.baselineId,
    expectedDiagnosticCodes: definition.expectedDiagnosticCodes,
    changes: [
      { file: sourceFile, beforeSha256: sha256, afterSha256: null },
      { file: destinationFile, beforeSha256: null, afterSha256: sha256 },
    ],
  };
}

async function assertFileMissing(file: string): Promise<void> {
  try {
    await readFile(file);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`Mutation destination already exists: ${file}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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
