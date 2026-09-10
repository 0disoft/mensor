# Guarded HonoX RSVP

A maintained checkout example of server-rendered JSX form inspection. This is
adapted from the historical HonoX trial; the trial and its evidence are untouched.
The response list uses `Array.from`, const snapshots and string guards.

## Run

Use Node 22.13 or later. From the repository root, install the workspace
dependencies and run `pnpm run build` first. Then, from this directory:

```sh
npm install --ignore-scripts
npm run check
npm test
npm start
```

Open `http://127.0.0.1:4174/rsvp`. Set `PORT` to another free port if needed.
`npm test` builds the real HonoX/Vite server and checks it through Request/Response
calls. `npm start` serves that build on loopback only. Data is in memory and is
lost when the process restarts; this is not a production deployment template.

## What Is Checked

`npm run check` regenerates the source-bound FormIndex and runs the checkout CLI.
It verifies form fields, the exported POST handler and explicit renderer/build
evidence. It does not statically verify HonoX file routing: the report deliberately
shows routes as `not-configured`. The HTTP oracle separately checks GET/POST,
redirects, stored responses, escaping, malformed input, media types and isolation.
The test mutates only temporary copies to prove stale-index rejection, then
regenerates the index and proves a missing email field is detected.

To inspect freshness yourself, run the checkout CLI directly after changing a
source instead of regenerating first:

```sh
node ../../packages/cli/dist/src/bin.js check . --json --report-version 2
```

FormIndex output, build output and dependencies are ignored. Installed published
Mensor packages are not used here; package-consumer validation is a separate gate.
The schema checks nonempty text; the example POST handler additionally validates
email shape and the three attendance choices, covered by the HTTP tests.

## Workspace Agent Commands

From the parent Mustflow workspace, use the delegated repository selector
`--repo projects/hobby/opensource/mensor` with `mensor_guarded_rsvp_install` and
`mensor_guarded_rsvp_check`. Installation requires network and dependency-install
allowances. The check is bounded and does not start a listener. `npm start` is a
manual developer command, not an agent-runnable background process.
