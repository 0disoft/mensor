import { createTask } from "../server/create-task.mjs";
import { renderTaskPage } from "../server/render-task-page.mjs";

export async function handleTasksRequest(request, dependencies) {
  const url = new URL(request.url);
  if (url.pathname !== "/tasks") {
    return new Response("Not found\n", { status: 404 });
  }
  if (request.method === "GET") {
    return html(renderTaskPage(dependencies.template, dependencies.store.list()));
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed\n", {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }
  const decoded = await decodeCreateTask(request);
  if (!decoded.ok) {
    return new Response(`${decoded.message}\n`, { status: 400 });
  }
  createTask(dependencies.store, decoded.input);
  return new Response(null, {
    status: 303,
    headers: { location: "/tasks" },
  });
}

async function decodeCreateTask(request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return { ok: false, message: "Expected URL-encoded form data." };
  }
  const form = new URLSearchParams(await request.text());
  const names = [...new Set(form.keys())];
  if (names.some((name) => name !== "title")) {
    return { ok: false, message: "Unexpected form field." };
  }
  const titles = form.getAll("title");
  if (titles.length !== 1) {
    return { ok: false, message: "Expected one title field." };
  }
  const title = titles[0].trim();
  if (title.length === 0 || title.length > 120) {
    return { ok: false, message: "Title must contain 1 to 120 characters." };
  }
  return { ok: true, input: { title } };
}

function html(body) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
