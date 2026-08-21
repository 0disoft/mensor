export function assertManifest(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.manifestVersion !== 1 ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.actions)
  ) {
    throw new TypeError("manifest must be a validated RuntimeManifest v1 value.");
  }
  for (const page of value.pages) {
    assertRoute(page, "GET");
    if (typeof page.html !== "string") {
      throw new TypeError("RuntimeManifest pages must contain HTML strings.");
    }
  }
  for (const action of value.actions) {
    assertRoute(action, "POST");
    if (
      typeof action.handlerId !== "string" ||
      action.handlerId.length === 0 ||
      typeof action.input !== "object" ||
      action.input === null ||
      action.input.formCodec?.encoding !== "urlencoded" ||
      action.input.formCodec?.unknownFields !== "reject"
    ) {
      throw new TypeError("RuntimeManifest actions must contain supported handler and input contracts.");
    }
  }
  return value;
}

function assertRoute(route, expectedMethod) {
  if (
    typeof route !== "object" ||
    route === null ||
    route.method !== expectedMethod ||
    typeof route.path !== "string" ||
    !/^\/[^?#]*$/u.test(route.path)
  ) {
    throw new TypeError(`RuntimeManifest contains an invalid ${expectedMethod} route.`);
  }
}

export function registerRoute(methodsByPath, method, path) {
  const methods = methodsByPath.get(path);
  if (methods === undefined) {
    methodsByPath.set(path, new Set([method]));
  } else {
    methods.add(method);
  }
}

export function resolveHandler(handlers, id) {
  if (handlers instanceof Map) {
    return handlers.get(id);
  }
  if (typeof handlers !== "object" || handlers === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(handlers, id);
  return descriptor?.value;
}

export function positiveLimit(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return value;
}
