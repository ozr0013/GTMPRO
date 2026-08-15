"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/approvals", label: "Approvals" },
  { href: "/brain", label: "Brain" },
  { href: "/analytics", label: "Analytics" },
  { href: "/activity", label: "Activity" },
] as const;

/** Inline nav in the masthead: bold, tracked, uppercase — no icons, no chrome. */
export function Nav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-6 md:flex">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative text-[0.72rem] font-bold tracking-widest uppercase transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {href === "/approvals" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-signal align-middle font-mono text-[0.6rem] text-white tabular-nums">
                {pendingCount}
              </span>
            )}
            {active && (
              <span className="absolute -bottom-1.5 left-0 h-[2px] w-full rounded-full bg-foreground" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
