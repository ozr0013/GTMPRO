"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlaybookView, PlaybookVersionView } from "@/lib/db/queries";
import { rollbackAction } from "@/app/actions";

const CATEGORY_ORDER = ["voice", "content", "timing", "audience", "guardrail"];

const SOURCE_LABEL: Record<string, string> = {
  seed: "seeded hypothesis",
  outcome: "learned from an outcome",
  rejection: "learned from your rejection",
  edit: "distilled from your edit",
};

export function PlaybookPanel({
  worldId,
  playbook,
  history,
}: {
  worldId: string;
  playbook: PlaybookView;
  history: PlaybookVersionView[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rollback = (version: number) =>
    startTransition(async () => {
      await rollbackAction(worldId, version);
      router.refresh();
    });

  const categories = CATEGORY_ORDER.filter((c) => playbook.rules.some((r) => r.category === c));

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_24rem]">
      {/* the playbook, set like a standards document */}
      <div className="lg:border-r">
        <div className="flex items-baseline justify-between border-b px-6 py-3 md:px-10">
          <h3 className="eyebrow">Active rules</h3>
          <span className="font-mono text-[0.7rem] text-muted-foreground">
            v{playbook.version} · {playbook.rules.length} rules
          </span>
        </div>

        {categories.map((category) => (
          <section key={category}>
            <div className="border-b bg-muted/40 px-6 py-1.5 md:px-10">
              <h4 className="eyebrow">{category}</h4>
            </div>
            {playbook.rules
              .filter((r) => r.category === category)
              .map((rule) => (
                <details key={rule.id} className="group border-b">
                  <summary className="flex cursor-pointer list-none items-baseline gap-4 px-6 py-3 hover:bg-muted/40 md:px-10">
                    <span className="w-24 shrink-0 font-mono text-[0.65rem] text-signal">
                      {rule.ruleKey}
                    </span>
                    <span className="flex-1 text-[0.88rem] leading-relaxed">{rule.text}</span>
                    <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground tabular-nums">
                      {rule.confidence.toFixed(2)}
                    </span>
                  </summary>
                  <div className="bg-muted/30 px-6 py-3 pl-[calc(1.5rem+7rem)] md:px-10 md:pl-[calc(2.5rem+7rem)]">
                    <p className="eyebrow">{SOURCE_LABEL[rule.evidence.sourceType] ?? rule.evidence.sourceType}</p>
                    {rule.evidence.refs.length > 0 && (
                      <p className="mt-1 font-mono text-[0.62rem] text-muted-foreground">
                        refs {rule.evidence.refs.map((r) => r.slice(0, 8)).join(" · ")}
                      </p>
                    )}
                  </div>
                </details>
              ))}
          </section>
        ))}
      </div>

      {/* version timeline — an editorial changelog */}
      <aside>
        <div className="border-b px-6 py-3">
          <h3 className="eyebrow">Version timeline</h3>
        </div>
        {[...history].reverse().map((version) => (
          <article key={version.versionId} className="border-b px-6 py-4">
            <div className="flex items-baseline gap-2.5">
              <span
                className={`figure text-[1.35rem] ${
                  version.version === playbook.version ? "text-signal" : ""
                }`}
              >
                v{version.version}
              </span>
              <span className="eyebrow">{version.authorType}</span>
              <span className="ml-auto font-mono text-[0.62rem] text-muted-foreground">
                {version.createdLabel}
              </span>
            </div>
            <p className="mt-1.5 text-[0.8rem] text-muted-foreground">{version.changeSummary}</p>

            <div className="mt-3 space-y-1.5">
              {version.added.map((rule) => (
                <div
                  key={`add-${rule.ruleKey}`}
                  className="border-l-2 border-positive pl-2.5 text-[0.75rem] leading-relaxed"
                >
                  <span className="eyebrow text-positive">added</span>{" "}
                  <span className="text-muted-foreground">{rule.text}</span>
                </div>
              ))}
              {version.amended.map((rule) => (
                <div
                  key={`amend-${rule.ruleKey}`}
                  className="border-l-2 border-caution pl-2.5 text-[0.75rem] leading-relaxed"
                >
                  <span className="eyebrow text-caution">amended</span>{" "}
                  <span className="text-muted-foreground line-through opacity-60">
                    {rule.before}
                  </span>{" "}
                  <span className="text-muted-foreground">→ {rule.after}</span>
                </div>
              ))}
              {version.retired.map((rule) => (
                <div
                  key={`retire-${rule.ruleKey}`}
                  className="border-l-2 border-destructive pl-2.5 text-[0.75rem] leading-relaxed"
                >
                  <span className="eyebrow text-destructive">retired</span>{" "}
                  <span className="text-muted-foreground line-through opacity-60">{rule.text}</span>
                </div>
              ))}
            </div>

            {version.version !== playbook.version && (
              <button
                type="button"
                disabled={pending}
                onClick={() => rollback(version.version)}
                className="eyebrow mt-3 border-b border-muted-foreground pb-0.5 transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
              >
                Roll back to v{version.version}
              </button>
            )}
          </article>
        ))}
      </aside>
    </div>
  );
}
