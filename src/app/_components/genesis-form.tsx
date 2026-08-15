"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorldAction, type GenesisResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRightIcon, CheckIcon, Loader2Icon } from "lucide-react";

const STEPS = [
  "Deriving audience segments…",
  "Growing personas with hidden preferences…",
  "Hiding the ground-truth affinity matrix…",
  "Writing seed hypotheses into playbook v1…",
] as const;

const STEP_MS = 420;

export function GenesisForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [step, setStep] = useState(-1);
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
    startTransition(async () => {
      const created = await createWorldAction(name.trim(), description.trim());
      setStep(STEPS.length - 1);
      setResult(created);
    });
  };

  if (result) {
    return (
      <Card className="gap-4 p-5">
        <div>
          <h2 className="font-heading text-base font-semibold">{result.name} is live on Pictogram</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The agent does not get to see any of this — it has to discover it from outcomes.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Personas</div>
            <div className="font-heading text-2xl font-semibold tabular-nums">
              {result.personaCount}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Segments</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.segments.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Content pillars</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.topics.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <Button
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
        >
          Enter Mission Control
          <ArrowRightIcon />
        </Button>
      </Card>
    );
  }

  return (
    <Card className="gap-4 p-5">
      <div className="space-y-2">
        <Label htmlFor="brand-name">Brand name</Label>
        <Input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="TestBrew"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="product">What are you selling?</Label>
        <Textarea
          id="product"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cold brew concentrate for coffee obsessives who care about extraction."
          rows={4}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          This seeds the world: segments, personas, and the hidden affinity matrix the agent has to
          reverse-engineer.
        </p>
      </div>

      <Button
        onClick={submit}
        disabled={pending || name.trim().length < 2 || description.trim().length < 10}
      >
        {pending && <Loader2Icon className="animate-spin" />}
        Grow the world
      </Button>

      {step >= 0 && (
        <ul className="space-y-1.5 border-t pt-3">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={
                i <= step ? "flex items-center gap-2 text-xs" : "flex items-center gap-2 text-xs opacity-40"
              }
            >
              {i < step || result ? (
                <CheckIcon className="size-3.5 text-emerald-500" />
              ) : i === step ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <span className="size-3.5" />
              )}
              {label}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
