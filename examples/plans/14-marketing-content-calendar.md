# Marketing Content Calendar (Multichannel)

## Overview
Plan, draft, and stage a multichannel content calendar — blog, social, and email
— organized by content pillars, with every piece aligned to a campaign theme and
target persona. Use this to keep a content engine running: the loop researches,
drafts, and stages each asset; a human approves before publish.

**Methodology (how the pros do it):** Build around **content pillars** (3-7 broad
themes tied to the ICP's pain + search demand) and the **hub-and-spoke / topic
cluster** model — one pillar ("hub") page linking bidirectionally to 8-12
supporting "spoke" articles. Repurpose each hub with **COPE** (Create Once,
Publish Everywhere — clean content is portable). Follow a documented **brand
voice guide** and a "document, don't create" philosophy (turn internal docs/calls
into content). Map every asset to a funnel stage (TOFU/MOFU/BOFU).

**Tools/standards named here:** **Hub-and-spoke / topic cluster model**
(HubSpot-originated); **COPE** (NPR, Daniel Jacobson); **brand voice guide**;
calendar tools (HubSpot, Notion, Airtable, CoSchedule).

## Architecture context (read first)
Replace the brand, channels, and tooling with your own. Re-read every iteration.
- Campaign theme: `<campaign>` (e.g. "Q3 product launch"); target persona: `<persona>`.
- Channels: blog (`content/blog/`), social (`content/social/`), email (`content/email/`).
- Voice & style guide: `docs/brand-voice.md` (create if missing) — tone, vocabulary, forbidden claims.
- Working file: `content/calendar.md` — the single source of truth (dates, status, links).

## Phase 1 — Strategy & calendar
- [ ] **1.1 (recon)** Define pillars, goals, and the cluster map
  - Record the objective, the `<persona>`, the key message, the success metric, and the 3-7 content pillars in `content/calendar.md`; map each pillar to its hub + spokes
  - **Recursion:** for each discovered pillar insert one `- [ ]` task below to build its cluster (e.g. `**1.1a** Build cluster for pillar "<pillar>"`)
- [ ] **1.2** Build the editorial calendar
  - Assign each sub-topic to a channel and a publish date; sequence for a narrative arc; tag funnel stage per asset
  - Verify: every calendar row has topic, channel, date, owner, status, and funnel stage; no gaps or clashes

## Phase 2 — Blog / long-form (the hub-and-spoke)
- [ ] **2.1** Draft the pillar (hub) blog post
  - Write the cornerstone article for `<campaign>`; cite sources; follow `docs/brand-voice.md`; it links to every spoke
  - Verify: the draft hits the target word count, includes the key message, and has a CTA
- [ ] **2.2** Draft the supporting (spoke) blog posts
  - Write each sub-topic post, cross-linking bidirectionally to the pillar; one post per task
  - Verify: each post stands alone, links to/from the pillar, and passes the voice-guide checklist

## Phase 3 — Social & email (COPE repurposing)
- [ ] **3.1** Create the social asset set (repurpose the hub)
  - Per channel, draft posts that repurpose the pillar (thread, carousel, short video script)
  - Verify: each post fits the channel's length/format limits and carries a consistent hook
- [ ] **3.2** Build the email sequence
  - Draft the nurture sequence (teaser → value → CTA) aligned to the blog narrative
  - Verify: each email has a single CTA, a preview/subject pair, and a send time in the calendar
- [MANUAL] **3.3** Brand and legal review of all copy
  - Confirm claims are substantiated, compliance is met, and the voice is on-brand

## Phase 4 — Schedule & measure
- [ ] **4.1** Stage everything in the calendar
  - Update `content/calendar.md` with final asset links, publish times, and status per channel
  - Verify: the calendar is internally consistent and every asset is linked
- [ ] **4.2** Define the measurement plan
  - Record per-asset KPIs (mapped to the funnel stage) and the reporting cadence in `content/calendar.md`
  - Verify: each asset maps to a metric that proves the campaign goal from 1.1
- [MANUAL] **4.3** Launch review and go-live sign-off
  - Human approves the calendar and triggers scheduling/publish in the tools

## Testing Notes
- There is no code suite; "verify" means the artifact meets the spec (length, voice, CTA, format) and is internally consistent.
- Re-read `docs/brand-voice.md` each iteration so the voice stays consistent across assets.
- Never publish from the loop — the loop drafts and stages; a human approves every external post.

## Acceptance criteria
1. A complete editorial calendar (`content/calendar.md`) maps every asset to a pillar, channel, date, funnel stage, and metric.
2. A pillar hub post plus supporting spokes are drafted in the brand voice with bidirectional links, sources, and CTAs.
3. COPE social assets and an email sequence are drafted, channel-correct, and staged.
4. Every asset is human-approved before publish; a measurement plan is defined.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key message or angle chosen) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (pillars, spokes, gaps); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
