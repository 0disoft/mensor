import { compareText } from "./compare.js";
import { parseJsonc } from "./jsonc.js";
import { schemaIssues, validateFormIndex } from "./schemas.js";
import type {
  ContractIssue,
  ContractResult,
  FormIndex,
  FormIndexActionEvidence,
  FormIndexControl,
  FormIndexDocument,
  FormIndexDocumentInspection,
  FormIndexEvidence,
  FormIndexForm,
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
  if (serializeCanonical(canonical) !== text) {
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
  return serializeCanonical(canonicalFormIndex(value));
}

function serializeCanonical(value: FormIndex): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function canonicalDocument(value: FormIndexDocument): FormIndexDocument {
  return {
    path: value.path,
    contentDigest: value.contentDigest,
    sourceKind: value.sourceKind,
    inspection: canonicalInspection(value.inspection),
    forms: [...value.forms].sort(compareRanged).map(canonicalForm),
  };
}

function canonicalInspection(
  value: FormIndexDocumentInspection,
): FormIndexDocumentInspection {
  if (value.state === "complete") {
    return { state: "complete" };
  }
  return value.range === undefined
    ? { state: "incomplete", reason: value.reason }
    : {
        state: "incomplete",
        reason: value.reason,
        range: canonicalRange(value.range),
      };
}

function canonicalForm(value: FormIndexForm): FormIndexForm {
  return {
    identity: canonicalEvidence(value.identity),
    method: canonicalEvidence(value.method),
    action: canonicalAction(value.action),
    range: canonicalRange(value.range),
    controls: [...value.controls].sort(compareRanged).map(canonicalControl),
  };
}

function canonicalControl(value: FormIndexControl): FormIndexControl {
  return {
    name: canonicalEvidence(value.name),
    controlKind: canonicalEvidence(value.controlKind),
    inputType: canonicalEvidence(value.inputType),
    multiple: canonicalEvidence(value.multiple),
    multiplicity: canonicalEvidence(value.multiplicity),
    successful: canonicalEvidence(value.successful),
    range: canonicalRange(value.range),
  };
}

function canonicalAction(value: FormIndexActionEvidence): FormIndexActionEvidence {
  return value.state === "current-document"
    ? { state: "current-document", range: canonicalRange(value.range) }
    : canonicalEvidence(value);
}

function canonicalEvidence<T>(value: FormIndexEvidence<T>): FormIndexEvidence<T> {
  if (value.state === "known") {
    return {
      state: "known",
      value: value.value,
      range: canonicalRange(value.range),
    };
  }
  if (value.state === "absent") {
    return value.range === undefined
      ? { state: "absent" }
      : { state: "absent", range: canonicalRange(value.range) };
  }
  return value.state === "dynamic"
    ? {
        state: "dynamic",
        reason: value.reason,
        range: canonicalRange(value.range),
      }
    : {
        state: "unsupported",
        reason: value.reason,
        range: canonicalRange(value.range),
      };
}

function canonicalRange(value: SourceRange): SourceRange {
  return {
    start: { line: value.start.line, character: value.start.character },
    end: { line: value.end.line, character: value.end.character },
  };
}

function formIndexSemanticIssues(value: FormIndex): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const exactPaths = new Set<string>();
  const foldedPaths = new Set<string>();
  value.documents.forEach((document, documentIndex) => {
    const documentPath = `/documents/${documentIndex}`;
    if (!portableSourcePath(document.path)) {
      issues.push(semanticIssue(
        `${documentPath}/path`,
        "FormIndex document path must be a portable project-relative POSIX path.",
      ));
    }
    const folded = document.path.toLocaleLowerCase("en-US");
    if (exactPaths.has(document.path) || foldedPaths.has(folded)) {
      issues.push(semanticIssue(
        `${documentPath}/path`,
        "FormIndex document paths must be unique without case collisions.",
      ));
    }
    exactPaths.add(document.path);
    foldedPaths.add(folded);
    if (
      document.inspection.state === "incomplete"
      && document.inspection.range !== undefined
    ) {
      addRangeIssue(issues, document.inspection.range, `${documentPath}/inspection/range`);
    }
    const formRanges = new Set<string>();
    document.forms.forEach((form, formIndex) => {
      const formPath = `${documentPath}/forms/${formIndex}`;
      addRangeIssue(issues, form.range, `${formPath}/range`);
      addEvidenceRangeIssues(issues, form, formPath);
      const formKey = rangeKey(form.range);
      if (formRanges.has(formKey)) {
        issues.push(semanticIssue(`${formPath}/range`, "Form ranges must be unique."));
      }
      formRanges.add(formKey);
      const controlRanges = new Set<string>();
      form.controls.forEach((control, controlIndex) => {
        const controlPath = `${formPath}/controls/${controlIndex}`;
        addRangeIssue(issues, control.range, `${controlPath}/range`);
        addEvidenceRangeIssues(issues, control, controlPath);
        const controlKey = rangeKey(control.range);
        if (controlRanges.has(controlKey)) {
          issues.push(semanticIssue(
            `${controlPath}/range`,
            "Control ranges must be unique within a form.",
          ));
        }
        controlRanges.add(controlKey);
      });
    });
  });
  return issues.sort((left, right) =>
    compareText(left.instancePath ?? "", right.instancePath ?? "")
    || compareText(left.message, right.message)
  );
}

function addEvidenceRangeIssues(
  issues: ContractIssue[],
  value: object,
  instancePath: string,
): void {
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "range" || typeof entry !== "object" || entry === null) {
      continue;
    }
    const range = (entry as { readonly range?: SourceRange }).range;
    if (range !== undefined) {
      addRangeIssue(issues, range, `${instancePath}/${key}/range`);
    }
  }
}

function addRangeIssue(
  issues: ContractIssue[],
  range: SourceRange,
  instancePath: string,
): void {
  if (comparePositions(range.start, range.end) > 0) {
    issues.push(semanticIssue(instancePath, "Range start must not follow its end."));
  }
}

function portableSourcePath(value: string): boolean {
  return value.split("/").every((segment) =>
    segment.length > 0
    && segment !== "."
    && segment !== ".."
    && !segment.includes(":")
    && !segment.endsWith(".")
    && !segment.endsWith(" ")
    && !windowsReservedName.test(segment)
  );
}

function compareRanged<T extends { readonly range: SourceRange }>(
  left: T,
  right: T,
): number {
  return comparePositions(left.range.start, right.range.start)
    || comparePositions(left.range.end, right.range.end);
}

function comparePositions(left: SourcePosition, right: SourcePosition): number {
  return left.line - right.line || left.character - right.character;
}

function rangeKey(value: SourceRange): string {
  return `${value.start.line}:${value.start.character}-${value.end.line}:${value.end.character}`;
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
