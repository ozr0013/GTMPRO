import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __flywheelDb?: ReturnType<typeof create> };

/**
 * Bootstrap the schema from the committed drizzle-kit SQL (./drizzle/*.sql).
 * Makes fresh file DBs and per-process in-memory test DBs work with zero setup.
 * (Decision D17 — see docs/DECISIONS.md.)
 */
function bootstrap(sqlite: Database.Database) {
  const hasWorlds = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='worlds'")
    .get();
  if (hasWorlds) return;
  const dir = path.join(process.cwd(), "drizzle");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }
}

/**
 * Additive column migration.
 *
 * `bootstrap` only fires when the schema is absent entirely, so a column added to
 * schema.ts after a DB exists would be missing everywhere that matters — the
 * committed demo-snapshot.db and every teammate's local flywheel.db — and every
 * select touching it would throw. SQLite has no `ADD COLUMN IF NOT EXISTS`, so
 * check PRAGMA first. Idempotent, and cheap enough to run on every open.
 *
 * Additive only, by the same rule that governs schema.ts: never drop or retype
 * here, or an older checkout will fail against a newer DB.
 */
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: "outcome_reports", column: "suggested_lessons", ddl: "TEXT" },
  { table: "settings", column: "slack_target", ddl: "TEXT" },
  { table: "settings", column: "slack_notify", ddl: "TEXT" },
  { table: "settings", column: "slack_enabled", ddl: "INTEGER NOT NULL DEFAULT 0" },
];

function ensureColumns(sqlite: Database.Database) {
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const exists = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((c) => c.name === column)) continue;
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Where the SQLite file lives.
 *
 * Locally this is just DB_PATH (or ./flywheel.db). On a serverless host the
 * deployment bundle is read-only, so opening ./flywheel.db yields an empty
 * database that cannot be written — which presents as "no world yet", every
 * route redirecting to /onboarding, and genesis silently failing.
 *
 * /tmp is the one writable location, so seed a copy there from the committed
 * snapshot. State is per-instance and resets on a cold start; that is the right
 * trade for a public demo — every visitor gets the fully-grown world, and their
 * clicks work for the length of their session without touching anyone else's.
 */
function resolveDbPath(): string {
  const configured = process.env.DB_PATH?.trim();
  if (configured) return configured;
  if (!process.env.VERCEL) return "./flywheel.db";

  const runtime = path.join(os.tmpdir(), "flywheel.db");
  if (!fs.existsSync(runtime)) {
    const snapshot = path.join(process.cwd(), "demo-snapshot.db");
    // Never let seeding take the app down at import time. A failure here is
    // survivable: bootstrap() builds an empty schema instead and the visitor
    // lands on genesis, which still works in mock mode.
    try {
      if (fs.existsSync(snapshot)) fs.copyFileSync(snapshot, runtime);
    } catch (err) {
      console.warn(`[flywheel] could not seed ${runtime} from the snapshot:`, err);
    }
  }
  return runtime;
}

function create() {
  const dbPath = resolveDbPath();
  const sqlite = new Database(dbPath);
  if (dbPath !== ":memory:") sqlite.pragma("journal_mode = WAL");
  bootstrap(sqlite);
  ensureColumns(sqlite);
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__flywheelDb ?? (globalForDb.__flywheelDb = create());
export type Db = typeof db;
