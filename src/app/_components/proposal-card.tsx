"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProposalView } from "@/lib/db/queries";
import { decideAction } from "@/app/actions";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Mode = "reject" | "edit" | null;

export function ProposalCard({ proposal, index }: { proposal: ProposalView; index: number }) {
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [caption, setCaption] = useState(proposal.payload.caption ?? proposal.payload.text ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const decide = (decision: "approve" | "reject" | "edit") =>
    startTransition(async () => {
      await decideAction(proposal.id, decision, reason || undefined, caption);
      setMode(null);
      setReason("");
      router.refresh();
    });

  const ranges = [
    { label: "Impressions", range: proposal.predictedEffect.impressions },
    { label: "Likes", range: proposal.predictedEffect.likes },
    { label: "Clicks", range: proposal.predictedEffect.linkClicks },
    { label: "Signups", range: proposal.predictedEffect.signups },
  ];

  return (
    <article className="mt-4 overflow-hidden rounded-3xl bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 py-4 md:px-8">
        <span className="font-mono text-[0.75rem] font-bold tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        {/* dm_reply payloads have no archetype/timeSlot — filter empty chips */}
        {[proposal.kind, proposal.payload.archetype, proposal.payload.timeSlot]
          .filter((chip): chip is string => Boolean(chip))
          .map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-muted px-3 py-1 text-[0.68rem] font-bold tracking-wider uppercase"
          >
            {chip}
          </span>
        ))}
        {proposal.riskClass === "sensitive" && (
          <span className="rounded-full bg-foreground px-3 py-1 text-[0.68rem] font-bold tracking-wider text-background uppercase">
            sensitive · approval required
          </span>
        )}
        {proposal.dream && (
          <span
            className="rounded-full border border-foreground/30 px-3 py-1 font-mono text-[0.68rem] font-bold tracking-wider uppercase"
            title={`Ranked against the agent's learned model of the audience (score ${proposal.dream.score}) — never the hidden config`}
          >
            dreamed #{proposal.dream.rank} of {proposal.dream.of}
          </span>
        )}
        <span className="ml-auto font-mono text-[0.68rem] text-muted-foreground">
          proposed {proposal.createdLabel} → runs {proposal.scheduledLabel}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="px-6 py-7 md:px-8 lg:border-r">
          {/* the draft is the thing being judged, so it gets display type.
              dm_reply payloads carry `text` instead of caption/hashtags/brief. */}
          <p className="display-sm max-w-xl text-[1.5rem]">
            {proposal.payload.caption ?? proposal.payload.text ?? ""}
          </p>
          {(proposal.payload.hashtags?.length ?? 0) > 0 && (
            <p className="mt-3 font-mono text-[0.75rem] text-muted-foreground">
              {proposal.payload.hashtags!.join(" ")}
            </p>
          )}

          {proposal.payload.creativeBrief && (
            <div className="mt-7">
              <p className="eyebrow">Creative brief</p>
              <p className="mt-2 text-[0.88rem] text-muted-foreground">
                {proposal.payload.creativeBrief}
              </p>
            </div>
          )}

          <div className="mt-6">
            <p className="eyebrow">Why this action</p>
            <p className="mt-2 max-w-xl text-[0.92rem] leading-relaxed">{proposal.reasoning}</p>
          </div>

          {(proposal.ruleTexts.length > 0 || proposal.armLabel) && (
            <div className="mt-6">
              <p className="eyebrow">Evidence</p>
              <ul className="ruled mt-2 max-w-xl">
                {proposal.ruleTexts.map((rule) => (
                  <li key={rule.ruleKey} className="flex gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-mono text-[0.68rem] font-medium">
                      {rule.ruleKey}
                    </span>
                    <span className="text-[0.85rem] text-muted-foreground">{rule.text}</span>
                  </li>
                ))}
                {proposal.armLabel && (
                  <li className="flex gap-3 py-2.5">
                    <span className="w-24 shrink-0 font-mono text-[0.68rem] text-muted-foreground">
                      bandit
                    </span>
                    <span className="text-[0.85rem] text-muted-foreground">{proposal.armLabel}</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("approve")}
              className="rounded-full bg-foreground px-6 py-3 text-[0.7rem] font-bold tracking-widest text-background uppercase transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("edit")}
              className="rounded-full bg-muted px-6 py-3 text-[0.7rem] font-bold tracking-widest uppercase transition-colors hover:bg-accent disabled:opacity-40"
            >
              Edit first
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("reject")}
              className="rounded-full px-6 py-3 text-[0.7rem] font-bold tracking-widest text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </div>

        <aside className="bg-muted/40 px-6 py-7 md:px-8">
          <p className="eyebrow">Predicted effect</p>
          <dl className="ruled mt-3">
            {ranges.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between py-2.5">
                <dt className="text-[0.85rem] text-muted-foreground">{r.label}</dt>
                <dd className="font-mono text-[0.85rem] tabular-nums">
                  {r.range[0]}–{r.range[1]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-muted-foreground">
            The analyst scores these against reality after 24 ticks. Calibration lives in Brain.
          </p>
        </aside>
      </div>

      {/* a rejection reason is required — it is the coach's strongest learning signal */}
      <Dialog open={mode === "reject"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="display-sm text-[1.4rem]">
              Why are you rejecting this?
            </DialogTitle>
            <DialogDescription>
              The coach turns your reason into a playbook rule, so the next proposal differs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason" className="eyebrow">
              Reason
            </Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. too salesy for this audience — lead with the insight, not the product"
              rows={3}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-full px-5 py-2.5 text-[0.7rem] font-bold tracking-widest uppercase hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || reason.trim().length === 0}
              onClick={() => decide("reject")}
              className="rounded-full bg-foreground px-5 py-2.5 text-[0.7rem] font-bold tracking-widest text-background uppercase disabled:opacity-40"
            >
              Reject
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "edit"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="display-sm text-[1.4rem]">Edit before approving</DialogTitle>
            <DialogDescription>
              Your edit is stored as a diff and distilled into voice rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-caption" className="eyebrow">
              Caption
            </Label>
            <Textarea
              id="edit-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
            />
            <Label htmlFor="edit-reason" className="eyebrow">
              What changed and why (optional)
            </Label>
            <Textarea
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-full px-5 py-2.5 text-[0.7rem] font-bold tracking-widest uppercase hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || caption.trim().length < 10}
              onClick={() => decide("edit")}
              className="rounded-full bg-foreground px-5 py-2.5 text-[0.7rem] font-bold tracking-widest text-background uppercase disabled:opacity-40"
            >
              Approve with edit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
