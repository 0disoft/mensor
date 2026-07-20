import type { SourceRange } from "@0disoft/mensor-contract";

export type ContentDigest = `sha256:${string}`;

export type DynamicReason =
  | "computed-attribute"
  | "conditional-presence"
  | "custom-helper-semantics"
  | "dynamic-interpolation"
  | "repeated-generation";

export type UnsupportedReason =
  | "file-input"
  | "named-submitter"
  | "provider-resource-limit"
  | "submitter-route-override"
  | "unsupported-control-kind";

export type IndexedEvidence<T> =
  | {
      readonly state: "known";
      readonly value: T;
      readonly range: SourceRange;
    }
  | {
      readonly state: "absent";
      readonly range?: SourceRange;
    }
  | {
      readonly state: "dynamic";
      readonly reason: DynamicReason;
      readonly range: SourceRange;
    }
  | {
      readonly state: "unsupported";
      readonly reason: UnsupportedReason;
      readonly range: SourceRange;
    };

export type FormActionEvidence =
  | IndexedEvidence<string>
  | {
      readonly state: "current-document";
      readonly range: SourceRange;
    };

export type DocumentInspection =
  | {
      readonly state: "complete";
    }
  | {
      readonly state: "incomplete";
      readonly reason: DynamicReason | UnsupportedReason;
      readonly range?: SourceRange;
    };

export interface FormIndex {
  readonly schemaVersion: 1;
  readonly producer: {
    readonly name: string;
    readonly version: string;
  };
  readonly documents: readonly FormDocumentFact[];
}

export interface FormDocumentFact {
  readonly path: string;
  readonly contentDigest: ContentDigest;
  readonly sourceKind: string;
  readonly inspection: DocumentInspection;
  readonly forms: readonly IndexedFormFact[];
}

export interface IndexedFormFact {
  readonly identity: IndexedEvidence<string>;
  readonly method: IndexedEvidence<string>;
  readonly action: FormActionEvidence;
  readonly range: SourceRange;
  readonly controls: readonly IndexedControlFact[];
}

export interface IndexedControlFact {
  readonly name: IndexedEvidence<string>;
  readonly controlKind: IndexedEvidence<
    "button" | "input" | "select" | "textarea"
  >;
  readonly inputType: IndexedEvidence<string>;
  readonly multiple: IndexedEvidence<boolean>;
  readonly multiplicity: IndexedEvidence<
    "mutually-exclusive" | "repeated" | "scalar"
  >;
  readonly successful: IndexedEvidence<boolean>;
  readonly range: SourceRange;
}

export type FormIndexFailureCode =
  | "form_index.digest_invalid"
  | "form_index.digest_mismatch"
  | "form_index.duplicate"
  | "form_index.json_invalid"
  | "form_index.noncanonical"
  | "form_index.path_invalid"
  | "form_index.range_invalid"
  | "form_index.shape_invalid"
  | "form_index.source_encoding_invalid"
  | "form_index.source_missing";

export class FormIndexFailure extends Error {
  readonly code: FormIndexFailureCode;
  readonly instancePath: string;

  constructor(
    code: FormIndexFailureCode,
    instancePath: string,
    message: string,
  ) {
    super(message);
    this.name = "FormIndexFailure";
    this.code = code;
    this.instancePath = instancePath;
  }
}
