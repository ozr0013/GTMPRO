# Functional QA audit — every clickable, verified against the backend

**Method.** Playwright-driven real Chromium against `npm run demo` (mock mode,
`demo-run.db` reset from the committed snapshot), 2026-08-15. Every interactive
element was clicked in the browser; persistence was verified by page reloads,
the `/activity` trail, and direct SQLite queries against `demo-run.db`. The
bar: **every clickable does something real — a server action that lands in
SQLite — or it is not clickable.**

## Matrix

| # | Interaction | Backend path | Verdict | Evidence |
|---|-------------|--------------|---------|----------|
| 1 | Genesis form (`/onboarding`) | `createWorldAction` → `sim/genesis` | PASS | World row + cookie persisted; segments/personas rendered; home lands on the new world |
| 2 | Genesis submit gating | client validation | PASS | Disabled until name ≥ 2 and description ≥ 10 chars |
| 3 | Run heartbeat (fresh world) | `heartbeatAction` → orchestrator | PASS | 2 pending human-gated proposals with reasoning, rule chips, bandit arm, predicted ranges |
| 4 | Reject requires a typed reason | dialog gating | PASS | Submit disabled with empty textarea |
| 5 | Reject with reason | `decideAction("reject")` | PASS | `proposals.status='rejected'`, `human_reason` stores the exact sentence |
| 6 | Rejection becomes a rule | coach on day boundary | PASS | After +1 day, the playbook carries the typed words ("Too salesy…") |
| 7 | Edit-then-approve | `decideAction("edit")` | PASS | `<10` char caption blocked; edited caption is what published (`posts.caption`) |
| 8 | Plain approve | `decideAction("approve")` | PASS | Card cleared, publish logged in `activity_log` |
| 9 | +1h / +6h / +1 day | `advanceTicksAction` → `sim/clock` | PASS | Clock moved 00:00 → 01:00 → 07:00; day advance triggers engagement, analyst, coach |
| 10 | World switcher (top bar) | `selectWorldAction` (cookie) | PASS | Selection survives reload |
| 11 | Earned-autonomy heartbeat (TestBrew) | orchestrator autonomy gate | PASS | Proposals `executed 18 → 19` with the queue still empty — low-risk skipped the human gate |
| 12 | Halt switch (kill switch) | `togglePauseAction` | PASS | Mode reads HALTED, heartbeat disabled, `settings.paused=1`, resume restores; activity logged |
| 13 | Autopilot switch | `setModeAction` | PASS | `settings.mode='autopilot'` and back; readout AUTO/PROPOSE; activity logged |
| 14 | Playbook rollback | `rollbackAction` | PASS | v5 → v6 rollback version appended (history preserved), activity logged |
| 15 | Reveal spoiler gate | client-side by design | PASS | Reveals per-dimension verdicts + hidden matrix; resets on navigation (rehearsal-friendly) |
| 16 | Analytics filter chips + Clear | URL params → server re-fetch | PASS | 12 posts measured → 4 (education) → 12 (clear); URL carries the param |
| 17 | Generate hero image | `generateHeroImageAction` → SVG provider | PASS | Image persisted after reload; ledger 0 → 1 (derived from DB, not a counter) |
| 18 | Feed comments toggle | reads DB comments | PASS | Renders persona comments with segment tags; read-only by design |
| 19 | Slack settings save | `saveSlackSettingsAction` | PASS | Enabled/target/kinds survive reload (`settings` row) |
| 20 | Slack test-send gating | `slackReadiness` | PASS | No creds in env → "Not connected." banner + button disabled |
| 21 | Dream-rank chip | `learning/dreamer` | PASS | Absent on a zero-signal fresh world (honest no-signal, by design); appears once posts are scored |
| 22 | Feed like / double-tap | — | **FAKE → FIXED** | Was client-only state that reset on refresh; see fixes below |
| 23 | dm_reply approve → meeting | `sim/dm` pipeline | NOT RUN in browser | No `dm_reply` surfaced during the session window; pipeline covered by `tests/dm.test.ts` + `tests/meeting-attribution.test.ts` (both pass) |
| 24 | Guardrails panel | display of `checkGuardrails` limits | BY DESIGN | Read-only; enforcement lives in `learning/guardrails.ts` |

Raw run log: three scripted passes (fresh world, TestBrew, DemoBrew follow-up),
all recorded from live browser sessions with DB spot-checks.

## Fixes shipped in this audit

1. **Feed like button + double-tap were placeholders** (`phone-feed.tsx`):
   client-only React state, reset on refresh, wrote nothing. The feed simulates
   the *audience*; likes feed the agent's learning loop, so an operator "like"
   must not fake or pollute engagement. Likes are now display-only sim
   outcomes (like saves); the misleading "Double-tap a card to like it" copy is
   gone. Chosen over persisting an operator-reaction because the smallest
   honest surface beats a new table that the learning loop would have to
   ignore.
2. **Clean checkout rendered broken hero images**: `public/generated/` is
   gitignored but the snapshot references 5 SVGs. `npm run demo` now restores
   missing mock heroes from their `(world.seed, postStreamKey)` seeds —
   verified byte-identical (MD5) after emptying the directory. Regression test:
   `tests/hero-restore.test.ts`. Live png/webp renders are skipped (cannot be
   re-derived).
3. **Dead code removed**: `src/components/pause-switch.tsx` was unimported
   (TopBar inlines the halt switch).
4. **Stale demo doc**: DEMO.md's checklist example promised `pending proposal:
   YES`, but the builder intentionally reports an empty queue once autonomy is
   earned (that is the trust-tour punchline). The example now matches the real
   builder output, including `earned autonomy: YES` and 8/8 tracked rules.

## Snapshot rebuild verification

`npm run demo:build` after all changes reproduces the committed beats exactly
(deterministic seed `flywheel-1`): Day 13 00:00, playbook v5, 13 followers,
funnel 478 → 411 → 33 → 11 → 6 → 4, rejection→rule YES, meeting booked YES,
**both** reveal dimensions MATCH (11 obs), 8/8 rules tracked, earned autonomy
YES (hit rate 100%).

## Verification status

- `npm run verify` (tsc + eslint + vitest): **PASS — 33 files, 130 tests**
- Full click-through matrix above: **21 PASS, 1 fixed, 2 by-design/not-run**
- Clean-checkout hero restore: **PASS (byte-identical)**
