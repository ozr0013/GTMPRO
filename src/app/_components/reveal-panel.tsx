"use client";

import { useState } from "react";
import type { GroundTruthReveal } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  seed: "seeded hypothesis",
  outcome: "learned from an outcome",
  rejection: "learned from your rejection",
  edit: "distilled from your edit",
};

function Bar({ value, tone }: { value: number; tone: "world" | "agent" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
      <div
        className={cn("h-full rounded-full", tone === "world" ? "bg-foreground/55" : "bg-signal")}
        style={{ width: `${Math.max(2, Math.round(value * 100))}%` }}
      />
    </div>
  );
}

function agreementCopy(reveal: GroundTruthReveal): { title: string; body: string } {
  const truth = `${reveal.trueBest.archetype}/${reveal.trueBest.timeSlot}`;
  if (!reveal.champion) {
    return {
      title: "Not enough evidence yet",
      body: `No arm has observed outcomes, so there is no champion to grade. The world's true best arm is ${truth} — advance a few sim days and come back.`,
    };
  }
  const champ = `${reveal.champion.archetype}/${reveal.champion.timeSlot}`;
  switch (reveal.agreement) {
    case "match":
      return {
        title: "The agent found it",
        body: `Champion arm ${champ} (n=${reveal.champion.observations}) is exactly the world's hidden best arm — discovered from outcomes alone.`,
      };
    case "partial":
      return {
        title: "One axis off",
        body: `Champion ${champ} (n=${reveal.champion.observations}) vs true best ${truth} — the agent has locked one dimension and is still exploring the other.`,
      };
    default:
      return {
        title: "Still searching",
        body: `Champion ${champ} (n=${reveal.champion.observations}) diverges from the true best ${truth} — more observations will pull the posteriors toward the truth.`,
      };
  }
}

export function RevealPanel({ reveal }: { reveal: GroundTruthReveal }) {
  const [revealed, setRevealed] = useState(false);
  const archetypes = [...new Set(reveal.arms.map((a) => a.archetype))];

  if (!revealed) {
    return (
      <div className="px-6 py-14 text-center md:px-10 md:py-20">
        <p className="eyebrow">the answer key</p>
        <h3 className="display-sm mt-3 text-[1.6rem]">
          This world has a hidden config the agent has never seen.
        </h3>
        <p className="mx-auto mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          Per-segment content affinities, the audience&apos;s real active hours, and the platform
          algorithm&apos;s levers. The agent only ever saw outcomes. Reveal the ground truth and
          compare it with what the playbook and bandits learned.
        </p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-8 rounded-full bg-foreground px-8 py-3 text-[0.8rem] font-bold tracking-wide text-background uppercase transition-opacity hover:opacity-85"
        >
          Reveal the hidden config
        </button>
      </div>
    );
  }

  const verdict = agreementCopy(reveal);

  return (
    <div>
      {/* verdict */}
      <div className="border-b px-6 py-6 md:px-10">
        <p className={cn("eyebrow", reveal.agreement === "match" ? "text-positive" : "text-signal")}>
          {reveal.agreement === "untested" ? "ungraded" : reveal.agreement}
        </p>
        <h3 className="display-sm mt-1.5 text-[1.5rem]">{verdict.title}</h3>
        <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-muted-foreground">
          {verdict.body}
        </p>
      </div>

      {/* truth vs learned, arm by arm */}
      <div className="border-b px-6 py-3 md:px-10">
        <h3 className="eyebrow">Hidden truth vs learned posterior — compare rankings, not magnitudes</h3>
      </div>
      {archetypes.map((archetype) => (
        <section key={archetype} className="border-b">
          <div className="border-b bg-muted/40 px-6 py-1.5 md:px-10">
            <h4 className="eyebrow">{archetype}</h4>
          </div>
          <div className="grid sm:grid-cols-3 [&>*]:-mr-px [&>*]:border-r">
            {reveal.arms
              .filter((a) => a.archetype === archetype)
              .map((arm) => (
                <div key={`${arm.archetype}-${arm.timeSlot}`} className="px-6 py-4 md:px-10">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[0.82rem]">{arm.timeSlot}</span>
                    <span className="flex gap-2">
                      {arm.isTrueBest && <span className="eyebrow text-positive">true best</span>}
                      {arm.isChampion && <span className="eyebrow text-signal">champion</span>}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-10 shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                        world
                      </span>
                      <Bar value={arm.trueScore} tone="world" />
                      <span className="w-9 shrink-0 text-right font-mono text-[0.62rem] tabular-nums">
                        {arm.trueScore.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-10 shrink-0 font-mono text-[0.6rem] text-muted-foreground">
                        agent
                      </span>
                      <Bar value={arm.observations > 0 ? arm.learnedMean : 0} tone="agent" />
                      <span className="w-9 shrink-0 text-right font-mono text-[0.62rem] tabular-nums">
                        {arm.observations > 0 ? arm.learnedMean.toFixed(2) : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 font-mono text-[0.6rem] text-muted-foreground tabular-nums">
                    n={arm.observations}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}

      <div className="grid lg:grid-cols-2">
        {/* segment affinity matrix */}
        <section className="lg:border-r">
          <div className="border-b px-6 py-3 md:px-10">
            <h3 className="eyebrow">Hidden affinity matrix — segment × archetype</h3>
          </div>
          <div className="px-6 py-4 md:px-10">
            {reveal.segments.map((seg) => (
              <div key={seg.name} className="border-b py-3 last:border-b-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.85rem] font-semibold">{seg.name}</span>
                  <span className="font-mono text-[0.62rem] text-muted-foreground tabular-nums">
                    {seg.personaCount} personas
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-3">
                  {(Object.keys(seg.affinity) as (keyof typeof seg.affinity)[]).map((arch) => (
                    <div key={arch}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[0.58rem] text-muted-foreground">
                          {arch}
                        </span>
                        <span className="font-mono text-[0.62rem] tabular-nums">
                          {seg.affinity[arch].toFixed(1)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <Bar value={seg.affinity[arch]} tone="world" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* audience rhythm + algorithm levers */}
        <section>
          <div className="border-b px-6 py-3 md:px-10">
            <h3 className="eyebrow">When the audience is really online</h3>
          </div>
          <div className="space-y-2.5 px-6 py-4 md:px-10">
            {reveal.slotActivity.map(({ slot, share }) => (
              <div key={slot} className="flex items-center gap-2.5">
                <span className="w-16 shrink-0 text-[0.8rem]">{slot}</span>
                <Bar value={share} tone="world" />
                <span className="w-10 shrink-0 text-right font-mono text-[0.62rem] tabular-nums">
                  {Math.round(share * 100)}%
                </span>
              </div>
            ))}
          </div>
          <div className="border-y px-6 py-3 md:px-10">
            <h3 className="eyebrow">Platform algorithm levers</h3>
          </div>
          <div className="grid grid-cols-3 [&>*]:-mr-px [&>*]:border-r">
            <div className="px-6 py-4 md:px-10">
              <span className="figure block text-[1.5rem]">
                {reveal.algo.earlyVelocityBoost.toFixed(1)}×
              </span>
              <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                early-velocity boost
              </span>
            </div>
            <div className="px-6 py-4 md:px-10">
              <span className="figure block text-[1.5rem]">
                {reveal.algo.overPostPenalty.toFixed(1)}×
              </span>
              <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                over-posting penalty
              </span>
            </div>
            <div className="px-6 py-4 md:px-10">
              <span className="figure block text-[1.5rem]">
                {reveal.algo.maxOrganicReachPostsPerDay}
              </span>
              <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                full-reach posts / day
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* what the agent wrote down */}
      <div className="border-t">
        <div className="border-b px-6 py-3 md:px-10">
          <h3 className="eyebrow">What the agent wrote down — content + timing rules</h3>
        </div>
        {reveal.learnedRules.length === 0 ? (
          <p className="px-6 py-5 text-[0.85rem] text-muted-foreground md:px-10">
            No content or timing rules yet.
          </p>
        ) : (
          reveal.learnedRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-baseline gap-4 border-b px-6 py-3 last:border-b-0 md:px-10"
            >
              <span className="w-24 shrink-0 font-mono text-[0.65rem] text-signal">
                {rule.ruleKey}
              </span>
              <span className="flex-1 text-[0.85rem] leading-relaxed">{rule.text}</span>
              <span className="hidden shrink-0 font-mono text-[0.6rem] text-muted-foreground sm:inline">
                {SOURCE_LABEL[rule.evidence.sourceType] ?? rule.evidence.sourceType}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
