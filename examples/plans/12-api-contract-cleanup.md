# API Contract Cleanup & OpenAPI Spec

## Overview
Normalize a grown-by-accretion API into a consistent, documented contract —
consistent naming, status codes, error shapes, pagination — and generate a
verified OpenAPI spec from the code. Use this before exposing an API to external
consumers, generating SDKs, or when the API has inconsistent conventions.

**Methodology (how the pros do it):** Prefer **design-first** (author the OpenAPI
document *before* backend code) so frontends and backends work in parallel and
the spec can't drift. Follow REST resource naming and the **Richardson Maturity
Model** (aim Level 2 — resources + HTTP verbs; Level 3 HATEOAS only when
warranted). **Lint** the spec with **Spectral**, **mock** with **Prism** for early
consumer dev, **generate** stubs/clients with **OpenAPI Generator**, and enforce
the contract with **consumer-driven contract testing (Pact)**.

**Tools/standards named here:** **OpenAPI 3.1** (aligns with JSON Schema 2020-12);
**design-first vs code-first**; **Spectral** (Stoplight) linting;
**Prism** mock server; **OpenAPI Generator**; **Pact** contract testing;
**Richardson Maturity Model**; Redoc/Swagger UI for docs.

## Architecture context (read first)
Replace the paths and commands with your own. Re-read every iteration.
- `src/api/` or `src/routes/` - the route definitions and handlers.
- `src/schemas/` - request/response validation schemas (Zod, Valibot, Pydantic, etc.).
- `openapi.json` or `docs/openapi.yaml` - the generated spec (create if missing).
- `test/` - run with `<your-test-command>`; an API test framework (e.g. supertest) is ideal.

## Phase 1: Inventory & conventions
- [ ] **1.1 (recon)** Inventory every endpoint
  - List all routes (method + path) and record their current status codes, auth, and response shape in `docs/api-audit.md`; flag inconsistencies (mixed casing, wrong verbs, 200 for creates, non-uniform errors)
  - **Recursion:** for each discovered endpoint insert one `- [ ]` task below to normalize + contract-test it (e.g. `**1.1a** Normalize & test GET /users`)
- [ ] **1.2** Define the target conventions
  - Decide: resource naming (plural, kebab-case), status codes per action, the standard error envelope, pagination shape; target RMM Level 2
  - Verify: the conventions are written down so each later task can apply them uniformly

## Phase 2: Normalize the surface
- [ ] **2.1** Fix resource naming and routes
  - Apply the naming convention across `src/api/`; keep backward-compatible aliases if consumers exist
  - Verify: a test asserts routes match the convention; aliases still respond
- [ ] **2.2** Standardize status codes and the error envelope
  - Make every handler return the agreed codes and the uniform error shape; remove leaked internals
  - Verify: tests assert the right code per action and the error envelope for a 4xx and a 5xx
- [ ] **2.3** Add consistent pagination, filtering, and sorting
  - Apply the chosen pagination shape (cursor or offset) to list endpoints; standardize filter/sort params
  - Verify: a test walks a multi-page result and reaches the end correctly

## Phase 3: Schemas & the OpenAPI spec
- [ ] **3.1** Ensure every endpoint has a validated schema
  - Attach request/response schemas to each handler; reject invalid input at the boundary
  - Verify: a malformed request returns a clean 400 tied to the schema
- [ ] **3.2** Generate and lint the OpenAPI spec
  - Produce `openapi.json`/`docs/openapi.yaml` from the schemas + routes (design-first: edit the spec, regenerate stubs); include auth and examples; run `spectral lint`
  - Verify: Spectral passes with zero errors; the spec lists every route from 1.1
- [ ] **3.3** Validate the spec against the implementation
  - Run contract tests (Pact) that hit each route and assert the real response matches the documented schema
  - Verify: zero contract mismatches; the spec is provably in sync with the code

## Phase 4: Docs & SDK readiness
- [ ] **4.1** Publish API docs from the spec
  - Render the spec to readable docs (Redoc/Stoplight) or wire it into the existing docs site
  - Verify: a reader can find any endpoint, its params, and a valid example
- [ ] **4.2** Add the versioning and changelog strategy
  - Decide the version header/URL policy and record breaking vs non-breaking rules in `docs/api-audit.md`
  - Verify: the strategy is documented; the current version is surfaced in the spec
- [MANUAL] **4.3** Review for consumer impact
  - Confirm breaking changes are intentional and communicated; aliases cover existing consumers

## Testing Notes
- Run `<your-test-command>` after EVERY task; contract changes must not break the suite.
- The OpenAPI spec is a test artifact — generate it in CI (`spectral lint` + OpenAPI Generator) and fail if it drifts from the code.
- Never document an endpoint that isn't implemented, and never ship an endpoint that isn't documented.

## Acceptance criteria
1. Every endpoint follows the naming, status-code, and error conventions (RMM Level 2).
2. Each endpoint has validated request/response schemas and returns clean errors for bad input.
3. A generated OpenAPI 3.1 spec passes Spectral and is proven in sync with the code via Pact contract tests.
4. API docs are rendered from the spec; versioning and breaking-change rules are documented.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the contract change and any consumer impact) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (endpoints, Spectral violations, failing contracts); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
