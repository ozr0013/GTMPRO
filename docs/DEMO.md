# Demo Script (3-5 minutes)

Target runtime 4:50. Rehearse twice from a fresh seed before recording (Task F2). The script assumes Tracks A/B/C have landed; per-scene fallbacks are noted where a piece may not be built yet. Platform is always called Pictogram on screen and out loud.

## 0:00 — Genesis onboarding

- Click: open `/onboarding`, type a product description (pick something the judges know, e.g. "cold brew concentrate for coffee obsessives"), submit, watch the streaming progress ("Deriving segments... Growing 100 personas... Writing seed hypotheses..."), then "Enter Mission Control".
- Say: "Flywheel grows any product's account on Pictogram — a simulated social platform whose audience has hidden ground truth the agent has to discover."
- Judge notices: the world is generated from an arbitrary product description; nothing is hard-coded to one demo product.
- Until A1/C4 land: skip typing and tour the pre-seeded world instead (`npm run db:seed`, then open `/`) — same talking line, minus "any product".

## 0:45 — Heartbeat and proposal anatomy

- Click: "Run heartbeat" in the top bar, then open `/approvals` and expand one proposal card. Point at each element: reasoning, cited playbook rule IDs (chips), bandit arm stats, predicted-effect ranges, risk class badge.
- Say: "Every proposal explains itself — which playbook rules drove it, what the bandit believes, and predicted ranges the strategist will be scored against later."
- Judge notices: explainability is structural (rule IDs and numbers), not a decorative text blob.

## 1:30 — Approve one, reject one with a reason

- Click: Approve the first proposal. On the second, click Reject and type a real reason in the dialog: "Too salesy — we never lead with product pushes." Submit.
- Say: "Rejections aren't discarded. That sentence is training data — watch for it in a minute."
- Judge notices: the reject flow requires a typed reason; human feedback is captured as structured input, not a thumbs-down.

## 2:15 — Fast-forward one sim day

- Click: "+1 day" in the top bar. Open `/feed` — likes, comments, and follower count land; then `/analytics` — funnel bars move (impressions through signups).
- Say: "Time is simulated and request-driven — a full day of audience behavior, deterministic from the world's seed, lands in seconds."
- Judge notices: outcomes are funnel events (clicks, signups, DMs), not vanity counters; personas comment in character.

## 2:45 — The learning moment

- Click: open `/brain` > Playbook tab — show the new version's diff (added rules green, amended amber, retired red) including a rule sourced from the typed rejection. Switch to Bandits tab — posterior means have shifted; the champion arm is highlighted. Then click "Run heartbeat" again and open the newest proposal.
- Say: "One day of outcomes plus one human rejection changed the playbook — and the very next proposal behaves differently and cites the new rule by ID."
- Judge notices: the full loop closed on screen — outcome, lesson, changed behavior, with the evidence chain intact.

## 3:30 — DM thread to booked meeting

- Click: open the pending `dm_reply` proposal (first-touch DMs are always gated, even in Autopilot), approve it, then "+6h" twice. Show the thread reaching `meeting_booked` and the funnel event in `/activity` and `/analytics`.
- Say: "Engagement isn't the finish line — the community manager qualifies in at most three turns, and meetings booked is the metric."
- Judge notices: full-funnel GTM outcome; the riskiest action class stayed human-gated; the conversation is capped, not open-ended.

## 4:00 — The reveal

- Click: `/brain` > **Reveal** tab. Read the setup line out loud, then hit "Reveal the hidden config". Point at: the verdict banner (champion vs true best), the per-arm world/agent bars, the affinity matrix, the real active-hours split, and "what the agent wrote down" underneath.
- Say: "The world had a hidden config — per-segment content affinities, real active hours, algorithm levers. The agent never saw any of it; it only saw outcomes. Here's the answer key against what it learned."
- Judge notices: learning is measured against ground truth, not self-graded by the same LLM — and the match (or the honest "still searching") is visible arm by arm.

## 4:30 — Trust tour

- Click: flip the Propose/Autopilot toggle and show caps in settings (posts/day, DMs/day, quiet hours, budgets); scroll `/activity` — every actor's steps logged; hit the pause switch; then in `/brain`, roll the playbook back to v1 and show the new rollback version appear.
- Say: "Autonomy is a dial, not a leap of faith: hard caps in one gate function, a full activity trail, a kill switch, and a revertible brain."
- Judge notices: trust primitives are enforced in code (`checkGuardrails`, versioned playbook), not promised in the UI.

## Live-local runbook (Ollama — the primary demo mode)

`.env.local` is already `MODEL_MODE=live` + `MODEL_PROVIDER=local` (Qwen3 acts, Gemma 3 judges). Latency reality on an M1 Max (32 GB tier): **genesis ≈ 4–5 min, one heartbeat ≈ 1–2 min, one full sim day ≈ 10–15 min** (persona + community calls every tick). Choreograph around that:

1. **30+ min before the demo:** `OLLAMA_KEEP_ALIVE=45m ollama serve` in its own terminal, then `npm run smoke` — expect three PASS lines. Keep that terminal open; if models unload mid-demo the next call stalls ~30 s reloading.
2. **Pre-bake the world:** run genesis (onboarding) and 2-3 sim days *before* judges arrive, ending the fast-forward just after a day boundary so the playbook has fresh coach versions. Scene 0:00 then *replays* onboarding on a second world if asked, or talks over the pre-baked one.
3. **Run live on stage:** heartbeat (scene 0:45) and approvals are the live beats — a heartbeat's 1-2 min is talk-over time for the proposal-anatomy narration. Do NOT advance a full day live; use the pre-baked state for scenes 2:15+.
4. **If anything stalls:** flip to the offline fallback below — same UI, instant.

## Offline fallback

Demo day needs no network: `scripts/prewarm-demo.ts` (Task C5) runs the demo path ahead of time and caches the result as a committed `demo-snapshot.db`. If Ollama or the machine misbehaves, stop the dev server and restart with

```bash
MODEL_MODE=mock DB_PATH=./demo-snapshot.db npm run dev
```

and replay from the 2:15 mark — every scene above still works because the loop runs fully offline (mock agents now read their context: proposals cite the newest playbook rules and typed rejections still become visible rules).
