import { readFile } from "node:fs/promises";

import { createRsvpStore } from "./features/rsvp/database/rsvp-store.mjs";
import { createRsvpRouter } from "./features/rsvp/routes/rsvp.mjs";

const templateUrl = new URL("./features/rsvp/views/index.html", import.meta.url);

export async function createNodeStaticRsvpApp() {
  return createRsvpRouter({
    store: createRsvpStore(),
    template: await readFile(templateUrl, "utf8"),
  });
}
