import { readFile } from "node:fs/promises";

import { createTaskStore } from "./features/tasks/database/task-store.mjs";
import { handleTasksRequest } from "./features/tasks/routes/tasks.mjs";

const templateUrl = new URL("./features/tasks/views/index.html", import.meta.url);

export async function createDogfoodApp() {
  const dependencies = {
    store: createTaskStore(),
    template: await readFile(templateUrl, "utf8"),
  };
  return (request) => handleTasksRequest(request, dependencies);
}
