# Testing

## Verification workflow

`npm run verify` — typecheck + lint + vitest — must be green before every merge to `main`. It is the only merge gate; if it passes, merge, if it fails, fix before merging. Run it locally; there is no CI to catch you.

## Test-first for pure logic

Pure logic is written test-first: the sim engine (`src/lib/sim/engine.ts`), bandit math (`src/lib/learning/bandit.ts`), playbook versioning (`src/lib/learning/playbook.ts`), and guardrails (`src/lib/learning/guardrails.ts`). These are deterministic modules where a failing test is cheap to write and catches drift from any track. Glue code (orchestrator, clock) is covered by the mock-mode walking-skeleton test (`tests/loop.test.ts`, lands with Task 5); UI is verified by the manual walkthrough in the plan's Task 6.

## Mock-mode rules

Tests never hit the network. `vitest.config.ts` pins the test environment:

```ts
env: { MODEL_MODE: "mock", DB_PATH: ":memory:" },
```

- `MODEL_MODE=mock` makes every `callAgent` return seeded, schema-valid canned output — the full agent loop runs offline.
- `DB_PATH=:memory:` gives each test process a fresh in-memory SQLite DB, bootstrapped automatically from the committed `drizzle/*.sql` by `src/lib/db/client.ts`.

Never override these in a test, and never write a test that requires live API keys. Provider connectivity is checked separately by `npm run smoke` (not part of the test suite).

## Determinism testing pattern

Invariant: same world seed produces identical outcomes. All randomness flows through `src/lib/rng.ts`, and RNG streams are keyed on stable identifiers — the world seed, a fixed post id, and `persona.handle` — never on row UUIDs or iteration order.

To write a determinism test, follow the pattern in `tests/engine.test.ts` ("is deterministic for the same world seed"):

1. Build two worlds with the same seed: `buildTinyWorld("fixed")` twice.
2. Insert posts with fixed ids (e.g. `"post-determinism"`), not `randomUUID()` — the post id seeds the rng stream, so it must be identical across runs.
3. Run the code under test in both worlds and compare outcomes keyed by `persona.handle` (persona row ids are random; handles are stable).

If a new feature breaks this test, the fix is in the feature: route its randomness through `subRng` with stable key parts.

## Fixtures

`tests/fixtures/world.ts` exports `buildTinyWorld(seed = "test-seed"): { worldId: string }` — the deterministic tiny world every test uses: 12 personas across 3 segments (`coffee-nerds`, `busy-pros`, `cafe-owners`), a hidden affinity matrix and algo params, playbook v1 with seed rules `voice-1` / `content-1` / `timing-1`, 12 bandit arms, and default settings (quiet hours 23-6, banned topic "politics").

Build a fresh world per test (`beforeEach`) with a unique seed, unless the test specifically compares same-seed runs. Since the DB is per-process in-memory, worlds accumulate within a test file — always filter queries by `worldId`.

## Running tests

```bash
npm test                              # full suite, single run
npx vitest run tests/engine.test.ts   # one file
npm run test:watch                    # watch mode
```

## Suite status (2026-08-14)

16 tests green: engine 3, learning 6 (bandit 2, playbook 2, guardrails 2), contracts 7. The end-to-end loop test (`tests/loop.test.ts`) lands with the orchestrator (Task 5).
