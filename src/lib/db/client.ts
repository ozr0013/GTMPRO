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

function create() {
  const dbPath = process.env.DB_PATH ?? "./flywheel.db";
  const sqlite = new Database(dbPath);
  if (dbPath !== ":memory:") sqlite.pragma("journal_mode = WAL");
  bootstrap(sqlite);
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.__flywheelDb ?? (globalForDb.__flywheelDb = create());
export type Db = typeof db;
