# KAI-64 PWA QA

## Implementation

- Mechanism: small hand-written service worker at `/sw.js`; no PWA dependency or install CTA.
- Manifest: `/manifest.webmanifest` with `/` start URL and scope, standalone display, Meguruto branding, 192/512 PNG icons, and maskable variants.
- Registration: production builds register `/sw.js` with `updateViaCache: "none"`.
- Build integration: `scripts/inject-pwa-assets.cjs` injects the hashed Vite JS/CSS/font asset list into the worker AFTER the normal pipeline (`vite build` → `npm run seo:generate` → injection). `seo:generate` stays in the build pipeline.
- Routing: `/sw.js`, `/manifest.webmanifest`, and `/icons/*` are excluded from Pages Functions (`public/_routes.json`) so they are served as real static resources; `verify:pages-functions` asserts the production endpoints return the actual worker/manifest/icons.
- Update strategy (open-tab-safe): install precaches the current build into a fingerprint-versioned cache and calls `skipWaiting()` so updates apply promptly; activation performs NO `clients.claim()` (open tabs keep their current worker until their next navigation) and deletes only STALE caches — retention keeps the current plus up to two previous builds, so a tab still running an older build can fetch its hashed assets even after the deployment removed them. Navigation stays network-first with a cached shell fallback.
- Upgrade regression: `e2e/kai-64-upgrade.spec.ts` stages a Build A → Build B redeploy (B removes one lazy chunk from the server) and proves an old tab still renders the lazy route from the retained A cache, and that a fresh tab runs B cleanly.

## Cache policy

| Resource                                 | Policy                                    |
| ---------------------------------------- | ----------------------------------------- |
| Static Vite JS/CSS/font assets           | Precached and cache-first                 |
| Manifest, favicon, app icons, shell HTML | Precached                                 |
| Supabase/auth/private data               | Network-only; never service-worker cached |
| Weather                                  | Network-only; never service-worker cached |
| Transport and fare estimates             | Network-only; never service-worker cached |
| Recommendations and personalized data    | Network-only; never service-worker cached |

The worker only runtime-caches same-origin immutable Vite build files under `/assets/`. It bypasses Supabase hosts, `/rest/v1/`, `/auth/v1/`, `/storage/v1/`, `/api/`, `/functions/`, authorization-bearing requests, and access-token URLs.

## Route matrix

| Route                      | Production smoke result                                       |
| -------------------------- | ------------------------------------------------------------- |
| `/`                        | E2E: worker registers, shell precached, dynamic data excluded |
| `/settings`                | E2E: offline deep-route reload serves the shell               |
| `/destinations`            | Manual (preview)                                              |
| `/destinations/kyoto-city` | Manual (preview)                                              |
| `/collections`             | Manual (preview)                                              |
| `/collections/example`     | Manual (preview)                                              |
| `/compare`                 | Manual (preview)                                              |
| `/bucket-list`             | Manual (preview)                                              |
| `/my-trips`                | Manual (preview)                                              |
| `/passport`                | Manual (preview)                                              |
| `/help`                    | Manual (preview)                                              |

## Automated checks

- `npm run check:pwa` — manifest fields, icon files, worker private-data
  bypass policy, production output (runs in CI).
- `npm run test:pwa` — Playwright against the production build:
  1. worker registers with scope `/`; manifest served; Cache Storage holds
     the shell and NO Supabase/`/data/` URLs.
  2. offline deep-route reload (`/settings`) serves the app shell.
  3. Build A → Build B: an old tab still renders a lazy route after B
     removes its chunk from the server (retained previous cache), and a
     fresh tab runs B with a clean new cache.
- External third-party requests are blocked in the specs so SW behavior is
  deterministic regardless of network conditions.

## Platforms tested

- Desktop Chromium: covered by the PWA E2E job (production build) in CI.
- Android Chrome: NOT YET RECORDED — owner must run Add to Home Screen /
  install QA on a physical Android device and attach evidence before KAI-64
  can be marked complete.
- iOS Safari: NOT YET RECORDED — owner must run Add to Home Screen /
  standalone-mode QA on a physical iOS device and attach evidence before
  KAI-64 can be marked complete.

## Privacy and update checks

- Automated source checks cover manifest fields and the worker's explicit
  private-data bypass policy; `verify:pages-functions` proves the PWA
  endpoints are served as real static resources in the production runtime.
- Account-switch privacy (sign-in as user A → sign-out → user B/guest, then
  inspect Cache Storage for cross-user leakage): NOT YET RECORDED — owner
  browser run required for ticket completion.
- Build A → build B update verification: automated (Build-A → Build-B E2E);
  a physical-device upgrade run (install A, deploy B, reopen) remains owner
  QA.

## Commands

Pending final run:

```bash
npm run validate:i18n
npm run test:run
npm run lint
npm run format:check
npx tsc -b --noEmit
npm run build
npm run check:pwa
npm run verify:pr
npx playwright test
git diff --check
```

## Limitations

Meguruto is not an offline trip-planning application. If offline, the cached shell may open, while current weather, transport, fare, recommendation, account, and Supabase data intentionally fail rather than appear stale or leak across users. Physical iOS and Android-device verification remains owner QA.
