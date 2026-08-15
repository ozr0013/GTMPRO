"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorldAction, type GenesisResult } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STEPS = [
  "Deriving audience segments",
  "Growing personas with hidden preferences",
  "Hiding the ground-truth affinity matrix",
  "Writing seed hypotheses into playbook v1",
] as const;

const STEP_MS = 420;

export function GenesisForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenesisResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // walk the progress list while the action runs; each line names real genesis work
  useEffect(() => {
    if (!pending || step >= STEPS.length - 1) return;
    const timer = window.setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [pending, step]);

  const submit = () => {
    setStep(0);
    setError(null);
    startTransition(async () => {
      try {
        const created = await createWorldAction(name.trim(), description.trim());
        setStep(STEPS.length - 1);
        setResult(created);
      } catch (e) {
        // live-mode genesis throws when the model call fails — surface it
        setError(e instanceof Error ? e.message : "World genesis failed");
        setStep(-1);
      }
    });
  };

  if (result) {
    return (
      <div className="rise">
        <div className="border-b px-6 py-8 md:px-10">
          <p className="eyebrow">World grown</p>
          <h2 className="display mt-2.5 text-[2.25rem]">{result.name}</h2>
          <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
            The agent does not get to see any of this — it has to discover it from outcomes.
          </p>
        </div>

        <div className="grid border-b sm:grid-cols-3 [&>*]:-mr-px [&>*]:border-r">
          <div className="px-6 py-5 md:px-10">
            <p className="eyebrow">Personas</p>
            <p className="figure mt-2 text-[2.5rem]">{result.personaCount}</p>
          </div>
          <div className="px-6 py-5 md:px-10">
            <p className="eyebrow">Segments</p>
            <ul className="mt-2 space-y-1">
              {result.segments.map((s) => (
                <li key={s} className="font-mono text-[0.72rem]">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="px-6 py-5 md:px-10">
            <p className="eyebrow">Content pillars</p>
            <ul className="mt-2 space-y-1">
              {result.topics.map((t) => (
                <li key={t} className="font-mono text-[0.72rem]">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-6 py-6 md:px-10">
          <button
            type="button"
            onClick={() => {
              router.push("/");
              router.refresh();
            }}
            className="bg-foreground px-6 py-2.5 font-mono text-[0.72rem] tracking-widest text-background uppercase transition-opacity hover:opacity-80"
          >
            Enter Mission Control →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl px-6 py-8 md:px-10">
      <div className="space-y-2">
        <Label htmlFor="brand-name" className="eyebrow">
          Brand name
        </Label>
        <Input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="TestBrew"
          disabled={pending}
          className="rounded-none border-x-0 border-t-0 border-b bg-transparent px-0 text-[1.15rem] shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="mt-8 space-y-2">
        <Label htmlFor="product" className="eyebrow">
          What are you selling?
        </Label>
        <Textarea
          id="product"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cold brew concentrate for coffee obsessives who care about extraction."
          rows={4}
          disabled={pending}
          className="rounded-none border-x-0 border-t-0 border-b bg-transparent px-0 text-[0.95rem] shadow-none focus-visible:ring-0"
        />
        <p className="pt-1 text-[0.78rem] leading-relaxed text-muted-foreground">
          This seeds the world: segments, personas, and the hidden affinity matrix the agent has
          to reverse-engineer.
        </p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={pending || name.trim().length < 2 || description.trim().length < 10}
        className="mt-8 bg-foreground px-6 py-2.5 font-mono text-[0.72rem] tracking-widest text-background uppercase transition-opacity hover:opacity-80 disabled:opacity-30"
      >
        {pending ? "Growing…" : "Grow the world"}
      </button>

      {error && (
        <p className="mt-4 border-l-2 border-foreground pl-3 text-[0.8rem] font-medium">
          {error}
        </p>
      )}

      {step >= 0 && !error && (
        <ol className="ruled mt-8 border-t">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-baseline gap-3 py-2.5">
              <span
                className={`font-mono text-[0.62rem] tabular-nums ${
                  i <= step ? "font-bold text-foreground" : "text-muted-foreground/40"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`text-[0.82rem] ${
                  i < step || result
                    ? "text-muted-foreground"
                    : i === step
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                }`}
              >
                {label}
              </span>
              {i < step && <span className="eyebrow ml-auto">done</span>}
              {i === step && pending && <span className="eyebrow ml-auto">running</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
