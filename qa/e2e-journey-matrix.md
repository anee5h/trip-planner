# E2E Journey Matrix (KAI-51)

Versioned traceability: journey → variants → spec → status. "100%" means every
**defined, deterministic, supported P0/P1 journey** is mapped to a passing
Playwright spec — not 100% source coverage. Status legend: ✅ covered ·
🟡 partial · ⬜ planned · 🚫 excluded (reason documented).

Suite: `e2e/` — runs on pull requests via `pr-checks.yml` (4 shards, KAI-99).
The current default-branch and release workflows do not run the full Playwright
suite. Fixtures: weather routes mocked, clock pinned via `page.clock`;
production data never used; guest sessions by default (auth journeys need
isolated fixtures — tracked in KAI-51 follow-ups).

## Journey matrix

| #   | Journey                                             | EN  | JA  | guest | auth | desktop | mobile | Spec                                                                  | Status                      |
| --- | --------------------------------------------------- | --- | --- | ----- | ---- | ------- | ------ | --------------------------------------------------------------------- | --------------------------- |
| J1  | Home renders hero + trip planner                    | ✅  | ✅  | ✅    | —    | ✅      | ✅     | kai-74-homepage-rails, kai-51-home-smoke                              | ✅                          |
| J2  | Home recommendation rails                           | ✅  | —   | ✅    | —    | ✅      | ✅     | kai-74-homepage-rails                                                 | ✅                          |
| J3  | Search destinations from Home                       | ✅  | ⬜  | ✅    | —    | ✅      | ✅     | kai-51-home-smoke                                                     | 🟡 (EN covered; JA planned) |
| J4  | Locale switch on Home + destinations                | ✅  | ✅  | ✅    | —    | ✅      | ✅     | kai-49-destinations-ja, kai-51-home-smoke                             | 🟡 (not all surfaces)       |
| J5  | Explore: grid + search filter + sort                | ✅  | 🟡  | ✅    | —    | ✅      | ✅     | kai-51-destinations-explore                                           | 🟡 (sort + JA partial)      |
| J6  | Destination details (hero, tabs, budget, transport) | ✅  | ✅  | ✅    | —    | ✅      | ✅     | kai-89-data-safety, kai-89-score-surfaces, kai-51-destination-details | ✅                          |
| J7  | Date selection + planning (kai-85)                  | ✅  | —   | ✅    | —    | ✅      | ✅     | kai-85-date-selection                                                 | ✅                          |
| J8  | Bus/ferry eligibility (kai-63)                      | ✅  | —   | ✅    | —    | ✅      | ✅     | kai-63-bus-eligibility                                                | ✅                          |
| J9  | Collections directory + detail + members            | ✅  | 🟡  | ✅    | —    | ✅      | ✅     | kai-51-destination-details.spec.ts                                    | 🟡 (JA partial)             |
| J10 | Compare destinations                                | ⬜  | ⬜  | ✅    | —    | ✅      | ✅     | —                                                                     | ⬜                          |
| J11 | Weekend trips / roulette                            | 🟡  | —   | ✅    | —    | ✅      | ✅     | kai-74-homepage-rails (rails only)                                    | 🟡                          |
| J12 | Passport / visited map                              | ⬜  | ⬜  | —     | ✅   | ✅      | ✅     | —                                                                     | ⬜ (auth fixtures)          |
| J13 | Bucket list / my trips (guest)                      | ⬜  | ⬜  | ✅    | —    | ✅      | ✅     | —                                                                     | ⬜                          |
| J14 | Settings (origin, profile)                          | ⬜  | ⬜  | ✅    | ✅   | ✅      | ✅     | —                                                                     | ⬜ (auth fixtures)          |
| J15 | Destructive actions (delete account, clear data)    | ⬜  | ⬜  | —     | ✅   | ✅      | ✅     | —                                                                     | ⬜ (KAI-44 follow-up)       |
| J16 | Legal pages (terms/privacy/cookies)                 | ✅  | 🟡  | ✅    | —    | ✅      | ✅     | kai-51-legal-pages                                                    | 🟡 (JA partial)             |
| J17 | SEO/prerender contract (kai-68)                     | ✅  | ✅  | ✅    | —    | n/a     | n/a    | kai-68-seo                                                            | ✅                          |
| J18 | Data-safety honesty (kai-89)                        | ✅  | —   | ✅    | —    | ✅      | ✅     | kai-89-data-safety                                                    | ✅                          |
| J19 | JA availability (kai-93)                            | —   | ✅  | ✅    | —    | ✅      | ✅     | kai-93-japanese-availability                                          | ✅                          |
| J20 | Beta version + feedback email (kai-94)              | ✅  | —   | ✅    | —    | ✅      | ✅     | kai-94-beta-version-email                                             | ✅                          |
| J21 | Itinerary create → edit → share                     | ⬜  | ⬜  | ✅    | ✅   | ✅      | ✅     | —                                                                     | ⬜ (auth/share fixtures)    |
| J22 | Account + origin persistence                        | ⬜  | ⬜  | ✅    | ✅   | ✅      | ✅     | —                                                                     | ⬜ (auth fixtures)          |
| J23 | Loading, empty, error, offline, and stale states    | ⬜  | ⬜  | ✅    | —    | ✅      | ✅     | —                                                                     | ⬜ (fixture inventory)      |
| J24 | Accessibility smoke                                 | ⬜  | ⬜  | ✅    | —    | ✅      | ✅     | —                                                                     | ⬜                          |
| J25 | Authenticated Supabase critical journeys            | ⬜  | ⬜  | —     | ✅   | ✅      | ✅     | —                                                                     | ⬜ (isolated fixtures)      |

## Explicit exclusions (documented reasons)

- **J12/J14/J15/J21/J22/J25 auth journeys** — require isolated Supabase test fixtures
  (seeded accounts, RLS-isolated project). Tracked as KAI-51 follow-up
  ("auth fixtures"); manual QA covers until then.
- **Visual pixel assertions** — only targeted layout checks (guardrail:
  no brittle pixel-only coverage); manual exploratory QA covers aesthetics.

## Metrics (tracked per release)

- Flake rate: retries used / total tests per run (KAI-99 retry=1 absorbs
  residual contention; recurring flakes get redesigned, not retried away).
- Wall clock: PR E2E ≤ 10 min target (KAI-99 sharding).
- Coverage gaps: any ⬜/🟡 row above must be closed or re-documented each
  release cycle.
