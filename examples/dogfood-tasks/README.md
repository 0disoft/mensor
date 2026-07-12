# Dogfood Tasks

This is a runnable dependency-free server-rendered application used to test
Mensor outside the synthetic fixture corpus. Its `Request -> Response` handler
serves a task page, decodes a URL-encoded form, invokes a server action, and
persists tasks in an in-memory store.

The root test suite proves both the clean compiler report and application
semantics. The mutation benchmark also uses this application as a pinned
baseline. It is evidence for the current static HTML and Node.js boundary, not
a framework adapter or production runtime.
