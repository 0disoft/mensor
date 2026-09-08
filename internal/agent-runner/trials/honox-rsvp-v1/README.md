# HonoX RSVP Capability Trial

This private experiment executes an original HonoX application. It is not a
public package, production example, FormIndex producer, or repair-rate benchmark.

## Result

On Windows x64 with Node 24.18.0, Hono 4.13.7, HonoX 0.1.61 and Vite 7.3.6:

- The original candidate built successfully and passed three of four protected
  semantic tests. It accepted an unknown form field, violating the brief.
- One repair request supplied only that failing submission and the original
  requirement. The author added an allowed-key check before state mutation.
- The repaired candidate built successfully and passed all four semantic tests.
- GET rendering, current-document submission, redirects, escaping, isolated
  instance state, rejected inputs, media types and unsupported methods are covered
  by the protected oracle. This does not claim exhaustive HTTP or browser testing.

`original-response.json` preserves the initial source artifact. `evidence.json`
records both attempts, exact dependency versions, input/artifact SHA-256 hashes,
and the final TSX inventory with zero-based UTF-16 opening-element ranges.
The evaluator supplies `package.json`, the dependency lock and `tsconfig.json`;
the latter removes the initial build's missing-configuration warning.

## Source Review

`app/server.ts` calls the real `honox/server` route loader. An outer Hono instance
injects an instance-local array; it does not define a second RSVP implementation.
`app/routes/rsvp.tsx` owns GET and POST, and `_renderer.tsx` uses the Hono JSX
renderer. `src/app.mjs` invokes the built server factory. No client script,
island, raw-HTML insertion or duplicate static form is present in these sources.

The form contains five inputs, one submit button, one fieldset, one legend and
five ordinary label wrappers. Structural attributes are literal and `required`
is boolean. Its omitted action means current-document submission. The response
list's map and value expressions occur outside the form. An extractor must
traverse inert labels/fragments without rejecting unrelated dynamic siblings;
this observation is not permission to accept dynamic controls inside a form.

## Provenance And Limits

Author agent: `01a08055-4126-7600-86ca-b7eabf17cd4b`, with a fresh, non-forked
context. Input was the versioned HonoX RSVP brief plus evaluator-approved API and
build-interface facts. Reading files, examples, repository history and protected
tests, and using tools, was forbidden in the generation prompt. The exact
inherited model identifier was not exposed by the dispatch interface.

This was prompt-isolated generation, not an OS-attested sandbox. No independent
filesystem-access attestation or full input-transcript digest is available.
Do not use it as proof of the stronger independent-trial implementation gate or
as a model comparison. Local execution used the minimal Mustflow environment;
network denial during the build was declared, not enforced by an OS sandbox.
Only dependency installation deliberately used the network. No server was started.

Canonical FormIndex output, unsupported-template fixtures, cross-root
determinism, general JSX coverage and production safety remain unimplemented.
This experiment is intentionally absent from the normal workspace test glob:
installing its toolchain is an explicit optional operation, not a new default
dependency for Mensor consumers or contributors.

## Reproduction

Use configured `mensor_honox_trial_install` for the isolated dependency install,
then `mensor_honox_trial_check` for the one-shot build and protected tests, with
the Mensor repository scope. The install disables lifecycle scripts, uses the
official npm registry, and avoids personal npm configuration. The evaluator
invokes the local Vite entrypoint and then the external protected oracle.
Install may update the lock within the declared dependency ranges; inspect a
changed lock and record the resulting versions before comparing attempts.

Upstream API reference: <https://github.com/honojs/honox>.
