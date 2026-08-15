# Handoff

Last updated: 2026-08-14 late. State: **all three tracks complete on `main`; agent-learning
improvements open on `oz/agent-rule-attribution`.** Suite: **80 tests / 23 files.**

**Before you start anything, read the "Right now" block at the top of `docs/PROGRESS.md`** —
it lists what is claimed, what is unmerged, and what is genuinely open. Notably **B6 (local
models) is DONE**, despite older notes assigning it to Minh as todo.

## What works right now (mock mode, no API keys)

The full loop runs end-to-end: `Run heartbeat` → Strategist proposes (citing playbook rules + bandit stats, predicting effect ranges) → approval card → Approve/Reject/Edit → publisher schedules → advancing the clock publishes the post, personas engage (hidden-ground-truth engine), funnel fires (clicks → signups → DMs), community qualifies DMs toward meetings, the Analyst grades outcomes vs predictions at each day boundary, the Coach writes a new playbook version, and the next heartbeat behaves differently. Genesis builds ~100-persona worlds from any product description. Ambient competitor accounts post noise into the feed.

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

- **Track A (Anurup)** — COMPLETE. A2 persona DM continuation (`sim/dm.ts`), A3 two-wave engagement with velocity boost + follow conversion + churn (`sim/engine.ts`), A4 golden-run guard (`tests/golden.test.ts` — regenerate deliberately with `UPDATE_GOLDEN=1` after intended sim changes). **One open item:** a live run produced 36 impressions / 19 likes but **0 clicks, 0 signups, 0 meetings** — the headline metric reads zero. Funnel tuning in `sim/funnel.ts` is the highest-value remaining sim work.
- **Track B (Minh)** — B1–B5 merged. **B6 local models is DONE** (by Omar — do not redo; three blocking bugs found, see PROGRESS). B7–B9 (rule attribution, human-feedback fix, rule dedupe) are **done but unmerged** on `oz/agent-rule-attribution` and want your review — they change coach behaviour and the golden snapshot.
- **Track C (Omar)** — COMPLETE, C1–C5 merged, plus the Mission Control visual rework.
- **All hands (submission)** — the brief asks for "a 3–5 minute demo showing one realistic GTM loop, one human decision, and one observable learning cycle". It does **not** specify a recording; this is being presented **in person**, so rehearse `docs/DEMO.md` against `npm run demo` until it fits in time. (Earlier notes here said "record the video" — that was our assumption, not the brief's requirement.) README pass still outstanding. Live *cloud* validation (`npm run smoke` with real Claude+GPT keys) is unrun; live *local* is validated.

## Running it on local models (no API keys)

Works today. `docs/LOCAL_MODELS.md` is the runbook; pick your tier, `ollama pull`, then set
`MODEL_MODE=live` + `MODEL_PROVIDER=local` in `.env.local`.

Two things the runbook does not tell you, learned the hard way:

- **`npm run smoke` passing does NOT mean local mode works.** Smoke only calls `generateText`,
  which carries no JSON schema. Every structured call can still be broken while smoke is green.
  `npx tsx scripts/e2e-drive.ts` is the real gate.
- **Budget ~12 minutes per sim day** on a machine that can't fit the actor model entirely in
  VRAM (the runbook's 1–4 min assumes a good GPU fit). `ollama ps` shows the CPU/GPU split.
  For a timed demo, use `MODEL_MODE=mock` — identical learning machinery, canned prose, instant.

## Known deliberate deviations

- ~~Coach digests same-tick human decisions (`>=` window)~~ — **superseded on `oz/agent-rule-attribution`.**
  The `>=` window both re-digested a decision made on a version's own tick *and* let a decision
  age out unaddressed once a later version landed, so a human rejection could silently vanish.
  The coach now tracks **addressed-ness**: a rejection is outstanding until some playbook rule
  cites its `proposalId` in `evidence.refs`, so an ignored one is re-raised next cycle.
- `tests/fixtures/world.ts` was intentionally NOT refactored to delegate to `src/lib/sim/build.ts` — the hand-written fixture anchors deterministic tests (see build.ts header).
- Determinism rule (enforced by the golden run): every RNG stream and every mock-mode `refId` must be keyed on stable identifiers (persona handles, post stream keys, turn counts) — never row UUIDs.
