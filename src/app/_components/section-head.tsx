import Link from "next/link";

/**
 * The one section marker used across every page: tracked mono eyebrow, hairline
 * beneath, optional link on the baseline. Keeps rhythm consistent so pages read
 * as chapters of the same document.
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
    <div className="flex items-baseline justify-between gap-4 border-b px-6 py-3 md:px-10">
      <div className="flex items-baseline gap-3">
        <h2 className="eyebrow">{title}</h2>
        {note && <span className="text-[0.75rem] text-muted-foreground">{note}</span>}
      </div>
      {href && cta && (
        <Link
          href={href}
          className="eyebrow shrink-0 transition-colors hover:text-signal"
        >
          {cta} →
        </Link>
      )}
    </div>
  );
}
