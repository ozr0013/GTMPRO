# Progress

Update this every working session. Definition of done: code + tests + a row here.

---

## ⚠️ Right now — read this before starting anything

Last updated: **2026-08-15 mid-morning, after the best-of-both team merge (Anurup).**

**Suite: 103 tests green across 26 files.** `npm run verify` and `next build` both clean on `main`.
Anurup's submission-day branch and Omar's overnight branch were built in parallel (neither knew) and
merged best-of-both — details in the "Final push" section below. `oz/agent-rule-attribution` and all
Track C branches are now merged; remote side branches are safe to delete.

### Claimed / do NOT duplicate

| Area | Who | State |
|---|---|---|
| **B6 local models (Ollama)** | Omar + Anurup — **done, validated twice independently** | Do not re-do. Findings below and in the B6 row. |
| B7–B9 (rule attribution, human-feedback addressed-ness, dedupe) | Omar, merged | On `main`, with Anurup's mock closure + closure test merged in |
| Mission Control UI (Track C) + Slack routing + `/settings` + merged Reveal tab | Omar (+ Anurup's spoiler gate/learned-rules) | Merged to `main` |
| **Funnel zero-conversion fix** (`sim/funnel.ts`) | **Anurup — in progress today** | The headline-metric fix; claimed, do not duplicate |
| Sandbox dreaming + calibration-earned autonomy + librarian consolidation | Anurup — in progress today | See the long-term learning plan |

### Known-open, unclaimed

1. **`/analytics` funnel percentages assume strict nesting.** The ladder computes each stage as a
   share of the one above, but Track A's funnel rolls clicks/signups/DMs as semi-independent draws
   off a profile visit — so "DMs 1 · 0.0%" can appear. Numbers honest, percentage misleading.
2. **`prewarm-demo.ts` predates `docs/DEMO.md`**; `scripts/build-demo.ts` is the checklist-verified
   snapshot builder now — consider retiring prewarm or folding them together.
3. **Live cloud image generation untested** — needs real API keys the project deliberately has none of (D22).
4. **`tests/community-dedupe.test.ts`** is a standalone file to avoid a merge seam; fold into
   `runners.test.ts` whenever convenient (Minh).

---

## Phase 0 — walking skeleton (COMPLETE, on main)

| Item | Status | Notes |
|---|---|---|
| Scaffold (Next 16, Drizzle, Vitest, AI SDK, shadcn) | done | Node 22.23.2 pinned via .tool-versions |
| Schema + rng + fixture + seed | done | schema self-bootstraps from drizzle/*.sql (D17) |
| Engagement engine v0 + determinism tests | done | RNG keyed on stable handles |
| Bandit + playbook + guardrails + tests | done | |
| Contracts + cross-family registry + mock mode | done | smoke script for live keys |
| Orchestrator + clock + runners + loop test | done | one wave per post (see clock.ts comment) |
| Minimal UI: feed / approvals / activity | done | pause switch, mode toggle, +1h/+6h/+1d |
| Docs: ARCHITECTURE, DECISIONS, TESTING, CONTRIBUTING, DEMO | done | |
| README, HANDOFF, PROGRESS | done | this commit |
| First push + branch workflow | done | main + track branches on ozr0013/GTMPRO |

Suite at Phase 0 close: 49 tests / 16 files. **Now 80 tests / 23 files** (see the block at the top).

## Track A — Simulator (owner: Anurup)

| Task | Status | Notes |
|---|---|---|
| A1 world genesis | done | ~100-persona worlds, deterministic per seed |
| A2 funnel/DM depth | done | persona DM continuation in sim/dm.ts: reply-or-ghost from dmOpenness/skepticism, 2-6 tick delays, 3-turn janitor |
| A3 algorithm dynamics + ambient | done | two-wave idempotent engagement, early-velocity boost, follow conversion, >4-posts/day follower churn, ambient content |
| A4 golden-run regression test | done | tests/golden.test.ts: 5 scripted sim-days vs committed snapshot; regenerate via UPDATE_GOLDEN=1 |

Track A complete.

## Track B — Agents & learning (owner: Minh)

| Task | Status | Notes |
|---|---|---|
| B1 bandit lifecycle | done | merged from minh-agent; tests/bandit-lifecycle.test.ts |
| B2 calibration tracking | done | src/lib/learning/calibration.ts + tests |
| B3 edit-distillation (wordDiff in coach) | done | tests/edit-distillation.test.ts |
| B4 autopilot + expiry + budgets | done | publisher.ts expireStaleProposals wired into clock day-boundary |
| B5 rollback + quarantine surfacing | done | orchestrator getQuarantined/rollbackPlaybook + tests |
| B6 local models (Ollama) | **done — validated independently twice** (Omar 08-14 night, Anurup 08-15 morning) | Omar: end-to-end on the 32 GB tier (qwen3:14b acts / gemma3:12b judges), three blocking bugs found and fixed — see "B6 findings" below. Anurup, in parallel on qwen3:8b: smoke 3/3, e2e-drive genesis + 2 days in 22.9 min **zero quarantines**, then a hardened-code recheck (2 more days, 11.5 min) proving the closure chain live: rejection → `rule-ec4dbba8` (sourceType `rejection`) → next proposal cites `["seed-1","seed-2","rule-1cba04a0","rule-ec4dbba8"]`. Independent fixes converged (structured outputs, artdirector local branch); unique finds merged: hallucinated dm_reply guard (Anurup), negative-range clamp (Omar). Rehearsal world: `flywheel.db-e2erecheck` (tick 96, v4, real model text) |
| B7 rule→outcome attribution | **done — by Omar** | `learning/ruleEvidence.ts` + `ruleConfidence.ts`. The playbook now learns from outcomes the way the bandit already did. |
| B8 human rejections must change the playbook | **done — by Omar + Anurup, merged** | `learning/humanFeedback.ts` addressed-ness (Omar) + mandatory-add coach prompt with the amend-can't-carry-evidence trap documented, mock echo of the human's words, closure regression test (Anurup). |
| B9 rule dedupe / collapse | **done — by Omar** | `learning/ruleDedupe.ts`. Guards both additions and amendment-convergence. |

### B6 findings — local mode had never completed a loop

Ran the full system with zero API keys. It did not work; three bugs, all fixed:

1. **`supportsStructuredOutputs` was never set** on `createOpenAICompatible` in `models.ts`.
   The provider silently dropped the JSON schema on every call ("responseFormat is not
   supported"), so the model free-formed and **no `generateObject` could ever succeed** —
   genesis died first, but the strategist, critic, analyst and coach were equally dead.
   `npm run smoke` passed the whole time because `generateText` carries no schema, which is
   why this survived: **smoke is not sufficient to validate local mode, e2e-drive is.**
2. **`artdirector.ts` branched only on `MODEL_MODE`**, so live+local called the *cloud* OpenAI
   image API with no key. Now takes the local render, per the runbook's stated behaviour.
3. **Negative predicted counts.** qwen3 returned `impressions: [-10, 30]`; the contract types
   ranges as plain numbers so it validated. That rendered as "−10–30" in approvals, dragged
   `computeReward` (which averages the bounds), and inflated calibration hit-rate. Clamped to
   non-negative, ordered ranges in `orchestrator.ts`.

**Verified working:** genesis produced 5 real segments / 5 topics / 100 personas; the strategist
cited `[seed-1]` *and* a Thompson probability of 0.704; personas argued back in character; the
coach wrote v2→v4 including a **retirement** and a funnel-driven amendment. Setup notes: this
machine fits ~63% of a 14b on GPU, so a sim-day advance takes **~12 minutes**, not the runbook's
1–4. Budget for that in any live-local demo, or use the 16 GB tier.
>>>>>>> origin/main

## Track C — Mission Control UX (owner: Omar)

| Task | Status | Notes |
|---|---|---|
| C1 phone-frame feed | done | merged from oz/track-c-mission-control (phone-feed component) |
| C2 Brain view (playbook diffs, arm grid, calibration charts) | done | brain-view, arm-grid, calibration-charts components |
| C3 funnel analytics | done | analytics page + filters |
| C4 genesis onboarding UI | done | onboarding page + genesis-form, world cookie switcher |
| C5 hero images + demo prewarm (demo-snapshot.db) | done | `agents/artdirector.ts`, hero button on brand posts, `npm run prewarm` → `demo-snapshot.db`; mock mode renders a seeded local SVG so the demo needs no keys |

### C5 notes

- **Mock mode generates art locally.** `MODEL_MODE=mock` renders a seeded SVG from the
  creative brief instead of calling the image model, preserving the zero-network rule.
  Live mode calls `generateImage` with `MODEL_IMAGE` (default `gpt-image-1`).
- **Budget is derived, not decremented.** `getImageBudget` counts posts that already have
  an `imageUrl` against `settings.imageBudget`, so a retry after a failed write cannot leak
  budget. `spendImageBudget` keeps the name B4 was specified to own.
- **`public/generated/` is gitignored**; regenerate with `npm run prewarm`. `demo-snapshot.db`
  is committed per the C5 spec (its `-wal`/`-shm` sidecars are ignored).
- `prewarm-demo.ts` currently runs its own three-cycle path; it should be re-aligned with
  `docs/DEMO.md` now that DEMO.md exists.
- Live image generation is **untested** — it needs real API keys. Only the mock path is verified.

### Mission Control visual language

Modelled on a16z Speedrun. `globals.css` is the whole design system — components
read tokens, so restyling happens there, not in page files.

- **Ground/cards:** warm grey `--background` with pure white `--card`. Content
  lives in generously rounded cards (`rounded-3xl`, `--radius: 1.25rem`) floating
  on the grey. Cards are the structure — don't add shadows or heavy borders.
- **Type:** Archivo throughout. Headlines are heavy and tight (`.display` = 800 /
  -0.035em; `.display-sm` for card titles; `.figure` for big numerals). IBM Plex
  Mono for every label and figure, always tabular.
- **Rhythm:** each card is eyebrow → bold title → muted description, exactly like
  the reference's CAPITAL / HANDS-ON SUPPORT / NETWORK cards.
- **One accent:** `--signal` (periwinkle, from the APPLY NOW button tint) marks the
  live sim clock, cited rule keys, and the pending-approvals badge. `--positive` /
  `--caution` / `--destructive` stay reserved for playbook diffs.
- **Primitives:** `.eyebrow`, `.display`, `.display-sm`, `.figure`, `.stat-art`,
  `.ruled` (rows inside a card), `.rise` (page-load reveal). `<StatArt>` renders the
  repeated-numeral graphic that stands where the reference puts a photo.
- **Buttons are pills.** `rounded-full`, uppercase, bold, wide tracking.
- Note: `<html>` must not carry `h-full` — pinning it to the viewport breaks the
  scroll container that the sticky masthead resolves against.

## Final push (2026-08-15, submission day — Anurup; merged best-of-both with Omar's overnight branch)

| Item | Status | Notes |
|---|---|---|
| Learning closure: mocks read their inputs | done (merged) | mock strategist cites the NEWEST rule key from the context plus one rng-spread older key (closure beat + attribution spread); mock coach parses the digest JSON — every outstanding rejection becomes a `sourceType: "rejection"` rule echoing the human's words, edits keep the hashtag rule, outcome cycles rotate distinct dedupe-proof lessons |
| Analyst dead-ends removed | done | `suggestedLessons` persisted on `outcome_reports` (migration 0001 + generalized `ensureColumns` guard); `attribution` + lessons in the coach digest |
| Closure regression test | done | `tests/loop.test.ts`: rejection → coach rule (with the human's words) → **next proposal cites the new rule key** — the headline claim now has a test |
| Ground-truth Reveal tab on `/brain` | done (merged) | Omar's per-dimension verdicts + affinity heatmap + `lib/db/groundTruth.ts` read-path, plus Anurup's spoiler gate and learned-rules side-by-side; duplicate queries.ts implementation removed. Tests rewritten against the merged module incl. genesis-scale invariants |
| Live hardening from B6 findings | done | dm_reply-without-open-thread dropped at proposal time (+ gates test); merged strategist prompt (newest rules + measured track record + dm_reply restriction + calibration widening); merged coach prompt (mandatory ADD for rejections — amends cannot carry evidenceRefs — + track-record amend/retire) |
| Local-first identity (D22) | done | `MODEL_PROVIDER` defaults to local; README/env/docs lead with Ollama tiers; cloud opt-in and untested; art director renders seeded SVG in local mode |
| **Funnel zero-conversion fix** | done | intent differentiates instead of compounding (click 0.35+0.5·PI, signup 0.15+0.45·PI, dm 0.25·dm+0.35·PI); golden regenerated deliberately (signups 0→2, meetings 1→2); checklist snapshot bakes 6 signups / 2 meetings; `tests/funnel.test.ts` |
| Failure memory | done | `getRecentlyRetiredRules` → digest `recentlyRetiredRules_DO_NOT_READD` + dedupe corpus; retired lessons cannot be silently re-derived; text-based revival clears the memory; `tests/failure-memory.test.ts` |
| Librarian consolidation | done | past 10 rules, the coach cycle runs a merge/retire pass (SYSTEM.librarian); rejection rules code-guarded from auto-retirement; deterministic mock; `tests/librarian.test.ts` |
| Sandbox dreaming | done | `learning/dreamer.ts` ranks all 48 archetype/slot/topic candidates against the LEARNED model only (posterior x observed rates, Laplace-smoothed — never `worlds.config`/`personas.hidden`); top-5 in strategist context; "dreamed #N of 48" chip on cards; honest no-signal state; `tests/dreamer.test.ts` |
| Calibration-earned autonomy | done | hit-rate ≥0.6 over last 5 scored posts waives the human gate for low-risk actions in propose mode; sensitive always gated; derived (revokes itself, survives rollback); trail event + top-bar badge; `tests/autonomy.test.ts` |
| Design spec | done | `docs/superpowers/specs/2026-08-15-longterm-learning-design.md` — records the learned-model-dreaming epistemics decision and the deferred upgrades |
| Review round 2 fixes | done | Critical: `contextRuleKeys` leaked the track-record section (its lines also start with `[ruleKey]`), so once anything was scored "newest" resolved to the best-performing OLD rule — closure beat silently broken; fixed + regression-tested with a populated track record. Also: coach retire/amend paths now share the librarian's human-constraint guard (a rejection rule could be retired while addressed-ness still read "addressed"); rejection adds dedupe against active rules only (retired-similarity livelock); mock predictions widened to honest ranges so autonomy is earnable; snapshot seed `flywheel-1` (both reveal dimensions MATCH, meeting booked, autonomy 100%); build-demo checklist now verifies autonomy/dream/librarian beats; stray `flywheel.backup-*.db` untracked + ignored |
| Known-deferred from review | noted | `sim/metrics.ts` meeting attribution can double-count when one persona opens threads from two posts (rare in demo windows) — attribute to the latest `dm_started` at/before the meeting tick when picked up |

### Rule-level outcome attribution (new — closes the playbook learning loop)

The bandit learned from outcomes; the **playbook did not**. The coach received outcome
reports and human decisions but nothing linking *which rules were cited by posts that
hit or missed* — so despite a prompt saying "amend or retire rules contradicted by
evidence", it had no evidence to act on. Consequences: the playbook only ever grew, and
`playbook_rules.confidence` sat at its seeded value forever while the Brain view rendered
it as though it meant something.

- **`learning/ruleEvidence.ts`** derives per-rule performance with **no schema change** —
  the links already exist as `outcome_reports.postId → posts.proposalId →
  proposals.evidence.ruleIds`. Exposes citations, exceeded/met/missed, mean bandit reward,
  and a confidence shrunk toward the 0.5 prior so one lucky post can't read as certainty.
- **`learning/ruleConfidence.ts`** writes measured confidence onto each new version
  (`createPlaybookVersion` copies confidence forward unchanged). Derived, not accumulated,
  so it stays correct across rollbacks.
- **Coach digest** now carries each rule's track record plus a `rulesContradictedByEvidence`
  list (≥2 citations, mean reward < 0.4 — conservative on purpose).
- **Strategist context** carries the same track record, so citations favour what has worked.
- **Brain → Playbook** shows `confidence · n=N`, colour-coded, or "untested".
- Tests: `tests/rule-evidence.test.ts` (attribution, shrinkage, conservative flagging,
  confidence written through to the UI view).

Track B owners: the flagging thresholds in `underperformingRules` are a judgement call —
tune freely, the derivation is the part worth keeping.

### Human rejections were being silently dropped (fixed)

Observed live on local models: a human rejected a proposal with "too salesly" and **neither
v2 nor v3 mentioned tone at all** — the coach wrote about outcome metrics both times. The
headline product claim (reject with a reason → playbook changes → next proposal differs)
did not hold. Two causes:

1. **Ordering.** The digest listed rejections *after* active rules and outcome reports, so a
   small local model reliably wrote about metrics instead. Human feedback now leads the
   digest under `humanRejections_MUST_ADDRESS`, carrying the rejected caption so the coach
   can write a preventive rule, and the coach prompt makes addressing them a precondition.
2. **The time window leaked.** `decidedTick >= latest.createdTick` re-digested a decision made
   on the same tick as a version, while letting a decision age out unaddressed once a later
   version landed. `learning/humanFeedback.ts` now tracks **addressed-ness** instead: a
   rejection is outstanding until some rule cites its proposalId in `evidence.refs`. An
   ignored rejection is re-raised next cycle rather than vanishing, and the coach logs a
   `human_feedback` activity row saying how many it addressed vs ignored — so "is the coach
   listening?" is now measurable rather than vibes.

### Near-duplicate rules (fixed)

The coach re-derives the same lesson from the same report each cycle. Live output had two
rules both reading "Educational posts must use the 'Did you know?' format and include a clear
CTA… 35%", and three of five rules citing one post. `learning/ruleDedupe.ts` drops additions
that restate an existing rule (Jaccard over content words, threshold 0.6) and logs what it
dropped rather than discarding silently.

**Golden regenerated** (`playbookVersionCount` 5→2, `activeRuleCount` 7→4, everything else
byte-identical). The old snapshot was recording three versions that each re-added the *same*
canned mock rule — accretion recorded as if it were learning. The mock coach now returns
varied lessons and, importantly, has a **rejection branch** echoing the human's typed words,
so the offline demo exercises the human-feedback beat. (Regenerated again after the 08-15
best-of-both merge — the merged mock strategist/coach shift aggregates deliberately.)

## Shared-file change announcements (additive-only rule)

- 2026-08-14: `src/lib/contracts.ts` + `GenesisOutput`; `src/lib/types.ts` + `AmbientAccount`, `WorldConfig.ambient?`; `src/lib/agents/models.ts` + `genesis` role (Track A / A1).
- 2026-08-14: `posts.banditArmId` column existed from Phase 0 schema; no schema changes since first push.
- 2026-08-14 (UI): `getArmDistributions` no longer crowns a champion among arms with
  zero observations — every untried arm sits on the same prior mean, so the old
  max-mean reduce showed an `n=0` arm as "champion" above one with real evidence.
  Champion is now picked only from arms that have actually been played.
- 2026-08-14 (C5): `agents/log.ts` actor union + `artdirector`. The `activity_log.actor` column
  is free text; `schema.ts`'s comment enumeration predates this agent and was left alone.
- 2026-08-14 (C5, **behaviour fix in Track B's `communityRunner.ts`**): the clock calls
  `runCommunityPass` every tick, but a *pending* reply proposal adds no agent message, so the
  thread stayed eligible and was re-proposed **every sim hour** until a human acted. One
  unanswered DM thread produced 24 duplicate proposals across ticks 49–72 in the demo
  prewarm — approvals floods, and in live mode that is one community call per tick. Added a
  guard: skip a thread that already has a pending `dm_reply`. Prewarm day 4 went from 26
  proposals to 2. Regression test in `tests/community-dedupe.test.ts` (separate file to avoid
  a merge seam in `runners.test.ts` — fold it in whenever convenient). Minh's existing runner
  tests still pass unchanged.
- 2026-08-14 (C5, **behaviour fix in Track B's `orchestrator.ts`**): the strategist context
  never listed the world's content pillars and the returned `topic` was never validated. A
  persona only engages when the topic is in their `interests`, and interests are drawn from
  `world.config.topics` — so an off-pillar topic produces a post that reaches people and
  lands with **nobody** (impressions, zero likes, dead funnel). Mock mode masks this because
  the mock genesis topology happens to contain the mock strategist's hard-coded
  `brewing-science`; **live mode has no such guarantee**, since A1 derives topics from the
  product description while the strategist is free to invent its own. `renderContext` now
  states the pillars and `groundTopic()` snaps off-list topics back with a `topic_snap`
  activity entry. Minh: if you'd rather reject the action than snap it, that's a one-line
  change in `groundTopic`.
- 2026-08-15 (final push): `src/lib/db/schema.ts` + `outcomeReports.suggestedLessons` (nullable JSON; migration `drizzle/0001_*.sql`; `db/client.ts` bootstrap gained an idempotent `ensureColumns` guard so pre-existing DBs — incl. the committed snapshot — pick the column up). `src/lib/db/queries.ts` (Track C) + `getGroundTruthReveal`. `src/lib/agents/models.ts` (Track B): mock strategist/coach now derive outputs from their inputs (context rule keys / digest JSON) — mock reasoning strings changed, golden aggregates verified unchanged. `src/lib/agents/orchestrator.ts` (Track B): dm_reply proposals naming no open thread are dropped with a blocked trail entry. `src/lib/agents/prompts.ts` (Track B): strategist + coach hardening for small local models.
- 2026-08-14 (team merge): minh-agent and oz/track-c-mission-control merged into main with track-owner priority. New modules: `agents/publisher.ts`, `agents/log.ts` (object-form `logActivity`), `learning/calibration.ts`, `sim/{time,metrics,streams}.ts`, `app/current-world.ts`. Interface changes: `runCommunityPass(worldId)` replaces `runCommunity(worldId, tick)`; `logActivity` moved to `agents/log.ts`; `generateWorld(productDescription, { seed?, name? })` now returns `{ worldId, segments, topics }`; engine RNG streams keyed by `postStreamKey(post)` (content/slot) instead of post id.
