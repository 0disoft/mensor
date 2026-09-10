import { Hono } from 'hono'
import { createApp } from 'honox/server'

export type RsvpEntry = {
  name: string
  email: string
  attendance: string
}

const inner = createApp()

export function createHonoxRsvpApp(responses: RsvpEntry[]) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    ;(c as any).set('rsvpResponses', responses)
    await next()
  })
  app.notFound((c) => c.text('Not Found', 404))
  app.route('/', inner)
  return app
}

export default createHonoxRsvpApp([])
