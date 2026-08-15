"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProposalView } from "@/lib/db/queries";
import { decideAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { AlertTriangleIcon, CheckIcon, PencilIcon, XIcon } from "lucide-react";

type Mode = "reject" | "edit" | null;

export function ProposalCard({ proposal }: { proposal: ProposalView }) {
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
    { label: "Link clicks", range: proposal.predictedEffect.linkClicks },
    { label: "Signups", range: proposal.predictedEffect.signups },
  ];

  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{proposal.kind}</Badge>
        <Badge variant="outline">{proposal.payload.archetype}</Badge>
        <Badge variant="outline">{proposal.payload.timeSlot}</Badge>
        {proposal.riskClass === "sensitive" && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangleIcon className="size-3" />
            sensitive — approval required
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          proposed {proposal.createdLabel} · runs {proposal.scheduledLabel}
        </span>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="text-sm leading-relaxed">{proposal.payload.caption}</p>
        {proposal.payload.hashtags.length > 0 && (
          <p className="mt-1.5 text-xs text-sky-600 dark:text-sky-400">
            {proposal.payload.hashtags.join(" ")}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Creative brief: {proposal.payload.creativeBrief}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-medium text-muted-foreground">Why this action</h3>
        <p className="mt-1 text-sm">{proposal.reasoning}</p>
      </div>

      {proposal.ruleTexts.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Evidence</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {proposal.ruleTexts.map((rule) => (
              <Badge key={rule.ruleKey} variant="secondary" title={rule.text} className="font-mono text-[10px]">
                {rule.ruleKey}
              </Badge>
            ))}
            {proposal.armLabel && (
              <Badge variant="outline" className="text-[10px]">
                bandit: {proposal.armLabel}
              </Badge>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-medium text-muted-foreground">Predicted effect</h3>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ranges.map((r) => (
            <div key={r.label} className="rounded-lg border px-2.5 py-1.5">
              <div className="text-[10px] text-muted-foreground">{r.label}</div>
              <div className="font-heading text-sm font-semibold tabular-nums">
                {r.range[0]}–{r.range[1]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide("approve")}>
          <CheckIcon />
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("edit")}>
          <PencilIcon />
          Edit
        </Button>
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => setMode("reject")}>
          <XIcon />
          Reject
        </Button>
      </div>

      {/* a rejection reason is required — it is the coach's strongest learning signal */}
      <Dialog open={mode === "reject"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why are you rejecting this?</DialogTitle>
            <DialogDescription>
              The coach turns your reason into a playbook rule, so the next proposal differs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. too salesy for this audience — lead with the insight, not the product"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length === 0}
              onClick={() => decide("reject")}
            >
              Reject proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "edit"} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit before approving</DialogTitle>
            <DialogDescription>
              Your edit is stored as a diff and distilled into voice rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-caption">Caption</Label>
            <Textarea
              id="edit-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
            />
            <Label htmlFor="edit-reason">What did you change and why? (optional)</Label>
            <Textarea
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button disabled={pending || caption.trim().length < 10} onClick={() => decide("edit")}>
              Approve with edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
