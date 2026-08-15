import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getWorlds } from "@/lib/db/queries";
import { getCurrentWorld } from "./current-world";
import { Nav } from "./_components/nav";
import { TopBar } from "./_components/top-bar";

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
  description: "A self-improving organic-social GTM agent on Pictogram.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const world = await getCurrentWorld();
  const worlds = getWorlds();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex min-h-screen flex-1">
          <aside className="hidden w-52 shrink-0 flex-col border-r bg-sidebar md:flex">
            <Link href="/" className="flex items-center gap-2 px-4 py-3.5">
              <span className="size-5 rounded-md bg-gradient-to-br from-amber-400 to-rose-500" />
              <span className="font-heading text-sm font-semibold">Flywheel</span>
            </Link>
            <Nav pendingCount={world?.pendingCount ?? 0} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {world ? (
              <TopBar world={world} worlds={worlds} />
            ) : (
              <header className="border-b px-4 py-2.5 text-sm text-muted-foreground">
                No world yet — create one to start.
              </header>
            )}
            <main className="flex-1 overflow-x-hidden">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
