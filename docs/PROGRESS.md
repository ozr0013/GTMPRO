# Progress

Update every working session. Announce every change to a shared or cross-track file here.

## Track C — Mission Control UX (owner: C)

| State | Item |
| --- | --- |
| done | C1 Pictogram phone-frame feed (`/feed`) — post cards, double-tap like, comment drawer, follower ticker, animated counts |
| done | C2 Brain (`/brain`) — Playbook tab (rules by category, evidence disclosure, version timeline w/ add/amend/retire diff colours, rollback), Bandits tab (12-arm grid, Beta mean, n, density strips, champion), Calibration tab (rolling hit rate + predicted-vs-actual scatter) |
| done | C3 Analytics (`/analytics`) — funnel bars w/ stage conversions, archetype + time-slot filters, playbook-era comparison, per-post attribution table |
| done | C4 Genesis onboarding (`/onboarding`) — description → staged progress → world summary → Enter Mission Control; world switcher in the top bar |
| done | Task 6 scope Track C owns — `queries.ts`, `actions.ts`, app shell, approvals, activity |
| **not started** | **C5 hero images + demo prewarm** — needs a live image model and API keys; `artdirector.ts` and `scripts/prewarm-demo.ts` do not exist |

## Unblocking work done outside Track C

Track C was specified to build on Task 5 and Task 6, neither of which existed at
`4d7db3b`. Rather than stub the UI against absent contracts, the minimum vertical
slice was built so Mission Control drives a real loop:

- **New (Track A territory):** `src/lib/sim/clock.ts` (`advanceTicks`), `src/lib/sim/funnel.ts`, `src/lib/sim/metrics.ts`, `src/lib/sim/time.ts`, `src/lib/sim/streams.ts`, `src/lib/sim/genesis.ts`
- **New (Track B territory):** `src/lib/agents/orchestrator.ts` (`runHeartbeat`, `decideProposal`, `schedulePost`), `analystRunner.ts`, `coachRunner.ts`, `log.ts`
- **New (Track C):** `src/lib/db/queries.ts`, `src/app/actions.ts`, `src/app/current-world.ts`, all routes and `src/app/_components/*`
- **New tests:** `tests/loop.test.ts` — mock-mode walking skeleton, determinism, kill switch, rejection→coach

These are handoff-shaped, not land-grabs. A/B owners should treat them as starting
points and replace freely; the signatures Track C depends on are listed below.

### Shared / cross-track file changes (announced per the additive-only rule)

1. **`src/lib/sim/engine.ts` (Track A owns) — behavioural fix.** It seeded rng streams
   with `post.id`, a random UUID, so identical world seeds produced different
   engagement between runs — violating the "identical seeds ⇒ identical sim outcomes"
   constraint (its own comment claimed streams never key on row UUIDs). Streams now key
   on `postStreamKey(post)` (`archetype:topic:scheduledTick`) from the new
   `src/lib/sim/streams.ts`. Covered by the determinism case in `tests/loop.test.ts`.
2. **`next.config.ts`** — added `allowedDevOrigins: ["127.0.0.1", "localhost"]` so the
   dev server serves `/_next` chunks to preview tooling; without it nothing hydrates.
3. **`src/lib/sim/genesis.ts`** — deterministic stand-in for Task A1's `generateWorld`,
   written so C4 works today. A1 should replace the body; keep the signature and the
   hidden-ground-truth shape, which C4 depends on.

No changes were made to `schema.ts`, `types.ts`, or `contracts.ts`.

### Contracts Track C depends on

```ts
advanceTicks(worldId: string, n: number): Promise<{ tick: number }>
runHeartbeat(worldId: string): Promise<{ proposalIds: string[] }>
decideProposal(id: string, decision: "approve" | "reject" | "edit", reason?, editedCaption?): void
generateWorld({ name, productDescription, seed? }): { worldId, segments, topics }
```

`src/lib/db/queries.ts` is the only read path the UI uses; every export returns plain
serializable objects. Add to it rather than querying tables from components.

## Known gaps

- **C5 not built** (see above).
- **DM loop is display-only.** `dm_started` events and threads are created by the funnel,
  and `getDmThreads` exists, but `communityRunner.ts` (Track B) does not, so no DM is ever
  replied to and no meeting is ever booked. The Meetings funnel stage is therefore always 0.
- **`reply` and `dm_reply` proposal kinds are skipped** by the heartbeat — only `post` is
  wired end-to-end.
- **Ambient content** (Track A, A3) does not exist, so the feed only shows brand posts.
- The `executed` proposal status overwrites `approved` / `edited_approved`; the coach
  detects human edits via `humanEditDiff` instead. Worth revisiting if the lifecycle
  gains more states.
