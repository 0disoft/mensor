import { writeFileSync } from "node:fs";

writeFileSync(new URL("compiler-executed.txt", import.meta.url), "executed\n");

export function createTask(): void {
  // This source is intentionally in the route slot for the placement fixture.
}
