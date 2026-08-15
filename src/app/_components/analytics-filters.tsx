"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ARCHETYPES, TIME_SLOTS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLOTS = Object.keys(TIME_SLOTS);

export function AnalyticsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = (key: string) => params.get(key);

  const toggle = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <FilterRow
        label="Archetype"
        options={ARCHETYPES}
        active={current("archetype")}
        onToggle={(v) => toggle("archetype", v)}
      />
      <FilterRow
        label="Time slot"
        options={SLOTS}
        active={current("timeSlot")}
        onToggle={(v) => toggle("timeSlot", v)}
      />
      {(current("archetype") || current("timeSlot")) && (
        <Button size="xs" variant="ghost" onClick={() => router.push(pathname)}>
          Clear
        </Button>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  active: string | null;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {options.map((option) => (
        <Button
          key={option}
          size="xs"
          variant={active === option ? "default" : "outline"}
          onClick={() => onToggle(option)}
          className={cn("capitalize")}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
