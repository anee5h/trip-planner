/**
 * KAI-64 service-worker unit tests — run the REAL public/sw.js source in
 * a vm sandbox with fake Cache Storage, so the retention and offline-shell
 * logic is exercised exactly as deployed (no copy, no mock of the worker).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const WORKER_SOURCE = readFileSync(
  path.resolve(process.cwd(), "public/sw.js"),
  "utf8",
);

const MARKER = "/__meguruto_installed_at__";

function makeFakeCache() {
  const entries = new Map();
  return {
    entries,
    async addAll(urls) {
      for (const url of urls) entries.set(url, new Response("asset"));
    },
    async put(request, response) {
      entries.set(String(request), response);
    },
    async match(key) {
      return entries.get(String(key)) ?? null;
    },
    async keys() {
      return [...entries.keys()].map((url) => ({ url }));
    },
  };
}

function makeFakeCaches(seed = {}) {
  const store = new Map();
  for (const [key, cache] of Object.entries(seed)) store.set(key, cache);
  return {
    store,
    async open(key) {
      if (!store.has(key)) store.set(key, makeFakeCache());
      return store.get(key);
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(key) {
      return store.delete(key);
    },
    async match(url) {
      for (const cache of store.values()) {
        const hit = cache.entries.get(String(url));
        if (hit) return hit;
      }
      return null;
    },
  };
}

/** Loads the worker with a specific CACHE_NAME (as the injector does),
 *  with a controllable clock and cache store. Returns the event handlers
 *  and a way to run install/activate/fetch. */
function loadWorker({ cacheName, now, caches }) {
  const listeners = {};
  let fakeNow = now;
  const context = {
    self: {
      location: { origin: "http://127.0.0.1" },
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      skipWaiting: () => {},
    },
    caches,
    fetch: async () => {
      throw new TypeError("offline");
    },
    Response,
    // The worker's fetch always rejects in this sandbox; a no-op Request
    // constructor keeps `new Request(request, { cache: "no-store" })`
    // from parsing the fake request object.
    Request: class {},
    URL,
    Headers,
    Date: { now: () => fakeNow },
    setNow: (value) => {
      fakeNow = value;
    },
  };
  const source = WORKER_SOURCE.replace(
    'const CACHE_NAME = "meguruto-shell-dev";',
    `const CACHE_NAME = "${cacheName}";`,
  );
  vm.runInNewContext(source, context);
  const runInstall = () =>
    new Promise((resolve, reject) => {
      const event = { waitUntil: (promise) => promise.then(resolve, reject) };
      listeners.install(event);
    });
  const runActivate = () =>
    new Promise((resolve, reject) => {
      const event = { waitUntil: (promise) => promise.then(resolve, reject) };
      listeners.activate(event);
    });
  const runFetch = (request) =>
    new Promise((resolve, reject) => {
      const event = {
        request,
        respondWith: (promise) => promise.then(resolve, reject),
      };
      listeners.fetch(event);
    });
  return { runInstall, runActivate, runFetch, setNow: context.setNow };
}

/** Simulates one deployment: a worker with the build's cache name installs
 *  (writes its chronological marker) and activates (runs retention). */
async function deploy({ cacheName, now, caches }) {
  const worker = loadWorker({ cacheName, now, caches });
  await worker.runInstall();
  await worker.runActivate();
  return worker;
}

describe("KAI-64 service worker cache retention", () => {
  it("retains the CURRENT build + the two newest PREVIOUS by installation time — never by hash order", async () => {
    // Adversarial names (the reviewer's exact case): the current build
    // sorts FIRST lexicographically, so the old slice(-3)-by-hash logic
    // would delete the CURRENT cache.
    const caches = makeFakeCaches();
    await deploy({ cacheName: "meguruto-shell-f9ab", now: 100, caches });
    await deploy({ cacheName: "meguruto-shell-e2cd", now: 200, caches });
    await deploy({ cacheName: "meguruto-shell-d178", now: 300, caches });
    await deploy({ cacheName: "meguruto-shell-01ba", now: 400, caches }); // current

    const keys = (await caches.keys()).sort();
    expect(keys).toEqual(
      [
        "meguruto-shell-01ba", // current — never deletable
        "meguruto-shell-d178", // newest previous (t=300)
        "meguruto-shell-e2cd", // second-newest previous (t=200)
      ].sort(),
    );
    expect(keys).not.toContain("meguruto-shell-f9ab"); // oldest, deleted
  });

  it("keeps the current cache even when its name sorts before the retained old ones", async () => {
    const caches = makeFakeCaches();
    await deploy({ cacheName: "meguruto-shell-99aa", now: 100, caches });
    await deploy({ cacheName: "meguruto-shell-10bb", now: 200, caches }); // current sorts lowest
    const keys = await caches.keys();
    expect(keys).toContain("meguruto-shell-10bb");
    expect(keys).toContain("meguruto-shell-99aa");
  });

  it("cleanup tolerates caches without markers (pre-fix deployments), sorting them oldest", async () => {
    const caches = makeFakeCaches();
    // Three legacy caches with no marker, then the current build. The two
    // newest PREVIOUS are still retained by design; the extra legacy cache
    // (markerless = oldest) is the one that goes.
    await caches.open("meguruto-shell-legacy1");
    await caches.open("meguruto-shell-legacy2");
    await caches.open("meguruto-shell-legacy3");
    await deploy({ cacheName: "meguruto-shell-current", now: 100, caches });

    const keys = (await caches.keys()).sort();
    expect(keys).toEqual(
      [
        "meguruto-shell-current",
        "meguruto-shell-legacy2",
        "meguruto-shell-legacy3",
      ].sort(),
    );
    expect(keys).not.toContain("meguruto-shell-legacy1");
  });
});

describe("KAI-64 offline shell isolation", () => {
  it("offline navigation serves the CURRENT cache's shell, not a retained old one", async () => {
    const caches = makeFakeCaches();
    await deploy({ cacheName: "meguruto-shell-a1", now: 100, caches });
    await deploy({ cacheName: "meguruto-shell-b2", now: 200, caches });
    await deploy({ cacheName: "meguruto-shell-c3", now: 300, caches }); // current

    // Each cache carries a DIFFERENT "/" shell; retained old caches must
    // never be candidates for the current app's offline HTML.
    const a = await caches.open("meguruto-shell-a1");
    a.entries.set("/", new Response("SHELL-A"));
    const b = await caches.open("meguruto-shell-b2");
    b.entries.set("/", new Response("SHELL-B"));
    const c = await caches.open("meguruto-shell-c3");
    c.entries.set("/", new Response("SHELL-C"));

    const worker = loadWorker({
      cacheName: "meguruto-shell-c3",
      now: 300,
      caches,
    });
    const response = await worker.runFetch({
      method: "GET",
      mode: "navigate",
      url: "http://127.0.0.1/settings",
      headers: new Headers(),
    });
    expect(response).not.toBeNull();
    expect(await response.text()).toBe("SHELL-C");
  });
});
