# Marketing Content Calendar (Multichannel)

## Overview
Plan, draft, and publish a multichannel content calendar — blog, social, and
email — one asset at a time, with every piece aligned to a campaign theme and
target persona. Use this to keep a content engine running unattended: the loop
researches, drafts, and stages each asset, and a human approves before publish.

## Architecture context (read first)
Replace the brand, channels, and tooling with your own. Re-read every iteration.
- Campaign theme: `<campaign>` (e.g. "Q3 product launch"); target persona: `<persona>`.
- Channels: blog (`content/blog/`), social (`content/social/`), email (`content/email/`).
- Voice & style guide: `docs/brand-voice.md` (create if missing) — tone, vocabulary, forbidden claims.
- Working file: `content/calendar.md` — the single source of truth (dates, status, links).

## Phase 1: Strategy & calendar
- [ ] **1.1** Define the campaign goals and metrics
  - Record the objective, the `<persona>`, the key message, and the success metric in `content/calendar.md`
  - List the 3-5 sub-topics that ladder up to the campaign theme
- [ ] **1.2** Build the editorial calendar
  - Assign each sub-topic to a channel and a publish date; sequence for a narrative arc
  - Verify: every calendar row has topic, channel, date, owner, and status; no gaps or clashes

## Phase 2: Blog / long-form
- [ ] **2.1** Draft the pillar blog post
  - Write the cornerstone article for `<campaign>` from the outline; cite sources; follow `docs/brand-voice.md`
  - Verify: the draft hits the target word count, includes the key message, and has a CTA
- [ ] **2.2** Draft the supporting blog posts
  - Write each sub-topic post, cross-linking to the pillar; one post per task
  - Verify: each post stands alone, links to the pillar, and passes the voice-guide checklist

## Phase 3: Social & email
- [ ] **3.1** Create the social asset set
  - Per channel, draft posts that repurpose the pillar (thread, carousel, short video script)
  - Verify: each post fits the channel's length/format limits and carries a consistent hook
- [ ] **3.2** Build the email sequence
  - Draft the nurture sequence (teaser → value → CTA) aligned to the blog narrative
  - Verify: each email has a single CTA, a preview/subject pair, and a send time in the calendar
- [MANUAL] **3.3** Brand and legal review of all copy
  - Confirm claims are substantiated, claims compliance is met, and the voice is on-brand

## Phase 4: Schedule & measure
- [ ] **4.1** Stage everything in the calendar
  - Update `content/calendar.md` with final asset links, publish times, and status per channel
  - Verify: the calendar is internally consistent and every asset is linked
- [ ] **4.2** Define the measurement plan
  - Record per-asset KPIs and the reporting cadence in `content/calendar.md`
  - Verify: each asset maps to a metric that proves the campaign goal from 1.1
- [MANUAL] **4.3** Launch review and go-live sign-off
  - Human approves the calendar and triggers scheduling/publish in the tools

## Testing Notes
- There is no code suite; "verify" means the artifact meets the spec (length, voice, CTA, format) and is internally consistent.
- Re-read `docs/brand-voice.md` each iteration so the voice stays consistent across assets.
- Never publish from the loop — the loop drafts and stages; a human approves every external post.

## Acceptance criteria
1. A complete editorial calendar (`content/calendar.md`) maps every asset to a channel, date, and metric.
2. A pillar blog post plus supporting posts are drafted in the brand voice with sources and CTAs.
3. Social assets and an email sequence are drafted, channel-correct, and staged.
4. Every asset is human-approved before publish; a measurement plan is defined.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key message or angle chosen) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
