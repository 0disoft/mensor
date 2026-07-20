import type { SourceRange } from "@0disoft/mensor-contract";

export interface FormFact {
  readonly id: string;
  readonly method: string;
  readonly methodRange: SourceRange;
  readonly action: FormActionFact;
  readonly fields: readonly FormFieldFact[];
  readonly unsupportedControls: readonly UnsupportedFormControlFact[];
  readonly range: SourceRange;
}

export type FormActionFact =
  | {
      readonly kind: "literal";
      readonly value: string;
      readonly range: SourceRange;
    }
  | {
      readonly kind: "current-document";
      readonly range: SourceRange;
    };

export interface FormFieldFact {
  readonly name: string;
  readonly controls: readonly FormControlFact[];
  readonly range: SourceRange;
}

export interface FormControlFact {
  readonly kind: "input" | "select" | "textarea";
  readonly inputType: string;
  readonly multiple: boolean;
  readonly range: SourceRange;
}

export interface UnsupportedFormControlFact {
  readonly kind: "button" | "input";
  readonly inputType: string;
  readonly name: string;
  readonly reason: "file-input" | "named-submitter" | "submitter-route-override";
  readonly range: SourceRange;
}
