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
      <header className="border-b px-6 py-8 md:px-10 md:py-10">
        <p className="eyebrow">Audit trail</p>
        <h1 className="display mt-2.5 text-[2.25rem]">Activity</h1>
        <p className="mt-3 max-w-lg text-[0.9rem] leading-relaxed text-muted-foreground">
          Every agent step, guardrail block, and human decision, newest first.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="px-6 py-16 text-center text-[0.9rem] text-muted-foreground md:px-10">
          No activity yet — run a heartbeat.
        </p>
      ) : (
        <ul className="ruled">
          {rows.map((row) => (
            // log entry: a metadata line, then the summary as prose beneath it —
            // avoids squeezing long summaries into a narrow table column
            <li
              key={row.id}
              className="px-6 py-3 transition-colors hover:bg-muted/40 md:px-10"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-[0.65rem] text-muted-foreground">{row.label}</span>
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
              <p className="mt-1 max-w-3xl text-[0.85rem] leading-relaxed text-muted-foreground">
                {row.summary}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
