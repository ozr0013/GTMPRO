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

Platform is always called Pictogram on screen and out loud.

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

- Click: `/brain` > **Reveal** tab. Content archetype reads **Match** — truth favours Education, the agent ranks Education highest after 18 scored posts. Time slot reads **Not Yet**. Scroll to the hidden affinity matrix; each segment's true favourite is ringed.
- Do not hide the "Not Yet". It got one dimension right and one wrong, and says so with the observation counts — that is what makes the Match believable rather than staged.
- Say: "The world had a hidden config — cafe owners love product posts, mornings win. The agent never saw it. Compare what it learned."
- Judge notices: learning is measured against ground truth, not self-graded by the same LLM — and the match is visible.

## 4:30 — Trust tour

- Click: flip the Propose/Autopilot toggle and show caps in settings (posts/day, DMs/day, quiet hours, budgets); scroll `/activity` — every actor's steps logged; hit the pause switch; then in `/brain`, roll the playbook back to v1 and show the new rollback version appear.
- Say: "Autonomy is a dial, not a leap of faith: hard caps in one gate function, a full activity trail, a kill switch, and a revertible brain."
- Judge notices: trust primitives are enforced in code (`checkGuardrails`, versioned playbook), not promised in the UI.

## The snapshot everything is recorded against

`npx tsx scripts/build-demo.ts` rebuilds the committed `demo-snapshot.db` — 20 sim days,
seeded so every beat above is **already in the data** and nothing has to be generated on
camera. It prints a checklist; all of these must read YES before recording:

```
rejection -> rule : YES   (a rule sourced from the typed rejection)
pending proposal  : YES   (so /approvals is not empty on screen)
meeting booked    : YES   (the funnel reaches the money metric)
reveal Content archetype: MATCH
rules with measured track record: 4/4
```

Point `DB_PATH` at a **copy** so a stray click during rehearsal cannot dirty the original:

```bash
cp demo-snapshot.db demo-run.db && DB_PATH=./demo-run.db MODEL_MODE=mock npm run dev
```

Live local models work (`MODEL_PROVIDER=local`) but budget **~12 minutes per sim day** on a
machine that cannot fit the actor model in VRAM — never advance the clock live on camera.
