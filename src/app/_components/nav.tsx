"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ActivityIcon,
  BrainIcon,
  ChartNoAxesColumnIcon,
  InboxIcon,
  SmartphoneIcon,
  SparklesIcon,
} from "lucide-react";

const LINKS = [
  { href: "/feed", label: "Feed", icon: SmartphoneIcon },
  { href: "/approvals", label: "Approvals", icon: InboxIcon },
  { href: "/brain", label: "Brain", icon: BrainIcon },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesColumnIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/onboarding", label: "New world", icon: SparklesIcon },
] as const;

export function Nav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {href === "/approvals" && pendingCount > 0 && (
              <Badge variant="default" className="h-5 min-w-5 justify-center px-1 text-xs">
                {pendingCount}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
