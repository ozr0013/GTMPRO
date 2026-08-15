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

Suite at last update: **24 tests green** (engine 3, learning 6, contracts 7, loop 2, genesis 2, ambient 4).

## Track A — Simulator (owner: Anurup)

| Task | Status | Notes |
|---|---|---|
| A1 world genesis | done | ~100-persona worlds, deterministic per seed |
| A2 funnel/DM depth | next | persona DM continuation (threads currently stall after one agent reply unless qualified); per-persona caps exist |
| A3 algorithm dynamics + ambient | partial | ambient content + clock wiring done; early-velocity boost + follower churn remain (needs idempotent second wave) |
| A4 golden-run regression test | todo | after A2/A3 settle |

## Track B — Agents & learning (owner: unassigned)

| Task | Status |
|---|---|
| B1 bandit lifecycle (arm stats in strategist context, posteriors API) | todo |
| B2 calibration tracking | todo |
| B3 edit-distillation (word-diff of human edits) | todo |
| B4 autopilot + budget enforcement + proposal expiry | partial (gate + caps exist; expiry + image budget spend todo) |
| B5 rollback surfacing + quarantine UX data | todo |

## Track C — Mission Control UX (owner: unassigned)

| Task | Status |
|---|---|
| C1 phone-frame feed polish | todo (minimal feed exists) |
| C2 Brain view (playbook diffs, posteriors, calibration) | todo |
| C3 funnel analytics | todo |
| C4 genesis onboarding UI | todo (generateWorld API ready) |
| C5 hero images + demo prewarm | todo |

## Shared-file change announcements (additive-only rule)

- 2026-08-14: `src/lib/contracts.ts` + `GenesisOutput`; `src/lib/types.ts` + `AmbientAccount`, `WorldConfig.ambient?`; `src/lib/agents/models.ts` + `genesis` role (Track A / A1).
- 2026-08-14: `posts.banditArmId` column existed from Phase 0 schema; no schema changes since first push.
