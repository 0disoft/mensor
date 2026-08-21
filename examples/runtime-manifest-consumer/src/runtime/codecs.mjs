import {
  invalidValue,
  repeatedScalar,
  RuntimeRequestError,
} from "./errors.mjs";

const missing = Symbol("missing");
const integerPattern = /^-?(?:0|[1-9][0-9]*)$/u;
const decimalPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;

export function decodeBinding(binding, schema, values, required) {
  if (schema === undefined || binding.path.length !== 1) {
    throw new TypeError("RuntimeManifest contains an invalid form binding path.");
  }

  if (binding.decode.kind === "repeat") {
    if (values.length === 0 && !required) {
      return missing;
    }
    const decoded = values.map((value) =>
      decodeScalar(binding.name, binding.decode.items, schema.items, value)
    );
    validateArray(binding.name, schema, decoded);
    return Object.freeze(decoded);
  }

  if (binding.decode.kind === "checkbox") {
    if (values.length === 0) {
      return binding.decode.missing;
    }
    if (values.length !== 1) {
      repeatedScalar(binding.name);
    }
    const raw = values[0];
    if (!binding.decode.trueValues.includes(raw)) {
      invalidValue(binding.name, "is not an accepted checkbox value");
    }
    return true;
  }

  if (values.length === 0) {
    if (required) {
      throw new RuntimeRequestError(
        400,
        "runtime.form_field_missing",
        `Required form field ${JSON.stringify(binding.name)} is missing.`,
      );
    }
    return missing;
  }
  if (values.length !== 1) {
    repeatedScalar(binding.name);
  }
  return decodeScalar(binding.name, binding.decode, schema, values[0]);
}

export function isMissing(value) {
  return value === missing;
}

function decodeScalar(fieldName, decoder, schema, raw) {
  if (decoder.kind === "text") {
    const value = decoder.trim ? raw.trim() : raw;
    if (decoder.empty === "reject" && value.length === 0) {
      invalidValue(fieldName, "must not be empty");
    }
    validateString(fieldName, schema, value);
    return value;
  }
  if (decoder.kind === "integer-base10") {
    if (!integerPattern.test(raw)) {
      invalidValue(fieldName, "must be a strict base-10 integer");
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      invalidValue(fieldName, "must be a safe base-10 integer");
    }
    validateNumber(fieldName, schema, value);
    return value;
  }
  if (decoder.kind === "decimal") {
    if (!decimalPattern.test(raw)) {
      invalidValue(fieldName, "must be a finite decimal");
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      invalidValue(fieldName, "must be a finite decimal");
    }
    validateNumber(fieldName, schema, value);
    return value;
  }
  if (decoder.kind === "enum") {
    if (!decoder.values.includes(raw)) {
      invalidValue(fieldName, "must be one of the declared enum values");
    }
    return raw;
  }
  throw new TypeError(`Unsupported scalar decoder ${JSON.stringify(decoder.kind)}.`);
}

function validateString(fieldName, schema, value) {
  if (schema.kind !== "string") {
    throw new TypeError("RuntimeManifest pairs a text decoder with a non-string schema.");
  }
  const length = [...value].length;
  if (schema.minLength !== undefined && length < schema.minLength) {
    invalidValue(fieldName, `must contain at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && length > schema.maxLength) {
    invalidValue(fieldName, `must contain at most ${schema.maxLength} characters`);
  }
}

function validateNumber(fieldName, schema, value) {
  if (schema.kind !== "integer" && schema.kind !== "number") {
    throw new TypeError("RuntimeManifest pairs a numeric decoder with a non-numeric schema.");
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    invalidValue(fieldName, `must be greater than or equal to ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    invalidValue(fieldName, `must be less than or equal to ${schema.maximum}`);
  }
}

function validateArray(fieldName, schema, value) {
  if (schema.kind !== "array") {
    throw new TypeError("RuntimeManifest pairs a repeat decoder with a non-array schema.");
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    invalidValue(fieldName, `must contain at least ${schema.minItems} values`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    invalidValue(fieldName, `must contain at most ${schema.maxItems} values`);
  }
}

