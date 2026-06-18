# Performance Optimization

## Overview
Find and fix the biggest performance bottlenecks, one at a time, each backed by a
measurement before and after. Use this when a route, job, or build is too slow and
you want systematic, evidence-driven gains instead of guesswork.

**Methodology (how the pros do it):** **Measure, don't guess.** Establish a
baseline before touching anything, profile to find the *real* bottleneck, form one
hypothesis, change **one variable at a time**, and re-measure (changing two things
at once makes the effect unattributable). For resources, apply Brendan Gregg's
**USE method** — for each resource check **U**tilization, **S**aturation,
**E**rrors. For services, use **RED** (Rate/Errors/Duration). Use flame graphs to
see hot code paths and load tests (k6) to reproduce bottlenecks.

**Tools/standards named here:** **USE method** + **flame graphs** (Brendan Gregg,
*Systems Performance*); `perf`/eBPF/bpftrace, `pprof` (Go), async-profiler (JVM),
py-spy; **k6**/JMeter for load testing; Lighthouse/Chrome DevTools for frontend;
**RED method** for services.

## Architecture context (read first)
Replace the paths, targets, and commands with your own. Re-read every iteration.
- Hot path: `<route-or-job>` (the endpoint/job to optimize).
- Bench: `<your-bench-command>` (e.g. `k6 run ...`, `autocannon ...`).
- Suite: run with `<your-test-command>` — must stay green; correctness before speed.
- Record baselines and gains in `docs/perf-notes.md` (create `docs/` if missing).

## Phase 1: Measure & profile
- [ ] **1.1** Establish the performance baseline
  - Run `<your-bench-command>` against the hot path; record p50/p95/p99 latency and throughput in `docs/perf-notes.md`
  - Define the target: e.g. "p95 under `<target-ms>` ms" or "throughput up `<target-x>`"
- [ ] **1.2 (recon)** Profile to find the real bottleneck
  - Use a profiler/flamegraph and DB query logs; run the USE checklist per resource (CPU, mem, disk, NIC); rank cost highest→lowest
  - **Recursion:** for each discovered hotspot (top-N functions/slowest endpoints/saturated resource) insert one `- [ ]` task below to optimize it, each with its own before/after
  - Record the top 3-5 cost centers in `docs/perf-notes.md`

## Phase 2: Eliminate the biggest waste
- [ ] **2.1** Fix the N+1 query / redundant fetch
  - Batch or eager-load the most expensive repeated data access identified in 1.2
  - Verify: re-run the bench; latency drops; `<your-test-command>` still green
- [ ] **2.2** Add or fix caching on the hottest read
  - Cache the most-read, rarely-changing result with a correct invalidation strategy
  - Verify: bench shows the improvement; a test proves a cache invalidation returns fresh data
- [ ] **2.3** Reduce payload and serialization cost
  - Trim over-fetching (select only needed fields), compress large responses, avoid re-encoding
  - Verify: response size drops; bench improves; a test asserts the response shape is still correct

## Phase 3: Concurrency & algorithmic gains
- [ ] **3.1** Parallelize independent work
  - Convert sequential awaits/loops over independent items into concurrent execution with bounded parallelism
  - Verify: bench improves under load; `<your-test-command>` green; no new race or ordering bug
- [ ] **3.2** Replace the worst algorithmic hot spot
  - Swap an O(n²)/repeated-scan inner loop for an indexed/map-based approach where profiling showed cost
  - Verify: a micro-bench of that path shows the asymptotic gain; full suite green

## Phase 4: Validate & guard
- [ ] **4.1** Confirm the target is met and no regression
  - Run the full bench + `<your-test-command>`; confirm the target from 1.1 is hit and nothing regressed
  - Verify: record the before/after table in `docs/perf-notes.md`
- [ ] **4.2** Add a regression guard for the win
  - Add a perf test or budget assertion (e.g. a test that fails if the hot path exceeds `<target-ms>`)
  - Verify: the guard passes and would fail on the pre-optimization code
- [MANUAL] **4.3** Review under real-world load
  - Load-test or observe in staging; confirm the gain holds beyond the synthetic bench

## Testing Notes
- Run `<your-bench-command>` AND `<your-test-command>` after EVERY task — never trade correctness for speed.
- Always measure before optimizing a task, and record the after number. No measurement = no claim.
- Change one variable at a time; if two changes are bundled, you can't attribute the effect.
- If a bottleneck needs infrastructure (DB index migration, a cache server), mark it `[BLOCKED: reason]` with the owner.

## Acceptance criteria
1. The hot path meets the target defined in 1.1 (before/after recorded in `docs/perf-notes.md`).
2. Every optimization is backed by a measurement showing the delta (one variable at a time).
3. The full suite is green throughout; no correctness regression.
4. A regression guard keeps the win from silently regressing.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the bottleneck fixed and the measured delta) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (hotspots, saturated resources); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
