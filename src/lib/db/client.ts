import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
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

function create() {
  const dbPath = process.env.DB_PATH ?? "./flywheel.db";
  const sqlite = new Database(dbPath);
  if (dbPath !== ":memory:") sqlite.pragma("journal_mode = WAL");
  bootstrap(sqlite);
  ensureColumns(sqlite);
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__flywheelDb ?? (globalForDb.__flywheelDb = create());
export type Db = typeof db;
