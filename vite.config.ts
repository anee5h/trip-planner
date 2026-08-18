/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

import fs from "fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"),
);

// Deployment commit SHA for the KAI-46 error pipeline (baked into the
// bundle so every reported event can be traced to a build). Non-git or
// CI checkout fallbacks stay honest ("unknown").
const commitSha = (() => {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // build.manifest: emit dist/.vite/manifest.json — the deterministic
  // source→chunk graph (static imports vs lazy routes) consumed by the
  // KAI-82 bundle-budget gate (scripts/check-bundle-budget.mjs).
  build: {
    manifest: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_SHA__: JSON.stringify(commitSha),
  },
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 15000,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
// Version update trigger
