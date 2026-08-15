"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeedPost } from "@/lib/db/queries";
import type { Archetype } from "@/lib/types";
import { generateHeroImageAction } from "@/app/actions";
import { CountUp } from "./count-up";
import { cn } from "@/lib/utils";
import { BookmarkIcon, HeartIcon, MessageCircleIcon } from "lucide-react";

// Placeholder art is set in the palette's own ink, not stock gradient candy —
// each archetype gets a duotone wash so the feed still reads as one publication.
const ARCHETYPE_WASH: Record<Archetype, string> = {
  education: "from-[oklch(0.86_0.05_215)] to-[oklch(0.93_0.03_180)]",
  story: "from-[oklch(0.87_0.06_25)] to-[oklch(0.93_0.03_60)]",
  meme: "from-[oklch(0.89_0.08_75)] to-[oklch(0.94_0.04_45)]",
  product: "from-[oklch(0.87_0.05_155)] to-[oklch(0.93_0.03_120)]",
};

export function PhoneFeed({
  posts,
  brandName,
  followers,
  imageBudgetRemaining,
}: {
  posts: FeedPost[];
  brandName: string;
  followers: number;
  imageBudgetRemaining: number;
}) {
  return (
    <div className="mx-auto w-full max-w-[392px]">
      {/* device: a thin machined bezel rather than a glossy phone mockup */}
      <div className="overflow-hidden rounded-[1.75rem] border border-foreground/15 bg-card p-1.5 ring-1 ring-foreground/5">
        <div className="overflow-hidden rounded-[1.35rem] border">
          <div className="flex items-end justify-between border-b bg-card px-4 py-3">
            <div>
              <div className="display text-[1.15rem] leading-none">Pictogram</div>
              <div className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                @{slug(brandName)}
              </div>
            </div>
            <div className="text-right">
              <CountUp value={followers} className="figure block text-[1.35rem]" />
              <div className="eyebrow mt-0.5">followers</div>
            </div>
          </div>

          <div className="max-h-[74vh] divide-y overflow-y-auto bg-card">
            {posts.length === 0 ? (
              <p className="px-6 py-20 text-center text-[0.82rem] text-muted-foreground">
                Nothing published yet. Approve a proposal, then advance the clock.
              </p>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  brandName={brandName}
                  imageBudgetRemaining={imageBudgetRemaining}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({
  post,
  brandName,
  imageBudgetRemaining,
}: {
  post: FeedPost;
  brandName: string;
  imageBudgetRemaining: number;
}) {
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(false);
  const [burst, setBurst] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();
  const router = useRouter();
  const isBrand = post.authorType === "brand";

  const generate = () =>
    startGenerating(async () => {
      const result = await generateHeroImageAction(post.id);
      setImageError(result.ok ? null : (result.reason ?? "generation failed"));
      router.refresh();
    });

  // double-tap is the platform-native gesture; a click on the art counts as one tap
  const handleDoubleClick = () => {
    setLiked(true);
    setBurst(true);
    window.setTimeout(() => setBurst(false), 650);
  };

  const author = isBrand ? slug(brandName) : (post.ambientAuthor ?? "pictogram");

  return (
    <article className="bg-card">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full font-mono text-[0.6rem] tracking-tight",
            isBrand
              ? "bg-foreground text-background"
              : "border border-border text-muted-foreground",
          )}
        >
          {author.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.8rem]">@{author}</div>
          <div className="font-mono text-[0.62rem] text-muted-foreground">
            {post.publishedLabel}
          </div>
        </div>
        <span className="eyebrow">{post.archetype}</span>
      </header>

      {/* the art director's hero once generated; until then the creative brief
          stands in for the image it describes */}
      <div
        onDoubleClick={handleDoubleClick}
        className={cn(
          "relative flex aspect-square cursor-pointer select-none items-center justify-center overflow-hidden border-y text-center",
          !post.imageUrl && `bg-gradient-to-br px-8 ${ARCHETYPE_WASH[post.archetype]}`,
        )}
      >
        {post.imageUrl ? (
          // plain img: generated files vary (svg in mock, png/webp live) and are
          // local, so there is nothing for the image optimizer to do
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt={post.creativeBrief} className="size-full object-cover" />
        ) : (
          <>
            <span className="eyebrow absolute top-3 left-3 text-neutral-900/40">brief</span>
            <p className="display text-[1.05rem] leading-snug text-neutral-900/75">
              {post.creativeBrief}
            </p>
          </>
        )}
        {burst && (
          <HeartIcon className="pointer-events-none absolute size-24 animate-ping fill-white text-white/90" />
        )}
      </div>

      {isBrand && !post.imageUrl && (
        <div className="flex items-baseline gap-3 border-b px-4 py-2">
          <button
            type="button"
            disabled={generating || imageBudgetRemaining <= 0}
            onClick={generate}
            className="eyebrow border-b border-signal pb-px text-signal transition-opacity hover:opacity-60 disabled:pointer-events-none disabled:opacity-30"
          >
            {generating ? "Generating…" : "Generate hero image"}
          </button>
          <span className="font-mono text-[0.62rem] text-muted-foreground">
            {imageError ?? `${imageBudgetRemaining} left`}
          </span>
        </div>
      )}

      <div className="flex items-center gap-5 px-4 pt-3">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          className="flex items-center gap-1.5 font-mono text-[0.72rem] tabular-nums"
          aria-pressed={liked}
          aria-label="Like"
        >
          <HeartIcon className={cn("size-3.5", liked && "fill-signal text-signal")} />
          <CountUp value={post.metrics.likes + (liked ? 1 : 0)} />
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 font-mono text-[0.72rem] tabular-nums"
          aria-expanded={showComments}
        >
          <MessageCircleIcon className="size-3.5" />
          <CountUp value={post.metrics.comments} />
        </button>
        <span className="flex items-center gap-1.5 font-mono text-[0.72rem] text-muted-foreground tabular-nums">
          <BookmarkIcon className="size-3.5" />
          <CountUp value={post.metrics.saves} />
        </span>
        <span className="ml-auto font-mono text-[0.62rem] text-muted-foreground tabular-nums">
          <CountUp value={post.metrics.impressions} /> seen
        </span>
      </div>

      <div className="px-4 py-2.5 text-[0.82rem] leading-relaxed">
        <span className="font-medium">@{author}</span>{" "}
        <span className="text-muted-foreground">{post.caption}</span>
        {post.hashtags.length > 0 && (
          <span className="mt-1.5 block font-mono text-[0.68rem] text-signal">
            {post.hashtags.join(" ")}
          </span>
        )}
      </div>

      {(post.metrics.linkClicks > 0 || post.metrics.signups > 0) && (
        <div className="mx-4 mb-3 flex gap-5 border-t pt-2">
          {[
            ["clicks", post.metrics.linkClicks],
            ["signups", post.metrics.signups],
            ["dms", post.metrics.dmsStarted],
          ]
            .filter(([, n]) => (n as number) > 0)
            .map(([label, n]) => (
              <span key={label as string} className="flex items-baseline gap-1.5">
                <CountUp
                  value={n as number}
                  className="font-mono text-[0.75rem] text-foreground tabular-nums"
                />
                <span className="eyebrow">{label}</span>
              </span>
            ))}
        </div>
      )}

      {/* comment drawer */}
      {showComments && (
        <div className="border-t bg-muted/40 px-4 py-3">
          {post.comments.length === 0 ? (
            <p className="text-[0.72rem] text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {post.comments.map((comment) => (
                <li key={comment.id} className="text-[0.75rem] leading-relaxed">
                  <span className="font-medium">@{comment.handle}</span>{" "}
                  <span className="text-muted-foreground">{comment.text}</span>
                  <span className="eyebrow ml-1.5">{comment.segment}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
