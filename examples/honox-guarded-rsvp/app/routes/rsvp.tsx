import { createRoute } from 'honox/factory'

type RsvpEntry = {
  name: string
  email: string
  attendance: string
}

function getStore(c: any): RsvpEntry[] {
  const value = c.get('rsvpResponses')
  if (Array.isArray(value)) {
    return value as RsvpEntry[]
  }
  return []
}

function isValidEmail(value: string): boolean {
  if (/\s/.test(value)) {
    return false
  }
  const first = value.indexOf('@')
  const last = value.lastIndexOf('@')
  if (first <= 0 || first !== last || first === value.length - 1) {
    return false
  }
  const local = value.slice(0, first)
  const domain = value.slice(first + 1)
  if (!local || !domain) {
    return false
  }
  return true
}

export default createRoute((c: any) => {
  const responses = getStore(c)
  return c.render(
    <>
      <h1>RSVP</h1>
      <form id="rsvp-response" method="post">
        <label>
          Name
          <input type="text" name="name" required />
        </label>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <fieldset>
          <legend>Attendance</legend>
          <label>
            <input type="radio" name="attendance" value="yes" required />
            Yes
          </label>
          <label>
            <input type="radio" name="attendance" value="no" required />
            No
          </label>
          <label>
            <input type="radio" name="attendance" value="maybe" required />
            Maybe
          </label>
        </fieldset>
        <button type="submit">Submit</button>
      </form>
      <section>
        <h2>Responses</h2>
        <ul>
          {Array.from(responses, (entry) => {
            const name = entry.name
            const email = entry.email
            const attendance = entry.attendance
            return (
            <li>
              <span>{typeof name === 'string' ? name : ''}</span> <span>{typeof email === 'string' ? email : ''}</span>{' '}
              <span>{typeof attendance === 'string' ? attendance : ''}</span>
            </li>
          ); })}
        </ul>
      </section>
    </>,
  )
})

export const POST = createRoute(async (c: any) => {
  const rawType = c.req.header('content-type') ?? ''
  const mime = rawType.split(';')[0].trim().toLowerCase()
  if (mime !== 'application/x-www-form-urlencoded') {
    return c.text('Unsupported Media Type', 415)
  }
  const bodyText = await c.req.text()
  const params = new URLSearchParams(bodyText)
  for (const key of params.keys()) {
    if (key !== 'name' && key !== 'email' && key !== 'attendance') {
      return c.text('Invalid submission', 400)
    }
  }
  const names = params.getAll('name')
  const emails = params.getAll('email')
  const attendances = params.getAll('attendance')
  if (names.length !== 1 || emails.length !== 1 || attendances.length !== 1) {
    return c.text('Invalid submission', 400)
  }
  const name = names[0].trim()
  const email = emails[0].trim()
  const attendance = attendances[0].trim()
  if (!name || !email || !attendance) {
    return c.text('Invalid submission', 400)
  }
  if (attendance !== 'yes' && attendance !== 'no' && attendance !== 'maybe') {
    return c.text('Invalid submission', 400)
  }
  if (!isValidEmail(email)) {
    return c.text('Invalid submission', 400)
  }
  const store = getStore(c)
  store.push({ name, email, attendance })
  return c.redirect('/rsvp', 303)
})

export const PUT = createRoute((c: any) => {
  return c.text('Method Not Allowed', 405)
})

export const DELETE = createRoute((c: any) => {
  return c.text('Method Not Allowed', 405)
})

export const PATCH = createRoute((c: any) => {
  return c.text('Method Not Allowed', 405)
})
