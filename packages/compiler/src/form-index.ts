import { createHash } from "node:crypto";

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
  }
  return canonical;
}
