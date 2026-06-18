# SEO & On-Page Keyword Optimization

## Overview
Audit and optimize a website's SEO — one page or topic cluster at a time —
improving on-page factors, internal linking, and metadata, then recording the
before/after so gains are measurable. Use this when organic traffic is
underperforming and the site has many pages to optimize systematically.

## Architecture context (read first)
Replace the site root and tools with your own. Re-read every iteration.
- Site content root: `content/` or `src/pages/` (where page copy/markup lives).
- Sitemap: `sitemap.xml`; keyword research lives in `docs/keywords.md`.
- Tools: `<seo-audit-tool>` (e.g. Lighthouse, Screaming Frog export) and `<rank-tracker>`.
- Record progress in `docs/seo-audit.md` (create `docs/` if missing).

## Phase 1: Baseline & keyword map
- [ ] **1.1** Capture the SEO baseline
  - Run `<seo-audit-tool>`; record per-page scores (perf, SEO, accessibility) in `docs/seo-audit.md`
  - Pull current rankings from `<rank-tracker>`; record the target keywords and positions
- [ ] **1.2** Build the keyword-to-page map
  - Assign a primary + secondary keyword to each page; flag pages cannibalizing the same term
  - Verify: every money/page has exactly one primary keyword; cannibals are flagged for Phase 3

## Phase 2: On-page fundamentals
- [ ] **2.1** Fix the technical on-page issues on the top page
  - Title, meta description, H1, URL slug, image alt text, and schema for the highest-value page
  - Verify: the page's targeted keyword appears in title, H1, and first 100 words; `<seo-audit-tool>` score improves
- [ ] **2.2** Optimize content depth and intent match
  - Expand thin content to fully answer the search intent; add the missing secondary keywords naturally
  - Verify: word count and topical coverage meet the target; no keyword stuffing
- [ ] **2.3** Fix the next priority page
  - Repeat the on-page pass for the next page on the ranked list, one page per task
  - Verify: that page's audit score and keyword placement improve

## Phase 3: Internal linking & structure
- [ ] **3.1** Build a topic-cluster internal link structure
  - Link supporting pages to and from the pillar; add contextual links with descriptive anchors
  - Verify: every supporting page has a path to/from the pillar; orphan pages are linked in
- [ ] **3.2** Resolve cannibalization and redirect chains
  - Merge or differentiate cannibalizing pages; fix 301 chains and broken internal links
  - Verify: each keyword targets exactly one page; no redirect chains longer than one hop

## Phase 4: Measure & document
- [ ] **4.1** Re-run the audit and confirm gains
  - Run `<seo-audit-tool>` end-to-end; confirm per-page scores rose and no page regressed
  - Verify: record the before/after table in `docs/seo-audit.md`
- [ ] **4.2** Set up ongoing rank tracking
  - Ensure `<rank-tracker>` monitors the mapped keywords at a fixed cadence
  - Verify: the tracker is configured for the keyword map from 1.2 with no gaps
- [MANUAL] **4.3** Human review of the optimized pages
  - Read the pages for quality and brand voice; SEO must not harm readability

## Testing Notes
- Run `<seo-audit-tool>` after EVERY page task to prove the score actually moved.
- Optimize for the reader first: if a change reads awkwardly or stuffs keywords, revert it.
- SEO gains lag; the "verify" is the on-page factor + audit score, not an instant rank jump.

## Acceptance criteria
1. Every money/value page has a mapped primary keyword and passes on-page fundamentals.
2. A topic-cluster internal-link structure is in place; orphan pages and cannibals resolved.
3. The audit score improved per page (before/after in `docs/seo-audit.md`) with no regressions.
4. Ongoing rank tracking covers the full keyword map.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the keyword decision and the score delta) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
