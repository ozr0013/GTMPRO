"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlaybookView, PlaybookVersionView } from "@/lib/db/queries";
import { rollbackAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UndoIcon } from "lucide-react";

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div>
          <h3 className="font-heading text-sm font-medium">
            Active rules — v{playbook.version}
          </h3>
          <p className="text-xs text-muted-foreground">
            {playbook.rules.length} rules. Every proposal must cite these by key.
          </p>
        </div>

        {categories.map((category) => (
          <div key={category}>
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">{category}</h4>
            <div className="space-y-1.5">
              {playbook.rules
                .filter((r) => r.category === category)
                .map((rule) => (
                  <details key={rule.id} className="group rounded-lg border px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-start gap-2 text-sm">
                      <Badge variant="secondary" className="mt-0.5 shrink-0 font-mono text-[10px]">
                        {rule.ruleKey}
                      </Badge>
                      <span className="flex-1">{rule.text}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {rule.confidence.toFixed(2)}
                      </span>
                    </summary>
                    <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                      <div>{SOURCE_LABEL[rule.evidence.sourceType] ?? rule.evidence.sourceType}</div>
                      {rule.evidence.refs.length > 0 && (
                        <div className="mt-1 font-mono text-[10px]">
                          refs: {rule.evidence.refs.map((r) => r.slice(0, 8)).join(", ")}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="font-heading text-sm font-medium">Version timeline</h3>
        {[...history].reverse().map((version) => (
          <Card key={version.versionId} className="gap-2 p-3">
            <div className="flex items-center gap-2">
              <Badge variant={version.version === playbook.version ? "default" : "outline"}>
                v{version.version}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{version.authorType}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{version.createdLabel}</span>
            </div>
            <p className="text-xs">{version.changeSummary}</p>

            {version.added.map((rule) => (
              <div
                key={`add-${rule.ruleKey}`}
                className="rounded border-l-2 border-emerald-500 bg-emerald-500/5 px-2 py-1 text-[11px]"
              >
                <span className="font-medium text-emerald-700 dark:text-emerald-400">added</span>{" "}
                {rule.text}
              </div>
            ))}
            {version.amended.map((rule) => (
              <div
                key={`amend-${rule.ruleKey}`}
                className="rounded border-l-2 border-amber-500 bg-amber-500/5 px-2 py-1 text-[11px]"
              >
                <span className="font-medium text-amber-700 dark:text-amber-400">amended</span>{" "}
                <span className="line-through opacity-60">{rule.before}</span> → {rule.after}
              </div>
            ))}
            {version.retired.map((rule) => (
              <div
                key={`retire-${rule.ruleKey}`}
                className="rounded border-l-2 border-rose-500 bg-rose-500/5 px-2 py-1 text-[11px]"
              >
                <span className="font-medium text-rose-700 dark:text-rose-400">retired</span>{" "}
                <span className="line-through opacity-60">{rule.text}</span>
              </div>
            ))}

            {version.version !== playbook.version && (
              <Button
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() => rollback(version.version)}
              >
                <UndoIcon />
                Roll back to v{version.version}
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
