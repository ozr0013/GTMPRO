# Decisions (ADR-lite)

Append-only. New entries take the next number; never edit or delete an existing entry — supersede it with a new one that references it. Keep each entry to Context / Decision / Consequence, 2-4 sentences total.

## D1 — Organic-social loop, not cold outbound

- Context: The obvious entry for a GTM-agent bounty is another cold-outbound AI SDR, a crowded space where submissions blur together.
- Decision: Flywheel owns an organic-social-to-pipeline loop — grow a product's account with content, then convert engagement into booked meetings.
- Consequence: Differentiated positioning and an inherently visual demo (a feed and a funnel, not an inbox).

## D2 — Full-funnel outcomes

- Context: Vanity engagement metrics are easy to inflate and say nothing about GTM impact.
- Decision: The simulator and the learning loop optimize the full funnel: reach, engagement, link clicks, signups, DMs, booked meetings.
- Consequence: `computeReward` and analytics weight deeper funnel stages higher, and meetings booked is the headline demo metric.

## D3 — Simulated platform with hidden ground truth

- Context: The bounty requires simulated sends, which most entries treat as a mock to apologize for.
- Decision: Make the simulation the product — a world with hidden ground truth (affinity matrix, algorithm parameters, persona hidden state) the agent must discover.
- Consequence: Learning curves are real and measurable, and the endgame demo move is revealing the true config next to the learned rules.

## D4 — One Instagram-like platform

- Context: Cross-channel breadth would dilute a weekend build into shallow integrations.
- Decision: A single Instagram-like platform — always called Pictogram in UI copy, docs, and screenshots — with depth: feed mechanics, discovery, DMs, a platform algorithm.
- Consequence: There are richer hidden dynamics to learn, and the platform name is a hard copy constraint everywhere.

## D5 — Hybrid engagement engine

- Context: Pure-LLM audience simulation is slow, expensive, and non-deterministic.
- Decision: Seeded deterministic scoring decides WHO engages and how deeply; LLM persona voices write text only for personas that actually engaged.
- Consequence: Outcomes are cheap and reproducible at scale, LLM cost is proportional to real engagement, and engagement math is testable without models.

## D6 — Playbook + Thompson-sampling bandits as the learning machinery

- Context: "Self-improving" must be visible and auditable, not a fine-tune or a silent prompt mutation.
- Decision: Two explicit mechanisms — a human-readable versioned playbook of rules, and Thompson-sampling Beta bandits over archetype and time-slot arms.
- Consequence: Learning shows up as rule diffs and posterior shifts that can be rendered, edited, and rolled back.

## D7 — Cross-family model assignment

- Context: LLM evaluators systematically favor outputs from their own model family (self-preference bias; Panickssery et al., arXiv 2410.21819).
- Decision: Claude acts (Strategist, Copywriter, Coach) and GPT judges (Critic, Analyst); an evaluator never shares a family with the actor it judges.
- Consequence: Live mode requires both provider keys, and `modelFor()` in `src/lib/agents/models.ts` enforces the mapping.

## D8 — Request-driven sim time

- Context: Next.js server processes are ephemeral; background timers die on redeploy and make tests nondeterministic.
- Decision: Sim time advances only via `advanceTicks(worldId, n)`; no `setInterval`/`setTimeout` daemons anywhere.
- Consequence: Time is fully controllable in tests and demos (`+1h`/`+1 day` buttons), and the heartbeat fires as a consequence of ticks rather than a cron.

## D9 — Mock-mode-first

- Context: Hackathon development and tests cannot depend on API keys, rate limits, or network reliability.
- Decision: `MODEL_MODE=mock` runs the complete loop offline with seeded, schema-valid canned outputs; all tests run in mock mode, pinned by `vitest.config.ts`.
- Consequence: Anyone can develop and test with zero keys; live mode is a demo-day flourish validated by `npm run smoke`.

## D10 — Bandit arm space capped at 12

- Context: With demo-scale sample sizes, a large arm space never visibly converges.
- Decision: Arms are 4 archetypes x 3 time slots (at most 12); topics are steered by playbook rules, not arms.
- Consequence: Posteriors move visibly within a few sim days, and topic-level learning stays in the readable playbook.

## D11 — DM qualification capped at 3 turns

- Context: Open-ended DM conversations burn tokens and stall the funnel.
- Decision: The community manager must reach `meeting_booked` or `disqualified` within 3 turns (`turnCount` on `dm_threads`).
- Consequence: DM simulation stays bounded and cheap, and qualification outcomes land as funnel events quickly enough to demo.

## D12 — Quarantine, never crash

- Context: LLM structured-output calls fail sometimes, and one bad call must not kill a heartbeat mid-demo.
- Decision: `callAgent` retries once, then the failure is written as a proposal row with `status: "quarantined"` and the error in `detail`; the heartbeat never throws.
- Consequence: Failures are visible in the activity trail and approvals data instead of silently lost.

## D13 — Additive-only shared files

- Context: Three parallel tracks merging into `schema.ts`, `types.ts`, and `contracts.ts` is the project's biggest collision risk.
- Decision: After Phase 0 those files are additive-only — new tables, nullable columns, types, and schemas only — and every change is announced in `docs/PROGRESS.md`.
- Consequence: Merges stay trivial and no track can break another's compiled code through a shared file.

## D14 — Sensitive actions always gated

- Context: Some actions are high-regret even inside daily caps: first-touch DMs and pricing/discount posts.
- Decision: Actions with `riskClass: "sensitive"` always require human approval, even in Autopilot; `checkGuardrails` computes `requiresApproval` as propose-mode OR sensitive.
- Consequence: The autonomy dial never covers the riskiest classes, which is the permission model judges are asked to trust.

## D15 — Full-copy playbook versioning

- Context: Rule history must be diffable and revertible without reconstructing event-sourced state.
- Decision: Every playbook version stores its complete rule set; identity across versions is the stable `ruleKey`; diffs compare by `ruleKey`; bandit posteriors are snapshotted per version (`bandit_snapshots`).
- Consequence: Storage is redundant but trivially small, and diff/rollback are simple set operations in `src/lib/learning/playbook.ts`.

## D16 — Committed generated SQL, no migration framework

- Context: A hackathon-scale schema under an additive-only rule does not need incremental migration tooling.
- Decision: `drizzle-kit generate` output is committed as `drizzle/*.sql`; there is no runtime migration framework; the local SQLite file (`flywheel.db`) is gitignored.
- Consequence: Schema changes are code-reviewed as SQL, and every fresh checkout can build the database from the repo alone.

## D17 — Runtime schema bootstrap in the DB client

- Context: `db:push` is a manual per-developer step and cannot reach per-process in-memory test databases.
- Decision: `src/lib/db/client.ts` bootstraps the schema from the committed `drizzle/*.sql` whenever the tables are missing.
- Consequence: Fresh file DBs and `:memory:` test DBs work with zero setup; `npm run db:push` remains available but optional.

## D18 — Human-only commit authorship

- Context: Commits must be attributable to humans, but the Cursor IDE agent appends a "Co-authored-by: Cursor" trailer to `git commit`.
- Decision: No AI co-author trailers, ever; agent-made commits go through `scripts/commit-clean.sh`, which builds the commit with git plumbing so nothing is injected; author identity is the personal GitHub account, not a work account.
- Consequence: `main` history is verified clean of trailers, and the policy is enforceable by script rather than by memory (see CONTRIBUTING.md).

## D19 — Two-wave idempotent engagement with hidden platform dynamics

- Context: A single engagement wave per post left the plan's early-velocity dynamic unimplemented because the wave inserter was not idempotent.
- Decision: `runEngagementWave(worldId, postId, tick, wave)` excludes personas that already engaged with the post; wave 2 fires 6 ticks after publish on fresh discovery only, sized up by `earlyVelocityBoost` when wave-1 interaction rate ≥ 0.3 and halved otherwise; deep engagers can convert to followers; posting >4 brand posts/day triggers 5% follower churn at the day boundary.
- Consequence: The agent has real hidden dynamics to discover (velocity, over-posting), audience growth is endogenous, and wave-1 RNG streams are byte-identical to the previous implementation so existing deterministic tests are unaffected.

## D20 — Persona-side DM continuation model

- Context: DM threads stalled after the agent's first reply unless qualification ended immediately, making the meeting-booked funnel depend on a single exchange.
- Decision: `src/lib/sim/dm.ts` gives each waiting persona a stable seeded roll — reply (after a 2-6 tick delay) or ghost — derived from `dmOpenness` and `skepticism`; a janitor closes threads that exhaust the 3-turn budget.
- Consequence: Conversations progress across sim time toward `meeting_booked`/`disqualified`/ghosted outcomes, and the community runner needs no changes because threads simply become persona-last again.

## D21 — Stable-identifier rule for all RNG and mock refIds

- Context: The golden run exposed nondeterminism: mock-mode outputs derive their RNG from `callAgent` refIds, and two runners keyed refIds on row UUIDs.
- Decision: Every RNG stream and every `callAgent` refId must be keyed on stable identifiers — persona handles, post stream keys, turn counts, ticks — never row UUIDs. Activity-log row references may still use UUIDs.
- Consequence: Same seed ⇒ same simulation, byte for byte; `tests/golden.test.ts` enforces the rule permanently (regenerate deliberately with `UPDATE_GOLDEN=1`).

## D22 — Absolute funnel reward, predictions are calibration-only

- Context: `computeReward` scored "did this post beat the strategist's own predicted midpoint." The bandit therefore learned where the model under-forecast, not which content converted, and posteriors flattened toward 0.5 as calibration improved. Meetings — the headline metric — were not an input.
- Decision: Reward is weighted funnel value per impression (likes 0.05, clicks 1, signups 3, DMs 3, meetings 10), clipped at a fixed saturation rate of 0.4. Predicted ranges stay on outcome reports for calibration and analyst verdicts only.
- Consequence: A meeting always outranks a like; the same outcome always scores the same; `ruleEvidence` and the bandit now share an honest performance signal. Supersedes the D2 implication that predicted-vs-actual was the reward.

## D23 — Ground-truth recovery is a number

- Context: The reveal compared hidden config to learned posteriors by eyeballing two ranked lists and a top-1 "Match / Not yet" badge.
- Decision: Each reveal dimension reports Spearman's rank correlation (ρ) between hidden truth scores and learned bandit means; the panel headline is the mean ρ across dimensions that produced a defined ranking. Null when there is no evidence or zero learned variance.
- Consequence: The demo close is "the agent recovered the hidden ordering at ρ = …, having never seen it" rather than a visual comparison, and `tests/ground-truth.test.ts` guards the statistic.
