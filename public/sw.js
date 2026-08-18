// Meguruto service worker — KAI-64.
//
// Upgrade strategy (open-tab-safe):
// 1. install  — precache THIS build's shell into a fingerprint-versioned
//    cache (meguruto-shell-<hash>). skipWaiting makes the new build's
//    worker activate promptly (users are not forced to close every tab),
//    but activation does NOT claim existing tabs: each open tab keeps its
//    current worker until its next navigation — an open tab's in-flight
//    fetches are never interrupted.
// 2. activate — delete only STALE caches. Retention is bounded: the
//    current cache plus up to two previous builds stay. A tab still
//    running the previous build can therefore fetch its hashed assets
//    from its own retained cache even after the deployment removed them
//    from the server. (Hashed assets are content-addressed, so each
//    build's cache is self-sufficient; exact-previous identity is not
//    required — keeping the newest few versions covers the transition.)
//    The old "delete every other version immediately" sequence is what
//    broke open tabs; that is gone.
// 3. fetch    — navigations: network-first with a shell fallback (always
//    fresh HTML, offline fallback to the cached shell). Static assets:
//    cache-first with a network fallback (a retained-but-unused asset
//    still resolves; a missing one degrades to the network, never hangs).
// Supabase / API traffic is never cached, so account data can never leak
// across users or go stale offline.
const CACHE_NAME = "meguruto-shell-dev";
const APP_SHELL = ["/"];
const NEVER_CACHE_PATHS = [
  "/rest/v1/",
  "/auth/v1/",
  "/storage/v1/",
  "/api/",
  "/functions/",
  // KAI-126: protected engineering surfaces must never enter the app-shell
  // cache (an offline user should not be able to read the dashboard shell
  // from the cache, and the guarded routes must always hit the edge).
  // Exact path AND subtree both excluded (startsWith alone misses /e2e).
  "/e2e/",
  "/qa/",
];

/** True when pathname equals the prefix or starts with prefix + "/". */
const isPathOrSubtree = (pathname, prefix) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isSupabaseHost = (url) =>
  url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co");

const isNeverCacheRequest = (request, url) =>
  isSupabaseHost(url) ||
  // Supabase / API / functions traffic is never cached (KAI-64).
  NEVER_CACHE_PATHS.some((path) => url.pathname.startsWith(path)) ||
  // KAI-126: protected engineering surfaces — exact path AND subtree
  // (startsWith alone misses /e2e, /qa).
  isPathOrSubtree(url.pathname, "/e2e") ||
  isPathOrSubtree(url.pathname, "/qa") ||
  request.headers.has("authorization") ||
  url.searchParams.has("access_token");

const isStaticAsset = (request, url) =>
  url.origin === self.location.origin && url.pathname.startsWith("/assets/");

const isMegurutoCache = (key) => key.startsWith("meguruto-shell-");

// Installation-chronology marker: written into each build's cache at
// install time. Cache NAMES are content fingerprints with no ordering
// relationship to deployment order, so retention must sort by this
// timestamp, never by hash.
const INSTALLED_AT_MARKER = "/__meguruto_installed_at__";

const readInstalledAt = async (key) => {
  try {
    const cache = await caches.open(key);
    const marker = await cache.match(INSTALLED_AT_MARKER);
    return marker ? Number(await marker.text()) || 0 : 0;
  } catch {
    return 0;
  }
};

/** Bounded retention: always the current build + the two newest PREVIOUS
 *  builds by actual installation time (a cache without a marker sorts as
 *  oldest and is cleaned up first). */
const deleteStaleCaches = async () => {
  const keys = (await caches.keys()).filter(isMegurutoCache);
  const versions = await Promise.all(
    keys.map(async (key) => ({ key, installedAt: await readInstalledAt(key) })),
  );
  versions.sort((a, b) => a.installedAt - b.installedAt);
  const previous = versions.filter((v) => v.key !== CACHE_NAME).slice(-2);
  const keep = new Set([CACHE_NAME, ...previous.map((v) => v.key)]);
  await Promise.all(
    versions.filter((v) => !keep.has(v.key)).map((v) => caches.delete(v.key)),
  );
};

/** The CURRENT build's cached shell — retained old caches exist only for
 *  their hashed assets and must never serve the current app's offline
 *  HTML. */
const currentShell = () =>
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.match("/", { ignoreSearch: true }));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache
          .addAll(APP_SHELL)
          .then(() =>
            cache.put(INSTALLED_AT_MARKER, new Response(String(Date.now()))),
          ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // No client claiming: open tabs keep their current worker until their
  // next navigation — the open-tab-safe handover.
  event.waitUntil(deleteStaleCaches());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isNeverCacheRequest(request, url)) return;

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" })).catch(() =>
        currentShell(),
      ),
    );
    return;
  }

  if (!isStaticAsset(request, url)) return;

  event.respondWith(
    caches.match(url.href, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()))
            .catch(() => undefined);
        }
        return response;
      });
    }),
  );
});
