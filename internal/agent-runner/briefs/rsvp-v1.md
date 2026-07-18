# Agent-Authored Application Brief: RSVP v1

## Goal

Build a complete dependency-free Node.js ESM RSVP application in the empty
`project/` directory. The project must satisfy its application semantics and
Mensor's current TypeScript/JavaScript plus static HTML contract.

## Product Behavior

- `GET /rsvp` returns an HTML page containing the RSVP form and all responses
  created by the current application instance.
- The form submits `POST /rsvp` as
  `application/x-www-form-urlencoded`.
- The form has exact id `rsvp-response` and exactly three application-owned
  named fields: `name`, `email`, and `attendance`.
- `attendance` is one radio group with exact values `yes`, `no`, and `maybe`.
  Exactly one selected radio value is accepted per request.
- `POST /rsvp` trims `name` and `email`, rejects missing, empty, duplicate, or
  unknown fields, rejects any other attendance value without changing state,
  creates one response on valid input, and returns a `303` redirect to `/rsvp`.
- Rendered name, email, and attendance values are HTML-escaped.
- State may remain in memory. Authentication, persistence, JavaScript browser
  enhancement, multipart input, cookies, and deployment are out of scope.

## Mensor Contract

- Use one root `mensor.project.jsonc` and one feature contract for feature id
  `rsvp`.
- Keep the form in a source `.html` file. Do not generate it from JavaScript.
- Declare one `POST /rsvp` action linked to form `rsvp-response`.
- Declare `name`, `email`, and `attendance` as required string properties
  decoded by the scalar text codec with trimming and empty-value rejection.
- Preserve the three same-name radio controls as one mutually exclusive wire
  field. Do not replace them with three differently named fields.
- Put the action handler in the declared server role and export it as a runtime
  value.
- Keep routes, server code, and views in distinct declared feature-relative
  role directories.

## Required Files

- runnable application source;
- static HTML form source;
- Mensor project and feature contracts;
- `test/semantic.test.mjs`, runnable with the Node test runner; and
- any small package metadata required for Node ESM, without dependencies or
  lifecycle scripts.

## Constraints

- Do not read or copy Mensor fixtures, examples, golden reports, tests, or
  another trial workspace.
- Do not install dependencies, access the network, execute shell scripts, or
  add credentials.
- Do not edit `input/`, the brief, or supplied documentation.
- Write only inside `project/`.
- Do not weaken or omit a contract merely to make the checker pass.
- Keep every generated file UTF-8 text with LF line endings and one final
  newline.

## Completion Evidence

The trial harness, not the agent, decides completion. It runs the generated
semantic test independently and then checks the generated project with Mensor.
Both must pass. A project that deletes behavior, weakens the contract, mutates
protected input, writes outside `project/`, or requires unapproved effects
fails the trial.
