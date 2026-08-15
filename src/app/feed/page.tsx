import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getFeed, getFunnelEvents } from "@/lib/db/queries";
import { getImageBudget } from "@/lib/agents/artdirector";
import { PhoneFeed } from "../_components/phone-feed";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  const events = getFunnelEvents(world.id, 20);
  const imageBudget = getImageBudget(world.id);

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <PhoneFeed
          posts={posts}
          brandName={world.name}
          followers={world.followers}
          imageBudgetRemaining={imageBudget.remaining}
        />
      </div>

      <aside className="space-y-4">
        <Card className="gap-3 p-4">
          <h2 className="font-heading text-sm font-medium">What the posts caused</h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No funnel events yet. Publish a post and advance the clock.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-2">
                  <Badge
                    variant={event.kind === "meeting_booked" ? "default" : "outline"}
                    className="mt-0.5 shrink-0 text-[10px]"
                  >
                    {event.label}
                  </Badge>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">@{event.handle}</span>{" "}
                    {EVENT_LABEL[event.kind] ?? event.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-2 p-4 text-xs text-muted-foreground">
          <h2 className="font-heading text-sm font-medium text-foreground">Reading the feed</h2>
          <p>
            Posts show their creative brief until the art director generates a hero image —{" "}
            {imageBudget.used}/{imageBudget.total} of the image budget spent.
          </p>
          <p>
            In <code className="font-mono">MODEL_MODE=mock</code> the hero is a seeded local render,
            so the demo works with no API keys.
          </p>
          <p>Double-tap a card to like it. Counts animate whenever you advance the sim clock.</p>
        </Card>
      </aside>
    </div>
  );
}
