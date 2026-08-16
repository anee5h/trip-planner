"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("public/manifest.webmanifest"));

assert.equal(manifest.name, "Meguruto");
assert.equal(manifest.short_name, "Meguruto");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color, "#243C58");
assert.equal(manifest.background_color, "#F8FAFC");

for (const size of ["192x192", "512x512"]) {
  assert.ok(
    manifest.icons.some(
      (icon) => icon.sizes === size && icon.type === "image/png",
    ),
    `manifest is missing a ${size} PNG icon`,
  );
}

assert.ok(
  manifest.icons.some((icon) => icon.purpose === "maskable"),
  "manifest is missing a maskable icon",
);

const index = read("index.html");
assert.match(index, /rel="manifest"/);
assert.match(index, /apple-touch-icon/);
assert.match(index, /theme-color/);

const worker = read("public/sw.js");
for (const required of [
  'request.headers.has("authorization")',
  'url.searchParams.has("access_token")',
  'url.hostname.endsWith(".supabase.co")',
  '"/rest/v1/"',
  '"/auth/v1/"',
  '"/storage/v1/"',
  'url.pathname.startsWith("/assets/")',
  'request.mode === "navigate"',
  'cache: "no-store"',
  "skipWaiting",
]) {
  assert.match(
    worker,
    new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}

// KAI-64: the upgrade sequence must be open-tab-safe — never rip control
// away from open tabs (no clients.claim) and never delete the previous
// build's cache in one sweep. Retention is CHRONOLOGICAL (install-time
// markers), never hash-ordered: hash-sorted slice(-3) can delete the
// current build after a few deployments.
assert.doesNotMatch(worker, /clients\.claim/);
assert.match(worker, /INSTALLED_AT_MARKER/);
assert.match(worker, /readInstalledAt/);
assert.match(worker, /currentShell/);
assert.doesNotMatch(worker, /caches\.match\("\/",/);

const distWorkerPath = path.join(root, "dist/sw.js");
if (fs.existsSync(distWorkerPath)) {
  const distWorker = fs.readFileSync(distWorkerPath, "utf8");
  assert.doesNotMatch(distWorker, /meguruto-shell-dev/);
  assert.match(distWorker, /meguruto-shell-[a-f0-9]{12}/);
  assert.match(distWorker, /\/assets\/.*\.js/);
}

console.log(
  "PWA manifest, worker policy, and production output checks passed.",
);
