"use client";

import { useState } from "react";
import type { GroundTruthReveal } from "@/lib/db/groundTruth";
import type { Archetype } from "@/lib/types";
import { ARCHETYPES } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  seed: "seeded hypothesis",
  outcome: "learned from an outcome",
  rejection: "learned from your rejection",
  edit: "distilled from your edit",
};

/** Affinity 0..1 as ink density — the hidden matrix read at a glance. */
function AffinityCell({ value, isBest }: { value: number; isBest: boolean }) {
  return (
    <td className="px-2 py-1.5">
      <div
        className={cn(
          "flex h-9 items-center justify-center rounded-lg font-mono text-[0.72rem] tabular-nums",
          isBest && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
        )}
        style={{
          backgroundColor: `color-mix(in oklch, var(--foreground) ${Math.round(value * 88)}%, var(--card))`,
          color: value > 0.55 ? "var(--card)" : "var(--foreground)",
        }}
      >
        {value.toFixed(2)}
      </div>
    </td>
  );
}

function Bars({
  items,
  muted,
}: {
  items: { key: string; score: number; observations?: number }[];
  muted?: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[0.78rem] capitalize">{item.key}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full", muted ? "bg-muted-foreground/50" : "bg-foreground")}
              style={{ width: `${Math.max(item.score * 100, 2)}%` }}
            />
          </span>
          {item.observations !== undefined && (
            <span className="w-10 shrink-0 text-right font-mono text-[0.62rem] text-muted-foreground tabular-nums">
              n={item.observations}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function RevealPanel({ reveal }: { reveal: GroundTruthReveal | null }) {
  // Spoiler-gated so the answer key cannot leak on screen during earlier demo
  // scenes; state resets on navigation, which is what a rehearsal wants.
  const [revealed, setRevealed] = useState(false);

  if (!reveal) {
    return <p className="px-6 py-10 text-[0.9rem] text-muted-foreground md:px-10">No world loaded.</p>;
  }

  if (!revealed) {
    return (
      <div className="px-6 py-14 text-center md:px-10 md:py-20">
        <p className="eyebrow">the answer key</p>
        <h3 className="display-sm mt-3 text-[1.6rem]">
          This world has a hidden config the agent has never seen.
        </h3>
        <p className="mx-auto mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          Per-segment content affinities, the audience&apos;s real active hours, and the platform
          algorithm&apos;s levers. The strategist only ever saw playbook rules, bandit posteriors and
          observed outcomes. Reveal the ground truth and compare it with what the agent learned.
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

  const segments = Object.keys(reveal.affinity);

  return (
    <div>
      <div className="border-b px-6 py-6 md:px-10">
        <p className="eyebrow">The reveal</p>
        <h3 className="display-sm mt-2 max-w-2xl text-[1.6rem]">
          The world was built with a hidden config. The agent never saw it.
        </h3>
        <p className="mt-3 max-w-2xl text-[0.88rem] leading-relaxed text-muted-foreground">
          The strategist only ever receives playbook rules, bandit posteriors and observed
          signals — never the affinity matrix or any persona&apos;s internals. So this comparison
          measures learning against ground truth rather than letting the agent grade itself.
        </p>
      </div>

      {/* verdicts first — this is the line the demo lands on */}
      <div className="grid border-b sm:grid-cols-2 [&>*]:-mr-px [&>*]:border-r">
        {reveal.dimensions.map((d) => (
          <div key={d.label} className="px-6 py-6 md:px-10">
            <p className="eyebrow">{d.label}</p>

            {d.evidence === 0 ? (
              <>
                <p className="figure mt-3 text-[1.6rem] text-muted-foreground">No evidence yet</p>
                <p className="mt-2 text-[0.8rem] text-muted-foreground">
                  Every arm still sits on its prior — advance the clock so outcomes land before
                  reading this.
                </p>
              </>
            ) : (
              <>
                {/* verdicts in ink weight: a Match is full ink, a Not-yet recedes */}
                <p
                  className={cn(
                    "figure mt-3 text-[1.9rem] capitalize",
                    d.agrees ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {d.agrees ? "Match" : "Not yet"}
                </p>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
                  Truth favours <span className="font-bold text-foreground capitalize">{d.truthTop}</span>
                  ; the agent ranks{" "}
                  <span className="font-bold text-foreground capitalize">{d.learnedTop}</span> highest
                  after {d.evidence} scored post{d.evidence === 1 ? "" : "s"}.
                </p>
              </>
            )}

            <div className="mt-6 space-y-5">
              <div>
                <p className="eyebrow mb-2">Hidden truth</p>
                <Bars items={d.truth} />
              </div>
              <div>
                <p className="eyebrow mb-2">What the agent believes</p>
                <Bars items={d.learned} muted />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* the raw matrix — proof there is a real hidden structure, not a vibe */}
      <div className="border-b px-6 py-6 md:px-10">
        <p className="eyebrow">Hidden affinity matrix</p>
        <p className="mt-2 mb-4 max-w-2xl text-[0.85rem] text-muted-foreground">
          How much each audience segment actually likes each content archetype, straight from
          <span className="font-mono text-[0.78rem]"> worlds.config</span>. Ringed cell = that
          segment&apos;s true favourite.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem]">
            <thead>
              <tr>
                <th className="eyebrow px-2 py-2 text-left font-normal">Segment</th>
                {ARCHETYPES.map((a) => (
                  <th key={a} className="eyebrow px-2 py-2 text-center font-normal">
                    {a}
                  </th>
                ))}
                <th className="eyebrow px-2 py-2 text-right font-normal">Size</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment) => (
                <tr key={segment}>
                  <td className="px-2 py-1.5 text-[0.8rem]">{segment}</td>
                  {ARCHETYPES.map((a) => (
                    <AffinityCell
                      key={a}
                      value={reveal.affinity[segment]?.[a as Archetype] ?? 0}
                      isBest={reveal.segmentBest[segment] === a}
                    />
                  ))}
                  <td className="px-2 py-1.5 text-right font-mono text-[0.72rem] text-muted-foreground tabular-nums">
                    {reveal.segmentSizes[segment] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 border-t pt-4">
          <p className="eyebrow">Hidden algorithm</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.72rem] text-muted-foreground">
            <span>early-velocity boost ×{reveal.algo?.earlyVelocityBoost}</span>
            <span>over-post penalty ×{reveal.algo?.overPostPenalty}</span>
            <span>free reach up to {reveal.algo?.maxOrganicReachPostsPerDay} posts/day</span>
            <span>discovery rate {reveal.algo?.discoveryRate}</span>
          </div>
        </div>
      </div>

      {/* what the agent wrote down — read next to the matrix above */}
      <div>
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
              key={rule.ruleKey}
              className="flex items-baseline gap-4 border-b px-6 py-3 last:border-b-0 md:px-10"
            >
              <span className="w-24 shrink-0 font-mono text-[0.65rem] font-medium">
                {rule.ruleKey}
              </span>
              <span className="flex-1 text-[0.85rem] leading-relaxed">{rule.text}</span>
              <span className="hidden shrink-0 font-mono text-[0.6rem] text-muted-foreground sm:inline">
                {SOURCE_LABEL[rule.sourceType] ?? rule.sourceType}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
