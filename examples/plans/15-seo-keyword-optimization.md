# SEO & On-Page Keyword Optimization

## Overview
Audit and optimize a website's SEO — one page or topic cluster at a time —
improving on-page factors, internal linking, and metadata, then recording the
before/after so gains are measurable. Use this when organic traffic is
underperforming and the site has many pages to optimize systematically.

**Methodology (how the pros do it):** Organize around the **topic-cluster /
pillar-page model** — one comprehensive pillar page per topic, surrounded by
cluster pages that link to it. Do keyword research with **search-intent mapping**
(informational/navigational/commercial/transactional) and assign **one intent per
page** (the modern "one keyword, one page" rule). Run the on-page checklist
(title ≤60 chars, single H1, meta description, schema, internal links), build
**E-E-A-T** signals (named author + Person schema, sources, dates), and detect +
resolve **cannibalization** (multiple URLs competing for one query).

**Tools/standards named here:** **Topic-cluster / pillar-page model** (HubSpot,
Search Engine Land); **search-intent mapping**; **schema.org** (Article, Person,
Organization, FAQ, HowTo); **E-E-A-T** (Google Search Essentials — Experience,
Expertise, Authoritativeness, Trustworthiness); Ahrefs, Semrush, Screaming Frog,
Google Search Console; Core Web Vitals (LCP/INP/CLS).

## Architecture context (read first)
Replace the site root and tools with your own. Re-read every iteration.
- Site content root: `content/` or `src/pages/` (where page copy/markup lives).
- Sitemap: `sitemap.xml`; keyword research lives in `docs/keywords.md`.
- Tools: `<seo-audit-tool>` (e.g. Lighthouse, Screaming Frog export) and `<rank-tracker>` (Search Console).
- Record progress in `docs/seo-audit.md` (create `docs/` if missing).

## Phase 1: Baseline & keyword map
- [ ] **1.1** Capture the SEO baseline
  - Run `<seo-audit-tool>`; record per-page scores (perf, SEO, accessibility) in `docs/seo-audit.md`
  - Pull current rankings from `<rank-tracker>`; record the target keywords and positions
- [ ] **1.2 (recon)** Build the keyword-to-page map and find the gaps
  - Assign a primary + secondary keyword/intent to each page; flag pages cannibalizing the same query; list orphan cluster pages and missing-schema pages
  - **Recursion:** for each discovered URL/cluster (and each cannibalization pair) insert one `- [ ]` task below to optimize/resolve it (e.g. `**1.2a** Optimize /pricing for "commercial" intent`)

## Phase 2: On-page fundamentals
- [ ] **2.1** Fix the technical on-page issues on the top page
  - Title, meta description, H1, URL slug, image alt text, and schema for the highest-value page; ensure the intent's keyword appears in title, H1, and first 100 words
  - Verify: `<seo-audit-tool>` score improves; the Rich Results Test validates the schema
- [ ] **2.2** Optimize content depth and intent match
  - Expand thin content to fully answer the search intent; add the missing secondary keywords naturally
  - Verify: word count and topical coverage meet the target; no keyword stuffing
- [ ] **2.3** Fix the next priority page
  - Repeat the on-page pass for the next page on the ranked list, one page per task
  - Verify: that page's audit score and keyword placement improve

## Phase 3: Internal linking & structure
- [ ] **3.1** Build a topic-cluster internal link structure
  - Link cluster pages to and from the pillar bidirectionally; add contextual links with descriptive anchors; link orphan pages in
  - Verify: every cluster page has a path to/from the pillar; no orphans remain
- [ ] **3.2** Resolve cannibalization and redirect chains
  - Merge or differentiate cannibalizing pages (301/canonical/merge); fix broken internal links and chains
  - Verify: each query targets exactly one canonical URL (Search Console); no redirect chains longer than one hop

## Phase 4: Measure & document
- [ ] **4.1** Re-run the audit and confirm gains
  - Run `<seo-audit-tool>` end-to-end; confirm per-page scores rose and no page regressed
  - Verify: record the before/after table in `docs/seo-audit.md`
- [ ] **4.2** Set up ongoing rank tracking and E-E-A-T hardening
  - Ensure `<rank-tracker>` monitors the mapped keywords at a fixed cadence; confirm author bios/Person schema, About/Contact, HTTPS, and cited sources are present
  - Verify: the tracker covers the full keyword map; E-E-A-T elements are in place
- [MANUAL] **4.3** Human review of the optimized pages
  - Read the pages for quality and brand voice; SEO must not harm readability

## Testing Notes
- Run `<seo-audit-tool>` after EVERY page task to prove the score actually moved.
- Optimize for the reader first: if a change reads awkwardly or stuffs keywords, revert it.
- SEO gains lag; the "verify" is the on-page factor + audit score, not an instant rank jump.

## Acceptance criteria
1. Every money/value page has a mapped primary intent and passes on-page fundamentals + schema.
2. A topic-cluster internal-link structure is in place; orphans and cannibalization resolved.
3. The audit score improved per page (before/after in `docs/seo-audit.md`) with no regressions.
4. Ongoing rank tracking covers the full keyword map; E-E-A-T signals are present.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the keyword/intent decision and the score delta) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (URLs to optimize, cannibalization pairs, missing schema); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
