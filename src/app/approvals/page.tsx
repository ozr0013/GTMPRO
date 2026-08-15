import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getPendingProposals } from "@/lib/db/queries";
import { ProposalCard } from "../_components/proposal-card";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const proposals = getPendingProposals(world.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {proposals.length === 0
            ? "Nothing waiting on you."
            : `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} waiting on a decision.`}
        </p>
      </div>

      {proposals.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {world.mode === "autopilot"
            ? "Autopilot is on — only sensitive actions land here."
            : "Run a heartbeat to generate the next proposal."}
        </Card>
      ) : (
        proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)
      )}
    </div>
  );
}
