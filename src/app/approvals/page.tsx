import { getWorld, getPendingProposals } from "@/lib/db/queries";
import { decideAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

async function approveAction(proposalId: string): Promise<void> {
  "use server";
  await decideAction(proposalId, "approve");
}

async function rejectAction(proposalId: string, formData: FormData): Promise<void> {
  "use server";
  await decideAction(proposalId, "reject", String(formData.get("reason") ?? ""));
}

async function editAction(proposalId: string, formData: FormData): Promise<void> {
  "use server";
  await decideAction(proposalId, "edit", undefined, String(formData.get("caption") ?? ""));
}

function formatRange(range: [number, number]): string {
  return `${range[0]}–${range[1]}`;
}

export default function ApprovalsPage() {
  const world = getWorld();
  if (!world) {
    return <p className="text-sm text-muted-foreground">Seed a world to review proposals.</p>;
  }
  const pending = getPendingProposals(world.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Approvals</h1>
      {pending.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No pending proposals — run a heartbeat to get new ones.
        </p>
      )}
      {pending.map((proposal) => (
        <Card key={proposal.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge>{proposal.kind}</Badge>
              <Badge variant={proposal.riskClass === "sensitive" ? "destructive" : "outline"}>
                {proposal.riskClass}
              </Badge>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                proposed tick {proposal.createdTick}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {proposal.kind === "post" ? (
              <div className="flex flex-col gap-1">
                <p className="text-sm leading-relaxed">{proposal.payload.caption}</p>
                <p className="text-xs text-muted-foreground">
                  {proposal.payload.archetype} · {proposal.payload.timeSlot} ·{" "}
                  {proposal.payload.topic} · publishes tick {proposal.payload.scheduledTick}
                </p>
                {(proposal.payload.hashtags?.length ?? 0) > 0 && (
                  <p className="text-xs text-primary/80">{proposal.payload.hashtags?.join(" ")}</p>
                )}
              </div>
            ) : (
              <p className="text-sm">
                DM reply ({proposal.payload.qualification}): {proposal.payload.text}
              </p>
            )}

            <p className="text-sm text-muted-foreground">Why: {proposal.reasoning}</p>

            {proposal.ruleIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {proposal.ruleIds.map((ruleId) => (
                  <Badge key={ruleId} variant="secondary">
                    {ruleId}
                  </Badge>
                ))}
              </div>
            )}

            <p className="font-mono text-xs text-muted-foreground">
              predicted: impressions {formatRange(proposal.predictedEffect.impressions)} · likes{" "}
              {formatRange(proposal.predictedEffect.likes)} · clicks{" "}
              {formatRange(proposal.predictedEffect.linkClicks)} · signups{" "}
              {formatRange(proposal.predictedEffect.signups)}
            </p>

            <Separator />

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <form action={approveAction.bind(null, proposal.id)}>
                  <Button type="submit" size="sm">Approve</Button>
                </form>
                <form
                  action={rejectAction.bind(null, proposal.id)}
                  className="flex flex-1 items-center gap-2"
                >
                  <Input name="reason" placeholder="Reason for rejection (required)" required />
                  <Button type="submit" variant="destructive" size="sm">Reject</Button>
                </form>
              </div>
              {proposal.kind === "post" && (
                <form action={editAction.bind(null, proposal.id)} className="flex flex-col gap-2">
                  <Textarea name="caption" defaultValue={proposal.payload.caption ?? ""} required />
                  <Button type="submit" variant="outline" size="sm" className="self-start">
                    Save edit &amp; approve
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
