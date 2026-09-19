# KAI-297 Recruiter Golden-Path QA Baseline

- **Date:** 2026-09-19 (JST)
- **Repository:** `anee5h/trip-planner`
- **Branch:** `qa/kai-297-recruiter-golden-path`
- **Base:** `origin/main` at `4a86e071a52a897163fd616d40727137c38349ca`
- **Validation source SHA:** `9b8aec514bda83dd76e78397e4ab9acdc0fd3f6e`
- **Notion ticket:** https://app.notion.com/p/3e0184241fac811587b0e8babd1a70ae
- **Linear:** not created; the Notion ticket remains provisional

## Scope and evidence boundary

This is an audit-first baseline, not a redesign. The audit inspected the current Playwright configuration, fixtures, CI workflow, Home/Explore/destination/planner/account surfaces, PWA tests, KAI-259, and KAI-282 before adding coverage.

Local automated coverage used the repository's Vite dev server or production preview as stated below. Catalogue data was served by the existing disk-backed `e2e/fixtures.ts` fixture. Weather was mocked to fixed August 2026 values in the new connected-flow spec. No production account, Supabase production project, credential, token, or private session was used.

The public smoke used `https://meguruto.app` as a fresh guest session. Cloudflare Pages metadata identified the production source as `main` at `4a86e07`; the KAI-297 branch was not deployed during this audit.

## Recruiter golden-path matrix

| Surface / dimension                                                         | Environment                                        |            Result | Evidence                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ----------------: | ------------------------------------------------------------------------------------------ |
| Home explains product, shows origin/preferences, and renders primary action | Desktop + mobile, EN                               |              PASS | New KAI-297 connected-flow test                                                            |
| Home → overnight preference → recommendation rail                           | Desktop + mobile, EN                               |              PASS | New KAI-297 connected-flow test                                                            |
| EN → JA → EN during the Home flow                                           | Desktop + mobile                                   |              PASS | New KAI-297 connected-flow test; existing KAI-141/KAI-165 coverage                         |
| Recommendation → destination detail                                         | Desktop + mobile, guest                            |              PASS | New KAI-297 connected-flow test                                                            |
| Destination travel time, transport and budget surfaces                      | Desktop + mobile, guest                            |              PASS | New KAI-297 connected-flow test; KAI-51/KAI-278 existing coverage                          |
| Generated itinerary / planner action row                                    | Desktop + mobile, guest                            |              PASS | New KAI-297 connected-flow test; KAI-166 existing coverage                                 |
| Guest save action presents a contextual signup/login CTA                    | Desktop + mobile                                   |              PASS | New KAI-297 connected-flow test; KAI-259/KAI-80 existing coverage                          |
| Detail → Explore navigation and result cards                                | Desktop + mobile, guest                            |              PASS | New KAI-297 connected-flow test; KAI-51 existing coverage                                  |
| Japanese command palette accessible name                                    | Local branch, desktop + mobile                     |              PASS | New KAI-297 regression; `search.title` added to EN/JA                                      |
| Japanese command palette accessible name                                    | Public production, source `4a86e07`                | FAIL — P1 finding | Live DOM readback: `Search destinations` remains the dialog label; see evidence screenshot |
| Browser-emulated standalone display mode                                    | Desktop + mobile                                   |              PASS | New KAI-297 `matchMedia('(display-mode: standalone)')` test                                |
| Manifest, service worker, cache boundary and offline deep-route reload      | Production preview                                 |              PASS | Existing KAI-64/KAI-121 suite: 19/19                                                       |
| Signed-in account surfaces                                                  | Fake non-production auth fixture                   |              PASS | Existing KAI-80 authenticated matrix: 72 passed, 2 expected skips                          |
| Signup → email login → intended destination preserved → logout              | Fake non-production auth fixture, desktop + mobile |              PASS | New KAI-297 auth handoff: 2/2 cells; only runs with `E2E_AUTH_FIXTURE=1` or `A11Y_E2E=1`   |
| Real installed iOS/Android PWA                                              | Physical device                                    |        NOT TESTED | No physical installed-PWA environment was available; browser emulation is not substituted  |
| Real production authenticated login/logout                                  | Public production                                  |        NOT TESTED | No real account or credentials were used                                                   |

## Findings

### P1 — Japanese command-palette dialog has an English accessible name in production

- **Status:** Fixed in this branch; production deployment pending.
- **Environment:** `https://meguruto.app/ja/`, desktop browser; same source behavior was covered on mobile locally.
- **Reproduction:**
  1. Open the Japanese homepage.
  2. Open the global command palette with the visible keyboard-shortcut control.
  3. Inspect the dialog accessible name in the accessibility tree or DOM.
- **Expected:** Japanese accessible name `目的地を検索`.
- **Actual on production source `4a86e07`:** `aria-label="Search destinations"` while the visible placeholder and results are Japanese.
- **Impact:** Screen-reader users receive contradictory language for a primary search surface; automated role/name navigation also receives the wrong locale.
- **Fix:** Added the existing `search.title` key to both `src/i18n/resources/en/common.json` and `src/i18n/resources/ja/common.json`; added a regression assertion in `e2e/kai-297-recruiter-golden-path.spec.ts`.
- **Evidence:** [`live-ja-search-dialog.png`](evidence/live-ja-search-dialog.png). The screenshot proves the visible Japanese surface; the English accessible name is a DOM/accessibility-tree observation, not visible text.
- **Mapping:** KAI-297. No separate KAI-298–307 mapping was necessary.

### No P0 regressions found

No blocking blank state, broken primary navigation, contradictory travel-time/transport label, unexplained budget state, unexpected auth redirect, or primary-control keyboard failure was reproduced in the tested environments. A partial budget caused by unavailable admission data was treated as intentional unknown data, not a defect.

## Existing coverage verified before additions

- **KAI-259:** merged implementation at `e36f946`; guest header signup CTA, EN/JA acquisition surfaces, signup modal entry, and authenticated header coverage already exist in `e2e/kai-259-signup-header.spec.ts`.
- **KAI-282:** merged implementation at `c3f8c726`; duplicate generated cost summary removal and unit coverage verified on current `main`.
- **KAI-51/KAI-74/KAI-141/KAI-165/KAI-166/KAI-275/KAI-276/KAI-278/KAI-279/KAI-420:** relevant Home, Explore, locale, transport, planner, context and budget coverage reused rather than duplicated.
- **KAI-64/KAI-121:** production-preview PWA/service-worker/lazy-catalogue coverage reused.
- **KAI-80:** production-preview accessibility, guest auth modal, keyboard/focus, EN/JA, and fake authenticated surfaces reused.

## Tests added

`e2e/kai-297-recruiter-golden-path.spec.ts` adds only the missing connected slices:

- connected guest journey from Home through recommendations, destination detail, logistics/budget, generated itinerary, contextual signup CTA, and Explore;
- EN → JA → EN switching during the journey on both configured browser projects;
- Japanese command-palette accessible-name regression;
- browser-emulated standalone display-mode smoke;
- fixture-gated signup → email login → route preservation → logout handoff.

External service policy:

- Catalogue uses the existing deterministic disk-backed fixture.
- Weather is mocked to fixed deterministic data.
- Auth tests route only to the fake `a11y-test.supabase.co` project and are skipped when that fixture build is not enabled.
- No live external weather, auth, or account state is required for the new tests.

## Validation results

- New KAI-297 guest/display-mode spec: **6 passed, 2 expected skips** without auth fixture.
- New KAI-297 spec with `E2E_AUTH_FIXTURE=1`: **8 passed** across mobile and desktop, including the auth handoff.
- E2E shard manifest guard: **passed** — 34 specs assigned exactly once across 4 bins.
- SearchDialog unit regression: **9 passed**.
- Allure privacy scan for the fake-auth E2E artifact set: **passed**, 8 files scanned / 0 matches.
- Existing desktop recruiter-relevant suite: **44 passed, 8 expected skips**; the one initial KAI-166 timeout was reproduced as missing `E2E_AUTH_FIXTURE` setup and passed on the authenticated rerun.
- Existing authenticated KAI-166/KAI-259 rerun with the fake fixture: **9 passed, 8 expected skips**.
- Existing mobile recruiter-relevant suite: **52 passed, 4 expected skips**. The run exposed the missing `search.title` warning that the branch fixes.
- Existing PWA/lazy-catalogue preview suite: **19 passed**.
- Existing KAI-80 production-preview accessibility/auth matrix: **72 passed, 2 expected skips**.
- Full Vitest suite from committed `HEAD`: **385 test files, 5,319 passed, 2 skipped**.
- TypeScript (`tsc -b --noEmit`): **passed**.
- Formatting (`format:check`): **passed**.
- Lint: **exit 0**; only pre-existing warnings in untouched destination components.
- i18n parity: **853 keys, 0 placeholder mismatches**.
- Localization validation: **32 passed**.
- Production build: **passed**; SEO generation wrote 2,264 outputs/1,130 canonical destinations, GA4 verified 2,262 shells, and PWA precache generated 58 assets.
- Branding: **passed**, 644 public files.
- Catalogue-fast: **passed**, 0 errors and 684 warnings.
- Catalogue-CI/deprecated-fields: **passed**, no structural errors.
- SEO freshness check: **passed**, 2,264 outputs byte-identical.

## Limitations and remaining manual checks

- No real-device iOS or Android installed-PWA launch, Home Screen install, standalone lifecycle, close/reopen, upgrade, or mobile Cache Storage inspection was performed.
- No real production authenticated login, logout, account creation, account switching, or saved-data mutation was performed.
- Browser display-mode emulation proves the app branch responds to `matchMedia`; it does not prove an installed PWA.
- Live production was smoke-tested as guest only and remained on `main` source `4a86e07`; the branch fix needs deployment before the P1 live finding can be closed.
- The live smoke did not claim a clean browser-console audit. The new deterministic KAI-297 flow mocks weather; one older KAI-166 authenticated run emitted a WebServer weather-fetch stack while its legacy test did not mock weather, but the test passed. This is recorded as harness noise, not a reproduced recruiter defect.

## Closure

The recruiter golden path is reproducible locally across desktop/mobile, EN/JA, guest/fake-auth, and browser-emulated standalone coverage. The only recruiter-visible defect found is the P1 Japanese accessibility-label mismatch on the currently deployed `main`; it is fixed and regression-tested on this branch. Physical installed-PWA and real-account checks remain explicitly partial until a suitable device/account environment is available.
