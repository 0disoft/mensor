import * as path from "node:path";

import type { SourcePosition, SourceRange } from "@mensor/contract";

import { compareText } from "./paths.js";
import {
  FormIndexFailure,
  type DocumentInspection,
  type DynamicReason,
  type FormActionEvidence,
  type FormDocumentFact,
  type FormIndex,
  type IndexedControlFact,
  type IndexedEvidence,
  type IndexedFormFact,
  type UnsupportedReason,
} from "./form-index-types.js";

const dynamicReasons = new Set<DynamicReason>([
  "computed-attribute",
  "conditional-presence",
  "custom-helper-semantics",
  "dynamic-interpolation",
  "repeated-generation",
]);

const unsupportedReasons = new Set<UnsupportedReason>([
  "provider-resource-limit",
  "unsupported-control-kind",
]);

const windowsReservedName = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function canonicalizeFormIndex(value: unknown): FormIndex {
  const root = objectValue(value, "");
  exactKeys(root, "", ["schemaVersion", "producer", "documents"]);
  if (root["schemaVersion"] !== 1) {
    fail("form_index.shape_invalid", "/schemaVersion", "schemaVersion must be 1.");
  }

  const producer = objectValue(root["producer"], "/producer");
  exactKeys(producer, "/producer", ["name", "version"]);
  const producerName = identifierValue(producer["name"], "/producer/name");
  const producerVersion = versionValue(producer["version"], "/producer/version");

  const rawDocuments = arrayValue(root["documents"], "/documents");
  const documents = rawDocuments
    .map((document, index) => documentValue(document, `/documents/${index}`))
    .sort((left, right) => compareText(left.path, right.path));
  rejectDuplicateDocuments(documents);

  return {
    schemaVersion: 1,
    producer: {
      name: producerName,
      version: producerVersion,
    },
    documents,
  };
}

function documentValue(value: unknown, instancePath: string): FormDocumentFact {
  const document = objectValue(value, instancePath);
  exactKeys(document, instancePath, [
    "path",
    "contentDigest",
    "sourceKind",
    "inspection",
    "forms",
  ]);
  const documentPath = relativePosixPathValue(
    document["path"],
    `${instancePath}/path`,
  );
  const contentDigest = digestValue(
    document["contentDigest"],
    `${instancePath}/contentDigest`,
  );
  const sourceKind = identifierValue(
    document["sourceKind"],
    `${instancePath}/sourceKind`,
  );
  const inspection = inspectionValue(
    document["inspection"],
    `${instancePath}/inspection`,
  );
  const rawForms = arrayValue(document["forms"], `${instancePath}/forms`);
  const forms = rawForms
    .map((form, index) => formValue(form, `${instancePath}/forms/${index}`))
    .sort((left, right) => compareRanges(left.range, right.range));
  rejectDuplicateRanges(forms, `${instancePath}/forms`, "form");

  return {
    path: documentPath,
    contentDigest,
    sourceKind,
    inspection,
    forms,
  };
}

function inspectionValue(
  value: unknown,
  instancePath: string,
): DocumentInspection {
  const inspection = objectValue(value, instancePath);
  const state = stringValue(inspection["state"], `${instancePath}/state`);
  if (state === "complete") {
    exactKeys(inspection, instancePath, ["state"]);
    return { state: "complete" };
  }
  if (state !== "incomplete") {
    fail(
      "form_index.shape_invalid",
      `${instancePath}/state`,
      "inspection state must be complete or incomplete.",
    );
  }
  exactKeys(inspection, instancePath, ["state", "reason"], ["range"]);
  const reason = unresolvedReasonValue(
    inspection["reason"],
    `${instancePath}/reason`,
  );
  const range = optionalRangeValue(inspection["range"], `${instancePath}/range`);
  return range === undefined
    ? { state: "incomplete", reason }
    : { state: "incomplete", reason, range };
}

function formValue(value: unknown, instancePath: string): IndexedFormFact {
  const form = objectValue(value, instancePath);
  exactKeys(form, instancePath, [
    "identity",
    "method",
    "action",
    "range",
    "controls",
  ]);
  const range = rangeValue(form["range"], `${instancePath}/range`);
  const rawControls = arrayValue(form["controls"], `${instancePath}/controls`);
  const controls = rawControls
    .map((control, index) =>
      controlValue(control, `${instancePath}/controls/${index}`),
    )
    .sort((left, right) => compareRanges(left.range, right.range));
  rejectDuplicateRanges(controls, `${instancePath}/controls`, "control");

  return {
    identity: evidenceValue(
      form["identity"],
      `${instancePath}/identity`,
      nonEmptyStringValue,
    ),
    method: evidenceValue(
      form["method"],
      `${instancePath}/method`,
      (entry, entryPath) => enumValue(entry, entryPath, ["get", "post"]),
    ),
    action: actionValue(form["action"], `${instancePath}/action`),
    range,
    controls,
  };
}

function controlValue(
  value: unknown,
  instancePath: string,
): IndexedControlFact {
  const control = objectValue(value, instancePath);
  exactKeys(control, instancePath, [
    "name",
    "controlKind",
    "inputType",
    "multiplicity",
    "successful",
    "range",
  ]);
  return {
    name: evidenceValue(
      control["name"],
      `${instancePath}/name`,
      nonEmptyStringValue,
    ),
    controlKind: evidenceValue(
      control["controlKind"],
      `${instancePath}/controlKind`,
      (entry, entryPath) =>
        enumValue(entry, entryPath, ["button", "input", "select", "textarea"]),
    ),
    inputType: evidenceValue(
      control["inputType"],
      `${instancePath}/inputType`,
      stringValue,
    ),
    multiplicity: evidenceValue(
      control["multiplicity"],
      `${instancePath}/multiplicity`,
      (entry, entryPath) =>
        enumValue(entry, entryPath, [
          "mutually-exclusive",
          "repeated",
          "scalar",
        ]),
    ),
    successful: evidenceValue(
      control["successful"],
      `${instancePath}/successful`,
      booleanValue,
    ),
    range: rangeValue(control["range"], `${instancePath}/range`),
  };
}

function actionValue(value: unknown, instancePath: string): FormActionEvidence {
  const action = objectValue(value, instancePath);
  if (action["state"] === "current-document") {
    exactKeys(action, instancePath, ["state", "range"]);
    return {
      state: "current-document",
      range: rangeValue(action["range"], `${instancePath}/range`),
    };
  }
  return evidenceValue(value, instancePath, nonEmptyStringValue);
}

function evidenceValue<T>(
  value: unknown,
  instancePath: string,
  knownValue: (value: unknown, instancePath: string) => T,
): IndexedEvidence<T> {
  const evidence = objectValue(value, instancePath);
  const state = stringValue(evidence["state"], `${instancePath}/state`);
  if (state === "known") {
    exactKeys(evidence, instancePath, ["state", "value", "range"]);
    return {
      state: "known",
      value: knownValue(evidence["value"], `${instancePath}/value`),
      range: rangeValue(evidence["range"], `${instancePath}/range`),
    };
  }
  if (state === "absent") {
    exactKeys(evidence, instancePath, ["state"], ["range"]);
    const range = optionalRangeValue(evidence["range"], `${instancePath}/range`);
    return range === undefined
      ? { state: "absent" }
      : { state: "absent", range };
  }
  if (state === "dynamic") {
    exactKeys(evidence, instancePath, ["state", "reason", "range"]);
    return {
      state: "dynamic",
      reason: dynamicReasonValue(evidence["reason"], `${instancePath}/reason`),
      range: rangeValue(evidence["range"], `${instancePath}/range`),
    };
  }
  if (state === "unsupported") {
    exactKeys(evidence, instancePath, ["state", "reason", "range"]);
    return {
      state: "unsupported",
      reason: unsupportedReasonValue(
        evidence["reason"],
        `${instancePath}/reason`,
      ),
      range: rangeValue(evidence["range"], `${instancePath}/range`),
    };
  }
  fail(
    "form_index.shape_invalid",
    `${instancePath}/state`,
    "evidence state is not supported.",
  );
}

function rangeValue(value: unknown, instancePath: string): SourceRange {
  const range = objectValue(value, instancePath);
  exactKeys(range, instancePath, ["start", "end"]);
  const start = positionValue(range["start"], `${instancePath}/start`);
  const end = positionValue(range["end"], `${instancePath}/end`);
  if (comparePositions(start, end) > 0) {
    fail(
      "form_index.range_invalid",
      instancePath,
      "range start must not follow range end.",
    );
  }
  return { start, end };
}

function optionalRangeValue(
  value: unknown,
  instancePath: string,
): SourceRange | undefined {
  return value === undefined ? undefined : rangeValue(value, instancePath);
}

function positionValue(value: unknown, instancePath: string): SourcePosition {
  const position = objectValue(value, instancePath);
  exactKeys(position, instancePath, ["line", "character"]);
  return {
    line: nonNegativeIntegerValue(position["line"], `${instancePath}/line`),
    character: nonNegativeIntegerValue(
      position["character"],
      `${instancePath}/character`,
    ),
  };
}

function relativePosixPathValue(value: unknown, instancePath: string): string {
  const candidate = stringValue(value, instancePath);
  if (
    candidate.length === 0 ||
    candidate.includes("\\") ||
    path.posix.isAbsolute(candidate) ||
    /^[a-z]:/iu.test(candidate) ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    fail(
      "form_index.path_invalid",
      instancePath,
      "path must be a non-empty project-relative POSIX path.",
    );
  }
  const segments = candidate.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":") ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        windowsReservedName.test(segment),
    )
  ) {
    fail(
      "form_index.path_invalid",
      instancePath,
      "path contains a non-portable or root-escaping segment.",
    );
  }
  return candidate;
}

function digestValue(value: unknown, instancePath: string) {
  const digest = stringValue(value, instancePath);
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    fail(
      "form_index.digest_invalid",
      instancePath,
      "contentDigest must be a lowercase SHA-256 digest.",
    );
  }
  return digest as FormDocumentFact["contentDigest"];
}

function identifierValue(value: unknown, instancePath: string): string {
  const identifier = stringValue(value, instancePath);
  if (!/^[a-z0-9](?:[a-z0-9._/-]{0,127})$/u.test(identifier)) {
    fail(
      "form_index.shape_invalid",
      instancePath,
      "identifier must use lowercase ASCII letters, digits, dot, underscore, slash, or hyphen.",
    );
  }
  return identifier;
}

function versionValue(value: unknown, instancePath: string): string {
  const version = stringValue(value, instancePath);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._+-]{0,127})$/u.test(version)) {
    fail(
      "form_index.shape_invalid",
      instancePath,
      "producer version is not a stable printable identifier.",
    );
  }
  return version;
}

function dynamicReasonValue(value: unknown, instancePath: string): DynamicReason {
  const reason = stringValue(value, instancePath);
  if (!dynamicReasons.has(reason as DynamicReason)) {
    fail("form_index.shape_invalid", instancePath, "dynamic reason is not supported.");
  }
  return reason as DynamicReason;
}

function unsupportedReasonValue(
  value: unknown,
  instancePath: string,
): UnsupportedReason {
  const reason = stringValue(value, instancePath);
  if (!unsupportedReasons.has(reason as UnsupportedReason)) {
    fail(
      "form_index.shape_invalid",
      instancePath,
      "unsupported reason is not supported.",
    );
  }
  return reason as UnsupportedReason;
}

function unresolvedReasonValue(
  value: unknown,
  instancePath: string,
): DynamicReason | UnsupportedReason {
  const reason = stringValue(value, instancePath);
  if (
    !dynamicReasons.has(reason as DynamicReason) &&
    !unsupportedReasons.has(reason as UnsupportedReason)
  ) {
    fail(
      "form_index.shape_invalid",
      instancePath,
      "incomplete inspection reason is not supported.",
    );
  }
  return reason as DynamicReason | UnsupportedReason;
}

function objectValue(
  value: unknown,
  instancePath: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail("form_index.shape_invalid", instancePath, "value must be a plain object.");
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, instancePath: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail("form_index.shape_invalid", instancePath, "value must be an array.");
  }
  return value;
}

function stringValue(value: unknown, instancePath: string): string {
  if (typeof value !== "string") {
    fail("form_index.shape_invalid", instancePath, "value must be a string.");
  }
  return value;
}

function nonEmptyStringValue(value: unknown, instancePath: string): string {
  const text = stringValue(value, instancePath);
  if (text.length === 0) {
    fail("form_index.shape_invalid", instancePath, "value must not be empty.");
  }
  return text;
}

function booleanValue(value: unknown, instancePath: string): boolean {
  if (typeof value !== "boolean") {
    fail("form_index.shape_invalid", instancePath, "value must be a boolean.");
  }
  return value;
}

function nonNegativeIntegerValue(value: unknown, instancePath: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(
      "form_index.range_invalid",
      instancePath,
      "position component must be a non-negative safe integer.",
    );
  }
  return value as number;
}

function enumValue<const T extends string>(
  value: unknown,
  instancePath: string,
  allowed: readonly T[],
): T {
  const text = stringValue(value, instancePath);
  if (!allowed.includes(text as T)) {
    fail("form_index.shape_invalid", instancePath, "value is not supported.");
  }
  return text as T;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  instancePath: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(
        "form_index.shape_invalid",
        `${instancePath}/${key}`,
        "property is not allowed.",
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      fail(
        "form_index.shape_invalid",
        `${instancePath}/${key}`,
        "required property is missing.",
      );
    }
  }
}

function rejectDuplicateDocuments(documents: readonly FormDocumentFact[]): void {
  const exact = new Set<string>();
  const folded = new Map<string, string>();
  for (const [index, document] of documents.entries()) {
    const key = document.path.toLocaleLowerCase("en-US");
    if (exact.has(document.path) || folded.has(key)) {
      fail(
        "form_index.duplicate",
        `/documents/${index}/path`,
        `document path collides with ${folded.get(key) ?? document.path}.`,
      );
    }
    exact.add(document.path);
    folded.set(key, document.path);
  }
}

function rejectDuplicateRanges<T extends { readonly range: SourceRange }>(
  values: readonly T[],
  instancePath: string,
  label: string,
): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      compareRanges(previous.range, current.range) === 0
    ) {
      fail(
        "form_index.duplicate",
        `${instancePath}/${index}/range`,
        `${label} range is duplicated.`,
      );
    }
  }
}

function compareRanges(left: SourceRange, right: SourceRange): number {
  return comparePositions(left.start, right.start) ||
    comparePositions(left.end, right.end);
}

function comparePositions(left: SourcePosition, right: SourcePosition): number {
  return left.line - right.line || left.character - right.character;
}

function fail(
  code: FormIndexFailure["code"],
  instancePath: string,
  message: string,
): never {
  throw new FormIndexFailure(code, instancePath, message);
}
