# Handoff

Last updated: 2026-08-15 (submission day, post team-merge). State: **feature-complete for the
demo; live-local validated twice, independently.** Anurup's submission-day branch and Omar's
overnight branch were built in parallel and merged best-of-both — see the "Right now" block at
the top of `docs/PROGRESS.md` before starting anything.

## What works right now (mock mode, no API keys)

The full loop runs end-to-end: `Run heartbeat` → Strategist proposes (citing playbook rules + bandit stats, predicting effect ranges) → approval card → Approve/Reject/Edit → publisher schedules → advancing the clock publishes the post, personas engage (hidden-ground-truth engine), funnel fires (clicks → signups → DMs), community qualifies DMs toward meetings, the Analyst grades outcomes vs predictions at each day boundary, the Coach writes a new playbook version, and the next heartbeat behaves differently. Genesis builds ~100-persona worlds from any product description. Ambient competitor accounts post noise into the feed.

Submission-day additions: **the loop closure is real in every mode** — a typed rejection becomes a `rejection`-sourced playbook rule and the very next proposal cites the new rule key (regression-tested in `tests/loop.test.ts`); the analyst's attribution + suggested lessons feed the coach digest; `/brain` gained a spoiler-gated **Reveal** tab comparing the hidden world config (affinity × active hours, algo levers) against learned posteriors and rules, with a champion-vs-truth verdict. **Live-local (Ollama) is validated** — see `docs/PROGRESS.md` B6 row and the live-local runbook in `docs/DEMO.md`. Suite: 72 tests / 22 files.

## Run it

```bash
asdf install && export PATH="$HOME/.asdf/shims:$PATH"
cp .env.example .env.local
npm i
npm run db:seed     # or wipe first: rm -f flywheel.db*
npm run dev         # http://localhost:3000
npm run verify      # typecheck + lint + 80 tests — must be green before merging
```

Gotchas:
- Non-interactive shells (agents, CI): always `export PATH="$HOME/.asdf/shims:$PATH"` first.
- Fresh clone + `tsc` complaining about `LayoutProps`: run `npx next typegen` once (or `npm run dev` briefly).
- Sim time only advances via the UI buttons / `advanceTicks` — there are no background timers by design (D8).
- Commits: humans commit normally; agent-made commits MUST use `./scripts/commit-clean.sh "msg"` (see CONTRIBUTING authorship policy).
- `.worktrees/` is for parallel agent builds — gitignored, excluded from verify; don't commit it.

## Where things live

Interface contracts and module ownership: `docs/ARCHITECTURE.md`. Task specs with code: `docs/superpowers/plans/2026-08-14-flywheel.md`. Demo script: `docs/DEMO.md`.

## Next up per track (see PROGRESS.md for live status)

Team merge landed: Minh's Track B (B1-B5 + 8 test suites) and Omar's Track C (full Mission Control: phone feed, approvals, brain, analytics, onboarding) are on main with track-owner priority; glue seams reconciled and the combined 49-test suite is green.

- **Track A (Anurup)** — A1-A4 COMPLETE (`sim/dm.ts`, `sim/engine.ts`, `tests/golden.test.ts` — regenerate deliberately with `UPDATE_GOLDEN=1` after intended sim changes). **One open item:** live runs produce impressions/likes but **~0 clicks, 0 signups, 0 meetings** — the headline metric reads zero (confirmed independently on two live runs). Funnel tuning in `sim/funnel.ts` is the highest-value remaining sim work and is claimed by Anurup today.
- **Track B (Minh)** — B1–B9 merged: bandit lifecycle through rollback, plus rule attribution (`ruleEvidence.ts`), the human-feedback addressed-ness fix (`humanFeedback.ts`), rule dedupe (`ruleDedupe.ts`), measured confidence, and the merged mock closure (rejections echo the human's words; the next proposal cites the newest rule — regression-tested in `tests/loop.test.ts`).
- **Track C (Omar)** — COMPLETE: C1–C5, Mission Control visual rework, Slack routing + `/settings`, merged Reveal tab (per-dimension verdicts + affinity heatmap + spoiler gate + learned-rules list).
- **All hands (submission)** — the brief asks for a 3–5 minute in-person demo (no recording required). Rehearse `docs/DEMO.md` against `npm run demo` until it fits. No cloud keys exist anywhere (D22): live runs use Qwen3/Gemma 3 via Ollama; the demo's live beats ride on a pre-baked world with the checklist-verified snapshot as fallback.

## Running it on local models (no API keys)

Works today, validated twice. `docs/LOCAL_MODELS.md` is the runbook; pick your tier, `ollama pull`,
then set `MODEL_MODE=live` in `.env.local` (`MODEL_PROVIDER` already defaults to local — D22).

Two things the runbook does not tell you, learned the hard way:

- **`npm run smoke` passing does NOT mean local mode works.** Smoke only calls `generateText`,
  which carries no JSON schema. Every structured call can still be broken while smoke is green.
  `npx tsx scripts/e2e-drive.ts` is the real gate.
- **Budget 6–12 minutes per sim day** depending on GPU fit (`ollama ps` shows the CPU/GPU split;
  M1 Max 32 GB measured ~5.75 min/day). For a timed demo, live beats are heartbeat + approvals
  only; day advances come pre-baked or from `npm run demo` (mock — identical machinery, instant).

## Known deliberate deviations

- ~~Coach digests same-tick human decisions (`>=` window)~~ — **superseded on `oz/agent-rule-attribution`.**
  The `>=` window both re-digested a decision made on a version's own tick *and* let a decision
  age out unaddressed once a later version landed, so a human rejection could silently vanish.
  The coach now tracks **addressed-ness**: a rejection is outstanding until some playbook rule
  cites its `proposalId` in `evidence.refs`, so an ignored one is re-raised next cycle.
- `tests/fixtures/world.ts` was intentionally NOT refactored to delegate to `src/lib/sim/build.ts` — the hand-written fixture anchors deterministic tests (see build.ts header).
- Determinism rule (enforced by the golden run): every RNG stream and every mock-mode `refId` must be keyed on stable identifiers (persona handles, post stream keys, turn counts) — never row UUIDs.
