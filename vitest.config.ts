import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // mock mode + per-process in-memory DB: tests never hit the network or disk
    env: { MODEL_MODE: "mock", DB_PATH: ":memory:" },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
