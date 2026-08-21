import {
  bodyTooLarge,
  RuntimeRequestError,
} from "./errors.mjs";

export async function readBoundedBody(request, maxBodyBytes) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^[0-9]+$/u.test(declaredLength) &&
    Number(declaredLength) > maxBodyBytes
  ) {
    bodyTooLarge(maxBodyBytes);
  }
  if (request.body === null) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      if (!(result.value instanceof Uint8Array)) {
        throw new TypeError("Request bodies must yield Uint8Array chunks.");
      }
      total += result.value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        bodyTooLarge(maxBodyBytes);
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof RuntimeRequestError) {
      throw error;
    }
    throw new RuntimeRequestError(
      400,
      "runtime.body_unreadable",
      "The request body could not be read.",
    );
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function parseUrlencoded(text, maxFields) {
  const fields = new Map();
  if (text.length === 0) {
    return fields;
  }
  let count = 0;
  for (const pair of text.split("&")) {
    if (pair.length === 0) {
      continue;
    }
    count += 1;
    if (count > maxFields) {
      throw new RuntimeRequestError(
        400,
        "runtime.form_field_limit_exceeded",
        `The form contains more than ${maxFields} fields.`,
      );
    }
    const separator = pair.indexOf("=");
    const encodedName = separator === -1 ? pair : pair.slice(0, separator);
    const encodedValue = separator === -1 ? "" : pair.slice(separator + 1);
    const name = decodeFormComponent(encodedName);
    const value = decodeFormComponent(encodedValue);
    const values = fields.get(name);
    if (values === undefined) {
      fields.set(name, [value]);
    } else {
      values.push(value);
    }
  }
  return fields;
}

function decodeFormComponent(value) {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    throw new RuntimeRequestError(
      400,
      "runtime.form_encoding_invalid",
      "The form body contains invalid percent encoding.",
    );
  }
}

export function isUrlencodedContentType(value) {
  if (value === null) {
    return false;
  }
  const parts = value.split(";");
  if (parts.shift()?.trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return false;
  }
  let charsetSeen = false;
  for (const part of parts) {
    const parameter = part.trim();
    const separator = parameter.indexOf("=");
    if (separator === -1) {
      return false;
    }
    const name = parameter.slice(0, separator).trim().toLowerCase();
    let parameterValue = parameter.slice(separator + 1).trim();
    if (parameterValue.startsWith('"') && parameterValue.endsWith('"')) {
      parameterValue = parameterValue.slice(1, -1);
    }
    if (
      name !== "charset" ||
      charsetSeen ||
      parameterValue.toLowerCase() !== "utf-8"
    ) {
      return false;
    }
    charsetSeen = true;
  }
  return true;
}
