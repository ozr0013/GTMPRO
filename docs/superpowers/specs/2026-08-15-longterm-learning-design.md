# Long-Term Learning Upgrade — Design (2026-08-15, submission day)

Approved scope: failure memory, librarian consolidation, sandbox dreaming, calibration-earned
autonomy — plus the zero-signup funnel fix that displaced other work when two live runs showed
the headline metric reading zero. Built by Anurup on top of (and merged best-of-both with)
Omar's overnight learning core (addressed-ness, rule attribution, dedupe, measured confidence).

## The problem

Reactive rule-making oscillates and bloats: nothing stopped contradictory or duplicate rules,
nothing remembered failed experiments, success was measured one post at a time, and autonomy
was a manual toggle rather than something the agent earns.

## Decisions

### 1. No vector store — SQL + an LLM reading all rules

At playbook scale (≤ ~15 rules capped) an LLM reading every rule does strictly better semantic
work than embedding similarity, with zero new infrastructure and no violation of the zero-key
identity (D22). Failed experiments already live in SQLite: retired rules, rejected proposals
with reasons, missed-verdict reports.

- **Failure memory** (`getRecentlyRetiredRules` in `learning/playbook.ts`): rules retired in
  the last 3 versions join the coach digest under `recentlyRetiredRules_DO_NOT_READD` and the
  dedupe corpus, so a retired lesson cannot be silently re-derived. Revival is text-based —
  a deliberate re-add (or rollback) clears the memory.
- **Librarian** (`runLibrarianConsolidation` in `agents/coachRunner.ts`): past 10 active rules,
  a consolidation call (SYSTEM.librarian) merges overlapping rules into contextual ones and
  retires stale/absorbed ones. Never adds. Rejection-sourced rules are protected in CODE, not
  just prompt — only a human may remove a human constraint. Mechanical near-duplicate dedupe
  (Omar's `ruleDedupe.ts`) handles textual convergence; the librarian handles semantic overlap.

### 2. Sandbox dreaming dreams against the LEARNED model — never the hidden config

The original proposal ("test posts against the simulated personas") would hand the agent a
free oracle: if the dreamer reads `personas.hidden` or `worlds.config`, the "discovers hidden
ground truth" claim collapses under one judge question. Instead (`learning/dreamer.ts`):

    dream(archetype, slot, topic) =
      banditPosteriorMean(archetype, slot)
      x smoothedObservedRate(topic)      — likes/impressions on own posts, Laplace (1,2)
      x smoothedObservedRate(slot)

All 48 candidates ranked every heartbeat; top-5 rendered into the strategist context; the
chosen tuple's rank attached to the proposal's evidence and shown as a "dreamed #N of 48"
chip. A world with zero scored posts honestly reports "no dream signal yet" instead of a fake
winner. Zero LLM calls, deterministic, identical in mock and live. The Reveal tab then grades
the dream — belief vs truth — which strengthens the epistemics story instead of breaking it.

### 3. Autonomy is earned, not toggled

`earnedAutonomy` (`learning/guardrails.ts`): calibration hit-rate ≥ 0.6 over the last 5 scored
posts waives the human gate for low-risk actions in propose mode. Derived on every check — a
slump revokes it automatically; nothing is stored, so it survives rollbacks. Sensitive actions
are human-gated unconditionally. Each waiver writes an `earned_autonomy` trail event; the top
bar shows the badge with the live hit-rate.

### 4. Funnel had to convert before any of this mattered

Two independent live runs produced 0 signups / 0 meetings: the funnel multiplied purchase
intent at every stage (click 0.6·PI, then signup 0.3·PI ⇒ ~3.6% per profile visit). A visit
already expresses intent, so downstream stages now use intent as a differentiator, not a
squared gate (click 0.35+0.5·PI, signup 0.15+0.45·PI, DM 0.25·dmOpenness+0.35·PI). Golden
regenerated deliberately; the checklist snapshot now bakes 6 signups and 2 meetings.

## Deferred (in README roadmap)

Campaign-arc bandit rewards and time-decayed meeting attribution; persona-cohort shadow
control and the twin-world frozen baseline; toxic-version detection with a rollback card;
bandit posterior restore on rollback.

## Verification

Every feature: unit + integration tests (suite 126/32 at spec time, golden regenerated once,
deliberately, for the funnel change only). Live-local validated twice on Ollama before the
feature work; the demo runbook in `docs/DEMO.md` carries the three new beats.
