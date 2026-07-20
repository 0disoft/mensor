import { createHash } from "node:crypto";

import type { SourcePosition, SourceRange } from "@0disoft/mensor-contract";

import {
  FormIndexFailure,
  type ContentDigest,
  type FormIndex,
} from "./form-index-types.js";
import { canonicalizeFormIndex } from "./form-index-validation.js";

export type {
  ContentDigest,
  DocumentInspection,
  DynamicReason,
  FormActionEvidence,
  FormDocumentFact,
  FormIndex,
  FormIndexFailureCode,
  IndexedControlFact,
  IndexedEvidence,
  IndexedFormFact,
  UnsupportedReason,
} from "./form-index-types.js";
export { FormIndexFailure } from "./form-index-types.js";

export function createContentDigest(
  source: string | Uint8Array,
): ContentDigest {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export function serializeFormIndex(value: unknown): string {
  const canonical = canonicalizeFormIndex(value);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export function parseFormIndex(text: string): FormIndex {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new FormIndexFailure(
      "form_index.json_invalid",
      "",
      "FormIndex must be strict JSON.",
    );
  }

  const canonical = canonicalizeFormIndex(value);
  if (serializeFormIndex(canonical) !== text) {
    throw new FormIndexFailure(
      "form_index.noncanonical",
      "",
      "FormIndex JSON is not in canonical form.",
    );
  }
  return canonical;
}

export function verifyFormIndexContent(
  value: unknown,
  sourceForPath: (path: string) => string | Uint8Array | undefined,
): FormIndex {
  const canonical = canonicalizeFormIndex(value);
  for (const [index, document] of canonical.documents.entries()) {
    const source = sourceForPath(document.path);
    if (source === undefined) {
      throw new FormIndexFailure(
        "form_index.source_missing",
        `/documents/${index}/path`,
        "Indexed source document is missing.",
      );
    }
    if (createContentDigest(source) !== document.contentDigest) {
      throw new FormIndexFailure(
        "form_index.digest_mismatch",
        `/documents/${index}/contentDigest`,
        "Indexed source digest does not match the current source bytes.",
      );
    }
    verifyDocumentRanges(document, source, `/documents/${index}`);
  }
  return canonical;
}

function verifyDocumentRanges(
  document: FormIndex["documents"][number],
  source: string | Uint8Array,
  instancePath: string,
): void {
  const text = sourceText(source, instancePath);
  const lines = text.split(/\r\n|\n|\r/u);
  const ranges: Array<{
    readonly instancePath: string;
    readonly range: SourceRange;
  }> = [];

  if (document.inspection.state === "incomplete" && document.inspection.range !== undefined) {
    ranges.push({
      instancePath: `${instancePath}/inspection/range`,
      range: document.inspection.range,
    });
  }
  document.forms.forEach((form, formIndex) => {
    const formPath = `${instancePath}/forms/${formIndex}`;
    ranges.push({ instancePath: `${formPath}/range`, range: form.range });
    pushEvidenceRange(ranges, `${formPath}/identity`, form.identity);
    pushEvidenceRange(ranges, `${formPath}/method`, form.method);
    pushEvidenceRange(ranges, `${formPath}/action`, form.action);
    form.controls.forEach((control, controlIndex) => {
      const controlPath = `${formPath}/controls/${controlIndex}`;
      ranges.push({ instancePath: `${controlPath}/range`, range: control.range });
      pushEvidenceRange(ranges, `${controlPath}/name`, control.name);
      pushEvidenceRange(ranges, `${controlPath}/controlKind`, control.controlKind);
      pushEvidenceRange(ranges, `${controlPath}/inputType`, control.inputType);
      pushEvidenceRange(ranges, `${controlPath}/multiple`, control.multiple);
      pushEvidenceRange(ranges, `${controlPath}/multiplicity`, control.multiplicity);
      pushEvidenceRange(ranges, `${controlPath}/successful`, control.successful);
    });
  });

  for (const entry of ranges) {
    assertPositionWithinSource(entry.range.start, lines, `${entry.instancePath}/start`);
    assertPositionWithinSource(entry.range.end, lines, `${entry.instancePath}/end`);
  }
}

function pushEvidenceRange(
  ranges: Array<{ readonly instancePath: string; readonly range: SourceRange }>,
  instancePath: string,
  evidence: { readonly range?: SourceRange },
): void {
  if (evidence.range !== undefined) {
    ranges.push({ instancePath: `${instancePath}/range`, range: evidence.range });
  }
}

function assertPositionWithinSource(
  position: SourcePosition,
  lines: readonly string[],
  instancePath: string,
): void {
  const line = lines[position.line];
  if (line === undefined || position.character > line.length) {
    throw new FormIndexFailure(
      "form_index.range_invalid",
      instancePath,
      "Indexed range falls outside the bound source document.",
    );
  }
}

function sourceText(source: string | Uint8Array, instancePath: string): string {
  if (typeof source === "string") {
    return source;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch {
    throw new FormIndexFailure(
      "form_index.source_encoding_invalid",
      instancePath,
      "Indexed source bytes must be valid UTF-8.",
    );
  }
}
