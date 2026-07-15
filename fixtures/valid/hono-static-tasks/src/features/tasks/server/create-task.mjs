export function createTask(store, input) {
  return store.add(input.title);
}
