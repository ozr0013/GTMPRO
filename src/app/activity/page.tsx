import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getActivity } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  blocked: "text-destructive",
  quarantined: "text-destructive",
  failed: "text-destructive",
  expired: "text-muted-foreground",
  skipped: "text-muted-foreground",
};

export default async function ActivityPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const rows = getActivity(world.id, 250);

  return (
    <div className="rise">
      <section className="mt-4 rounded-3xl bg-card px-6 py-10 md:px-12 md:py-12">
        <p className="eyebrow">Audit trail</p>
        <h1 className="display mt-3 text-[2.75rem] md:text-[3.5rem]">Activity</h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          Every agent step, guardrail block, and human decision, newest first.
        </p>
      </section>

      <section className="mt-4 rounded-3xl bg-card px-4 py-2 md:px-6">
        {rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-[0.95rem] text-muted-foreground">
            No activity yet — run a heartbeat.
          </p>
        ) : (
          <ul className="ruled">
            {rows.map((row) => (
              // metadata line, then the summary as prose — long summaries never
              // get squeezed into a narrow column
              <li key={row.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-mono text-[0.68rem] text-muted-foreground">
                    {row.label}
                  </span>
                  <span className="eyebrow">{row.actor}</span>
                  <span className="font-mono text-[0.68rem] text-muted-foreground/70">
                    {row.action}
                  </span>
                  <span
                    className={`eyebrow ml-auto ${STATUS_COLOR[row.status] ?? "text-muted-foreground/60"}`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-[0.88rem] leading-relaxed text-muted-foreground">
                  {row.summary}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
