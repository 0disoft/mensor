import type {
  IndexedControlFact,
  IndexedFormFact,
} from "./form-index.js";
import { extractStaticHtmlFormDocument } from "./html-forms.js";
import {
  assertRelativePosixPath,
  compareText,
  InputFailure,
} from "./paths.js";

const routePattern = /^\/[^?#]*$/u;

export interface DraftField {
  readonly name: string;
  readonly repeated: boolean;
}

export interface DraftFormCandidate {
  readonly file: string;
  readonly fields: readonly DraftField[];
  readonly id: string;
  readonly problems: readonly string[];
  readonly route:
    | { readonly kind: "current-document" }
    | { readonly kind: "literal"; readonly path: string }
    | { readonly kind: "unsupported" };
}

export async function discoverAndSelectForm(
  featureFiles: readonly string[],
  readSource: (file: string) => Promise<string>,
  requested: { readonly file: string; readonly id: string } | undefined,
): Promise<DraftFormCandidate> {
  const candidates = await discoverForms(featureFiles, readSource);
  if (requested !== undefined) {
    const file = assertRelativePosixPath(requested.file, "form file");
    const candidate = candidates.find((entry) =>
      entry.file === file && entry.id === requested.id,
    );
    if (candidate === undefined) {
      throw new InputFailure(
        "configuration",
        "init.form_not_found",
        `No static form ${JSON.stringify(`${file}#${requested.id}`)} was discovered under featureRoot.`,
        file,
      );
    }
    assertEligible(candidate);
    return candidate;
  }

  const eligible = candidates.filter((candidate) => candidate.problems.length === 0);
  if (eligible.length === 1 && eligible[0] !== undefined) {
    return eligible[0];
  }
  if (eligible.length === 0) {
    const details = candidates.length === 0
      ? "No static forms with an id were discovered."
      : `Discovered forms were not eligible: ${formatProblems(candidates)}.`;
    throw new InputFailure("configuration", "init.form_not_found", details);
  }
  throw new InputFailure(
    "configuration",
    "init.form_ambiguous",
    `Multiple eligible POST forms were discovered: ${formatCandidates(eligible)}. Select one with --form-file and --form-id.`,
  );
}

export function resolveFormRoute(
  form: DraftFormCandidate,
  documentPath: string | undefined,
): string {
  if (form.route.kind === "literal") {
    return form.route.path;
  }
  if (form.route.kind === "current-document" && documentPath !== undefined) {
    return documentPath;
  }
  throw new InputFailure(
    "configuration",
    "init.document_path_required",
    `Form ${JSON.stringify(`${form.file}#${form.id}`)} submits to the current document. Supply --document-path with its static root-relative route.`,
    form.file,
  );
}

async function discoverForms(
  featureFiles: readonly string[],
  readSource: (file: string) => Promise<string>,
): Promise<readonly DraftFormCandidate[]> {
  const candidates: DraftFormCandidate[] = [];
  for (const file of featureFiles.filter((entry) => entry.endsWith(".html"))) {
    const document = extractStaticHtmlFormDocument(file, await readSource(file));
    for (const form of document.forms) {
      if (form.identity.state !== "known") {
        continue;
      }
      const problems: string[] = [];
      if (form.method.state !== "known" || form.method.value !== "post") {
        problems.push("method is not an explicit POST");
      }
      candidates.push({
        file,
        fields: formFields(form, problems),
        id: form.identity.value,
        problems,
        route: formRoute(form, problems),
      });
    }
  }
  return candidates.sort((left, right) =>
    compareText(left.file, right.file) || compareText(left.id, right.id),
  );
}

function formRoute(
  form: IndexedFormFact,
  problems: string[],
): DraftFormCandidate["route"] {
  if (form.action.state === "current-document") {
    return { kind: "current-document" };
  }
  if (form.action.state === "known" && routePattern.test(form.action.value)) {
    return { kind: "literal", path: form.action.value };
  }
  problems.push("action is not a static root-relative path");
  return { kind: "unsupported" };
}

function formFields(
  form: IndexedFormFact,
  problems: string[],
): readonly DraftField[] {
  const fieldKinds = new Map<string, boolean>();
  for (const control of form.controls) {
    if (control.successful.state === "unsupported") {
      problems.push(`control uses unsupported ${control.successful.reason} semantics`);
      continue;
    }
    if (control.successful.state !== "known" || !control.successful.value) {
      continue;
    }
    if (control.name.state !== "known") {
      problems.push("a successful control has no static name");
      continue;
    }
    if (
      control.inputType.state === "known" &&
      control.inputType.value === "checkbox"
    ) {
      problems.push(
        `checkbox field ${JSON.stringify(control.name.value)} needs an explicit true-value decision`,
      );
      continue;
    }
    const repeated = controlMultiplicity(control, problems);
    if (repeated === undefined) {
      continue;
    }
    fieldKinds.set(
      control.name.value,
      (fieldKinds.get(control.name.value) ?? false) || repeated,
    );
  }
  if (fieldKinds.size === 0) {
    problems.push("form has no supported named fields");
  }
  return [...fieldKinds.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([name, repeated]) => ({ name, repeated }));
}

function controlMultiplicity(
  control: IndexedControlFact,
  problems: string[],
): boolean | undefined {
  if (control.multiplicity.state !== "known") {
    problems.push("a successful control has unknown multiplicity");
    return undefined;
  }
  return control.multiplicity.value === "repeated";
}

function assertEligible(candidate: DraftFormCandidate): void {
  if (candidate.problems.length > 0) {
    throw new InputFailure(
      "configuration",
      "init.form_unsupported",
      `Form ${JSON.stringify(`${candidate.file}#${candidate.id}`)} cannot be drafted: ${candidate.problems.join("; ")}.`,
      candidate.file,
    );
  }
}

function formatCandidates(candidates: readonly DraftFormCandidate[]): string {
  return formatBounded(candidates.map((candidate) =>
    JSON.stringify(`${candidate.file}#${candidate.id}`),
  ));
}

function formatProblems(candidates: readonly DraftFormCandidate[]): string {
  return formatBounded(candidates.map((candidate) =>
    `${JSON.stringify(`${candidate.file}#${candidate.id}`)} (${candidate.problems.join("; ")})`,
  ));
}

function formatBounded(values: readonly string[]): string {
  const visible = values.slice(0, 8);
  const suffix = values.length > visible.length
    ? `, and ${values.length - visible.length} more`
    : "";
  return `${visible.join(", ")}${suffix}`;
}
