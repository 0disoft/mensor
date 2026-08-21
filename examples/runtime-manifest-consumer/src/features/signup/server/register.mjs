export async function registerSignup({ ignoredFields, input, request, services }) {
  if (
    typeof services?.verifyCsrf !== "function" ||
    !(await services.verifyCsrf({
      request,
      values: ignoredFields.csrf ?? [],
    }))
  ) {
    return new Response("Forbidden\n", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (typeof services?.saveSignup !== "function") {
    throw new TypeError("The host must provide saveSignup(input).");
  }
  await services.saveSignup(input);
  return new Response(null, {
    status: 303,
    headers: { location: "/signup" },
  });
}
