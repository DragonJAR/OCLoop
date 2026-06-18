# Migration / Dependency Upgrade

## Overview
Upgrade a framework, library, or runtime to a new major version — safely, one
breaking change at a time. Use this when an upgrade is too risky to do in a
single commit: the loop handles each breaking change as its own task, keeping
the suite green between steps.

**Methodology (how the pros do it):** Inventory and freeze first, audit CVEs,
then upgrade **one breaking change per PR** so the blast radius is small and
bisectable. Resolve the **diamond dependency problem** (a transitive required at
two incompatible versions) via overrides/constraints. Keep the lockfile
committed and install with `--frozen-lockfile` so drift fails fast in CI.

**Tools/standards named here:** **Renovate** (config-as-code, 90+ ecosystems,
grouping, automerge) and **Dependabot** (native GitHub) for routine updates;
CVE auditing via **npm audit / pip-audit / Trivy / Snyk**; `npm overrides` /
`yarn resolutions` / pip constraints for diamond conflicts; lockfiles
(package-lock / poetry / Cargo.lock); SBOM in CycloneDX/SPDX.

## Architecture context (read first)
Replace the dependency, version, and test command with your own. Re-read every iteration.
- Target: upgrade `<dependency>` from `<current-version>` to `<target-version>`.
- Migration guide: link the official upgrade/breaking-changes doc here.
- `test/` - the safety net; run with `<your-test-command>`. Must stay green throughout.
- Notes go in `docs/upgrade-notes.md` (create `docs/` if missing).

## Phase 1 — Audit & prepare
- [ ] **1.1 (recon)** Audit current usage and the dependency graph
  - Grep for every use of `<dependency>`; record call sites and patterns; run `npm ls`/`pnpm why` to map the graph; record in `docs/upgrade-notes.md`
  - **Recursion:** list every outdated dependency and every open CVE; for each discovered dep/CVE insert one `- [ ]` task below to upgrade/patch it individually
- [ ] **1.2** Prepare a clean baseline
  - Confirm `<your-test-command>` is green and the build is clean on the current version; commit the baseline so a partial upgrade can be reverted
  - Verify: lockfile committed; CI installs with `--frozen-lockfile` without drift

## Phase 2 — Bump the version
- [ ] **2.1** Update the dependency to `<target-version>`
  - Change the version in `package.json` (or equivalent); install and confirm it resolves; do NOT fix anything yet — capture every error in `docs/upgrade-notes.md`
  - Resolve any diamond conflict via overrides/resolutions
- [ ] **2.2** Update config and tooling
  - Apply required config file changes from the migration guide (formats, options, paths)
  - Verify: the build command runs (failures are allowed in tests; the toolchain itself must load)

## Phase 3 — Fix breaking changes (one per task)
- [ ] **3.1** Fix the highest-impact breaking change
  - Address one removed/changed API from `docs/upgrade-notes.md`; update every call site
  - Verify: the affected test file passes; full suite may still have other failures
- [ ] **3.2** Fix the next breaking change
  - Address the next removed/changed API; update call sites and types
  - Verify: that area's tests pass
- [ ] **3.3** Fix remaining deprecations and warnings
  - Resolve every new deprecation warning the upgrade introduced
  - Verify: build runs with no new warnings beyond pre-existing ones

## Phase 4 — Validate & document
- [ ] **4.1** Confirm the full suite is green and CVEs are resolved
  - Run `<your-test-command>` end-to-end; re-run the dependency audit (`trivy fs --severity HIGH,CRITICAL --exit-code 1`)
  - Verify: zero failing tests; zero unpatched High/Critical CVEs (or documented accepted-risk)
- [ ] **4.2** Update docs and the lockfile
  - Update README/docs to reflect the new version and any changed commands
  - Verify: a fresh `install` + `<your-test-command>` passes from clean (lockfile reproducible)
- [MANUAL] **4.3** Smoke test in a staging environment
  - Deploy/preview and confirm the real-world behavior is intact

## Testing Notes
- Run `<your-test-command>` after every task. During Phase 3 some failures may persist across tasks; that's expected, but each fix must make progress.
- One breaking change per commit keeps `git bisect` meaningful.
- If a breaking change is genuinely blocked (upstream bug, missing replacement), mark it `[BLOCKED: reason]` and move on.

## Acceptance criteria
1. `<dependency>` is at `<target-version>` and installs cleanly; diamond conflicts resolved.
2. Every breaking change from the migration guide is addressed or documented as blocked.
3. The full test suite passes (`<your-test-command>`) with no new failures.
4. Zero unpatched High/Critical CVEs; docs and the lockfile reflect the new version.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (what broke and how it was fixed) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (outdated deps, open CVEs); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
