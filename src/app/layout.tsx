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
            <div className="flex items-center gap-4 px-5 py-3.5 md:gap-6 md:px-8">
              <Link href="/" className="display shrink-0 text-[1.35rem] tracking-[-0.05em]">
                flywheel
              </Link>
              <Nav pendingCount={world?.pendingCount ?? 0} />
              <Link
                href="/onboarding"
                className="ml-auto shrink-0 rounded-full border border-border px-4 py-2 text-[0.7rem] font-bold tracking-widest uppercase transition-colors hover:border-foreground"
              >
                New World
              </Link>
            </div>
          </header>

          {world ? <TopBar world={world} worlds={worlds} /> : null}

          {/*
            No empty-state guard here. This used to render a "no world yet, get
            started" card in place of `children` whenever getCurrentWorld() was
            null — which swallowed /onboarding too, the one route that can
            create a world. The card's own button pointed at /onboarding, so a
            fresh database rendered the same card forever with no way out.

            It was also redundant: every page under this layout already does
            `if (!world) redirect("/onboarding")` for itself, which is the right
            place for it — a layout cannot see the pathname, so it cannot know
            which routes the guard should not apply to.
          */}
          <main className="flex-1 overflow-x-hidden px-4 pb-14 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
