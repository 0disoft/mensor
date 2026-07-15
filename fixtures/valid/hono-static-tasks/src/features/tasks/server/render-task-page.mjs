const marker = "<!-- TASK_ITEMS -->";

export function renderTaskPage(template, tasks) {
  const items = tasks
    .map((task) => `<li data-task-id="${task.id}">${escapeHtml(task.title)}</li>`)
    .join("");
  if (!template.includes(marker)) {
    throw new Error("Task page template is missing its item marker.");
  }
  return template.replace(marker, items);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
