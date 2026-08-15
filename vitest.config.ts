import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // mock mode + per-process in-memory DB: tests never hit the network or disk
    env: { MODEL_MODE: "mock", DB_PATH: ":memory:" },
    // nested git worktrees (parallel agent builds) must not leak into this tree's runs
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
