// One command for the live demo: reset to the committed snapshot and start the app
// against a throwaway copy, in mock mode.
//
//   npm run demo
//
// Why a copy: clicking through the demo writes to the DB. Running against
// demo-snapshot.db directly would dirty the committed file, so the second
// rehearsal starts from a different state than the first — and the real run
// starts from wherever you left it. This resets every time.
//
// Why mock mode: a sim-day advance on local models takes minutes. Mock is instant
// and the learning machinery is identical; only the prose is canned.

import { copyFileSync, existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SNAPSHOT = resolve(process.cwd(), "demo-snapshot.db");
const RUNTIME = resolve(process.cwd(), "demo-run.db");

if (!existsSync(SNAPSHOT)) {
  console.error("demo-snapshot.db is missing — build it with: npx tsx scripts/build-demo.ts");
  process.exit(1);
}

// clear the previous run, sidecars included, or SQLite will replay stale WAL pages
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${RUNTIME}${suffix}`, { force: true });
copyFileSync(SNAPSHOT, RUNTIME);

console.log("demo-run.db reset from demo-snapshot.db");
console.log("mock mode · http://localhost:3000 · Ctrl+C to stop\n");

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DB_PATH: "./demo-run.db",
    MODEL_MODE: "mock",
    // force cloud/mock even if .env.local is configured for Ollama — a live demo
    // must never wait on a local model
    MODEL_PROVIDER: "cloud",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
