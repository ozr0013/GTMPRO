"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Numbered like a contents page. The index is the whole ornament — no icons,
// no pills, just a rule that fills in on the active row.
const LINKS = [
  { href: "/feed", label: "Feed" },
  { href: "/approvals", label: "Approvals" },
  { href: "/brain", label: "Brain" },
  { href: "/analytics", label: "Analytics" },
  { href: "/activity", label: "Activity" },
  { href: "/onboarding", label: "New world" },
] as const;

export function Nav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="mt-2 flex flex-col border-t">
      {LINKS.map(({ href, label }, i) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-baseline gap-3 border-b px-5 py-3 transition-colors",
              active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50",
            )}
          >
            <span
              className={cn(
                "font-mono text-[0.625rem] tabular-nums transition-colors",
                active ? "text-signal" : "text-muted-foreground/60",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={cn(
                "flex-1 text-[0.9rem] transition-colors",
                active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {label}
            </span>
            {href === "/approvals" && pendingCount > 0 && (
              <span className="font-mono text-[0.7rem] text-signal tabular-nums">
                {pendingCount}
              </span>
            )}
            {active && <span className="absolute inset-y-0 left-0 w-[2px] bg-signal" />}
          </Link>
        );
      })}
    </nav>
  );
}
