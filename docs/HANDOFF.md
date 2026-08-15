# Handoff

Last updated: 2026-08-15 (submission day). State: **feature-complete for the demo; live-local validated.**

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
npm run verify      # typecheck + lint + 49 tests — must be green before merging
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

- **Track A (Anurup)** — COMPLETE. A2 persona DM continuation (`sim/dm.ts`), A3 two-wave engagement with velocity boost + follow conversion + churn (`sim/engine.ts`), A4 golden-run guard (`tests/golden.test.ts` — regenerate deliberately with `UPDATE_GOLDEN=1` after intended sim changes).
- **Track B (Minh)** — B1-B5 merged. Remaining: image-budget spend guard for the art director, and porting any unique assertions from the pre-merge spine loop test if gaps appear.
- **Track C (Omar)** — C5 only: hero-post image generation (`artdirector.ts`, gated by image budget) + `scripts/prewarm-demo.ts` producing the committed `demo-snapshot.db` offline fallback.
- **All hands (submission)** — live-mode validation (`npm run smoke`, one real Claude+GPT run), rehearse `docs/DEMO.md` twice, record the 3-5 min video, final README pass.

## Known deliberate deviations

- Coach digests same-tick human decisions (`>=` window) — required for the rejection→learning cycle at tick 0.
- `tests/fixtures/world.ts` was intentionally NOT refactored to delegate to `src/lib/sim/build.ts` — the hand-written fixture anchors deterministic tests (see build.ts header).
- Determinism rule (enforced by the golden run): every RNG stream and every mock-mode `refId` must be keyed on stable identifiers (persona handles, post stream keys, turn counts) — never row UUIDs.
