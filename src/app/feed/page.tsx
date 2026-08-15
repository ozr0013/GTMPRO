import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getFeed, getFunnelEvents } from "@/lib/db/queries";
import { getImageBudget } from "@/lib/agents/artdirector";
import { PhoneFeed } from "../_components/phone-feed";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  link_click: "clicked the link",
  signup: "signed up",
  dm_started: "opened a DM",
  meeting_booked: "booked a meeting",
  disqualified: "was disqualified",
};

export default async function FeedPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const posts = getFeed(world.id);
  const events = getFunnelEvents(world.id, 24);
  const imageBudget = getImageBudget(world.id);
  const brandCount = posts.filter((p) => p.authorType === "brand").length;

  return (
    <div className="rise mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="rounded-3xl bg-card px-6 py-8">
        <PhoneFeed
          posts={posts}
          brandName={world.name}
          followers={world.followers}
          imageBudgetRemaining={imageBudget.remaining}
        />
      </div>

      <aside className="space-y-4">
        <section className="rounded-3xl bg-card px-6 py-6">
          <p className="eyebrow">Downstream</p>
          <h2 className="display-sm mt-2 text-[1.4rem]">What the posts caused</h2>
          {events.length === 0 ? (
            <p className="mt-4 text-[0.85rem] text-muted-foreground">
              No funnel events yet. Publish a post and advance the clock.
            </p>
          ) : (
            <ul className="ruled mt-4 max-h-[42vh] overflow-y-auto">
              {events.map((event) => (
                <li key={event.id} className="flex items-baseline gap-3 py-2.5">
                  <span className="w-24 shrink-0 font-mono text-[0.62rem] text-muted-foreground">
                    {event.label}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.8rem] text-muted-foreground">
                    <span
                      className={
                        event.kind === "meeting_booked"
                          ? "rounded bg-foreground px-1 font-bold text-background"
                          : "font-bold text-foreground"
                      }
                    >
                      @{event.handle}
                    </span>{" "}
                    {EVENT_LABEL[event.kind] ?? event.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-card px-6 py-6">
          <p className="eyebrow">Image budget</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="figure text-[2rem]">{imageBudget.used}</span>
            <span className="font-mono text-[0.75rem] text-muted-foreground">
              / {imageBudget.total} spent
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground"
              style={{
                width: `${imageBudget.total > 0 ? (imageBudget.used / imageBudget.total) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="mt-4 text-[0.78rem] leading-relaxed text-muted-foreground">
            {brandCount} brand posts · {posts.length - brandCount} ambient. Posts show their
            creative brief until the art director generates a hero. In{" "}
            <span className="font-mono text-[0.72rem]">MODEL_MODE=mock</span> the hero is a seeded
            local render, so the demo runs with no API keys.
          </p>
          <p className="mt-3 text-[0.78rem] leading-relaxed text-muted-foreground">
            Counts are audience outcomes from the sim — they animate whenever you advance the
            clock.
          </p>
        </section>
      </aside>
    </div>
  );
}
