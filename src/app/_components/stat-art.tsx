/**
 * Oversized typographic art: the value repeated down the block, each repeat
 * clipped harder than the last so it reads as one figure dissolving into the
 * card. A rotated label runs up the left edge.
 *
 * This is the graphic slot in a card — it stands where a product photo would.
 */
export function StatArt({
  value,
  label,
  rows = 4,
}: {
  value: string;
  label?: string;
  rows?: number;
}) {
  return (
    <div className="relative flex items-center justify-center overflow-hidden px-6 py-10">
      {label && (
        <span
          className="eyebrow absolute top-1/2 left-4 -translate-y-1/2 whitespace-nowrap"
          style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}
        >
          {label}
        </span>
      )}
      <div className="flex flex-col items-center" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <span
            key={i}
            className="stat-art block text-[clamp(2.5rem,9vw,4.5rem)]"
            style={{
              // each repeat keeps less of its top edge, so the stack fades downward
              clipPath: `inset(0 0 ${i * (100 / rows)}% 0)`,
              opacity: 1 - i * 0.05,
              marginTop: i === 0 ? 0 : "-0.08em",
            }}
          >
            {value}
          </span>
        ))}
      </div>
      <span className="sr-only">{value}</span>
    </div>
  );
}
