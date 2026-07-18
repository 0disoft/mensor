import { readFile } from "node:fs/promises";

import { createRsvpStore } from "./features/rsvp/database/rsvp-store.mjs";
import { createRsvpRouter } from "./features/rsvp/routes/rsvp.mjs";

const templateUrl = new URL("./features/rsvp/views/index.html", import.meta.url);

export function createRsvpApp({ templateHtml }) {
  return {
    fetch: createRsvpRouter({
      store: createRsvpStore(),
      template: templateHtml,
    }),
  };
}

export async function createNodeStaticRsvpApp() {
  const templateHtml = await readFile(templateUrl, "utf8");
  return createRsvpApp({ templateHtml }).fetch;
}
