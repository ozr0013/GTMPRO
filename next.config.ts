import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // dev-only: preview tooling reaches the dev server over 127.0.0.1, which Next
  // otherwise blocks from loading /_next static chunks (so nothing hydrates)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
