# Fixtures

Fixtures are executable specifications for compiler behavior. Each fixture is
self-contained and contains the project contract, feature contract, source
files, and canonical expected report needed for one behavior.

- `valid/tiny-tasks`: one valid form-backed action with a host-consumed `_csrf`
  field declared through `ignoredFields`; its omitted action resolves through
  the contract's explicit current-document path
- `valid/layered-tasks`: one valid action plus browser, shared, route, server,
  database, test, and i18n files under enforced boundary and ownership rules
- `invalid/file-role-mismatch`: an action handler discovered in the route slot
  while its contract requires the server role
- `invalid/form-field-missing`: the same action with its required `title`
  control removed, producing the compiler's canonical `form.field_missing`
  report
- `invalid/form-field-unexpected`: a valid action form with an unbound `debug`
  control, producing one canonical `form.field_unexpected` report
- `invalid/form-method-mismatch`: a linked form using GET for a POST action
- `invalid/form-action-mismatch`: a linked form submitting to the wrong path
- `invalid/form-control-codec-mismatch`: a checkbox bound to the scalar text
  decoder
- `invalid/form-control-unsupported`: a named file input that cannot be
  represented by the URL-encoded MVP contract
- `invalid/handler-export-missing`: a handler file without its declared export
- `invalid/module-boundary-transitive`: browser code reaches a server module
  through shared code and a type-only edge
- `invalid/module-boundary-direct`: route code directly imports a database
  module
- `invalid/module-dynamic-import-unsupported`: a browser module computes its
  dynamic import target
- `invalid/ownership-test-slot`: a feature test sits outside its declared
  `tests` slot
- `invalid/ownership-i18n-unowned`: a translation file sits outside every
  declared feature

`expected-report.json` uses the fixed producer version `0.0.0-fixture` so
package-version changes do not rewrite behavioral snapshots. The future fixture
runner must inject that producer version only for tests.

Invalid fixtures should normally prove one root diagnostic. Compound agent
repair scenarios belong under `fixtures/compound` after individual rules are
stable.
