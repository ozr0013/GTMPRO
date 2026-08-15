import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { getWorlds } from "@/lib/db/queries";
import { getCurrentWorld } from "./current-world";
import { Nav } from "./_components/nav";
import { TopBar } from "./_components/top-bar";

// One heavy grotesque doing display and body, plus a mono for labels and figures.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
    // no h-full / min-h-full here: pinning html to the viewport height breaks the
    // scroll container that `position: sticky` resolves against
    <html lang="en" className={`${archivo.variable} ${mono.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col">
          {/* full-width white nav bar sitting on the grey ground */}
          <header className="sticky top-0 z-30 bg-card">
            <div className="flex items-center gap-6 px-5 py-3.5 md:px-8">
              <Link href="/" className="display shrink-0 text-[1.35rem] tracking-[-0.05em]">
                flywheel
              </Link>
              <Nav pendingCount={world?.pendingCount ?? 0} />
              <Link
                href="/onboarding"
                className="ml-auto shrink-0 rounded-full bg-gradient-to-r from-signal/30 to-signal/10 px-4 py-2 text-[0.7rem] font-bold tracking-widest uppercase transition-opacity hover:opacity-70"
              >
                New World
              </Link>
            </div>
          </header>

          {world ? <TopBar world={world} worlds={worlds} /> : null}

          <main className="flex-1 overflow-x-hidden px-4 pb-14 md:px-8">
            {world ? (
              children
            ) : (
              <div className="mx-auto mt-10 max-w-lg rounded-3xl bg-card p-10 text-center">
                <p className="eyebrow">No world yet</p>
                <h1 className="display mt-3 text-4xl">Grow one to start</h1>
                <Link
                  href="/onboarding"
                  className="mt-7 inline-block rounded-full bg-foreground px-6 py-3 text-[0.7rem] font-bold tracking-widest text-background uppercase"
                >
                  Get started
                </Link>
              </div>
            )}
          </main>
        </div>
      </body>
    </html>
  );
}
