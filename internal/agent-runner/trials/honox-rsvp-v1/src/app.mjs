import { createHonoxRsvpApp } from '../dist/server.js'

export async function createRsvpApp() {
  const responses = []
  const app = createHonoxRsvpApp(responses)
  return {
    fetch: (request, ...rest) => app.fetch(request, ...rest),
  }
}
