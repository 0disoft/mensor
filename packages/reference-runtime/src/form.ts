import type {
  JsonObject,
  JsonValue,
  PropertySchema,
  RuntimeAction,
  ScalarSchema,
} from "@0disoft/mensor-contract";

import { ReferenceRuntimeConfigurationError, RequestFailure } from "./errors.js";
import type { RawFormFields, ReferenceRuntimeLimits } from "./types.js";

const forbiddenPropertyNames = new Set(["__proto__", "constructor", "prototype"]);
const integerPattern = /^-?(?:0|[1-9][0-9]*)$/u;
const decimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;

export async function readUrlEncodedFields(
  request: Request,
  limits: ReferenceRuntimeLimits,
): Promise<RawFormFields> {
  const mediaType = request.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded") {
    throw new RequestFailure(415, "Unsupported media type.");
  }

  const bytes = await readBoundedBody(request, limits.maxBodyBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestFailure(400, "Invalid form submission.");
  }

  const entries = [...new URLSearchParams(text).entries()];
  if (entries.length > limits.maxFields) {
    throw new RequestFailure(413, "Request body contains too many fields.");
  }

  const fields = new Map<string, string[]>();
  const encoder = new TextEncoder();
  for (const [name, value] of entries) {
    if (
      name.length === 0 ||
      forbiddenPropertyNames.has(name) ||
      encoder.encode(name).byteLength > limits.maxFieldBytes ||
      encoder.encode(value).byteLength > limits.maxFieldBytes
    ) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    const values = fields.get(name) ?? [];
    values.push(value);
    fields.set(name, values);
  }

  return Object.freeze(Object.fromEntries(
    [...fields.entries()].map(([name, values]) => [name, Object.freeze(values)]),
  ));
}

export function validateRawFields(
  action: RuntimeAction,
  fields: RawFormFields,
): void {
  const bindings = new Map(
    action.input.formCodec.bindings.map((binding) => [binding.name, binding]),
  );
  const ignored = new Set(
    (action.input.formCodec.ignoredFields ?? []).map((field) => field.name),
  );

  for (const [name, values] of Object.entries(fields)) {
    const binding = bindings.get(name);
    if (binding === undefined && !ignored.has(name)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    if (
      (binding === undefined || binding.decode.kind !== "repeat") &&
      values.length !== 1
    ) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
  }
}

export function decodeActionInput(
  action: RuntimeAction,
  fields: RawFormFields,
): JsonObject {
  const decoded: Record<string, JsonValue> =
    Object.create(null) as Record<string, JsonValue>;
  const required = new Set(action.input.schema.required);

  for (const binding of action.input.formCodec.bindings) {
    const propertyName = binding.path[0];
    if (
      binding.path.length !== 1 ||
      propertyName === undefined ||
      forbiddenPropertyNames.has(propertyName)
    ) {
      throw new ReferenceRuntimeConfigurationError(
        `Action ${JSON.stringify(action.id)} contains an unsafe form binding path.`,
      );
    }
    const schema = action.input.schema.properties[propertyName];
    if (schema === undefined) {
      throw new ReferenceRuntimeConfigurationError(
        `Action ${JSON.stringify(action.id)} binds an unknown schema property.`,
      );
    }
    const values = fields[binding.name];
    if (values === undefined) {
      if (binding.decode.kind === "checkbox") {
        decoded[propertyName] = binding.decode.missing;
        continue;
      }
      if (required.has(propertyName)) {
        throw new RequestFailure(400, "Invalid form submission.");
      }
      continue;
    }

    const decoder = binding.decode;
    const value: JsonValue = decoder.kind === "repeat"
      ? Object.freeze(values.map((item) => decodeScalar(item, decoder.items)))
      : decodeScalar(values[0] ?? "", decoder);
    validateSchemaValue(value, schema);
    decoded[propertyName] = value;
  }

  for (const propertyName of required) {
    if (!Object.hasOwn(decoded, propertyName)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
  }
  return Object.freeze({ ...decoded });
}

function decodeScalar(
  value: string,
  decoder: Exclude<RuntimeAction["input"]["formCodec"]["bindings"][number]["decode"], { kind: "repeat" }>,
): string | number | boolean {
  if (decoder.kind === "text") {
    const decoded = decoder.trim ? value.trim() : value;
    if (decoder.empty === "reject" && decoded.length === 0) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return decoded;
  }
  if (decoder.kind === "integer-base10") {
    if (!integerPattern.test(value)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    const decoded = Number(value);
    if (!Number.isSafeInteger(decoded)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return decoded;
  }
  if (decoder.kind === "decimal") {
    if (!decimalPattern.test(value)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    const decoded = Number(value);
    if (!Number.isFinite(decoded)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return decoded;
  }
  if (decoder.kind === "checkbox") {
    if (!decoder.trueValues.includes(value)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return true;
  }
  if (!decoder.values.includes(value)) {
    throw new RequestFailure(400, "Invalid form submission.");
  }
  return value;
}

function validateSchemaValue(
  value: string | number | boolean | readonly unknown[],
  schema: PropertySchema,
): void {
  if (schema.kind === "array") {
    if (!Array.isArray(value)) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    if (
      (schema.minItems !== undefined && value.length < schema.minItems) ||
      (schema.maxItems !== undefined && value.length > schema.maxItems)
    ) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    for (const item of value) {
      validateScalarSchema(item, schema.items);
    }
    return;
  }
  validateScalarSchema(value, schema);
}

function validateScalarSchema(value: unknown, schema: ScalarSchema): void {
  if (schema.kind === "string") {
    if (typeof value !== "string") {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    const length = [...value].length;
    if (
      (schema.minLength !== undefined && length < schema.minLength) ||
      (schema.maxLength !== undefined && length > schema.maxLength)
    ) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return;
  }
  if (schema.kind === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum)
    ) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return;
  }
  if (schema.kind === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum)
    ) {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return;
  }
  if (schema.kind === "boolean") {
    if (typeof value !== "boolean") {
      throw new RequestFailure(400, "Invalid form submission.");
    }
    return;
  }
  if (typeof value !== "string" || !schema.values.includes(value)) {
    throw new RequestFailure(400, "Invalid form submission.");
  }
}

async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array> {
  if (request.body === null) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) {
        break;
      }
      total += item.value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new RequestFailure(413, "Request body too large.");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
