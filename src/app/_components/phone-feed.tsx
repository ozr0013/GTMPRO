"use client";

import { useState } from "react";
import type { FeedPost } from "@/lib/db/queries";
import type { Archetype } from "@/lib/types";
import { CountUp } from "./count-up";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  BookOpenIcon,
  BookmarkIcon,
  HeartIcon,
  LaughIcon,
  MessageCircleIcon,
  PackageIcon,
  SparklesIcon,
} from "lucide-react";

const ARCHETYPE_STYLE: Record<Archetype, { icon: typeof BookOpenIcon; gradient: string }> = {
  education: { icon: BookOpenIcon, gradient: "from-sky-400 via-cyan-300 to-emerald-300" },
  story: { icon: SparklesIcon, gradient: "from-violet-400 via-fuchsia-300 to-rose-300" },
  meme: { icon: LaughIcon, gradient: "from-amber-300 via-orange-300 to-rose-300" },
  product: { icon: PackageIcon, gradient: "from-emerald-400 via-teal-300 to-sky-300" },
};

export function PhoneFeed({
  posts,
  brandName,
  followers,
}: {
  posts: FeedPost[];
  brandName: string;
  followers: number;
}) {
  return (
    <div className="mx-auto w-full max-w-[400px]">
      {/* phone frame */}
      <div className="overflow-hidden rounded-[2.25rem] border-8 border-neutral-900 bg-background shadow-2xl dark:border-neutral-800">
        <div className="flex items-center justify-between border-b bg-background px-4 py-3">
          <div>
            <div className="font-heading text-sm font-semibold">Pictogram</div>
            <div className="text-[11px] text-muted-foreground">@{slug(brandName)}</div>
          </div>
          <div className="text-right">
            <CountUp
              value={followers}
              className="font-heading text-sm font-semibold tabular-nums"
            />
            <div className="text-[11px] text-muted-foreground">followers</div>
          </div>
        </div>

        <div className="max-h-[70vh] divide-y overflow-y-auto">
          {posts.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-muted-foreground">
              Nothing published yet. Approve a proposal, then advance the clock.
            </p>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} brandName={brandName} />)
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, brandName }: { post: FeedPost; brandName: string }) {
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(false);
  const [burst, setBurst] = useState(false);
  const style = ARCHETYPE_STYLE[post.archetype];
  const Icon = style.icon;

  // double-tap is the platform-native gesture; a click on the art counts as one tap
  const handleDoubleClick = () => {
    setLiked(true);
    setBurst(true);
    window.setTimeout(() => setBurst(false), 650);
  };

  const author = post.authorType === "brand" ? slug(brandName) : (post.ambientAuthor ?? "pictogram");

  return (
    <article className="bg-background">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span
          className={cn(
            "size-7 rounded-full bg-gradient-to-br p-[2px]",
            post.authorType === "brand" ? "from-amber-400 to-rose-500" : "from-neutral-300 to-neutral-400",
          )}
        >
          <span className="flex size-full items-center justify-center rounded-full bg-background text-[10px] font-semibold">
            {author.slice(0, 2).toUpperCase()}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">@{author}</div>
          <div className="text-[10px] text-muted-foreground">{post.publishedLabel}</div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {post.archetype}
        </Badge>
      </header>

      {/* placeholder art: the creative brief rendered as the image the art director would make */}
      <div
        onDoubleClick={handleDoubleClick}
        className={cn(
          "relative flex aspect-square cursor-pointer select-none items-center justify-center bg-gradient-to-br p-6 text-center",
          style.gradient,
        )}
      >
        <Icon className="absolute top-3 left-3 size-4 text-neutral-900/40" />
        <p className="font-heading text-sm leading-snug font-medium text-neutral-900/80">
          {post.creativeBrief}
        </p>
        {burst && (
          <HeartIcon className="pointer-events-none absolute size-24 animate-ping fill-white text-white/90" />
        )}
      </div>

      <div className="flex items-center gap-4 px-3 pt-2.5">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          className="flex items-center gap-1.5 text-xs"
          aria-pressed={liked}
          aria-label="Like"
        >
          <HeartIcon className={cn("size-4", liked && "fill-rose-500 text-rose-500")} />
          <CountUp value={post.metrics.likes + (liked ? 1 : 0)} className="tabular-nums" />
        </button>
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-xs"
          aria-expanded={showComments}
        >
          <MessageCircleIcon className="size-4" />
          <CountUp value={post.metrics.comments} className="tabular-nums" />
        </button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookmarkIcon className="size-4" />
          <CountUp value={post.metrics.saves} className="tabular-nums" />
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          <CountUp value={post.metrics.impressions} /> seen
        </span>
      </div>

      <div className="px-3 py-2 text-xs leading-relaxed">
        <span className="font-semibold">@{author}</span> {post.caption}
        {post.hashtags.length > 0 && (
          <span className="mt-1 block text-sky-600 dark:text-sky-400">
            {post.hashtags.join(" ")}
          </span>
        )}
      </div>

      {(post.metrics.linkClicks > 0 || post.metrics.signups > 0) && (
        <div className="mx-3 mb-2 flex gap-3 rounded-lg bg-muted px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <span>
            <CountUp value={post.metrics.linkClicks} className="font-semibold tabular-nums" /> clicks
          </span>
          <span>
            <CountUp value={post.metrics.signups} className="font-semibold tabular-nums" /> signups
          </span>
          {post.metrics.dmsStarted > 0 && (
            <span>
              <CountUp value={post.metrics.dmsStarted} className="font-semibold tabular-nums" /> DMs
            </span>
          )}
        </div>
      )}

      {/* comment drawer */}
      {showComments && (
        <div className="border-t bg-muted/40 px-3 py-2.5">
          {post.comments.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="space-y-2">
              {post.comments.map((comment) => (
                <li key={comment.id} className="text-[11px] leading-relaxed">
                  <span className="font-semibold">@{comment.handle}</span>{" "}
                  <span className="text-muted-foreground">{comment.text}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground/70">
                    · {comment.segment}
                  </span>
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
