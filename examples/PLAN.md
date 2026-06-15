# Example Project Plan

## Overview
A small web API with authentication, data models, and CRUD endpoints. This file
demonstrates the PLAN.md format OCLoop expects: work grouped into ordered phases,
each actionable task on its own `- [ ]` line, executed one per fresh iteration.

## Architecture context (read first)
- `src/auth/` - authentication: login/logout, JWT handling, auth middleware.
- `src/db/` - data layer: schemas and migrations.
- `src/api/` - REST handlers (CRUD) with input validation.
- `test/` - test suite, run with the project's test command.

Keep this section tight: it is re-read at the start of every iteration.

## Phase 1: Setup
- [x] **1.1** Initialize project structure
  - Create `src/`, add `package.json` and `tsconfig.json`
  - Configure formatting and pre-commit hooks
- [x] **1.2** Add base configuration
  - Environment loading and a config module

## Phase 2: Core features
- [ ] **2.1** Implement authentication in `src/auth/`
  - Add login/logout endpoints, JWT issue/verify, and auth middleware
  - Verify: a protected route returns 401 without a token and 200 with a valid one
- [ ] **2.2** Define data models in `src/db/`
  - User and Post schemas plus migrations
- [ ] **2.3** Build REST endpoints in `src/api/`
  - CRUD for users and posts, with input validation
  - Verify: each endpoint returns the right status codes for valid and invalid input

## Phase 3: Tests
- [ ] **3.1** Unit tests in `test/unit/`
  - Cover auth logic, models, and utilities
  - Update any existing tests affected by Phase 2
- [ ] **3.2** Integration tests in `test/integration/`
  - Cover API endpoints, DB operations, and error handling
- [MANUAL] **3.3** Manual UI and accessibility testing
  - Responsive design, cross-browser behavior, accessibility checks

## Phase 4: Deployment
- [ ] **4.1** CI pipeline in `.github/workflows/ci.yml`
  - Run the test suite on every push and gate merges on green
  - Verify: a failing test blocks the workflow
- [BLOCKED: waiting for AWS credentials] **4.2** Configure production environment
  - Provision infrastructure, set environment variables, wire up monitoring
- [MANUAL] **4.3** Verify production deployment
  - Smoke-test endpoints, confirm DB connectivity, check with real users

## Testing Notes
- Run the full suite with the project's test command (e.g. `bun test` or `npm test`).
- After each phase, confirm the new behavior end-to-end, not just that it compiles.
- `[MANUAL]` tasks are verified by a human and are excluded from the loop's completion count.

## File Change Summary
| File | Change | Purpose |
| --- | --- | --- |
| `src/auth/*` | create | Authentication: login/logout, JWT, middleware |
| `src/db/*` | create | User/Post schemas and migrations |
| `src/api/*` | create | REST CRUD endpoints with validation |
| `test/unit/*`, `test/integration/*` | create/update | Unit and integration coverage |
| `.github/workflows/ci.yml` | create | CI: run the test suite on push |

## Acceptance criteria
1. A user can register, log in, and reach protected routes with a valid JWT; invalid or expired tokens are rejected.
2. CRUD endpoints for users and posts work and reject invalid input.
3. Unit and integration suites pass via the project's test command.
4. CI runs the suite on every push and blocks merges on failure.
5. `[MANUAL]` items (UI testing, production setup and verification) are completed by a human outside the loop.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh OpenCode session, then marks it `[x]` and continues.
- The run ends when the model appends a `<plan-complete> ... </plan-complete>` summary to the end of this file. There is no `.loop-complete` file.