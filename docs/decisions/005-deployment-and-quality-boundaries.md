# 005 — Deployment and quality boundaries

**Status:** Current

## Context

Meguruto is a browser-led product with public static pages, provider calls that need server-side credentials, optional authenticated persistence, and internal QA/report surfaces. The repository also has several verification layers because no single test can prove a localized browser journey, a data contract, an edge boundary, a generated SEO page, a service-worker upgrade, and a real production account at once.

## Considered approaches

The realistic alternatives are:

1. Put provider, recommendation, persistence, and rendering logic behind one application backend.
2. Keep everything in the browser, including provider credentials and privileged operations.
3. Keep the browser as the product/orchestration layer, use narrow Cloudflare Pages Functions for server-only seams, and use Supabase as an optional auth/persistence adapter.

The implementation uses the third approach. The repository does not contain an original architecture decision record proving that these alternatives were formally compared at the time; the reasons below are an interpretation of the implemented boundaries.

## Decision

Browser responsibilities include React route/UI orchestration, trip context, recommendation and budget calls through shared modules, public catalogue/SEO asset fetches, Open-Meteo/Nominatim browser interactions, guest browser storage, and calls to narrow API seams. Browsing and guest recommendations do not require an account.

Cloudflare Pages serves static/generated assets and runs Functions where a secret, edge validation, normalized provider contract, or protected delivery path is required. The car-route Function validates the request and calls the fixed server-side OpenRouteService endpoint. The ODPT Function validates allow-listed operations, injects the provider key, applies rate/dedup/cache/budget protections, and returns normalized results. Other Functions handle destination HTML/404 behavior, feedback/errors, account deletion, and protected QA/Allure routes.

Supabase is optional for guest browsing and is used by authenticated flows for profile/trip persistence and selected server-side records. It is not the recommendation engine. Cloudflare Access and private R2 protect the internal Allure/QA surfaces; production bindings, secrets, and deployment settings remain owner-managed configuration.

The verification model is layered:

- **Vitest/service tests** check deterministic recommendation, transport, budget, catalogue, auth, and localization contracts.
- **Playwright** checks connected user journeys in controlled Chromium desktop/mobile projects with fixture data and synthetic auth where needed.
- **Accessibility** uses axe and focused keyboard/focus/reflow/locale checks on representative surfaces.
- **Localization** checks key/placeholder parity and selected EN/JA browser behavior; parity does not judge translation quality.
- **Catalogue integrity** checks read-only audit findings, warning fingerprints, generated-file sync, and idempotency.
- **SEO** checks generated canonical/hreflang/sitemap/404 output and Pages Function behavior.
- **PWA** checks preview-build service-worker, offline, cache-exclusion, lazy-load, and upgrade behavior.
- **Protected-route checks** exercise local JWT/JWKS, Pages Function allow/deny, protected assets, Allure rendering, headers, and privacy boundaries.

## Reasons

The boundary keeps credentials out of browser bundles, narrows provider contracts, allows guest use without Supabase, and makes static/public delivery independent from optional persistence. The verification layers are complementary: service tests are fast and deterministic; browser tests cover connected UI behavior; data/SEO/PWA/edge checks cover different failure classes.

## Trade-offs

The system has more seams and local configuration than a monolith. Provider behavior can drift outside fixtures, deployment bindings can be wrong while local tests pass, and a real account lifecycle is not equivalent to a synthetic auth fixture. Multiple checks add CI duration and maintenance, while still leaving physical devices, live quotas, production identities, and owner-side configuration outside ordinary PR proof.

## Consequences

- Server-only values stay in Pages environment bindings and are never documented as values in the repository.
- Tests use local mocks, synthetic identities, committed fixtures, and preview builds; they do not mutate production accounts.
- A green PR is evidence for the tested contracts, not proof that every production binding, provider quota, account flow, or physical device behaves correctly.
- Full Remote Validation is conditional and is skipped on ordinary PRs; a skip is not a pass.

## Evidence

- [`src/App.tsx`](../../src/App.tsx)
- [`TripContext.tsx`](../../src/shared/context/TripContext.tsx)
- [`useTripSync.ts`](../../src/shared/hooks/useTripSync.ts)
- [`functions/api/car-route.js`](../../functions/api/car-route.js)
- [`functions/api/odpt.js`](../../functions/api/odpt.js)
- [`functions/e2e/[[path]].js`](../../functions/e2e/[[path]].js)
- [`pr-checks.yml`](../../.github/workflows/pr-checks.yml)
- [`validate.yml`](../../.github/workflows/validate.yml)
- [`playwright.config.ts`](../../playwright.config.ts)
- [`check-protected-routes.mjs`](../../scripts/check-protected-routes.mjs)
- [`verify-pages-functions.mjs`](../../scripts/verify-pages-functions.mjs)
- [`testing-strategy.md`](../testing-strategy.md)
- [`kai-126-allure-dashboard.md`](../kai-126-allure-dashboard.md)

## Current limitations

Automated Chromium is not physical iOS Safari, Android Chrome, or an installed PWA. Local JWKS/Supabase fixtures do not prove the production Access tenant or a real account lifecycle. Local provider mocks do not prove live provider availability, quotas, route accuracy, or production secret/binding configuration. Search-engine indexing, deployed edge behavior, and release/deployment approval remain external or owner-managed boundaries.

## Future reconsideration

Reconsider the boundaries if product scale, provider requirements, account workflows, or operational evidence justify a broader backend or different deployment platform. Any change should preserve server-only credential handling, narrow normalized contracts, guest usability, and explicit evidence limits.
