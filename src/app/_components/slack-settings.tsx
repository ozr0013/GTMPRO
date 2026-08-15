"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSlackSettingsAction, testSlackAction } from "@/app/actions";
import { ALL_KINDS } from "@/lib/notify/activityNotifier";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const KIND_COPY: Record<string, string> = {
  approval: "Something needs your decision",
  published: "A post went live on Pictogram",
  learned: "The playbook changed",
  blocked: "A guardrail stopped an action",
  meeting: "A DM converted to a meeting",
};

export interface SlackSettingsProps {
  worldId: string;
  enabled: boolean;
  target: string;
  kinds: string[];
  readiness: {
    hasToken: boolean;
    hasWebhook: boolean;
    deliverable: boolean;
    transport: "dm" | "webhook" | null;
  };
}

export function SlackSettings({ worldId, enabled, target, kinds, readiness }: SlackSettingsProps) {
  const [on, setOn] = useState(enabled);
  const [who, setWho] = useState(target);
  const [selected, setSelected] = useState<string[]>(kinds);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ sent: boolean; reason?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const save = () =>
    startTransition(async () => {
      await saveSlackSettingsAction(worldId, { enabled: on, target: who, kinds: selected });
      setSaved(true);
      setTestResult(null);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    });

  const test = () =>
    startTransition(async () => {
      // save first, so the test uses exactly what is on screen
      await saveSlackSettingsAction(worldId, { enabled: on, target: who, kinds: selected });
      setTestResult(await testSlackAction(worldId));
      router.refresh();
    });

  const toggleKind = (kind: string) =>
    setSelected((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));

  return (
    <section className="mt-4 rounded-3xl bg-card px-6 py-7 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Notifications</p>
          <h2 className="display-sm mt-2 text-[1.6rem]">Send approvals to Slack</h2>
          <p className="mt-2 max-w-xl text-[0.88rem] leading-relaxed text-muted-foreground">
            Propose mode only works if someone knows there is something to decide. Route it to
            your phone.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2.5">
          <Switch checked={on} disabled={pending} onCheckedChange={setOn} />
          <span className="eyebrow">{on ? "On" : "Off"}</span>
        </label>
      </div>

      {/* credentials live in env on purpose — this DB is committed to git */}
      <div
        className={cn(
          "mt-6 rounded-2xl px-4 py-3 text-[0.82rem]",
          readiness.deliverable ? "bg-muted" : "border border-dashed border-foreground/40 bg-muted/40",
        )}
      >
        {readiness.deliverable ? (
          <span>
            Connected via{" "}
            <span className="font-bold">
              {readiness.transport === "dm" ? "bot token (direct message)" : "incoming webhook"}
            </span>
            .
          </span>
        ) : (
          <span>
            <span className="font-bold">Not connected.</span> Add{" "}
            <span className="font-mono text-[0.75rem]">SLACK_BOT_TOKEN</span> (plus a handle
            below) or <span className="font-mono text-[0.75rem]">SLACK_WEBHOOK_URL</span> to{" "}
            <span className="font-mono text-[0.75rem]">.env.local</span> and restart.
          </span>
        )}
        <span className="mt-1.5 block text-muted-foreground">
          Tokens stay in env, never in the database — this project commits{" "}
          <span className="font-mono text-[0.72rem]">demo-snapshot.db</span>, so a secret stored
          here would be pushed to GitHub.
        </span>
      </div>

      <div className="mt-6 max-w-md space-y-2">
        <Label htmlFor="slack-target" className="eyebrow">
          Send to
        </Label>
        <Input
          id="slack-target"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          placeholder="@yourhandle, you@company.com, or U01ABCDEFG"
          disabled={pending}
          className="rounded-xl"
        />
        <p className="text-[0.78rem] leading-relaxed text-muted-foreground">
          Handles and emails are resolved to a Slack user id. A personal address (gmail and
          the like) works <span className="italic">if it is the email on your Slack profile</span>
          {" "}— it is your Slack account being looked up, not your mailbox. Leave blank to use the{" "}
          <span className="font-mono text-[0.72rem]">SLACK_DM_TARGET</span> default, or when
          posting to a webhook channel.
        </p>
      </div>

      <div className="mt-6">
        <p className="eyebrow">Notify me when</p>
        <div className="mt-3 space-y-2">
          {ALL_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted"
            >
              <Switch
                size="sm"
                checked={selected.includes(kind)}
                disabled={pending}
                onCheckedChange={() => toggleKind(kind)}
              />
              <span className="text-[0.85rem]">{KIND_COPY[kind]}</span>
              <span className="eyebrow ml-auto">{kind}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-foreground px-6 py-2.5 text-[0.7rem] font-bold tracking-widest text-background uppercase transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {saved ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={test}
          disabled={pending || !readiness.deliverable}
          className="rounded-full bg-muted px-6 py-2.5 text-[0.7rem] font-bold tracking-widest uppercase transition-colors hover:bg-accent disabled:opacity-30"
        >
          Send test message
        </button>
        {testResult && (
          <span
            className={cn(
              "text-[0.82rem]",
              testResult.sent ? "text-muted-foreground" : "font-bold text-foreground",
            )}
          >
            {testResult.sent ? "Sent — check your phone." : `Failed: ${testResult.reason}`}
          </span>
        )}
      </div>
    </section>
  );
}
