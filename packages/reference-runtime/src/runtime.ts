import {
  parseRuntimeManifest,
  serializeRuntimeManifest,
  type RuntimeAction,
  type RuntimeManifest,
} from "@0disoft/mensor-contract";

import { ReferenceRuntimeConfigurationError, RequestFailure } from "./errors.js";
import { decodeActionInput, readUrlEncodedFields, validateRawFields } from "./form.js";
import type {
  ActionGuardResult,
  HandlerResult,
  RawFormFields,
  ReferenceRuntime,
  ReferenceRuntimeLimits,
  ReferenceRuntimeOptions,
  RequestMetadata,
} from "./types.js";

const defaultLimits: ReferenceRuntimeLimits = {
  maxBodyBytes: 64 * 1024,
  maxFields: 128,
  maxFieldBytes: 8 * 1024,
};
const forbiddenResponseHeaders = new Set([
  "connection",
  "content-length",
  "content-type",
  "location",
  "set-cookie",
  "transfer-encoding",
]);

export function createReferenceRuntime(
  options: ReferenceRuntimeOptions,
): ReferenceRuntime {
  const manifest = canonicalManifest(options.manifest);
  const limits = normalizeLimits(options.limits);
  const actions = new Map(manifest.actions.map((action) => [action.path, action]));
  const pages = new Map(manifest.pages.map((page) => [page.path, page]));
  validateRegistry(manifest, options.handlers);
  if (manifest.actions.length > 0 && options.actionGuard === undefined) {
    throw new ReferenceRuntimeConfigurationError(
      "An actionGuard is required when the manifest contains actions.",
    );
  }

  return Object.freeze({
    manifest,
    handle: async (request: Request): Promise<Response> => {
      let url: URL;
      try {
        url = new URL(request.url);
      } catch {
        return response(400, "Invalid request.\n");
      }

      const page = pages.get(url.pathname);
      const action = actions.get(url.pathname);
      if (request.method === "GET" && page !== undefined) {
        return new Response(page.html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (request.method === "POST" && action !== undefined) {
        return handleAction({ request, url, action, options, limits });
      }
      if (page !== undefined || action !== undefined) {
        const allow = [page === undefined ? undefined : "GET", action === undefined ? undefined : "POST"]
          .filter((value): value is string => value !== undefined)
          .join(", ");
        return response(405, "Method not allowed.\n", { allow });
      }
      return response(404, "Not found.\n");
    },
  });
}

async function handleAction(options: {
  readonly request: Request;
  readonly url: URL;
  readonly action: RuntimeAction;
  readonly options: ReferenceRuntimeOptions;
  readonly limits: ReferenceRuntimeLimits;
}): Promise<Response> {
  try {
    const fields = await readUrlEncodedFields(options.request, options.limits);
    validateRawFields(options.action, fields);
    const requestMetadata = metadata(options.request, options.url);
    const guard = options.options.actionGuard;
    if (guard === undefined) {
      throw new ReferenceRuntimeConfigurationError("Action guard is unavailable.");
    }
    const guardResult = await guardResultFor(
      guard({ actionId: options.action.id, request: requestMetadata, fields }),
    );
    if (!guardResult.allowed) {
      return response(
        guardResult.status,
        guardResult.status === 401 ? "Unauthorized.\n" : "Forbidden.\n",
      );
    }

    const input = decodeActionInput(options.action, fields);
    const handler = options.options.handlers[options.action.handlerId];
    if (handler === undefined) {
      throw new ReferenceRuntimeConfigurationError("Action handler is unavailable.");
    }
    const result = await handler({
      actionId: options.action.id,
      path: options.action.path,
      input,
      request: requestMetadata,
      ...(guardResult.securityContext === undefined
        ? {}
        : { securityContext: guardResult.securityContext }),
    });
    return handlerResponse(result);
  } catch (error) {
    if (error instanceof RequestFailure) {
      return response(error.status, `${error.message}\n`);
    }
    return response(500, "Internal server error.\n");
  }
}

async function guardResultFor(
  value: ActionGuardResult | Promise<ActionGuardResult>,
): Promise<ActionGuardResult> {
  const result = await value;
  if (
    typeof result !== "object" ||
    result === null ||
    !("allowed" in result) ||
    (result.allowed !== true && result.allowed !== false) ||
    (result.allowed === false && result.status !== 401 && result.status !== 403)
  ) {
    throw new TypeError("Action guard returned an invalid result.");
  }
  return result;
}

function handlerResponse(result: HandlerResult): Response {
  if (result.kind === "redirect") {
    if (!isSafeRedirect(result.location)) {
      throw new TypeError("Handler returned an unsafe redirect.");
    }
    return new Response(null, { status: 303, headers: { location: result.location } });
  }
  const status = result.status ?? 200;
  if (!Number.isInteger(status) || status < 200 || status > 599 || status === 204 || status === 304) {
    throw new TypeError("Handler returned an invalid HTML status.");
  }
  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    const normalized = name.toLowerCase();
    if (forbiddenResponseHeaders.has(normalized) || /[\r\n]/u.test(value)) {
      throw new TypeError("Handler returned an unsafe response header.");
    }
    headers.set(name, value);
  }
  return new Response(result.body, { status, headers });
}

function canonicalManifest(manifest: RuntimeManifest): RuntimeManifest {
  let serialized: string;
  try {
    serialized = serializeRuntimeManifest(manifest);
  } catch (error) {
    throw new ReferenceRuntimeConfigurationError(
      error instanceof Error ? error.message : "Runtime manifest is invalid.",
    );
  }
  const parsed = parseRuntimeManifest(serialized);
  if (!parsed.ok) {
    throw new ReferenceRuntimeConfigurationError("Runtime manifest is invalid.");
  }
  return parsed.value;
}

function validateRegistry(
  manifest: RuntimeManifest,
  handlers: ReferenceRuntimeOptions["handlers"],
): void {
  const expected = [...manifest.actions.map((action) => action.handlerId)].sort();
  const actual = Object.keys(handlers).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new ReferenceRuntimeConfigurationError(
      "Handler registry ids must exactly match the runtime manifest.",
    );
  }
  for (const handler of Object.values(handlers)) {
    if (typeof handler !== "function") {
      throw new ReferenceRuntimeConfigurationError("Every registered handler must be a function.");
    }
  }
}

function normalizeLimits(
  value: Partial<ReferenceRuntimeLimits> | undefined,
): ReferenceRuntimeLimits {
  const limits = { ...defaultLimits, ...value };
  for (const [name, limit] of Object.entries(limits)) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new ReferenceRuntimeConfigurationError(`${name} must be a positive safe integer.`);
    }
  }
  return Object.freeze(limits);
}

function metadata(request: Request, url: URL): RequestMetadata {
  return Object.freeze({
    method: "POST" as const,
    path: url.pathname,
    query: grouped(url.searchParams.entries()),
    headers: grouped(request.headers.entries()),
  });
}

function grouped(entries: Iterable<readonly [string, string]>): Readonly<Record<string, readonly string[]>> {
  const values = new Map<string, string[]>();
  for (const [name, value] of entries) {
    const current = values.get(name) ?? [];
    current.push(value);
    values.set(name, current);
  }
  return Object.freeze(Object.fromEntries(
    [...values.entries()].map(([name, items]) => [name, Object.freeze(items)]),
  ));
}

function isSafeRedirect(location: string): boolean {
  return location.startsWith("/") && !location.startsWith("//") && !/[\r\n]/u.test(location);
}

function response(
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
  });
}
