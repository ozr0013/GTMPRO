import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getFeed, getFunnelEvents } from "@/lib/db/queries";
import { getImageBudget } from "@/lib/agents/artdirector";
import { PhoneFeed } from "../_components/phone-feed";
import { SectionHead } from "../_components/section-head";

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
    <div className="rise grid lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="border-b px-6 py-8 lg:border-r lg:px-10">
        <PhoneFeed
          posts={posts}
          brandName={world.name}
          followers={world.followers}
          imageBudgetRemaining={imageBudget.remaining}
        />
      </div>

      <aside>
        <section className="border-b">
          <SectionHead
            title="What the posts caused"
            note={`${events.length} events`}
          />
          {events.length === 0 ? (
            <p className="px-6 py-4 text-[0.82rem] text-muted-foreground">
              No funnel events yet. Publish a post and advance the clock.
            </p>
          ) : (
            <ul className="ruled max-h-[46vh] overflow-y-auto">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex items-baseline gap-3 px-6 py-2.5"
                >
                  <span className="w-24 shrink-0 font-mono text-[0.62rem] text-muted-foreground">
                    {event.label}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.78rem] text-muted-foreground">
                    <span
                      className={
                        event.kind === "meeting_booked"
                          ? "font-medium text-signal"
                          : "font-medium text-foreground"
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

        <section className="border-b">
          <SectionHead title="Reading the feed" />
          <dl className="ruled">
            <div className="px-6 py-3">
              <dt className="eyebrow">Image budget</dt>
              <dd className="mt-1.5 flex items-baseline gap-2">
                <span className="figure text-[1.5rem]">{imageBudget.used}</span>
                <span className="font-mono text-[0.72rem] text-muted-foreground">
                  / {imageBudget.total} spent
                </span>
              </dd>
            </div>
            <div className="px-6 py-3">
              <dt className="eyebrow">Published</dt>
              <dd className="mt-1.5 font-mono text-[0.75rem] text-muted-foreground">
                {brandCount} brand · {posts.length - brandCount} ambient
              </dd>
            </div>
            <div className="px-6 py-3 text-[0.78rem] leading-relaxed text-muted-foreground">
              Posts show their creative brief until the art director generates a hero.
              In <span className="font-mono text-[0.72rem]">MODEL_MODE=mock</span> the
              hero is a seeded local render, so the demo runs with no API keys.
            </div>
            <div className="px-6 py-3 text-[0.78rem] leading-relaxed text-muted-foreground">
              Double-tap a card to like it. Counts animate whenever you advance the clock.
            </div>
          </dl>
        </section>
      </aside>
    </div>
  );
}
