import { createRsvp } from "../server/create-rsvp.mjs";
import { renderRsvpPage } from "../server/render-rsvp-page.mjs";

const formMediaType = "application/x-www-form-urlencoded";
const fieldNames = ["name", "email", "attendance"];
const attendanceValues = new Set(["yes", "no", "maybe"]);

export function createRsvpRouter(dependencies) {
  return async function handleRequest(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/rsvp") {
      return new Response("Not found.", { status: 404 });
    }
    if (request.method === "GET") {
      return html(renderRsvpPage(dependencies.template, dependencies.store.list()));
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed.", {
        status: 405,
        headers: { allow: "GET, POST" },
      });
    }
    if (mediaType(request.headers.get("content-type")) !== formMediaType) {
      return new Response("Unsupported media type.", { status: 415 });
    }

    const decoded = decodeRsvp(await request.text());
    if (!decoded.ok) {
      return new Response(decoded.message, { status: 400 });
    }
    createRsvp(dependencies.store, decoded.input);
    return new Response(null, {
      status: 303,
      headers: { location: "/rsvp" },
    });
  };
}

function decodeRsvp(body) {
  const form = new URLSearchParams(body);
  const receivedNames = [...new Set(form.keys())];
  if (receivedNames.some((name) => !fieldNames.includes(name))) {
    return { ok: false, message: "Unexpected form field." };
  }

  const values = Object.fromEntries(
    fieldNames.map((name) => [name, form.getAll(name)]),
  );
  if (fieldNames.some((name) => values[name].length !== 1)) {
    return { ok: false, message: "Each field must occur exactly once." };
  }

  const input = {
    name: values.name[0].trim(),
    email: values.email[0].trim(),
    attendance: values.attendance[0].trim(),
  };
  if (
    input.name.length === 0
    || input.name.length > 80
    || input.email.length === 0
    || input.email.length > 254
    || !attendanceValues.has(input.attendance)
  ) {
    return { ok: false, message: "Invalid RSVP response." };
  }
  return { ok: true, input };
}

function mediaType(contentType) {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function html(body) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
