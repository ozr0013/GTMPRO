# Contributing

Weekend hackathon, 3+ people in parallel. The rules below exist to keep merges boring. Task scope and order live in `docs/superpowers/plans/2026-08-14-flywheel.md`; module boundaries in `docs/ARCHITECTURE.md`.

## Workflow

- Trunk-based development on `main`. No long-lived branches.
- Short-lived branches named `<initials>/<task-id>-<slug>`, e.g. `ak/a1-genesis`.
- Small PRs/merges, each mapped to one plan task. Don't bundle tasks.
- `npm run verify` (typecheck + lint + tests) must be green before every merge to `main`.
- Shared files (`src/lib/db/schema.ts`, `src/lib/types.ts`, `src/lib/contracts.ts`) are additive-only after Phase 0 — announce every change in `docs/PROGRESS.md` so the other tracks see it.
- Stay inside your track's files (A: `src/lib/sim/`; B: `src/lib/agents/` + `src/lib/learning/` + `contracts.ts`; C: `src/app/` + `src/lib/db/queries.ts`). Anything else, coordinate first.

Definition of done: code + tests + a `docs/PROGRESS.md` row. If it's not in PROGRESS.md, the rest of the team assumes it didn't happen.

## Toolchain

Node 22.23.2 via asdf — `.tool-versions` is committed, so `asdf install` gets you the right version. Non-interactive shells (agents, scripts, editors) may miss asdf's init; prefix with:

```bash
export PATH="$HOME/.asdf/shims:$PATH"
```

## Quickstart

```bash
cp .env.example .env.local
npm i
npm run db:seed     # creates flywheel.db (schema self-bootstraps) + demo world
npm run dev         # http://localhost:3000
```

Mock mode (`MODEL_MODE=mock`, the default) needs no API keys — the entire loop runs offline. For live mode, fill both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in `.env.local` (cross-family judging needs both) and validate with `npm run smoke`. Never commit `.env.local` or paste keys into docs, screenshots, or logs.

## Authorship policy

- Commits are authored by humans only. Never add AI co-author trailers (`Co-authored-by: Cursor`, `Co-authored-by: Claude`, or similar).
- Cursor's IDE agent appends `Co-authored-by: Cursor` to `git commit` invocations. Agent-made commits must therefore use the plumbing-based helper, which cannot be trailer-injected:

```bash
./scripts/commit-clean.sh "type: your message"
```

- The Cursor toggle for this behavior lives at Cursor Settings > Agent > Attribution — turn it off, but use the script regardless; the script works even when settings drift.
- Commit with your personal GitHub account, not a work account. Check `git config user.name` and `git config user.email` before your first commit.
