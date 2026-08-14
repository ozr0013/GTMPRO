# Flywheel — Design Spec (approved 2026-08-14)

Hackathon entry for the MadeThis "Build a Self-Improving GTM Agent" bounty.

## Positioning

The crowded default is another cold-outbound AI SDR. Flywheel instead owns an **organic-social-to-pipeline loop** inside a simulated Instagram-like platform, **Pictogram**, whose audience has *hidden ground truth*. That inversion turns the bounty's "simulate sends" safety constraint into the product: outcomes are measurable, learning curves are real, and the endgame demo move is revealing the hidden config the agent discovered.

## The World (simulator with ground truth)

- **World genesis**: from any product description, derive ICP, 4–6 segments, ~100 personas with hidden state (interests, skepticism, engagement propensity, purchase intent, DM-openness, active hours), ambient/competitor accounts, a link-in-bio landing page, and a seed playbook of hypotheses.
- **Sim clock**: request-driven ticks (1 tick = 1 sim-hour, 24 = 1 sim-day) via an `advanceTicks` server action. No background timers. Heartbeat fires every sim-morning (proactive-work bonus).
- **Hybrid engagement engine**: seeded deterministic persona×post scoring (interest match, segment×archetype affinity from the hidden matrix, time-of-day, fatigue, follower status, platform-algorithm multipliers, noise) decides who engages and how deeply (impression → like → comment → save → profile visit → link click → signup → DM). LLM persona voices write comment/DM text only for engagers. A discovery-reach floor solves cold start.
- **Hidden algorithm dynamics** the agent must discover: early-velocity boost, over-posting penalty, follower churn.

## The Agent Team (reason → action → evaluation → improvement)

Cross-family assignment is deliberate: documented self-preference bias (GPT-4o ~10% self-boost, Claude up to ~25%, plus family bias — Panickssery et al., arXiv 2410.21819) means evaluators must come from a different model family than the actors they judge.

| Role | Family | Job |
|---|---|---|
| Strategist | Claude | Picks next best action; cites playbook rule IDs + bandit stats; predicts effect ranges (scored for calibration) |
| Copywriter | Claude | Captions/hashtags/creative briefs per voice rules |
| Red-team Critic | GPT | Pre-flight: brand safety, spam/cringe risk, guardrails |
| Analyst | GPT | Post-hoc: actual vs predicted, factor attribution, lesson suggestions |
| Coach | Claude | Distills outcomes + human feedback into playbook deltas |
| Community Mgr | GPT (cheap) | DM replies; 3-turn qualification → meeting_booked / disqualified |
| Persona voices | GPT (cheap) | In-character comments/DMs for engagers |
| Art Director | image model | Hero-post images only, budget-capped |

## The self-improving loop (three feedback channels, all changing behavior)

1. **Outcome learning**: Analyst reports update Thompson-sampling bandit posteriors (≤12 arms: 4 archetypes × 3 time slots) and propose playbook rules.
2. **Human-feedback learning**: every rejection captures a rationale; every inline edit is diffed and distilled into rules (edit-distillation).
3. **Calibration**: predicted-vs-actual tracked over time; the strategist is told its current calibration and demonstrably improves at predicting, not just choosing.

The playbook is versioned (full-copy per version), human-editable, diffable, and revertible. Every proposal cites the rules and bandit stats that drove it — explainability is structural.

## Trust, permissions, guardrails

- **Propose mode**: approval cards (action, target, reasoning, evidence, predicted effect, risk class) with Approve / Reject-with-reason / Edit-inline.
- **Autopilot**: acts within caps — posts/day, DMs/day, quiet hours, image + token budgets, banned topics — enforced by one gate function. Sensitive classes (first-touch DMs, pricing/discount posts) always require approval.
- Activity trail for every step; pause/kill switch; playbook rollback (restores rules; bandit posteriors snapshotted per version).

## Mission Control UI

Onboarding/genesis → Pictogram feed (phone frame) → Approval queue → Activity trail → Brain (playbook + diffs, bandit posteriors, calibration) → Funnel analytics (before/after per playbook version).

## Stack & delivery

Next.js App Router + TypeScript strict, Vercel AI SDK (Anthropic + OpenAI), Drizzle + better-sqlite3, Tailwind + shadcn/ui, Vitest. `MODEL_MODE=mock` runs the full loop offline. Phase 0 ships a walking-skeleton MVP + collaboration docs as the first commit; Tracks A (simulator), B (agents/learning), C (UI) then run in parallel — see `docs/superpowers/plans/2026-08-14-flywheel.md`.

## Judging map

GTM impact 30% = full simulated funnel to meetings · learning loop 25% = playbook diffs + posteriors + calibration · trust 20% = gates/caps/trail/rollback · UX 15% = Mission Control · originality 10% = simulated-market-with-ground-truth + cross-family judging. Bonuses: heartbeat, experiment selection, editable memory, rollback, budget caps.
