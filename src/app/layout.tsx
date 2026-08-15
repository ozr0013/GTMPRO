import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getWorld } from "@/lib/db/queries";
import { advanceTicksAction, heartbeatAction, setModeAction, togglePauseAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PauseSwitch } from "@/components/pause-switch";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flywheel — Mission Control",
  description: "Self-improving GTM agent on Pictogram",
};

// Everything reads live sim state from SQLite; never prerender.
export const dynamic = "force-dynamic";

function simClock(simTick: number): string {
  const day = Math.floor(simTick / 24) + 1;
  const hour = simTick % 24;
  return `Day ${day}, ${String(hour).padStart(2, "0")}:00`;
}

const NAV = [
  { href: "/feed", label: "Feed" },
  { href: "/approvals", label: "Approvals" },
  { href: "/activity", label: "Activity" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const world = getWorld();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="flex w-44 shrink-0 flex-col gap-1 border-r border-border p-4">
            <div className="mb-4 text-lg font-semibold tracking-tight">Flywheel</div>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center gap-3 border-b border-border px-4">
              {world ? (
                <>
                  <span className="font-medium">{world.name}</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {simClock(world.simTick)}
                  </span>
                  <form
                    action={setModeAction.bind(
                      null,
                      world.id,
                      world.mode === "propose" ? "autopilot" : "propose",
                    )}
                  >
                    <Button type="submit" variant="outline" size="xs" title="Toggle mode">
                      {world.mode === "propose" ? "Propose" : "Autopilot"}
                    </Button>
                  </form>
                  <PauseSwitch
                    paused={world.paused}
                    toggleAction={togglePauseAction.bind(null, world.id)}
                  />
                  <div className="ml-auto flex items-center gap-2">
                    <form action={advanceTicksAction.bind(null, world.id, 1)}>
                      <Button type="submit" variant="secondary" size="sm">+1h</Button>
                    </form>
                    <form action={advanceTicksAction.bind(null, world.id, 6)}>
                      <Button type="submit" variant="secondary" size="sm">+6h</Button>
                    </form>
                    <form action={advanceTicksAction.bind(null, world.id, 24)}>
                      <Button type="submit" variant="secondary" size="sm">+1 day</Button>
                    </form>
                    <form action={heartbeatAction.bind(null, world.id)}>
                      <Button type="submit" size="sm">Run heartbeat</Button>
                    </form>
                  </div>
                </>
              ) : (
                <Badge variant="secondary">
                  No world found — run npm run db:seed
                </Badge>
              )}
            </header>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
