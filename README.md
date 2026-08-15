# Flywheel

**A self-improving organic-social GTM agent** — built for the MadeThis "Build a Self-Improving GTM Agent" bounty.

Type any product description. Flywheel spins up **Pictogram** — a simulated Instagram-like platform with ~100 audience personas whose interests, skepticism, purchase intent, and daily rhythms are *hidden ground truth* — then a team of cross-family AI agents grows that product's account from zero: posting, replying, qualifying DMs, and booking meetings. Every outcome, human approval, rejection, and edit feeds a versioned playbook and Thompson-sampling bandits, and the agent's next actions **visibly change**. The endgame demo move: reveal the hidden config and show the agent discovered the audience's true preferences.

Most entries in this space are cold-outbound SDR clones with hand-waved outcomes. Flywheel inverts the bounty's "simulate sends" safety rule into the product itself: because the market is simulated with ground truth, the learning loop is *measurable* — reply-rate curves, posterior shifts, and calibration are real, not narrated.

## The loop

```mermaid
flowchart LR
    subgraph reason [REASON]
        Strategist
    end
    subgraph action [ACTION]
        Copywriter --> Critic --> Gate{"Propose / Autopilot"} --> Publisher
    end
    subgraph world [PICTOGRAM]
        Engine["Engagement engine (hidden ground truth)"] --> Funnel["clicks -> signups -> DMs -> meetings"]
    end
    subgraph evaluation [EVALUATION]
        Analyst
    end
    subgraph improvement [IMPROVEMENT]
        Coach --> Playbook["Versioned playbook (diff, rollback)"]
        Analyst --> Bandits["Thompson-sampling bandits"]
    end
    Strategist --> Copywriter
    Publisher --> Engine
    Funnel --> Analyst --> Coach
    Playbook --> Strategist
    Bandits --> Strategist
```

## Models — fully local, zero API keys, and why two families

The entire system runs on **free local models via Ollama** — no Anthropic or OpenAI keys, ever. This is the validated demo configuration (see `docs/LOCAL_MODELS.md` for RAM tiers down to 12 GB laptops and measured end-to-end timings).

| Role | Local model | Job |
|---|---|---|
| Strategist | Qwen3 (`MODEL_ACTOR_LOCAL`) | Picks the next best action; cites playbook rule IDs + bandit stats; predicts effect ranges (scored for calibration) |
| Copywriter | Qwen3 | Captions, hashtags, creative briefs per voice rules |
| Coach | Qwen3 | Distills outcomes + human feedback into playbook rule deltas |
| Red-team Critic | Gemma 3 (`MODEL_JUDGE_LOCAL`) | Pre-flight review: brand safety, spam risk, guardrails |
| Analyst | Gemma 3 | Post-hoc: actual vs predicted, factor attribution, lessons |
| Community Mgr | Qwen3-small (`MODEL_CHEAP_LOCAL`) | DM replies; 3-turn qualification → meeting booked / disqualified |
| Persona voices | Qwen3-small | In-character comments and DMs for the simulated audience |
| Art Director | seeded local SVG | Hero-post creative cards, budget-capped (cloud image models optional) |

**Actors and their evaluators are deliberately different model families.** LLM judges systematically favor their own outputs (~10% for GPT-4o, up to ~25% for Claude models, plus same-family bias — Panickssery et al., [arXiv:2410.21819](https://arxiv.org/abs/2410.21819)). Qwen acts; Gemma judges. The evaluation signal that drives learning is independent of the writer by construction.

A cloud provider path (Claude acts / GPT judges, `MODEL_PROVIDER=cloud`) exists for portability but is opt-in and untested — this project has never run on cloud API keys.

## Self-improvement = behavior change, not stored notes

1. **Outcome learning** — the Analyst grades every post against the Strategist's predicted ranges; rewards update bandit posteriors (4 archetypes × 3 time slots) and become playbook rule proposals.
2. **Human-feedback learning** — every rejection captures a reason; every inline edit is diffed and distilled into rules. The next proposal cites the new rules by ID.
3. **Calibration** — predicted-vs-actual is tracked; the Strategist is told how over/under-confident it currently is and gets better at *predicting*, not just choosing.

The playbook is full-copy versioned: human-editable, diffable, and revertible, with bandit posteriors snapshotted per version.

## Permissions, guardrails, trust

- **Propose mode** (default): every action becomes an approval card — action, target, reasoning, evidence, predicted effect, risk class — with Approve / Reject-with-reason / Edit-inline.
- **Autopilot**: acts within caps (posts/day, DMs/day, quiet hours, image + token budgets, banned topics) enforced by a single guardrail gate. Sensitive actions (first-touch DMs, pricing posts) **always** require approval.
- Full activity trail, pause switch, playbook rollback. Agent-call failures quarantine into the trail; the loop never crashes.

## Quickstart

```bash
asdf install                 # Node 22.23.2 (pinned in .tool-versions)
cp .env.example .env.local   # mock mode needs NO API keys — and live mode doesn't either
npm i
npm run db:seed              # schema self-bootstraps; seeds a demo world
npm run dev                  # http://localhost:3000
```

Everything runs offline in mock mode (`MODEL_MODE=mock`, the default): heartbeat, approvals, simulation, learning. For live model calls — still zero API keys — install [Ollama](https://ollama.com), pull your RAM tier's models (`ollama pull qwen3:8b gemma3:12b qwen3:4b` on 16-32 GB), start it with `OLLAMA_KEEP_ALIVE=45m ollama serve`, set `MODEL_MODE=live` in `.env.local`, and validate with `npm run smoke`. Full runbook: `docs/LOCAL_MODELS.md`.

Try the loop: top bar → **Run heartbeat** → open **Approvals**, read the proposal's reasoning and evidence chips → Approve one → **+1 day** → watch the **Feed** fill with engagement and the **Activity** trail record strategist → critic → human → publisher → analyst → coach.

## Repo map

- `src/lib/sim/` — Pictogram: genesis, engagement engine, funnel, ambient content, clock (Track A)
- `src/lib/agents/` + `src/lib/learning/` — model registry, orchestrator, runners, bandits, playbook, guardrails (Track B)
- `src/app/` — Mission Control UI (Track C)
- `docs/ARCHITECTURE.md` — module contracts · `docs/DEMO.md` — demo script · `docs/DECISIONS.md` — ADR log · `CONTRIBUTING.md` — workflow + authorship policy
- `docs/superpowers/` — design spec + task-by-task implementation plan

## Bounty judging map

End-to-end GTM impact: full simulated funnel to booked meetings · Learning loop: playbook diffs + bandit posteriors + calibration · Trust: propose/autopilot, caps, trail, rollback · UX: Mission Control with evidence-citing proposals · Originality: simulated-market-with-ground-truth + cross-family judging. Bonuses: proactive heartbeat, experiment selection, editable memory, rollback, budget caps.

## Roadmap — from reactive rules to long-term memory management

**Shipped (submission day):**

- **Failure memory** — retired rules, typed rejections, and missed-outcome combos are fed back into every coach digest and strategist context, so the agent stops repeating historical mistakes (no vector store needed: at playbook scale, SQL + an LLM reading all rules beats embeddings).
- **Librarian consolidation** — when the playbook grows past 10 rules, a consolidation pass merges overlapping rules into contextual ones and retires contradictions; human rejection rules are never auto-retired.
- **Sandbox dreaming** — before proposing, the agent ranks every (archetype × slot × topic) variant against its *learned* model of the audience (bandit posteriors × observed engagement rates) and shows the dream rank on each approval card. Deliberately never reads the hidden ground truth — the dream is what the agent believes, and the Reveal tab grades it.
- **Earned autonomy** — sustained calibration accuracy (predicted ranges containing actuals) lets the agent auto-approve low-risk posts; sensitive actions stay human-gated forever.

**Next (deferred by design, not by accident):**

- Campaign-arc rewards and time-decayed attribution (a Day-10 meeting rewarding Day-7 nurture posts)
- Twin-world frozen-baseline benchmark (mathematically prove the learned agent beats its Genesis self)
- Toxic-version detection with a rollback recommendation card; bandit posterior restore on rollback

*Hackathon build in progress — see `docs/PROGRESS.md` for live status.*
