import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested git worktrees used for parallel agent builds:
    ".worktrees/**",
    // Python env for local image generation. torch ships bundled .js/.mjs in
    // site-packages, which otherwise lints as if it were ours.
    ".venv-images/**",
  ]),
]);

export default eslintConfig;
