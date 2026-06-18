# Security Audit (OWASP Top 10)

## Overview
Systematically find and fix web-application security vulnerabilities, one
weakness class at a time, mapped to the OWASP Top 10. Use this before a release,
after inheriting an unfamiliar codebase, or as part of a security engagement.
Each phase is a self-contained finding class so the agent can prove a fix with a
test and move on. **Authorization:** only run this against codebases you own or
are explicitly authorized to assess.

## Architecture context (read first)
Replace these paths with your own. Re-read every iteration, so keep it accurate.
- `src/auth/` - authentication, sessions, tokens, password handling.
- `src/api/` - request handlers, input parsing, output encoding.
- `src/db/` - queries, migrations, connection handling.
- `config/` - secrets, env loading, security headers config.
- `test/` - test suite, run with `<your-test-command>`.
- Record findings and fixes in `docs/security-audit.md` (create `docs/` if missing).

## Phase 1: Reconnaissance & baseline
- [ ] **1.1** Inventory the attack surface
  - List every entry point (routes, public functions, file uploads, webhooks, background jobs)
  - Map each to the OWASP class it most likely risks; record in `docs/security-audit.md`
- [ ] **1.2** Capture the dependency and config baseline
  - Run a dependency audit (`npm audit`, `pip-audit`, `cargo audit`, etc.); record CVEs
  - Grep for secrets/keys in the repo and config; confirm secrets come from env, not hardcoded

## Phase 2: Broken access control & authentication (A01, A07)
- [ ] **2.1** Audit authorization on every protected route
  - Confirm each handler enforces ownership/role, not just "is logged in"; check IDOR on object lookups
  - Verify: add a test that an authenticated-but-unauthorized user gets 403, not 200 or another user's data
- [ ] **2.2** Harden authentication and session handling in `src/auth/`
  - Check: password hashing (bcrypt/argon2), token expiry & rotation, logout invalidation, MFA hooks
  - Verify: add a test that an expired/revoked token is rejected; a reused refresh token fails

## Phase 3: Injection & data layer (A03)
- [ ] **3.1** Eliminate SQL/NoSQL/command injection
  - Confirm every query uses parameterization/prepared statements; no string-built queries, raw `$input`, or shell calls with user data
  - Verify: add a test feeding `' OR 1=1 --` / `;` / `$()` style payloads to one previously-vulnerable input
- [ ] **3.2** Lock down file and OS interactions
  - Path traversal (sanitize/resolve+prefix-check), command execution, SSRF (block internal hosts on outbound fetch), deserialization
  - Verify: add a test that `../../etc/passwd` style input is rejected or sandboxed

## Phase 4: Input, output & state (A03 cont., A08, A10)
- [ ] **4.1** Validate and coerce all input at the boundary
  - Every handler validates type/range/length before use; reject early with a generic error
  - Verify: probe one handler with oversized/negative/unicode/malformed input and confirm a clean 400
- [ ] **4.2** Ensure output encoding prevents XSS and injection downstream
  - Confirm templates auto-escape; raw HTML/JSON paths are explicit and bounded
  - Verify: add a test that `<script>` payload in stored data is rendered escaped, not executed
- [ ] **4.3** Add or confirm security headers and CSRF protection
  - CSP, HSTS, X-Content-Type-Options, frame-ancestors; CSRF tokens on state-changing requests
  - Verify: a test asserts the response carries the expected headers; a forged cross-site POST is rejected

## Phase 5: Secrets, logging & SSRF hardening (A02, A09)
- [ ] **5.1** Remove secrets from code and history
  - Move any hardcoded key to env/secret manager; rotate any secret found committed; add the pattern to pre-commit
  - Verify: grep returns no secrets; the secret-manager load is tested
- [ ] **5.2** Scrub logging of sensitive data and harden error responses
  - Never log passwords/tokens/PII; error responses to clients are generic, details server-side only
  - Verify: add a test that a failed-login log line contains no password, and a 500 body leaks no stack trace

## Phase 6: Validate & report
- [ ] **6.1** Re-run the full suite and the dependency audit
  - Run `<your-test-command>`; re-run the dependency audit; confirm every Phase 2-5 finding is fixed or filed
  - Verify: zero failing tests; no new high/critical CVEs remain unfixed
- [MANUAL] **6.2** Human review of the audit report and the diff
  - Confirm `docs/security-audit.md` lists every finding, its OWASP class, fix, and residual risk

## Testing Notes
- Run the suite with `<your-test-command>` (e.g. `bun test`, `npm test`, `pytest`).
- Every security fix MUST add a regression test proving the vulnerability is closed — a fix without a test is incomplete.
- For findings that need infrastructure changes (WAF, secrets manager), mark them `[BLOCKED: reason]` with the remediation owner rather than skipping silently.

## Acceptance criteria
1. Every OWASP class (A01-A10) relevant to this app has been reviewed; findings are fixed or filed in `docs/security-audit.md`.
2. At least one regression test was added per real vulnerability found in Phases 2-5.
3. The dependency audit shows no unfixed high/critical CVEs; no secrets remain in the repo.
4. The full suite is green; security headers and CSRF protection are in place and tested.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the vulnerability found and how it was fixed) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
