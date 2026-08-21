import { decodeActionInput } from "./decode.mjs";
import {
  notifyError,
  problem,
  RuntimeRequestError,
} from "./errors.mjs";
import {
  assertManifest,
  positiveLimit,
  registerRoute,
  resolveHandler,
} from "./manifest.mjs";

const defaultMaxBodyBytes = 65_536;
const defaultMaxFields = 256;

export function createRuntimeManifestConsumer(options) {
  const manifest = assertManifest(options?.manifest);
  const handlers = options?.handlers;
  const services = options?.services;
  const onError = options?.onError;
  const maxBodyBytes = positiveLimit(
    options?.maxBodyBytes ?? defaultMaxBodyBytes,
    "maxBodyBytes",
  );
  const maxFields = positiveLimit(
    options?.maxFields ?? defaultMaxFields,
    "maxFields",
  );
  if (onError !== undefined && typeof onError !== "function") {
    throw new TypeError("onError must be a function when provided.");
  }

  const pages = new Map();
  const actions = new Map();
  const methodsByPath = new Map();

  for (const page of manifest.pages) {
    registerRoute(methodsByPath, page.method, page.path);
    if (pages.has(page.path)) {
      throw new TypeError(`RuntimeManifest declares duplicate GET route ${JSON.stringify(page.path)}.`);
    }
    pages.set(page.path, page);
  }

  for (const action of manifest.actions) {
    registerRoute(methodsByPath, action.method, action.path);
    if (actions.has(action.path)) {
      throw new TypeError(`RuntimeManifest declares duplicate POST route ${JSON.stringify(action.path)}.`);
    }
    const handler = resolveHandler(handlers, action.handlerId);
    if (typeof handler !== "function") {
      throw new TypeError(
        `No handler function is registered for ${JSON.stringify(action.handlerId)}.`,
      );
    }
    actions.set(action.path, { action, handler });
  }

  return async function handleRequest(request) {
    if (!(request instanceof Request)) {
      throw new TypeError("Runtime consumers accept a standard Request instance.");
    }
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET") {
      const page = pages.get(url.pathname);
      if (page !== undefined) {
        return new Response(page.html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-content-type-options": "nosniff",
          },
        });
      }
    }

    if (method === "POST") {
      const route = actions.get(url.pathname);
      if (route !== undefined) {
        let decoded;
        try {
          decoded = await decodeActionInput(
            route.action,
            request,
            maxBodyBytes,
            maxFields,
          );
        } catch (error) {
          if (error instanceof RuntimeRequestError) {
            return problem(error.status, error.code, error.message);
          }
          await notifyError(onError, error, request, route.action);
          return problem(500, "runtime.decode_failed", "The request could not be decoded.");
        }

        try {
          const response = await route.handler({
            action: route.action,
            ignoredFields: decoded.ignoredFields,
            input: decoded.input,
            request,
            services,
          });
          if (!(response instanceof Response)) {
            throw new TypeError(
              `Handler ${JSON.stringify(route.action.handlerId)} must return a Response.`,
            );
          }
          return response;
        } catch (error) {
          await notifyError(onError, error, request, route.action);
          return problem(500, "runtime.handler_failed", "The action handler failed.");
        }
      }
    }

    const allowedMethods = methodsByPath.get(url.pathname);
    if (allowedMethods !== undefined) {
      return problem(
        405,
        "runtime.method_not_allowed",
        "The request method is not allowed for this route.",
        { allow: [...allowedMethods].sort().join(", ") },
      );
    }
    return problem(404, "runtime.route_not_found", "No runtime route matches this request.");
  };
}
