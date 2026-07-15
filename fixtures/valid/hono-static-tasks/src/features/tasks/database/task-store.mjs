export function createTaskStore() {
  const tasks = [];
  return {
    add(title) {
      const task = { id: tasks.length + 1, title };
      tasks.push(task);
      return task;
    },
    list() {
      return tasks.map((task) => ({ ...task }));
    },
  };
}
