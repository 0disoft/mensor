# Fixtures

Fixtures are executable specifications for compiler behavior. Each fixture is
self-contained and contains the project contract, feature contract, source
files, and canonical expected report needed for one behavior.

- `valid/tiny-tasks`: one valid form-backed action
- `invalid/file-role-mismatch`: an action handler discovered in the route slot
  while its contract requires the server role
- `invalid/form-field-missing`: the same action with its required `title`
  control removed

`expected-report.json` uses the fixed producer version `0.0.0-fixture` so
package-version changes do not rewrite behavioral snapshots. The future fixture
runner must inject that producer version only for tests.

Invalid fixtures should normally prove one root diagnostic. Compound agent
repair scenarios belong under `fixtures/compound` after individual rules are
stable.
