import type { SourceRange } from "@mensor/contract";

import type {
  FormControlFact,
  FormFact,
  FormFieldFact,
  UnsupportedFormControlFact,
} from "./form-facts.js";
import type {
  FormActionEvidence,
  FormDocumentFact,
  FormIndex,
  IndexedControlFact,
  IndexedEvidence,
  IndexedFormFact,
} from "./form-index.js";
import { compareText, InputFailure } from "./paths.js";

export function formFactsForLinkedForm(
  index: FormIndex,
  documentPath: string,
  formId: string,
): readonly FormFact[] {
  const document = index.documents.find((entry) => entry.path === documentPath);
  if (document === undefined) {
    throw new InputFailure(
      "configuration",
      "form_index.document_missing",
      `FormIndex has no document for ${JSON.stringify(documentPath)}.`,
      documentPath,
    );
  }
  assertCompleteInspection(document);

  const matches: FormFact[] = [];
  for (const form of document.forms) {
    if (form.identity.state === "absent") {
      continue;
    }
    if (form.identity.state !== "known") {
      throw unresolvedEvidence(
        document.path,
        "form_index.identity_unresolved",
        "form identity",
        form.identity,
      );
    }
    if (form.identity.value === formId) {
      matches.push(formFact(document.path, form));
    }
  }
  return matches;
}

function assertCompleteInspection(document: FormDocumentFact): void {
  if (document.inspection.state === "complete") {
    return;
  }
  throw new InputFailure(
    "configuration",
    "form_index.inspection_incomplete",
    `FormIndex inspection for ${JSON.stringify(document.path)} is incomplete: ${document.inspection.reason}.`,
    document.path,
  );
}

function formFact(documentPath: string, form: IndexedFormFact): FormFact {
  const fields: FormFieldFact[] = [];
  const unsupportedControls: UnsupportedFormControlFact[] = [];

  for (const control of form.controls) {
    if (control.successful.state === "known" && !control.successful.value) {
      continue;
    }
    if (control.successful.state === "unsupported") {
      unsupportedControls.push(unsupportedControl(documentPath, control));
      continue;
    }
    if (control.successful.state !== "known") {
      throw unresolvedEvidence(
        documentPath,
        "form_index.control_unresolved",
        "successful-control state",
        control.successful,
      );
    }

    const name = optionalKnownEvidence(
      documentPath,
      "control name",
      control.name,
    );
    if (name === undefined) {
      continue;
    }
    const controlFactValue = successfulControl(documentPath, control);
    const existing = fields.find((field) => field.name === name);
    if (existing === undefined) {
      fields.push({
        name,
        controls: [controlFactValue],
        range: control.range,
      });
    } else {
      const existingIndex = fields.indexOf(existing);
      fields[existingIndex] = {
        ...existing,
        controls: [...existing.controls, controlFactValue],
      };
    }
  }

  return {
    id: knownEvidence(documentPath, "form identity", form.identity),
    method: methodValue(documentPath, form.method),
    methodRange: evidenceRange(form.method, form.range),
    action: actionValue(documentPath, form.action, form.range),
    fields: fields.sort((left, right) => compareText(left.name, right.name)),
    unsupportedControls: unsupportedControls.sort((left, right) =>
      compareText(left.name, right.name) || compareText(left.reason, right.reason),
    ),
    range: form.range,
  };
}

function successfulControl(
  documentPath: string,
  control: IndexedControlFact,
): FormControlFact {
  const kind = knownEvidence(documentPath, "control kind", control.controlKind);
  if (kind === "button") {
    throw new InputFailure(
      "configuration",
      "form_index.control_invalid",
      "A successful field control cannot have button controlKind.",
      documentPath,
    );
  }
  knownEvidence(documentPath, "control multiplicity", control.multiplicity);
  return {
    kind,
    inputType: optionalKnownEvidence(
      documentPath,
      "control input type",
      control.inputType,
    ) ?? "",
    multiple: knownEvidence(documentPath, "control multiple state", control.multiple),
    range: control.range,
  };
}

function unsupportedControl(
  documentPath: string,
  control: IndexedControlFact,
): UnsupportedFormControlFact {
  if (control.successful.state !== "unsupported") {
    throw new Error("unsupportedControl requires unsupported evidence.");
  }
  const reason = control.successful.reason;
  if (
    reason !== "file-input" &&
    reason !== "named-submitter" &&
    reason !== "submitter-route-override"
  ) {
    throw new InputFailure(
      "configuration",
      "form_index.control_unresolved",
      `Unsupported control evidence ${JSON.stringify(reason)} cannot be mapped to a stable form diagnostic.`,
      documentPath,
    );
  }
  const kind = knownEvidence(documentPath, "control kind", control.controlKind);
  if (kind !== "button" && kind !== "input") {
    throw new InputFailure(
      "configuration",
      "form_index.control_invalid",
      `Unsupported ${JSON.stringify(reason)} evidence requires an input or button control.`,
      documentPath,
    );
  }
  return {
    kind,
    inputType: optionalKnownEvidence(
      documentPath,
      "control input type",
      control.inputType,
    ) ?? "",
    name: optionalKnownEvidence(documentPath, "control name", control.name) ?? "",
    reason,
    range: control.range,
  };
}

function methodValue(
  documentPath: string,
  method: IndexedFormFact["method"],
): string {
  if (method.state === "absent") {
    return "GET";
  }
  return asciiUppercase(knownEvidence(documentPath, "form method", method));
}

function actionValue(
  documentPath: string,
  action: FormActionEvidence,
  fallbackRange: SourceRange,
): FormFact["action"] {
  if (action.state === "current-document" || action.state === "absent") {
    return {
      kind: "current-document",
      range: action.range ?? fallbackRange,
    };
  }
  return {
    kind: "literal",
    value: knownEvidence(documentPath, "form action", action),
    range: action.range,
  };
}

function knownEvidence<T>(
  documentPath: string,
  label: string,
  evidence: IndexedEvidence<T>,
): T {
  if (evidence.state === "known") {
    return evidence.value;
  }
  throw unresolvedEvidence(
    documentPath,
    "form_index.evidence_unresolved",
    label,
    evidence,
  );
}

function optionalKnownEvidence<T>(
  documentPath: string,
  label: string,
  evidence: IndexedEvidence<T>,
): T | undefined {
  if (evidence.state === "absent") {
    return undefined;
  }
  return knownEvidence(documentPath, label, evidence);
}

function evidenceRange<T>(
  evidence: IndexedEvidence<T>,
  fallback: SourceRange,
): SourceRange {
  return evidence.range ?? fallback;
}

function unresolvedEvidence(
  documentPath: string,
  code: string,
  label: string,
  evidence: { readonly state: string; readonly reason?: string },
): InputFailure {
  const reason = evidence.reason === undefined ? evidence.state : evidence.reason;
  return new InputFailure(
    "configuration",
    code,
    `FormIndex cannot prove ${label}: ${reason}.`,
    documentPath,
  );
}

function asciiUppercase(value: string): string {
  return value.replace(/[a-z]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 32),
  );
}
