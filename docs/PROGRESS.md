# Progress

Update this every working session. Definition of done: code + tests + a row here.

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

Suite at last update: **49 tests green across 16 files** (Track A sim + Track B agent/learning suites + loop integration).

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
| B6 local models (NEW, owner: Minh) | todo | code + runbook landed (docs/LOCAL_MODELS.md); Minh: install Ollama, pull tier models, run smoke + e2e-drive live-local, report results |

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
- 2026-08-14 (team merge): minh-agent and oz/track-c-mission-control merged into main with track-owner priority. New modules: `agents/publisher.ts`, `agents/log.ts` (object-form `logActivity`), `learning/calibration.ts`, `sim/{time,metrics,streams}.ts`, `app/current-world.ts`. Interface changes: `runCommunityPass(worldId)` replaces `runCommunity(worldId, tick)`; `logActivity` moved to `agents/log.ts`; `generateWorld(productDescription, { seed?, name? })` now returns `{ worldId, segments, topics }`; engine RNG streams keyed by `postStreamKey(post)` (content/slot) instead of post id.
