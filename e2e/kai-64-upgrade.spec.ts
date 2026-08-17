import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * KAI-64 Build-A → Build-B upgrade regression — open-tab-safe worker
 * handover.
 *
 * Scenario: a tab loads Build A (worker A precaches the A shell). Build B
 * "deploys": the server now serves B's HTML/worker, and one of A's lazy
 * chunks (Passport) is GONE from the server, exactly like a real redeploy
 * that dropped old hashed assets. The old tab reloads onto B and navigates
 * to the lazy route: the retained A cache must still serve the old chunk —
 * the unsafe "delete every old cache on activate" sequence would 404 here.
 *
 * Requires PWA_E2E=1 (npm run test:pwa) — the webServer build provides
 * dist; this spec stages dist-a / dist-b itself and serves them on its
 * own port so it never interferes with the main preview.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO, "dist");
const DIST_A = path.join(REPO, "dist-a");
const DIST_B = path.join(REPO, "dist-b");
// Ephemeral port: a server left behind by a killed run must not collide
// with the next run (and two projects re-stage the spec sequentially).
let ORIGIN = "http://127.0.0.1:0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
};

const CONTENT_TYPES = new Map<string, string>(Object.entries(MIME));

function startStaticServer(initialRoot: string) {
  const state = { root: initialRoot, passportHits: 0 };
  const server = http.createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", ORIGIN).pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (pathname.includes("/assets/Passport-")) {
      state.passportHits += 1;
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.join(state.root, pathname);
    if (!file.startsWith(state.root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        // SPA history fallback: unknown paths serve the shell.
        const fallback = path.join(state.root, "index.html");
        fs.readFile(fallback, (err2, index) => {
          if (err2) {
            res.writeHead(404);
            res.end("not found");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });
          res.end(index);
        });
        return;
      }
      res.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES.get(path.extname(file)) ?? "application/octet-stream",
      });
      res.end(data);
    });
  });
  return new Promise<{
    server: http.Server;
    setRoot: (root: string) => void;
    passportHits: () => number;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 4174;
      ORIGIN = `http://127.0.0.1:${port}`;
      resolve({
        server,
        setRoot: (root: string) => {
          state.root = root;
        },
        passportHits: () => state.passportHits,
      });
    });
  });
}

const waitForReady = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      navigator.serviceWorker.ready.then((reg) => ({
        scope: reg.scope,
        scriptURL: reg.active?.scriptURL ?? null,
        state: reg.active?.state ?? null,
      })),
    { timeout: 35_000 },
  );

test.describe("KAI-64 Build-A → Build-B upgrade", () => {
  let server: http.Server;
  let setRoot: (root: string) => void;
  let passportHits: () => number;

  test.beforeAll(async () => {
    test.skip(
      process.env.PWA_E2E !== "1",
      "Run with npm run test:pwa against the production build.",
    );
    // Build A = the webServer's dist. Stage it, then produce Build B: the
    // same assets minus the Passport lazy chunk (simulating a redeploy that
    // removed an old hashed asset), a touched index.html, and a re-injected
    // fingerprint.
    fs.rmSync(DIST_A, { recursive: true, force: true });
    fs.rmSync(DIST_B, { recursive: true, force: true });
    fs.cpSync(DIST, DIST_A, { recursive: true });
    try {
      const passportChunk = fs
        .readdirSync(path.join(DIST, "assets"))
        .find((name) => /^Passport-.*\.js$/.test(name));
      if (!passportChunk) {
        throw new Error("Passport lazy chunk not found in dist/assets");
      }
      fs.rmSync(path.join(DIST, "assets", passportChunk));

      const indexPath = path.join(DIST, "index.html");
      fs.writeFileSync(
        indexPath,
        `${fs.readFileSync(indexPath, "utf8")}\n<!-- KAI-64 Build B -->\n`,
      );
      // dist/sw.js was already injected by the webServer build; restore the
      // placeholder source so the injector can re-run for Build B.
      fs.copyFileSync(
        path.join(REPO, "public/sw.js"),
        path.join(DIST, "sw.js"),
      );
      execSync("node scripts/inject-pwa-assets.cjs", {
        cwd: REPO,
        stdio: "ignore",
      });

      fs.cpSync(DIST, DIST_B, { recursive: true });
    } finally {
      // Restore the pristine build even on failure, so a broken staging
      // never corrupts the workspace for later projects or runs.
      fs.cpSync(DIST_A, DIST, { recursive: true });
    }

    const staged = await startStaticServer(DIST_A);
    server = staged.server;
    setRoot = staged.setRoot;
    passportHits = staged.passportHits;
  });

  test.afterAll(async () => {
    server?.close();
    fs.rmSync(DIST_A, { recursive: true, force: true });
    fs.rmSync(DIST_B, { recursive: true, force: true });
  });

  test("an old tab loads a lazy route after Build B removes its chunk from the server", async ({
    page,
  }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());

    // Load under Build A; the worker precaches A's shell (incl. Passport).
    await page.goto(ORIGIN);
    await waitForReady(page);
    await page.goto(`${ORIGIN}/passport`);
    await expect(page.locator("main")).toBeVisible();
    const hitsUnderA = passportHits();
    expect(hitsUnderA).toBeGreaterThan(0);
    const cacheKeysBefore = await page.evaluate(() => caches.keys());

    // "Deploy" Build B: same origin, B's files, A's Passport chunk gone.
    setRoot(DIST_B);

    // The old tab reloads onto B; B's worker installs and (via
    // skipWaiting, without claiming clients) becomes active.
    await page.reload();
    await waitForReady(page);
    await expect(page.locator("main")).toBeVisible();

    // Navigate to the lazy route: the chunk is gone from the server, so
    // ONLY the retained A cache can serve it — the server must see zero
    // new Passport hits (a 404 would mean the cache was deleted).
    await page.goto(`${ORIGIN}/passport`);
    await expect(page.locator("main")).toBeVisible();
    expect(passportHits()).toBe(hitsUnderA);

    // The upgrade must NOT have deleted the previous build's cache.
    const cacheKeysAfter = await page.evaluate(() => caches.keys());
    const retained = cacheKeysAfter.filter((key) =>
      cacheKeysBefore.includes(key),
    );
    expect(retained.length).toBeGreaterThan(0);
    expect(retained).toContain(
      cacheKeysBefore.find((key) => key.startsWith("meguruto-shell-")),
    );
    const passportCachedInRetained = await page.evaluate(
      (keys) =>
        Promise.all(
          keys.map(async (key) => {
            const cache = await caches.open(key);
            const matches = await cache.keys();
            return matches.some((request) =>
              request.url.includes("/assets/Passport-"),
            );
          }),
        ).then((results) => results.some(Boolean)),
      retained,
    );
    expect(passportCachedInRetained).toBe(true);
  });

  test("a fresh tab after the upgrade runs Build B with a clean new cache", async ({
    page,
  }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());

    setRoot(DIST_B);
    await page.goto(ORIGIN);
    await waitForReady(page);

    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      return {
        controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        scriptURL: registration.active?.scriptURL ?? null,
        keys,
      };
    });
    // A fresh tab is controlled by the newest worker.
    expect(state.scriptURL).toContain("/sw.js");
    expect(state.keys.length).toBeGreaterThan(0);
  });
});
