import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getPendingProposals } from "@/lib/db/queries";
import { ProposalCard } from "../_components/proposal-card";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const proposals = getPendingProposals(world.id);

  return (
    <div className="rise">
      <header className="border-b px-6 py-8 md:px-10 md:py-10">
        <p className="eyebrow">Awaiting your decision</p>
        <h1 className="display mt-2.5 text-[2.25rem]">Approvals</h1>
        <p className="mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          {proposals.length === 0
            ? "Nothing waiting on you."
            : `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} the agent wants to run. Rejecting with a reason is the strongest signal the coach gets.`}
        </p>
      </header>

      {proposals.length === 0 ? (
        <div className="px-6 py-16 text-center md:px-10">
          <p className="text-[0.9rem] text-muted-foreground">
            {world.mode === "autopilot"
              ? "Autopilot is on — only sensitive actions land here."
              : "Run a heartbeat to generate the next proposal."}
          </p>
        </div>
      ) : (
        proposals.map((proposal, i) => (
          <ProposalCard key={proposal.id} proposal={proposal} index={i} />
        ))
      )}
    </div>
  );
}
