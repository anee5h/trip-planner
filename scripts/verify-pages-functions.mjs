#!/usr/bin/env node
/**
 * KAI-68: end-to-end verification of the deployed Pages Function bundle
 * against the production build (dist/).
 *
 * Boots the real Cloudflare Pages local runtime (`wrangler pages dev`),
 * which compiles functions/ with Cloudflare's own bundler and serves dist/
 * exactly as the edge will, then asserts the full routing contract:
 *
 *   published destination        -> 200, prerendered HTML, no noindex
 *   beta/verified destination    -> 200, SPA shell, X-Robots-Tag: noindex, follow
 *   unknown slug                 -> 404, X-Robots-Tag: noindex
 *   malformed id                 -> 404
 *   private SPA route (/settings)-> 200 + noindex (from public/_headers)
 *   normal SPA routes, built module asset, sitemap, robots, manifest -> 200
 *
 * The built module asset is discovered from dist/index.html (not hardcoded)
 * so the gate survives future Vite output changes.
 *
 * Exit codes: 0 pass, 1 fail (a failed assertion MUST make the script exit
 * non-zero — assert() records process.exitCode and the final exit() call
 * respects it instead of forcing 0). Requires `npm run build` first (dist/).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const PORT = 8799 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

/** Finds the Vite-built entry module URL (e.g. /assets/index-XXXX.js) from
 *  dist/index.html so the check does not depend on a hashed filename. */
function discoverBuiltAsset() {
  const shellPath = path.join(DIST, "index.html");
  if (!fs.existsSync(shellPath)) {
    throw new Error(
      `dist/index.html not found — run "npm run build" before this check.`,
    );
  }
  const shell = fs.readFileSync(shellPath, "utf8");
  const match = shell.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  if (!match) {
    throw new Error(
      `No module script found in dist/index.html — cannot verify the built asset.`,
    );
  }
  return match[1];
}

function fetchStatusAndRobots(path) {
  return new Promise((resolve, reject) => {
    fetch(`${BASE}${path}`, { redirect: "manual" })
      .then(async (res) => {
        const body = await res.text();
        resolve({
          status: res.status,
          robots: res.headers.get("x-robots-tag") ?? null,
          body,
        });
      })
      .catch(reject);
  });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/robots.txt`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("wrangler pages dev did not become ready in time");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

const server = spawn(
  "npx",
  [
    "wrangler",
    "pages",
    "dev",
    "dist",
    "--port",
    String(PORT),
    "--ip",
    "127.0.0.1",
  ],
  { stdio: ["ignore", "pipe", "pipe"], detached: true },
);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

// Kill the whole process group (npx + wrangler + workerd children) with
// SIGKILL so no stray server outlives the check — SIGTERM lets workerd
// linger during graceful shutdown.
const exit = (code) => {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    // already gone
  }
  // Prefer the explicit code; otherwise respect exitCode recorded by any
  // failed assert(). Never force 0 over a failed assertion.
  process.exit(code ?? process.exitCode ?? 0);
};
server.on("exit", () => {
  // If we already decided, exit; otherwise the server died unexpectedly.
  if (process.exitCode === undefined) {
    console.error(serverLog.slice(-2000));
    process.exit(1);
  }
});

try {
  const builtAsset = discoverBuiltAsset();
  console.log(`built module asset: ${builtAsset}`);

  await waitForServer(30_000);

  const published = await fetchStatusAndRobots(
    "/destinations/tokyo-station-chiyoda",
  );
  assert(
    published.status === 200 && published.robots === null,
    `published destination -> 200 prerendered HTML without noindex (got ${published.status})`,
  );
  assert(
    published.body.includes("Tokyo Station") &&
      published.body.includes('rel="canonical"'),
    "published destination body contains destination-specific HTML",
  );

  const trailingSlash = await fetchStatusAndRobots(
    "/destinations/tokyo-station-chiyoda/",
  );
  assert(
    trailingSlash.status === 200,
    `trailing-slash destination URL -> 200 (got ${trailingSlash.status})`,
  );

  for (const id of ["abashiri-city", "fuji-5-lake"]) {
    const res = await fetchStatusAndRobots(`/destinations/${id}`);
    assert(
      res.status === 200 && res.robots === "noindex, follow",
      `non-published public destination ${id} -> 200 + noindex, follow (got ${res.status} ${res.robots})`,
    );
  }

  const unknown = await fetchStatusAndRobots(
    "/destinations/this-destination-does-not-exist",
  );
  assert(
    unknown.status === 404 && unknown.robots === "noindex, follow",
    `unknown destination slug -> 404 + noindex (got ${unknown.status})`,
  );

  const malformed = await fetchStatusAndRobots("/destinations/UPPER-CASE");
  assert(
    malformed.status === 404,
    `malformed destination id -> 404 (got ${malformed.status})`,
  );

  const settings = await fetchStatusAndRobots("/settings");
  assert(
    settings.status === 200 && settings.robots === "noindex",
    `private SPA route /settings -> 200 + noindex (got ${settings.status} ${settings.robots})`,
  );

  for (const path of [
    "/destinations",
    builtAsset,
    "/sitemap.xml",
    "/robots.txt",
    "/data/kai68-public-destinations.json",
  ]) {
    const res = await fetchStatusAndRobots(path);
    assert(res.status === 200, `${path} -> 200 (got ${res.status})`);
  }

  console.log("Pages Function runtime verification complete.");
  // Respect exitCode recorded by any failed assert().
  exit();
} catch (error) {
  console.error(error.message);
  console.error(serverLog.slice(-2000));
  exit(1);
}
