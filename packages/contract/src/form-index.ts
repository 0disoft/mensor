import { compareText } from "./compare.js";
import { parseJsonc } from "./jsonc.js";
import { schemaIssues, validateFormIndex } from "./schemas.js";
import type {
  ContractIssue,
  ContractResult,
  DocumentInspection,
  FormActionEvidence,
  FormDocumentFact,
  FormIndex,
  IndexedControlFact,
  IndexedEvidence,
  IndexedFormFact,
  SourcePosition,
  SourceRange,
} from "./types.js";

const windowsReservedName = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function parseFormIndex(text: string): ContractResult<FormIndex> {
  const parsed = parseJsonc(text);
  if (!parsed.ok) {
    return parsed;
  }
  if (!validateFormIndex(parsed.value)) {
    return { ok: false, issues: schemaIssues(validateFormIndex) };
  }

  const issues = formIndexSemanticIssues(parsed.value);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const canonical = canonicalFormIndex(parsed.value);
  if (serializeFormIndex(canonical) !== text) {
    return {
      ok: false,
      issues: [semanticIssue("", "FormIndex must use canonical JSON encoding.")],
    };
  }
  return { ok: true, value: canonical };
}

export function serializeFormIndex(value: unknown): string {
  if (!validateFormIndex(value)) {
    const issue = schemaIssues(validateFormIndex)[0];
    throw new TypeError(
      `FormIndex cannot be serialized: ${issue?.message ?? "schema validation failed"}`,
    );
  }
  const issues = formIndexSemanticIssues(value);
  if (issues.length > 0) {
    throw new TypeError(`FormIndex cannot be serialized: ${issues[0]?.message}`);
  }
  return `${JSON.stringify(canonicalFormIndex(value), null, 2)}\n`;
}

function canonicalFormIndex(value: FormIndex): FormIndex {
  return {
    schemaVersion: 1,
    producer: {
      name: value.producer.name,
      version: value.producer.version,
    },
    documents: [...value.documents]
      .sort((left, right) => compareText(left.path, right.path))
      .map(canonicalDocument),
  };
}

function canonicalDocument(document: FormDocumentFact): FormDocumentFact {
  return {
    path: document.path,
    contentDigest: document.contentDigest,
    sourceKind: document.sourceKind,
    inspection: canonicalInspection(document.inspection),
    forms: [...document.forms]
      .sort((left, right) => compareRanges(left.range, right.range))
      .map(canonicalForm),
  };
}

function canonicalInspection(inspection: DocumentInspection): DocumentInspection {
  if (inspection.state === "complete") {
    return { state: "complete" };
  }
  return {
    state: "incomplete",
    reason: inspection.reason,
    ...(inspection.range === undefined
      ? {}
      : { range: canonicalRange(inspection.range) }),
  };
}

function canonicalForm(form: IndexedFormFact): IndexedFormFact {
  return {
    identity: canonicalEvidence(form.identity),
    method: canonicalEvidence(form.method),
    action: canonicalActionEvidence(form.action),
    range: canonicalRange(form.range),
    controls: [...form.controls]
      .sort((left, right) => compareRanges(left.range, right.range))
      .map(canonicalControl),
  };
}

function canonicalControl(control: IndexedControlFact): IndexedControlFact {
  return {
    name: canonicalEvidence(control.name),
    controlKind: canonicalEvidence(control.controlKind),
    inputType: canonicalEvidence(control.inputType),
    multiple: canonicalEvidence(control.multiple),
    multiplicity: canonicalEvidence(control.multiplicity),
    successful: canonicalEvidence(control.successful),
    range: canonicalRange(control.range),
  };
}

function canonicalActionEvidence(value: FormActionEvidence): FormActionEvidence {
  return value.state === "current-document"
    ? { state: "current-document", range: canonicalRange(value.range) }
    : canonicalEvidence(value);
}

function canonicalEvidence<T>(value: IndexedEvidence<T>): IndexedEvidence<T> {
  switch (value.state) {
    case "known":
      return {
        state: "known",
        value: value.value,
        range: canonicalRange(value.range),
      };
    case "absent":
      return value.range === undefined
        ? { state: "absent" }
        : { state: "absent", range: canonicalRange(value.range) };
    case "dynamic":
      return {
        state: "dynamic",
        reason: value.reason,
        range: canonicalRange(value.range),
      };
    case "unsupported":
      return {
        state: "unsupported",
        reason: value.reason,
        range: canonicalRange(value.range),
      };
  }
}

function canonicalRange(range: SourceRange): SourceRange {
  return {
    start: {
      line: range.start.line,
      character: range.start.character,
    },
    end: {
      line: range.end.line,
      character: range.end.character,
    },
  };
}

function formIndexSemanticIssues(value: FormIndex): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const exactPaths = new Set<string>();
  const foldedPaths = new Map<string, string>();

  value.documents.forEach((document, documentIndex) => {
    const documentPath = `/documents/${documentIndex}`;
    if (!portableSourcePath(document.path)) {
      issues.push(semanticIssue(
        `${documentPath}/path`,
        "FormIndex document path must be a portable project-relative POSIX path.",
      ));
    }
    const foldedPath = document.path.toLowerCase();
    if (exactPaths.has(document.path) || foldedPaths.has(foldedPath)) {
      issues.push(semanticIssue(
        `${documentPath}/path`,
        `FormIndex document path collides with ${JSON.stringify(foldedPaths.get(foldedPath) ?? document.path)}.`,
      ));
    }
    exactPaths.add(document.path);
    foldedPaths.set(foldedPath, document.path);

    if (
      document.inspection.state === "incomplete" &&
      document.inspection.range !== undefined
    ) {
      collectRangeIssue(
        issues,
        document.inspection.range,
        `${documentPath}/inspection/range`,
      );
    }

    const formRanges = new Set<string>();
    document.forms.forEach((form, formIndex) => {
      const formPath = `${documentPath}/forms/${formIndex}`;
      collectRangeIssue(issues, form.range, `${formPath}/range`);
      collectEvidenceRangeIssue(issues, form.identity, `${formPath}/identity`);
      collectEvidenceRangeIssue(issues, form.method, `${formPath}/method`);
      collectEvidenceRangeIssue(issues, form.action, `${formPath}/action`);
      collectDuplicateRangeIssue(
        issues,
        formRanges,
        form.range,
        `${formPath}/range`,
        "FormIndex form ranges must be unique within one document.",
      );

      const controlRanges = new Set<string>();
      form.controls.forEach((control, controlIndex) => {
        const controlPath = `${formPath}/controls/${controlIndex}`;
        collectRangeIssue(issues, control.range, `${controlPath}/range`);
        collectEvidenceRangeIssue(issues, control.name, `${controlPath}/name`);
        collectEvidenceRangeIssue(
          issues,
          control.controlKind,
          `${controlPath}/controlKind`,
        );
        collectEvidenceRangeIssue(
          issues,
          control.inputType,
          `${controlPath}/inputType`,
        );
        collectEvidenceRangeIssue(
          issues,
          control.multiple,
          `${controlPath}/multiple`,
        );
        collectEvidenceRangeIssue(
          issues,
          control.multiplicity,
          `${controlPath}/multiplicity`,
        );
        collectEvidenceRangeIssue(
          issues,
          control.successful,
          `${controlPath}/successful`,
        );
        collectDuplicateRangeIssue(
          issues,
          controlRanges,
          control.range,
          `${controlPath}/range`,
          "FormIndex control ranges must be unique within one form.",
        );
      });
    });
  });

  return issues;
}

function collectEvidenceRangeIssue(
  issues: ContractIssue[],
  evidence: { readonly range?: SourceRange },
  instancePath: string,
): void {
  if (evidence.range !== undefined) {
    collectRangeIssue(issues, evidence.range, `${instancePath}/range`);
  }
}

function collectRangeIssue(
  issues: ContractIssue[],
  range: SourceRange,
  instancePath: string,
): void {
  if (comparePositions(range.start, range.end) > 0) {
    issues.push(semanticIssue(
      instancePath,
      "FormIndex range start must not follow its end.",
    ));
  }
}

function collectDuplicateRangeIssue(
  issues: ContractIssue[],
  seen: Set<string>,
  range: SourceRange,
  instancePath: string,
  message: string,
): void {
  const key = rangeKey(range);
  if (seen.has(key)) {
    issues.push(semanticIssue(instancePath, message));
  }
  seen.add(key);
}

function portableSourcePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z]:/iu.test(value) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return false;
  }
  return value.split("/").every((segment) =>
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes(":") &&
    !segment.endsWith(".") &&
    !segment.endsWith(" ") &&
    !windowsReservedName.test(segment)
  );
}

function rangeKey(range: SourceRange): string {
  return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

function compareRanges(left: SourceRange, right: SourceRange): number {
  return comparePositions(left.start, right.start) ||
    comparePositions(left.end, right.end);
}

function comparePositions(left: SourcePosition, right: SourcePosition): number {
  return left.line - right.line || left.character - right.character;
}

function semanticIssue(instancePath: string, message: string): ContractIssue {
  return {
    code: "schema.violation",
    message,
    instancePath,
    schemaPath: "#/$semantic",
    keyword: "semantic",
  };
}
