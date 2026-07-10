import {
  parse,
  type DefaultTreeAdapterTypes,
} from "parse5";

import type { SourceRange } from "@mensor/contract";

import { compareText } from "./paths.js";

export interface FormFact {
  readonly id: string;
  readonly method: string;
  readonly action: string;
  readonly fields: readonly FormFieldFact[];
  readonly range: SourceRange;
}

export interface FormFieldFact {
  readonly name: string;
  readonly range: SourceRange;
}

export function extractFormFacts(html: string): readonly FormFact[] {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const elements: DefaultTreeAdapterTypes.Element[] = [];
  collectElements(document.childNodes, elements);
  const forms = elements.filter((element) => element.tagName === "form");
  const controls = elements.filter(isFormControl);

  return forms
    .map((form) => {
      const id = attribute(form, "id") ?? "";
      const fields = controls
        .filter((control) => associatedForm(control, forms) === form)
        .filter(isSuccessfulFieldCandidate)
        .flatMap((control) => {
          const name = attribute(control, "name");
          return name === null || name.length === 0
            ? []
            : [{ name, range: elementStartTagRange(control) }];
        });
      return {
        id,
        method: (attribute(form, "method") ?? "GET").toUpperCase(),
        action: attribute(form, "action") ?? "",
        fields: uniqueFields(fields),
        range: elementStartTagRange(form),
      };
    })
    .sort((left, right) => compareText(left.id, right.id));
}

function uniqueFields(fields: readonly FormFieldFact[]): readonly FormFieldFact[] {
  const byName = new Map<string, FormFieldFact>();
  for (const field of fields) {
    if (!byName.has(field.name)) {
      byName.set(field.name, field);
    }
  }
  return [...byName.values()].sort((left, right) =>
    compareText(left.name, right.name),
  );
}

function collectElements(
  nodes: readonly DefaultTreeAdapterTypes.ChildNode[],
  result: DefaultTreeAdapterTypes.Element[],
): void {
  for (const node of nodes) {
    if (!("tagName" in node)) {
      continue;
    }
    result.push(node);
    collectElements(node.childNodes, result);
    if (node.tagName === "template" && "content" in node) {
      collectElements(node.content.childNodes, result);
    }
  }
}

function isFormControl(element: DefaultTreeAdapterTypes.Element): boolean {
  return ["button", "input", "select", "textarea"].includes(element.tagName);
}

function isSuccessfulFieldCandidate(
  element: DefaultTreeAdapterTypes.Element,
): boolean {
  if (attribute(element, "disabled") !== null || element.tagName === "button") {
    return false;
  }
  if (element.tagName !== "input") {
    return true;
  }
  const type = (attribute(element, "type") ?? "text").toLowerCase();
  return !["button", "file", "image", "reset", "submit"].includes(type);
}

function associatedForm(
  control: DefaultTreeAdapterTypes.Element,
  forms: readonly DefaultTreeAdapterTypes.Element[],
): DefaultTreeAdapterTypes.Element | undefined {
  const explicitForm = attribute(control, "form");
  if (explicitForm !== null) {
    return forms.find((form) => attribute(form, "id") === explicitForm);
  }

  let parent = control.parentNode;
  while (parent !== null) {
    if ("tagName" in parent && parent.tagName === "form") {
      return parent;
    }
    parent = "parentNode" in parent ? parent.parentNode : null;
  }
  return undefined;
}

function attribute(
  element: DefaultTreeAdapterTypes.Element,
  name: string,
): string | null {
  return element.attrs.find((entry) => entry.name === name)?.value ?? null;
}

function elementStartTagRange(
  element: DefaultTreeAdapterTypes.Element,
): SourceRange {
  const location = element.sourceCodeLocation?.startTag ?? element.sourceCodeLocation;
  if (location === undefined || location === null) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }
  return {
    start: {
      line: location.startLine - 1,
      character: location.startCol - 1,
    },
    end: {
      line: location.endLine - 1,
      character: location.endCol - 1,
    },
  };
}
