# Build a Feature End-to-End

## Overview
Implement a new feature from zero to production-ready, layer by layer, with a
test pinned at every step. Use this when adding a meaningful capability (a new
API resource, a UI screen, a worker) that touches multiple parts of the codebase.

**Methodology (how the pros do it):** Work **outside-in / London-school TDD** —
write the outer acceptance test first (Red), drive inward through the layers
until green, then refactor under green tests. Organize the slice **vertically**
(model → service → surface), not as horizontal scaffolding, so the feature is
independently shippable. Respect the **Test Pyramid** (Fowler): many fast unit
tests at the base, fewer integration in the middle, very few end-to-end at the top.

**Tools/standards named here:** Vertical Slice Architecture; Outside-In TDD
(Red-Green-Refactor); the Test Pyramid; a formal **Definition of Done** (coded,
reviewed, tested at all pyramid levels, merged, deployed, docs updated).

## Architecture context (read first)
Replace these paths and the feature name with your own. Re-read every iteration.
- `src/models/` - data models / schemas.
- `src/services/` - business logic.
- `src/api/` or `src/ui/` - the surface (REST handlers or components).
- `test/` - test suite, run with `<your-test-command>`.

## Phase 1 — Foundations
- [ ] **1.1** Define the data model
  - Add the schema/type for `<feature>` in `src/models/`; include validation
  - Verify: the model compiles and its types are exported
- [ ] **1.2** Add the data access layer
  - Implement create/read/update/delete for `<feature>` in `src/services/` or `src/db/`
  - Verify: write a test that creates and retrieves a record

## Phase 2 — Core logic
- [ ] **2.1** Implement the business rules
  - Add the service functions that encode `<feature>`'s rules and constraints
  - Verify: add tests covering the happy path and at least one error case (unit level)
- [ ] **2.2** Handle edge cases and errors
  - Cover: duplicate, not-found, invalid input, and permission checks
  - Verify: each case has a test asserting the correct behavior

## Phase 3 — Surface
- [ ] **3.1 (recon)** Decompose the feature into its surface touch-points and acceptance scenarios
  - List every handler/component to wire and every acceptance scenario (incl. edge cases) the outer test must cover
  - **Recursion:** for each discovered scenario/surface, insert one `- [ ]` task below to implement and test it
- [ ] **3.2** Expose the feature on the API / UI and add input validation
  - Wire the service to handlers in `src/api/` (or components in `src/ui/`); validate and sanitize every input; return clean 400s
  - Verify: an end-to-end test hits the surface and returns the expected result; malformed input yields a clean 400

## Phase 4 — Integration & polish
- [ ] **4.1** Integrate with existing features
  - Update anything that references the touched models/services to stay consistent
  - Verify: the full suite (`<your-test-command>`) passes with no regressions (pyramid intact: units + integration + the e2e slice)
- [ ] **4.2** Document the feature
  - Update the relevant doc/README with usage, config, and the test command
- [MANUAL] **4.3** Manual UX / exploratory review
  - Walk through the feature as a user; note anything rough for a follow-up

## Testing Notes
- Run the suite with `<your-test-command>`.
- Each task must add or update a test; do not mark `[x]` without a passing test for the change.
- Keep the slice vertical — every task should leave the feature runnable end-to-end, not a half-wired layer.

## Acceptance criteria
1. `<feature>` works end-to-end from the surface down to the data layer (vertical slice).
2. Happy path, error cases, and edge cases all have passing tests across the pyramid.
3. The full suite is green with no regressions in existing features.
4. The feature is documented and meets the Definition of Done.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key design decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (scenarios, surfaces); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
