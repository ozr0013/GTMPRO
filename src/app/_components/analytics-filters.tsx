"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ARCHETYPES, TIME_SLOTS } from "@/lib/types";
import { cn } from "@/lib/utils";

const SLOTS = Object.keys(TIME_SLOTS);

export function AnalyticsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const toggle = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const filtered = params.get("archetype") || params.get("timeSlot");

  return (
    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b px-6 py-3 md:px-10">
      <FilterRow
        label="Archetype"
        options={ARCHETYPES}
        active={params.get("archetype")}
        onToggle={(v) => toggle("archetype", v)}
      />
      <FilterRow
        label="Slot"
        options={SLOTS}
        active={params.get("timeSlot")}
        onToggle={(v) => toggle("timeSlot", v)}
      />
      {filtered && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="eyebrow ml-auto border-b border-muted-foreground pb-0.5 hover:text-foreground"
        >
          Clear
        </button>
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
    <div className="flex items-baseline gap-3">
      <span className="eyebrow">{label}</span>
      <div className="flex items-baseline gap-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={cn(
              "border-b pb-0.5 font-mono text-[0.7rem] transition-colors",
              active === option
                ? "border-foreground font-bold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
