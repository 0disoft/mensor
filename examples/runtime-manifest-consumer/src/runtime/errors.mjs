export class RuntimeRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RuntimeRequestError";
    this.status = status;
    this.code = code;
  }
}

export function repeatedScalar(fieldName) {
  throw new RuntimeRequestError(
    400,
    "runtime.form_field_repeated",
    `Scalar form field ${JSON.stringify(fieldName)} must occur exactly once.`,
  );
}

export function invalidValue(fieldName, requirement) {
  throw new RuntimeRequestError(
    400,
    "runtime.form_value_invalid",
    `Form field ${JSON.stringify(fieldName)} ${requirement}.`,
  );
}

export function bodyTooLarge(maxBodyBytes) {
  throw new RuntimeRequestError(
    413,
    "runtime.body_too_large",
    `The request body exceeds the ${maxBodyBytes}-byte limit.`,
  );
}

export async function notifyError(onError, error, request, action) {
  if (onError === undefined) {
    return;
  }
  try {
    await onError(error, { action, request });
  } catch {
    // Error reporting must not replace the canonical handler failure response.
  }
}

export function problem(status, code, message, additionalHeaders = {}) {
  return new Response(
    `${JSON.stringify({ error: { code, message } }, null, 2)}\n`,
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
        ...additionalHeaders,
      },
    },
  );
}
