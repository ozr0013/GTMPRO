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

- Click: the ground-truth reveal panel on `/brain` (until it lands: `npx drizzle-kit studio`, open `worlds.config`) side-by-side with the learned playbook rules and bandit posteriors.
- Say: "The world had a hidden config — cafe owners love product posts, mornings win. The agent never saw it. Compare what it learned."
- Judge notices: learning is measured against ground truth, not self-graded by the same LLM — and the match is visible.

## 4:30 — Trust tour

- Click: flip the Propose/Autopilot toggle and show caps in settings (posts/day, DMs/day, quiet hours, budgets); scroll `/activity` — every actor's steps logged; hit the pause switch; then in `/brain`, roll the playbook back to v1 and show the new rollback version appear.
- Say: "Autonomy is a dial, not a leap of faith: hard caps in one gate function, a full activity trail, a kill switch, and a revertible brain."
- Judge notices: trust primitives are enforced in code (`checkGuardrails`, versioned playbook), not promised in the UI.

## Offline fallback

Demo day needs no network: `scripts/prewarm-demo.ts` (Task C5) runs the demo path in live mode ahead of time and caches the result as a committed `demo-snapshot.db`. If wifi or a provider dies, point `DB_PATH` at a copy of the snapshot, keep `MODEL_MODE=mock`, and replay from the 2:15 mark — every scene above still works because the loop runs fully offline.
