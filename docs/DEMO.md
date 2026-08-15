# Demo Script (3-5 minutes)

**Presented live, in person.** No second take — rehearse until it fits.

## Run it

```bash
npm run demo      # resets demo-run.db from the snapshot, starts in mock mode
```

That is the only command you need. It works from a clean checkout with **no API keys**,
resets state every time so each rehearsal starts identically, and never touches the
committed `demo-snapshot.db`. Do not run the demo against local models — a single sim-day
advance takes minutes.

Target runtime 4:50, which is over the 5:00 ceiling if anything runs long — the two scenes
to protect are **2:45 (the learning moment)** and **4:00 (the reveal)**. If you are losing
time, cut 0:00 genesis and open on the pre-built world instead.

**Two worlds, one story.** Scenes 0:00–2:45 run on the *fresh world genesis creates on
camera* — it has no track record, so every proposal is human-gated and the approve/reject
beats work. Scenes 2:15+ can also flip to the pre-built **TestBrew** (world switcher, top
bar): twelve days in, its funnel reaches booked meetings, both Reveal dimensions read MATCH,
and its approval queue is *empty* because the agent **earned autonomy** — which is the trust
tour's punchline, not a bug: "this is the same system twelve days later; it earned the right
to skip the queue, and here's the calibration record that justifies it."

Platform is always called Pictogram on screen and out loud.

## 0:00 — Genesis onboarding

- Click: open `/onboarding`, type a product description (pick something the judges know, e.g. "cold brew concentrate for coffee obsessives"), submit, watch the streaming progress ("Deriving segments... Growing 100 personas... Writing seed hypotheses..."), then "Enter Mission Control".
- Say: "Flywheel grows any product's account on Pictogram — a simulated social platform whose audience has hidden ground truth the agent has to discover."
- Judge notices: the world is generated from an arbitrary product description; nothing is hard-coded to one demo product.
- Until A1/C4 land: skip typing and tour the pre-seeded world instead (`npm run db:seed`, then open `/`) — same talking line, minus "any product".

## 0:45 — Heartbeat and proposal anatomy

- Click: "Run heartbeat" in the top bar, then open `/approvals` and expand one proposal card. Point at each element: reasoning, cited playbook rule IDs (chips), bandit arm stats, predicted-effect ranges, risk class badge — and the **"dreamed #N of 48" chip**.
- Say: "Before proposing, the agent ran every archetype-slot-topic variant through its dream of the market — its learned model of the audience, never the hidden truth — and this candidate ranked #N. Every proposal explains itself: rules, bandit beliefs, dream rank, and predicted ranges it will be scored against."
- Judge notices: explainability is structural (rule IDs and numbers), and the agent sanity-checks itself against its own world-model before asking for approval.

## 1:30 — Approve one, reject one with a reason

- Click: Approve the first proposal. On the second, click Reject and type a real reason in the dialog: "Too salesy — we never lead with product pushes." Submit.
- Say: "Rejections aren't discarded. That sentence is training data — watch for it in a minute."
- Judge notices: the reject flow requires a typed reason; human feedback is captured as structured input, not a thumbs-down.

## 2:15 — Fast-forward one sim day

- Click: "+1 day" in the top bar. Open `/feed` — likes, comments, and follower count land; then `/analytics` — funnel bars move (impressions through signups).
- Say: "Time is simulated and request-driven — a full day of audience behavior, deterministic from the world's seed, lands in seconds."
- Judge notices: outcomes are funnel events (clicks, signups, DMs), not vanity counters; personas comment in character.

## 2:45 — The learning moment

- Click: open `/brain` > Playbook tab — show the new version's diff (added rules green, amended amber, retired red) including a rule sourced from the typed rejection **carrying your own words**. Switch to Bandits tab — posterior means have shifted; the champion arm is highlighted. Then click "Run heartbeat" again and open the newest proposal.
- Say: "One day of outcomes plus one human rejection changed the playbook — and the very next proposal behaves differently and cites the new rule by ID. The memory manages itself, too: near-duplicate rules get deduped, retired lessons can't sneak back in, and past ten rules a librarian pass consolidates overlapping rules into contextual ones — never touching a rule a human created by rejecting."
- Judge notices: the full loop closed on screen — outcome, lesson, changed behavior, with the evidence chain intact — and the playbook is curated long-term memory, not an append-only log.

## 3:30 — DM thread to booked meeting

- Click: open the pending `dm_reply` proposal (first-touch DMs are always gated, even in Autopilot), approve it, then "+6h" twice. Show the thread reaching `meeting_booked` and the funnel event in `/activity` and `/analytics`.
- Say: "Engagement isn't the finish line — the community manager qualifies in at most three turns, and meetings booked is the metric."
- Judge notices: full-funnel GTM outcome; the riskiest action class stayed human-gated; the conversation is capped, not open-ended.

## 4:00 — The reveal

- Click: `/brain` > **Reveal** tab. Read the setup line out loud, then hit **"Reveal the hidden config"** (spoiler-gated so it cannot leak earlier). Per-dimension verdicts land first — e.g. Content archetype reads **Match** while Time slot reads **Not Yet** with its observation count. Scroll: the hidden affinity matrix (each segment's true favourite ringed), the algorithm levers, and "what the agent wrote down" underneath.
- Do not hide a "Not Yet". Getting one dimension right and saying so with observation counts is what makes the Match believable rather than staged.
- Say: "The world had a hidden config — per-segment content affinities, real active hours, algorithm levers. The agent never saw any of it; it only saw outcomes. Here's the answer key against what it learned."
- Judge notices: learning is measured against ground truth, not self-graded by the same LLM — and the match (or the honest miss) is visible per dimension.

## 4:30 — Trust tour

- Click: point at the **"earned autonomy" badge** in the top bar (hover it for the calibration numbers); flip the Propose/Autopilot toggle and show caps in `/settings` (posts/day, DMs/day, quiet hours, budgets); scroll `/activity` — every actor's steps logged, including the `earned_autonomy` trust events; hit the pause switch; then in `/brain`, roll the playbook back to v1 and show the new rollback version appear.
- Say: "Autonomy is a dial the agent has to EARN: predict your own outcomes accurately for five straight posts and low-risk actions skip the queue — miss, and the privilege revokes itself. Sensitive actions never skip it. Under that: hard caps in one gate function, a full activity trail, a kill switch, and a revertible brain."
- Judge notices: trust primitives are enforced in code (`checkGuardrails`, versioned playbook), and autonomy is tied to measured competence, not a checkbox.

## The snapshot everything runs against

`npx tsx scripts/build-demo.ts` rebuilds the committed `demo-snapshot.db` — 20 sim days,
seeded so every beat above is **already in the data** and nothing has to be generated on
camera. It prints a checklist; all of these must match before demo day:

```
rejection -> rule : YES   (a rule sourced from the typed rejection)
pending proposal  : none here — EXPECTED once autonomy is earned
                    (scenes 0:45–1:30 run on the fresh world created on camera)
meeting booked    : YES   (the funnel reaches the money metric)
reveal Content archetype: MATCH
rules with measured track record: 8/8
earned autonomy   : YES
```

`npm run demo` starts from a fresh copy (`demo-run.db`) every time, so a stray click during
rehearsal cannot dirty the original.

## Live-local flex (Ollama — optional beats on top of the snapshot)

The whole system runs keyless on local models (`MODEL_MODE=live` + `MODEL_PROVIDER=local`;
Qwen3 acts, Gemma 3 judges). Latency reality on an M1 Max 32 GB: **genesis ≈ 4–5 min, one
heartbeat ≈ 1–2 min, one full sim day ≈ 6–12 min** — so the live beats are heartbeat +
approvals only, never a day advance:

1. **30+ min before the demo:** `OLLAMA_KEEP_ALIVE=45m ollama serve` in its own terminal, then `npm run smoke` — expect three PASS lines. Keep that terminal open; if models unload mid-demo the next call stalls ~30 s reloading.
2. **Pre-bake the live world:** genesis + 2-3 sim days *before* judges arrive, ending just after a day boundary so the playbook has fresh coach versions.
3. **On stage:** run one live heartbeat (scene 0:45) — its 1-2 min is talk-over time for the proposal-anatomy narration. Everything else plays from pre-baked state.
4. **If anything stalls:** `npm run demo` — same UI, mock mode, instant, from the checklist-verified snapshot.
