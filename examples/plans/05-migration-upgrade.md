# Migration / Dependency Upgrade

## Overview
Upgrade a framework, library, or runtime to a new major version — safely, one
breaking change at a time. Use this when an upgrade is too risky to do in a
single commit: the loop handles each breaking change as its own task, keeping
the suite green between steps.

## Architecture context (read first)
Replace the dependency, version, and test command with your own. Re-read every iteration.
- Target: upgrade `<dependency>` from `<current-version>` to `<target-version>`.
- Migration guide: link the official upgrade/breaking-changes doc here.
- `test/` - the safety net; run with `<your-test-command>`. Must stay green throughout.

## Phase 1: Audit & prepare
- [ ] **1.1** Audit current usage
  - Grep for every use of `<dependency>`; record call sites and patterns in `docs/upgrade-notes.md`
  - Flag any usage the migration guide marks as removed or changed
- [ ] **1.2** Prepare a clean baseline
  - Confirm `<your-test-command>` is green and the build is clean on the current version
  - Create the upgrade branch / commit the baseline so a partial upgrade can be reverted

## Phase 2: Bump the version
- [ ] **2.1** Update the dependency to `<target-version>`
  - Change the version in `package.json` (or equivalent); install and confirm it resolves
  - Do NOT fix anything yet — capture every error the build/tests emit in `docs/upgrade-notes.md`
- [ ] **2.2** Update config and tooling
  - Apply required config file changes from the migration guide (formats, options, paths)
  - Verify: the build command runs (failures are allowed in tests; the toolchain itself must load)

## Phase 3: Fix breaking changes (one per task)
- [ ] **3.1** Fix the highest-impact breaking change
  - Address one removed/changed API from `docs/upgrade-notes.md`; update every call site
  - Verify: the affected test file passes; full suite may still have other failures
- [ ] **3.2** Fix the next breaking change
  - Address the next removed/changed API; update call sites and types
  - Verify: that area's tests pass
- [ ] **3.3** Fix remaining deprecations and warnings
  - Resolve every new deprecation warning the upgrade introduced
  - Verify: build runs with no new warnings beyond pre-existing ones

## Phase 4: Validate & document
- [ ] **4.1** Confirm the full suite is green
  - Run `<your-test-command>` end-to-end; investigate and fix any remaining failure
  - Verify: zero failing tests; the upgrade is behaviorally complete
- [ ] **4.2** Update docs and the lockfile
  - Update README/docs to reflect the new version and any changed commands
  - Verify: a fresh `install` + `<your-test-command>` passes from clean
- [MANUAL] **4.3** Smoke test in a staging environment
  - Deploy/preview and confirm the real-world behavior is intact

## Testing Notes
- Run `<your-test-command>` after every task. During Phase 3 some failures may persist across tasks; that's expected, but each individual fix must make progress.
- If a breaking change is genuinely blocked (upstream bug, missing replacement), mark it `[BLOCKED: reason]` and move on.

## Acceptance criteria
1. `<dependency>` is at `<target-version>` and installs cleanly.
2. Every breaking change from the migration guide is addressed or documented as blocked.
3. The full test suite passes (`<your-test-command>`) with no new failures.
4. Docs and the lockfile reflect the new version; a fresh install + test passes.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (what broke and how it was fixed) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
