# Targeted Refactor & Cleanup

## Overview
Improve the structure of an existing module without changing its behavior:
extract responsibilities, tighten types, remove duplication, and keep tests green
throughout. Use this when a part of the codebase has become hard to work in.

**Methodology (how the pros do it):** Build the **safety net** first — if no tests
exist, write **characterization tests** to pin current behavior (Feathers:
legacy = code without tests). Then apply small, named, **behavior-preserving**
refactorings one at a time from Fowler's catalog, running tests after every step.
For large/legacy systems, use the **Strangler Fig** pattern to replace
incrementally from the edges rather than a big-bang rewrite.

**Tools/standards named here:** Martin Fowler's *Refactoring* catalog
(refactoring.com — Extract Method, Move, Introduce Parameter Object, Replace
Conditional with Polymorphism, …); Michael Feathers' *Working Effectively with
Legacy Code* (seam model, characterization tests); Strangler Fig pattern
(Azure Architecture Center; Shopify 7-step); IDE safe-refactor actions;
approval/golden-master tests.

## Architecture context (read first)
Replace the target module and test command with your own. Re-read every iteration.
- `src/<target>/` - the module being refactored.
- `test/<target>.test.ts` - its tests (the safety net; must stay green).
- Run tests with `<your-test-command>`.
- Notes go in `docs/refactor-notes.md` (create `docs/` if missing).

## Phase 1: Map the current state
- [ ] **1.1 (recon)** Inventory the target module and its smells
  - List every file, its responsibilities, and the code smells present (Long Method, Large Class, Feature Envy, Duplicated blocks via jscpd, high cyclomatic complexity) in `docs/refactor-notes.md`
  - **Recursion:** for each discovered smell instance, insert one `- [ ]` task below to apply the matching Fowler move (e.g. `**1.1a** Extract Method in src/<target>/foo.ts:42`)
- [ ] **1.2** Confirm the safety net
  - Run `<your-test-command>` and confirm it is green before changing anything; on a hot path with thin coverage, add characterization tests first
  - Verify: the suite is green and the riskiest paths are covered

## Phase 2: Extract & decompose
- [ ] **2.1** Extract the clearest tangled responsibility
  - Move one cohesive responsibility out of `src/<target>/` into its own module (behavior-preserving)
  - Verify: `<your-test-command>` stays green; behavior is unchanged
- [ ] **2.2** Repeat for the next responsibility
  - Extract the next cohesive unit; update imports across the codebase
  - Verify: tests green; no lingering references to the old location

## Phase 3: Tighten & deduplicate
- [ ] **3.1** Remove duplication
  - Consolidate repeated logic into a single helper; update all call sites
  - Verify: tests green; grep confirms no orphaned copies remain
- [ ] **3.2** Tighten types and error handling
  - Replace `any`/loose types with precise ones; narrow error handling to specific cases
  - Verify: tests green; the type checker reports no new errors

## Phase 4: Polish & document
- [ ] **4.1** Rename for clarity
  - Rename misleading identifiers and files; update every reference
  - Verify: tests green; build succeeds with the new names
- [ ] **4.2** Document the new structure
  - Update the module's doc/README and `AGENTS.md` with the new layout and why
  - Verify: a reader can find each responsibility from the docs alone
- [MANUAL] **4.3** Final review of the refactor diff
  - Confirm no behavior changed beyond the intended structural improvements (a refactor preserves bugs too, by design)

## Testing Notes
- Run `<your-test-command>` after EVERY task. A refactor must never break a green suite.
- Refactoring preserves observable behavior — if you intend to fix a bug, do it in a separate task, not during a refactor.
- If a task would turn the suite red, revert it (`git checkout -- <files>`) and mark it `[BLOCKED: reason]`.

## Acceptance criteria
1. Each responsibility in `src/<target>/` lives in its own focused module.
2. No duplication of the consolidated logic remains (grep confirms).
3. The full test suite is green throughout; coverage did not decrease.
4. `docs/refactor-notes.md` and `AGENTS.md` reflect the new structure and rationale.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (why it refactored this way) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (smells, duplicated blocks, hotspots); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
