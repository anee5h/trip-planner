"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const assetsDir = path.join(dist, "assets");
const workerPath = path.join(dist, "sw.js");

const assets = fs
  .readdirSync(assetsDir, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() && /\.(?:css|js|woff2?|ttf|otf)$/i.test(entry.name),
  )
  .map((entry) => `/assets/${entry.name}`)
  .sort();

const appShell = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/icons/meguruto-192.png",
  "/icons/meguruto-512.png",
  "/icons/meguruto-maskable-192.png",
  "/icons/meguruto-maskable-512.png",
  ...assets,
];

const buildFingerprint = crypto
  .createHash("sha256")
  .update(fs.readFileSync(path.join(dist, "index.html")))
  .update(JSON.stringify(appShell))
  .digest("hex")
  .slice(0, 12);

const worker = fs.readFileSync(workerPath, "utf8");
const injectedWorker = worker
  .replace(
    'const CACHE_NAME = "meguruto-shell-dev";',
    `const CACHE_NAME = "meguruto-shell-${buildFingerprint}";`,
  )
  .replace(
    'const APP_SHELL = ["/"];',
    `const APP_SHELL = ${JSON.stringify(appShell, null, 2)};`,
  );

if (injectedWorker === worker) {
  throw new Error("PWA worker placeholders were not found in dist/sw.js");
}

fs.writeFileSync(workerPath, injectedWorker);
console.log(`PWA worker precache generated: ${appShell.length} assets`);
