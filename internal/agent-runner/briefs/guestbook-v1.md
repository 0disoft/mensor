# Agent-Authored Application Brief: Guestbook v1

## Goal

Build a complete dependency-free Node.js ESM guestbook application in the
empty `project/` directory. The project must satisfy its application semantics
and Mensor's current TypeScript/JavaScript plus static HTML contract.

## Product Behavior

- `GET /guestbook` returns an HTML page containing the guestbook form and all
  entries created by the current application instance.
- The form submits `POST /guestbook` as
  `application/x-www-form-urlencoded`.
- The form has exact id `create-entry` and exactly two application-owned named
  fields: `author` and `message`.
- `POST /guestbook` trims both values, rejects missing, empty, duplicate, and
  unknown fields without changing state, creates one entry on valid input, and
  returns a `303` redirect to `/guestbook`.
- Rendered author and message values are HTML-escaped.
- State may remain in memory. Authentication, persistence, JavaScript browser
  enhancement, multipart input, cookies, and deployment are out of scope.

## Mensor Contract

- Use one root `mensor.project.jsonc` and one feature contract for feature id
  `guestbook`.
- Keep the form in a source `.html` file. Do not generate it from JavaScript.
- Declare one `POST /guestbook` action linked to form `create-entry`.
- Declare `author` and `message` as required string properties decoded by the
  scalar text codec with trimming and empty-value rejection.
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
