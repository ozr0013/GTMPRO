import { getWorld, getFeed } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function FeedPage() {
  const world = getWorld();
  if (!world) {
    return <p className="text-sm text-muted-foreground">Seed a world to see the feed.</p>;
  }
  const feed = getFeed(world.id);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Pictogram feed</h1>
      {feed.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing published yet — run a heartbeat, approve a proposal, then advance the clock.
        </p>
      )}
      {feed.map((post) => (
        <Card key={post.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge>{post.archetype}</Badge>
              <span className="text-xs text-muted-foreground">{post.topic}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                tick {post.publishedTick}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/50 via-purple-500/40 to-rose-500/50 p-6">
              <p className="text-center text-sm italic text-foreground/80">{post.creativeBrief}</p>
            </div>
            <p className="text-sm leading-relaxed">{post.caption}</p>
            {post.hashtags.length > 0 && (
              <p className="text-xs text-primary/80">{post.hashtags.join(" ")}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {post.likeCount} likes · {post.commentCount} comments
            </p>
            {post.comments.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-col gap-1.5">
                  {post.comments.map((comment, i) => (
                    <p key={`${post.id}-${i}`} className="text-xs">
                      <span className="font-medium text-muted-foreground">@{comment.handle}</span>{" "}
                      {comment.text}
                    </p>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
