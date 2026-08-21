import {
  isUrlencodedContentType,
  parseUrlencoded,
  readBoundedBody,
} from "./body.mjs";
import {
  decodeBinding,
  isMissing,
} from "./codecs.mjs";
import { RuntimeRequestError } from "./errors.mjs";

export async function decodeActionInput(action, request, maxBodyBytes, maxFields) {
  if (!isUrlencodedContentType(request.headers.get("content-type"))) {
    throw new RuntimeRequestError(
      415,
      "runtime.content_type_unsupported",
      "POST actions require application/x-www-form-urlencoded content.",
    );
  }

  const body = await readBoundedBody(request, maxBodyBytes);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new RuntimeRequestError(
      400,
      "runtime.form_encoding_invalid",
      "The form body must be valid UTF-8.",
    );
  }
  const fields = parseUrlencoded(text, maxFields);
  const bindingsByName = new Map(
    action.input.formCodec.bindings.map((binding) => [binding.name, binding]),
  );
  const ignoredNames = new Set(
    (action.input.formCodec.ignoredFields ?? []).map((field) => field.name),
  );

  for (const name of fields.keys()) {
    if (!bindingsByName.has(name) && !ignoredNames.has(name)) {
      throw new RuntimeRequestError(
        400,
        "runtime.form_field_unknown",
        `Form field ${JSON.stringify(name)} is not declared by the action contract.`,
      );
    }
  }

  const required = new Set(action.input.schema.required);
  const input = Object.create(null);
  for (const binding of action.input.formCodec.bindings) {
    const propertyName = binding.path[0];
    const schema = action.input.schema.properties[propertyName];
    const values = fields.get(binding.name) ?? [];
    const value = decodeBinding(
      binding,
      schema,
      values,
      required.has(propertyName),
    );
    if (!isMissing(value)) {
      Object.defineProperty(input, propertyName, {
        configurable: false,
        enumerable: true,
        value,
        writable: false,
      });
    }
  }

  const ignoredFields = Object.create(null);
  for (const name of ignoredNames) {
    const values = fields.get(name);
    if (values !== undefined) {
      Object.defineProperty(ignoredFields, name, {
        configurable: false,
        enumerable: true,
        value: Object.freeze([...values]),
        writable: false,
      });
    }
  }

  return {
    ignoredFields: Object.freeze(ignoredFields),
    input: Object.freeze(input),
  };
}
