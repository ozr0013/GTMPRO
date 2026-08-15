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
      <section className="mt-4 rounded-3xl bg-card px-6 py-10 md:px-12 md:py-12">
        <p className="eyebrow">Awaiting your decision</p>
        <h1 className="display mt-3 text-[2.75rem] md:text-[3.5rem]">Approvals</h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          {proposals.length === 0
            ? "Nothing waiting on you."
            : `${proposals.length} proposal${proposals.length === 1 ? "" : "s"} the agent wants to run. Rejecting with a reason is the strongest signal the coach gets.`}
        </p>
      </section>

      {proposals.length === 0 ? (
        <div className="mt-4 rounded-3xl bg-card px-6 py-16 text-center">
          <p className="text-[0.95rem] text-muted-foreground">
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
