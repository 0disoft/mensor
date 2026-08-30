import type {
  JsonObject,
  JsonValue,
  RuntimeManifest,
} from "@0disoft/mensor-contract";

export interface ReferenceRuntimeLimits {
  readonly maxBodyBytes: number;
  readonly maxFields: number;
  readonly maxFieldBytes: number;
}

export interface ReferenceRuntimeOptions {
  readonly manifest: RuntimeManifest;
  readonly handlers: Readonly<Record<string, ActionHandler>>;
  readonly actionGuard?: ActionGuard;
  readonly limits?: Partial<ReferenceRuntimeLimits>;
}

export interface ReferenceRuntime {
  readonly manifest: RuntimeManifest;
  readonly handle: (request: Request) => Promise<Response>;
}

export interface RequestMetadata {
  readonly method: "POST";
  readonly path: string;
  readonly query: Readonly<Record<string, readonly string[]>>;
  readonly headers: Readonly<Record<string, readonly string[]>>;
}

export type RawFormFields = Readonly<Record<string, readonly string[]>>;

export interface ActionGuardContext {
  readonly actionId: string;
  readonly request: RequestMetadata;
  readonly fields: RawFormFields;
}

export type ActionGuardResult =
  | {
      readonly allowed: true;
      readonly securityContext?: JsonValue;
    }
  | {
      readonly allowed: false;
      readonly status: 401 | 403;
    };

export type ActionGuard = (
  context: ActionGuardContext,
) => ActionGuardResult | Promise<ActionGuardResult>;

export interface ActionHandlerContext {
  readonly actionId: string;
  readonly path: string;
  readonly input: JsonObject;
  readonly request: RequestMetadata;
  readonly securityContext?: JsonValue;
}

export type ActionHandler = (
  context: ActionHandlerContext,
) => HandlerResult | Promise<HandlerResult>;

export type HandlerResult =
  | {
      readonly kind: "html";
      readonly body: string;
      readonly status?: number;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "redirect";
      readonly location: string;
    };
