# Flywheel Architecture

Next.js App Router monolith. Three owned modules behind explicit contracts so three tracks can build in parallel with near-zero merge conflicts. Source of truth for scope and task order: `docs/superpowers/plans/2026-08-14-flywheel.md` (plan) and `docs/superpowers/specs/2026-08-14-flywheel-design.md` (design). This document matches the code on `main`.

## Module map

Files not yet on `main` are marked with the plan task that lands them.

```
flywheel/
├── README.md                       # currently the plan kickoff; bounty README lands in F1
├── CONTRIBUTING.md                 # workflow, toolchain, authorship policy
├── .env.example                    # committed; .env.local is gitignored
├── .tool-versions                  # Node 22.23.2 via asdf
├── drizzle/                        # committed drizzle-kit SQL; DB client bootstraps from it
├── docs/
│   ├── ARCHITECTURE.md             # this file
│   ├── HANDOFF.md                  # (Task 7) state, how to run, next steps
│   ├── PROGRESS.md                 # (Task 7) per-track status; shared-file announcements
│   ├── DECISIONS.md                # ADR-lite, append-only
│   ├── TESTING.md                  # verification workflow
│   ├── DEMO.md                     # demo script
│   └── superpowers/                # frozen spec + plan (do not edit)
├── scripts/
│   ├── commit-clean.sh             # trailer-free commits for agent-made changes
│   ├── seed-demo-world.ts          # seeds the 12-persona demo world
│   ├── smoke-models.ts             # validates both providers + image model
│   └── prewarm-demo.ts             # (C5) live-mode demo prewarm + snapshot DB
├── src/
│   ├── app/                        # ── Track C owns ──
│   │   ├── layout.tsx, page.tsx    # scaffold today; nav/status in Task 6
│   │   ├── actions.ts              # (Task 6) thin "use server" wrappers only
│   │   ├── feed/ approvals/ activity/          # (Task 6)
│   │   └── brain/ analytics/ onboarding/       # (C2, C3, C4)
│   ├── components/ui/              # shadcn primitives (common scaffold)
│   └── lib/
│       ├── db/
│       │   ├── schema.ts           # SHARED, additive-only
│       │   ├── client.ts           # db singleton; runtime schema bootstrap
│       │   └── queries.ts          # (Task 6) Track C owns, additive
│       ├── types.ts                # SHARED domain types
│       ├── contracts.ts            # SHARED zod agent-output schemas (Track B extends)
│       ├── rng.ts                  # seeded RNG helpers
│       ├── utils.ts                # shadcn cn() helper
│       ├── sim/                    # ── Track A owns ──
│       │   ├── engine.ts           # engagement scoring (exists)
│       │   ├── clock.ts            # (Task 5) advanceTicks orchestration
│       │   ├── funnel.ts           # (Task 5) clicks/signups/DM initiation
│       │   ├── dm.ts               # (A2) persona DM behavior
│       │   ├── ambient.ts          # (A3) competitor/noise content
│       │   ├── genesis.ts          # (A1) product -> world pipeline
│       │   └── build.ts            # (A1) shared world builder, extracted from fixture
│       ├── agents/                 # ── Track B owns ──
│       │   ├── models.ts           # registry + mock mode + retry/quarantine (exists)
│       │   ├── prompts.ts          # all role prompts (exists)
│       │   ├── orchestrator.ts     # (Task 5) runHeartbeat, decideProposal, publisher
│       │   ├── analystRunner.ts    # (Task 5) day-boundary evaluation
│       │   ├── coachRunner.ts      # (Task 5) learning digest -> playbook version
│       │   ├── communityRunner.ts  # (Task 5) DM replies + qualification
│       │   └── artdirector.ts      # (C5) hero images
│       └── learning/               # ── Track B owns ──
│           ├── bandit.ts           # Thompson sampling (exists)
│           ├── playbook.ts         # full-copy versioning, diff, rollback (exists)
│           ├── guardrails.ts       # THE single gate function (exists)
│           └── calibration.ts      # (B2) predicted-vs-actual tracking
└── tests/
    ├── engine.test.ts  bandit.test.ts  playbook.test.ts  guardrails.test.ts  contracts.test.ts
    ├── loop.test.ts                # (Task 5) mock-mode end-to-end walking skeleton
    └── fixtures/world.ts           # deterministic tiny world builder
```

## Track ownership

| Track | Owns | Notes |
|---|---|---|
| A | `src/lib/sim/` | World genesis, engagement engine, funnel, DMs, ambient content, clock |
| B | `src/lib/agents/` + `src/lib/learning/` + `src/lib/contracts.ts` | Multi-model loop, bandits, playbook, guardrails. `contracts.ts` is also a shared file — see below |
| C | `src/app/` + `src/lib/db/queries.ts` | Mission Control UI; `queries.ts` is the read-side contract, additive |

Everything else (configs, scripts, docs) is common ground — coordinate in `docs/PROGRESS.md`.

## Shared files: additive-only

After Phase 0, `src/lib/db/schema.ts`, `src/lib/types.ts`, and `src/lib/contracts.ts` are additive-only: add tables, nullable columns, types, or schemas — never rename, remove, or change the meaning of anything existing. Announce every change in `docs/PROGRESS.md` so other tracks see it before their next merge. `contracts.ts` is Track B's to extend, but the additive rule still applies to it.

## Interface contracts

Exact signatures as implemented on `main`. Return shapes shown as comments where TypeScript infers them.

### Seeded RNG — `src/lib/rng.ts` (shared)

```ts
export type Rng = () => number;
export function makeRng(seed: string): Rng;
/** Stable per-entity rng so outcomes don't depend on iteration order. */
export function subRng(worldSeed: string, ...parts: (string | number)[]): Rng;
export function pick<T>(rng: Rng, items: readonly T[]): T;
```

All randomness flows through these, seeded per world. Identical seeds produce identical sim outcomes.

### DB — `src/lib/db/client.ts` (shared)

```ts
export const db;            // drizzle better-sqlite3 singleton over ./flywheel.db (or DB_PATH)
export type Db = typeof db;
```

The client self-bootstraps the schema from committed `drizzle/*.sql` when tables are missing (Decision D17), so fresh file DBs and per-process `:memory:` test DBs work with zero setup. After a (additive) schema change, run `npm run db:generate` and commit the SQL.

### Sim engine — `src/lib/sim/engine.ts` (Track A)

```ts
export interface ScoreContext { config: WorldConfig; brandPostsToday: number; tick: number; }
/** Pure scoring function, exported for tests. `noise` is a uniform [0,1) sample. */
export function scorePersonaPost(
  hidden: PersonaHidden, segment: string, archetype: Archetype, topic: string,
  ctx: ScoreContext, noise: number,
): number;
export function runEngagementWave(worldId: string, postId: string, tick: number): void;
```

`runEngagementWave` inserts `engagements` rows for followers plus a discovery sample of non-followers (at least `discoveryFloor` personas). RNG streams are keyed on `(world.seed, postId, persona.handle)` — stable identifiers, never row UUIDs.

### Bandit — `src/lib/learning/bandit.ts` (Track B)

```ts
export function sampleGamma(shape: number, rng: Rng): number;
export function sampleBeta(alpha: number, beta: number, rng: Rng): number;
export function sampleArm(worldId: string, rng: Rng);
  // returns the Thompson-sampled bandit_arms row among enabled arms
export function recordReward(armId: string, postId: string, reward: number, tick: number): void;
  // updates alpha/beta and inserts a bandit_observations row
export interface FunnelActual {
  impressions: number; likes: number; linkClicks: number; signups: number;
  dmsStarted?: number; meetings?: number;
}
export function computeReward(actual: FunnelActual): number;
  // 0..1 absolute funnel value per impression. Predictions are calibration-only.
```

### Playbook — `src/lib/learning/playbook.ts` (Track B)

```ts
export interface PlaybookChanges {
  add: { category: string; text: string; evidenceRefs: string[];
         sourceType: "outcome" | "rejection" | "edit" }[];
  amend: { ruleKey: string; text: string }[];
  retire: string[];
}
export function getActiveRules(worldId: string);
  // playbook_rules rows of the latest version
export function createPlaybookVersion(
  worldId: string, changes: PlaybookChanges,
  author: "coach" | "human" | "rollback", tick: number, summaryOverride?: string,
);  // { versionId, version, diff }; also snapshots bandit posteriors (bandit_snapshots)
export function diffVersions(worldId: string, vA: number, vB: number);
  // { added: rules[], amended: rules[], retired: ruleKey[] } — compared by stable ruleKey
export function rollbackTo(worldId: string, targetVersion: number, tick: number);
  // { versionId } — restores target rules as a NEW version (history is append-only)
```

### Guardrails — `src/lib/learning/guardrails.ts` (Track B)

```ts
export interface GuardrailAction {
  kind: "post" | "reply" | "dm_reply";
  topic: string;
  scheduledTick: number;
  riskClass: "normal" | "sensitive";
}
/** THE single gate: every action (heartbeat, autopilot, publisher) goes through here. */
export function checkGuardrails(worldId: string, action: GuardrailAction);
  // { allowed: boolean; requiresApproval: boolean; reasons: string[] }
```

Checks pause state, banned topics, quiet hours, posts/day and DMs/day caps. `requiresApproval` is true in propose mode or whenever `riskClass` is `"sensitive"` — sensitive actions are gated even in Autopilot.

### Model registry — `src/lib/agents/models.ts` (Track B)

```ts
export type AgentRole =
  | "strategist" | "copywriter" | "critic" | "analyst"
  | "coach" | "community" | "persona";
export function modelFor(role: AgentRole);
  // strategist/copywriter/coach -> anthropic(MODEL_ACTOR); critic/analyst -> openai(MODEL_JUDGE);
  // community/persona -> openai(MODEL_CHEAP). Cross-family judging is load-bearing (D7).
export async function callAgent<T>(
  role: AgentRole, schema: z.ZodType<T>, system: string, user: string,
  opts: { worldSeed: string; refId: string },
): Promise<{ ok: true; data: T } | { ok: false; error: string }>;
```

`callAgent` never throws. In `MODEL_MODE=mock` (the default) it returns seeded, schema-valid canned output keyed on `(worldSeed, role, refId)`. In live mode it retries once, then returns `{ ok: false }` — callers write a `quarantined` proposal row instead of crashing (D12).

### Agent output contracts — `src/lib/contracts.ts` (Track B, shared)

Zod schemas with inferred `...T` types: `PredictedEffectSchema`, `StrategistOutput` (1-3 actions, each with `reasoning`, `evidenceRuleIds`, optional `banditArmId`, `predictedEffect`, `riskClass`), `CopywriterOutput`, `CriticOutput` (`pass | revise | block`), `AnalystOutput` (`exceeded | met | missed`, factor attribution, suggested lessons), `CoachOutput` (`playbookChanges` matching `PlaybookChanges`), `CommunityOutput` (`continue | meeting_booked | disqualified`), `PersonaVoiceOutput`.

### Test fixture — `tests/fixtures/world.ts`

```ts
export function buildTinyWorld(seed = "test-seed"): { worldId: string };
```

Deterministic 12-persona world (3 segments), playbook v1 with seed rules `voice-1`/`content-1`/`timing-1`, 12 bandit arms, default settings.

### Landing next (signatures fixed by the plan)

```ts
// Task 5 — src/lib/agents/orchestrator.ts, src/lib/sim/clock.ts
runHeartbeat(worldId: string): Promise<{ proposalIds: string[] }>
decideProposal(proposalId: string, decision: "approve" | "reject" | "edit",
               opts?: { reason?: string; editedPayload?: PostPayload }): Promise<void>
advanceTicks(worldId: string, n: number): Promise<{ tick: number }>

// Task 6 — src/lib/db/queries.ts (Track C, additive)
getWorld, getFeed(worldId), getPendingProposals(worldId), getActivity(worldId, limit)

// Task A1 — src/lib/sim/genesis.ts
generateWorld(productDescription: string, seed: string): Promise<{ worldId: string }>
```

## Data flow

### Time model

Sim time is request-driven: it advances only via `advanceTicks(worldId, n)` — a server action triggered by the UI's `+1h` / `+6h` / `+1 day` buttons or by tests. 1 tick = 1 sim-hour; 24 ticks = 1 sim-day. There are no background timers (`setInterval`/`setTimeout`) anywhere (D8). The heartbeat is a consequence of ticks: the clock fires it at sim-morning (`tick % 24 === 7`).

### One sim tick

For each tick `t`, the clock (Task 5):

1. Publishes due scheduled posts (`status: "published"`, `publishedTick: t`).
2. Runs `runEngagementWave` for brand posts published in the last 24 ticks. Waves fire only at `publishedTick` and `publishedTick + 6` (two waves per post). The engine loads the world's hidden `WorldConfig` and persona hidden state, builds the reach set (followers + discovery sample), scores each persona with `scorePersonaPost` via per-entity `subRng` streams, and inserts `engagements` rows (impression, and like/comment/save/profile_visit above thresholds). Comments get placeholder text.
3. Runs the funnel: each `profile_visit` at `t` makes seeded rolls against the persona's hidden `purchaseIntent`/`dmOpenness` — `link_click`, then `signup`, then DM initiation, writing `funnel_events` and creating `dm_threads` + persona `dm_messages`.
4. Fills pending persona-voice comment texts via `callAgent("persona", ...)` in batch.
5. At the day boundary (`t % 24 === 0`): the analyst evaluates each post whose 24-tick window closed — actual vs the strategist's `predictedEffect` for the calibration/verdict write-up — writing `outcome_reports` and calling `recordReward(computeReward(actual))` to update the post's bandit arm from absolute funnel value (clicks/signups/DMs/meetings per impression). Then the coach digests new reports plus decided proposals into `createPlaybookVersion` (skipped when there are no changes).
6. At sim-morning (`t % 24 === 7`): fires `runHeartbeat`.
7. Updates `worlds.simTick = t`.

### One heartbeat cycle

`runHeartbeat(worldId)` — skipped entirely when paused:

1. **Strategist** (Claude) receives the active playbook rules (with ruleKeys), bandit arm stats, a 24-tick analytics summary, unanswered comments, and open DM threads. It returns 1-3 actions, each with reasoning, cited `evidenceRuleIds`, `predictedEffect` ranges, and a `riskClass`.
2. **Guardrails**: every action passes through `checkGuardrails`. Blocked actions are logged to `activity_log` with `status: "blocked"` and skipped.
3. **Copywriter** (Claude) drafts caption/hashtags/creative brief for post actions.
4. **Critic** (GPT — different family, deliberately) reviews the draft: `block` skips and logs, `revise` swaps in `revisedCaption`, `pass` proceeds.
5. A **proposal** row is inserted: `pending` when `requiresApproval` (propose mode, or any sensitive action), else `auto_approved`.
6. **Human gate / autopilot**: pending proposals wait on the Approvals screen for `decideProposal` — approve, edit (stores `humanEditDiff`), or reject with a typed reason (stores `humanReason`). Auto-approved proposals publish immediately.
7. **Publisher** inserts the `posts` row scheduled at the next occurrence of the action's `timeSlot` (`TIME_SLOTS` in `types.ts`).
8. On subsequent ticks the **engine wave** and **funnel** (see above) turn the published post into engagements and funnel events.
9. At the next day boundary the **analyst** closes the post's outcome window into an `outcome_reports` row and updates the bandit posterior via `recordReward` — the **bandit update**.
10. The **coach** (Claude) digests analyst reports and human decisions (rejections with reasons, edit diffs) into a new **playbook version** — which snapshots bandit posteriors alongside it. The next heartbeat's strategist sees the new rules and cites them.

Every step appends an `activity_log` row (actor, action, status, summary). Any `callAgent` failure after its one retry becomes a `quarantined` proposal row with the error in `detail` — the heartbeat never throws (D12).
