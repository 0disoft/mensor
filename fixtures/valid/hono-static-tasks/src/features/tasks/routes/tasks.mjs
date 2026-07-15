import { createTask } from "../server/create-task.mjs";
import { renderTaskPage } from "../server/render-task-page.mjs";

export function registerTaskRoutes(app, dependencies) {
  app.get("/tasks", (context) =>
    context.html(renderTaskPage(dependencies.template, dependencies.store.list())),
  );
  app.post("/tasks", async (context) => {
    const decoded = decodeCreateTask(await context.req.text());
    if (!decoded.ok) {
      return context.text(decoded.message, 400);
    }
    createTask(dependencies.store, decoded.input);
    return context.redirect("/tasks", 303);
  });
}

function decodeCreateTask(body) {
  const form = new URLSearchParams(body);
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
