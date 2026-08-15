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
  const [caption, setCaption] = useState(proposal.payload.caption);
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
    <article className="border-b">
      {/* dossier header — numbered like a filing */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-6 py-3 md:px-10">
        <span className="font-mono text-[0.7rem] text-signal tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="eyebrow">{proposal.kind}</span>
        <span className="eyebrow">{proposal.payload.archetype}</span>
        <span className="eyebrow">{proposal.payload.timeSlot}</span>
        {proposal.riskClass === "sensitive" && (
          <span className="eyebrow border-b border-destructive text-destructive">
            sensitive · approval required
          </span>
        )}
        <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
          proposed {proposal.createdLabel} → runs {proposal.scheduledLabel}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="px-6 py-6 md:px-10 lg:border-r">
          {/* the draft itself, set as copy rather than as a form field */}
          <p className="display max-w-xl text-[1.35rem] leading-snug">
            {proposal.payload.caption}
          </p>
          {proposal.payload.hashtags.length > 0 && (
            <p className="mt-3 font-mono text-[0.72rem] text-signal">
              {proposal.payload.hashtags.join(" ")}
            </p>
          )}

          <div className="mt-6">
            <p className="eyebrow">Creative brief</p>
            <p className="mt-1.5 text-[0.85rem] text-muted-foreground">
              {proposal.payload.creativeBrief}
            </p>
          </div>

          <div className="mt-6">
            <p className="eyebrow">Why this action</p>
            <p className="mt-1.5 max-w-xl text-[0.9rem] leading-relaxed">{proposal.reasoning}</p>
          </div>

          {(proposal.ruleTexts.length > 0 || proposal.armLabel) && (
            <div className="mt-6">
              <p className="eyebrow">Evidence</p>
              <ul className="ruled mt-2 max-w-xl border-t">
                {proposal.ruleTexts.map((rule) => (
                  <li key={rule.ruleKey} className="flex gap-3 py-2">
                    <span className="w-24 shrink-0 font-mono text-[0.65rem] text-signal">
                      {rule.ruleKey}
                    </span>
                    <span className="text-[0.8rem] text-muted-foreground">{rule.text}</span>
                  </li>
                ))}
                {proposal.armLabel && (
                  <li className="flex gap-3 py-2">
                    <span className="w-24 shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                      bandit
                    </span>
                    <span className="text-[0.8rem] text-muted-foreground">{proposal.armLabel}</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-6">
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("approve")}
              className="bg-foreground px-5 py-2 font-mono text-[0.72rem] tracking-widest text-background uppercase transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("edit")}
              className="eyebrow border-b border-foreground pb-0.5 text-foreground transition-opacity hover:opacity-60 disabled:opacity-40"
            >
              Edit first
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("reject")}
              className="eyebrow border-b border-destructive pb-0.5 text-destructive transition-opacity hover:opacity-60 disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </div>

        {/* predicted effect as a ruled table — the agent's stated confidence */}
        <aside>
          <div className="border-b px-6 py-3">
            <p className="eyebrow">Predicted effect</p>
          </div>
          <dl className="ruled">
            {ranges.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between px-6 py-2.5">
                <dt className="text-[0.8rem] text-muted-foreground">{r.label}</dt>
                <dd className="font-mono text-[0.82rem] tabular-nums">
                  {r.range[0]}–{r.range[1]}
                </dd>
              </div>
            ))}
          </dl>
          <p className="px-6 py-3 text-[0.72rem] leading-relaxed text-muted-foreground">
            The analyst scores these against reality after 24 ticks. Calibration lives in
            Brain.
          </p>
        </aside>
      </div>

      {/* a rejection reason is required — it is the coach's strongest learning signal */}
      <Dialog open={mode === "reject"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="display text-[1.35rem]">Why are you rejecting this?</DialogTitle>
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
              className="eyebrow px-3 py-2 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || reason.trim().length === 0}
              onClick={() => decide("reject")}
              className="bg-destructive px-4 py-2 font-mono text-[0.72rem] tracking-widest text-background uppercase disabled:opacity-40"
            >
              Reject
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "edit"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="display text-[1.35rem]">Edit before approving</DialogTitle>
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
              className="eyebrow px-3 py-2 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || caption.trim().length < 10}
              onClick={() => decide("edit")}
              className="bg-foreground px-4 py-2 font-mono text-[0.72rem] tracking-widest text-background uppercase disabled:opacity-40"
            >
              Approve with edit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
