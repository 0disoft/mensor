import type {
  ContentDigest,
  FormIndex,
  FormIndexActionEvidence,
  FormIndexControl,
  FormIndexDocument,
  FormIndexDocumentInspection,
  FormIndexDynamicReason,
  FormIndexEvidence,
  FormIndexForm,
  FormIndexUnsupportedReason,
} from "@0disoft/mensor-contract";

export type {
  ContentDigest,
  FormIndex,
  FormIndexActionEvidence as FormActionEvidence,
  FormIndexControl as IndexedControlFact,
  FormIndexDocument as FormDocumentFact,
  FormIndexDocumentInspection as DocumentInspection,
  FormIndexDynamicReason as DynamicReason,
  FormIndexEvidence as IndexedEvidence,
  FormIndexForm as IndexedFormFact,
  FormIndexUnsupportedReason as UnsupportedReason,
};

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
