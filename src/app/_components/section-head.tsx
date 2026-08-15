import Link from "next/link";

/**
 * Big bold section headline with a hairline beneath and an optional link on the
 * baseline — the "What Makes Speedrun Different" pattern.
 */
export function SectionHead({
  title,
  href,
  cta,
  note,
}: {
  title: string;
  href?: string;
  cta?: string;
  note?: string;
}) {
  return (
    <div className="mt-10 mb-5 border-b pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="display text-[2rem] md:text-[2.5rem]">{title}</h2>
        {href && cta && (
          <Link
            href={href}
            className="text-[0.72rem] font-bold tracking-widest uppercase transition-colors hover:text-muted-foreground"
          >
            {cta} →
          </Link>
        )}
      </div>
      {note && <p className="mt-2 text-[0.9rem] text-muted-foreground">{note}</p>}
    </div>
  );
}
