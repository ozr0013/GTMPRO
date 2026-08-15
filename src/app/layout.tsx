import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Instrument_Sans, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { getWorlds } from "@/lib/db/queries";
import { getCurrentWorld } from "./current-world";
import { Nav } from "./_components/nav";
import { TopBar } from "./_components/top-bar";

// Editorial pairing: a high-contrast serif for display, a refined grotesque for
// body, and a technical mono for every number and label.
const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flywheel — Mission Control",
  description: "A self-improving organic-social GTM agent on Pictogram.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const world = await getCurrentWorld();
  const worlds = getWorlds();

  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="relative z-1 flex min-h-screen flex-1">
          <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
            <Link href="/" className="group block px-5 pt-6 pb-5">
              <div className="display text-[1.6rem]">Flywheel</div>
              <div className="eyebrow mt-1.5 transition-colors group-hover:text-foreground">
                Mission Control
              </div>
            </Link>
            <Nav pendingCount={world?.pendingCount ?? 0} />
            <div className="mt-auto border-t px-5 py-4">
              <p className="eyebrow">Platform</p>
              <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground">
                Pictogram · simulated
              </p>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {world ? (
              <TopBar world={world} worlds={worlds} />
            ) : (
              <header className="border-b px-6 py-4">
                <span className="eyebrow">No world</span>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create one to start the loop.
                </p>
              </header>
            )}
            <main className="flex-1 overflow-x-hidden">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
