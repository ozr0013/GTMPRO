/**
 * Stable RNG stream key for a post.
 *
 * Row UUIDs are freshly random on every run, so keying an rng stream on `post.id`
 * silently breaks the "identical seeds ⇒ identical sim outcomes" constraint. This
 * derives a key from the post's content and slot instead, which is reproducible
 * across runs of the same seeded scenario.
 */
export function postStreamKey(post: {
  archetype: string;
  topic: string;
  scheduledTick: number;
}): string {
  return `${post.archetype}:${post.topic}:${post.scheduledTick}`;
}
