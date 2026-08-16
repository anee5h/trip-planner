/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

import fs from "fs";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"),
);

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
  },
  test: {
    globals: true,
    environment: "jsdom",
    testTimeout: 15000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
// Version update trigger
