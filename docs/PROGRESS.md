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
| A2 funnel/DM depth | next | persona DM continuation (threads currently stall after one agent reply unless qualified); per-persona caps exist |
| A3 algorithm dynamics + ambient | partial | ambient content + clock wiring done; early-velocity boost + follower churn remain (needs idempotent second wave) |
| A4 golden-run regression test | todo | after A2/A3 settle |

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
| C5 hero images + demo prewarm (demo-snapshot.db) | todo | last remaining C task |

## Shared-file change announcements (additive-only rule)

- 2026-08-14: `src/lib/contracts.ts` + `GenesisOutput`; `src/lib/types.ts` + `AmbientAccount`, `WorldConfig.ambient?`; `src/lib/agents/models.ts` + `genesis` role (Track A / A1).
- 2026-08-14: `posts.banditArmId` column existed from Phase 0 schema; no schema changes since first push.
- 2026-08-14 (team merge): minh-agent and oz/track-c-mission-control merged into main with track-owner priority. New modules: `agents/publisher.ts`, `agents/log.ts` (object-form `logActivity`), `learning/calibration.ts`, `sim/{time,metrics,streams}.ts`, `app/current-world.ts`. Interface changes: `runCommunityPass(worldId)` replaces `runCommunity(worldId, tick)`; `logActivity` moved to `agents/log.ts`; `generateWorld(productDescription, { seed?, name? })` now returns `{ worldId, segments, topics }`; engine RNG streams keyed by `postStreamKey(post)` (content/slot) instead of post id.
