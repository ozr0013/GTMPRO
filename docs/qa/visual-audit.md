# Visual QA audit — strict black-and-white theme

**Method.** Full-page screenshots of every route and key state at 1440px and
390px in real Chromium (Playwright), before and after the restyle, against the
committed demo snapshot. Curated pairs live in
[`screenshots/before`](screenshots/before) and
[`screenshots/after`](screenshots/after); names match one-to-one.

## Defects found in the before pass

1. **Not black and white.** Warm-grey ground with hue everywhere: periwinkle
   `--signal` (badges, rule keys, links, charts, sim clock), green/amber/red
   semantics (playbook diff, verdicts, track records), colored archetype washes
   in the feed, and neon mock hero art.
2. **No navigation below `md`.** `nav.tsx` was `hidden md:flex`; a phone got a
   logo and a New World button and no way to reach any page.
3. **Overview (`/`) missing from the nav** — reachable only via the logo.
4. **Fake like affordance** on feed cards (fixed in the functional pass).
5. Stale checklist numbers in DEMO.md (see functional audit).

## The monochrome grammar

Every token in `globals.css` is achromatic (`oklch` chroma 0): paper-grey
ground `0.965`, white cards, ink `0.145`, one grey ramp. Meaning that hue used
to carry is re-encoded in ink:

| Was | Now |
|-----|-----|
| Periwinkle "signal" accents | Full ink; emphasis via weight (bold mono, inverted pills) |
| Playbook diff green/amber/red | added = solid ink left rule + bold `+`; amended = dashed half-ink `~`; retired = faint rule + struck text `−` |
| Reveal verdicts green/amber | Match = full-ink figure; Not yet = receded grey; ringed favourite = ink ring with offset |
| Rule track-record chips | earning ≥ 0.6 = inverted ink chip; failing < 0.4 = outlined chip; unproven = muted chip |
| Analytics verdicts | exceeded = inverted; met = muted; missed = outlined |
| Chart hues | ink line/dots; hits solid ink vs misses hollow grey; dashed reference diagonal |
| Bandit champion periwinkle | inverted "champion" pill + heavier posterior stroke |
| Feed archetype color washes | four grades of grey (education lightest → meme darkest) |
| Mock hero palette (neon gradients) | grey duotones, seeded per post as before |
| Earned-autonomy / sensitive badges | solid ink pills — the two claims that must pop on stage |
| Alarm states (blocked/failed) | bold full ink inside a muted mono column |

Layout fixes: the nav is now a horizontal scroller below `md` (no scrollbar,
every page reachable on a phone), Overview joined the nav with exact-match
active state, and New World became a quiet outlined pill.

## Before / after

| Screen | Before | After |
|--------|--------|-------|
| Overview | ![before](screenshots/before/home--desktop.jpg) | ![after](screenshots/after/home--desktop.jpg) |
| Overview (mobile) | ![before](screenshots/before/home--mobile.jpg) | ![after](screenshots/after/home--mobile.jpg) |
| Feed | ![before](screenshots/before/feed--desktop.jpg) | ![after](screenshots/after/feed--desktop.jpg) |
| Proposal card | ![before](screenshots/before/approvals-card--desktop.jpg) | ![after](screenshots/after/approvals-card--desktop.jpg) |
| Reject dialog | ![before](screenshots/before/approvals-reject-dialog--desktop.jpg) | ![after](screenshots/after/approvals-reject-dialog--desktop.jpg) |
| Playbook + diff | ![before](screenshots/before/brain-playbook--desktop.jpg) | ![after](screenshots/after/brain-playbook--desktop.jpg) |
| Bandits | ![before](screenshots/before/brain-bandits--desktop.jpg) | ![after](screenshots/after/brain-bandits--desktop.jpg) |
| Calibration | ![before](screenshots/before/brain-calibration--desktop.jpg) | ![after](screenshots/after/brain-calibration--desktop.jpg) |
| Reveal (open) | ![before](screenshots/before/brain-reveal-open--desktop.jpg) | ![after](screenshots/after/brain-reveal-open--desktop.jpg) |
| Analytics | ![before](screenshots/before/analytics--desktop.jpg) | ![after](screenshots/after/analytics--desktop.jpg) |
| Activity | ![before](screenshots/before/activity--desktop.jpg) | ![after](screenshots/after/activity--desktop.jpg) |
| Settings | ![before](screenshots/before/settings--desktop.jpg) | ![after](screenshots/after/settings--desktop.jpg) |
| Onboarding | ![before](screenshots/before/onboarding--desktop.jpg) | ![after](screenshots/after/onboarding--desktop.jpg) |

## Demo-beat legibility check (DEMO.md 2:45 and 4:00)

- Playbook diff reads instantly without color: bold `+ added` with a solid ink
  rule, the rejection-sourced rule carries the operator's own words.
- Reveal lands: Match in full ink with the observation count, hidden-affinity
  matrix as ink density with the true favourite ringed, learned rules beneath.

## Verification

- `npm run verify`: PASS (tsc, eslint, 130 vitest tests).
- All 8 routes re-screenshotted at 1440px and 390px after the restyle; every
  page reachable and legible at 390px.
- `npm run demo:build` reproduces the committed snapshot beats exactly; the
  regenerated mock heroes are monochrome. The `.dark` token block was converted
  to the same grayscale for coherence (still no toggle — light is the demo
  surface).
