# KAI-277 — Operational facts trust guards

## Scope and baseline

- Base: `origin/main` at `607d3526de3174eab44b96aff101151c357b3850`
- Canonical catalogue: **1,130 records / 1,130 unique IDs**
- Historical issue #335 cohort: **27** specific-window records from the clean-main audit artifact
- The 567-record missing-hours long tail and seasonality work remain out of scope.

## Business hours

| Disposition                                                        | Count |
| ------------------------------------------------------------------ | ----: |
| Invalid specific-window records repaired                           |    15 |
| Verified gated/garden records retained with authoritative evidence |    12 |
| Resolved to unknown/unverified                                     |     0 |
| Conflicting/ambiguous                                              |     0 |
| Remaining historical-cohort allowlist offenders                    |     0 |

The machine-readable ledger is `qa/kai-277/opening-hours-repair-ledger.json`. The repaired records are no longer allowlisted. In addition, 19 current semantic-hour records with misleading facility/open-access fields were repaired fail-closed; unknown hours remain absent/unverified rather than becoming `00:00–24:00` or “Open access”. Generated detail projections were regenerated and are idempotent.

## Root-cause classification and fixes

| Defect path                      | Root cause                                                                                                                       | Fix                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Incorrect/stale catalogue data   | Facility-specific `openingHours` and paid-venue `Open access` labels were attached to broad/open-area or mandatory-venue records | Deterministic, fail-closed repair script; 19 current semantic repairs; generated projections synced                                       |
| Generator/runtime transformation | `TripEstimateEngine.admissionComponent` converted explicit `variable`/`unavailable` facts to a generic cheap bounded fallback    | Preserve canonical `variable`/`unavailable`; mandatory missing facts are unavailable; no strong budget total                              |
| Planner interpretation           | Route simulation did not parse/enforce verified opening intervals                                                                | Verified windows shift starts to opening, reject allocations after close, honor represented closed weekdays when `travelDate` is supplied |
| Visit-duration mismatch          | Zoo recommendation range was rejected by the generic category cap, causing a 90-minute allocation                                | Added zoo planning category; planner uses canonical min/midpoint/max contract and compresses only when the user window requires it        |
| Missing schedule validation      | No reusable interval/closed-day parser at the planner boundary                                                                   | `OpeningHoursPolicy` window parser plus Ueno/closed-weekday regressions                                                                   |
| Hidden critical restrictions     | Kamikochi facts existed only in secondary content                                                                                | Primary-flow “Check before planning” notice beside/before the Add to Itinerary CTA                                                        |
| Stale generated artifacts        | Canonical hour mutations were not enough without detail/lite projections                                                         | `sync-destination-details` run and checked twice for zero diff                                                                            |

## Astra regressions

- Ueno Zoo opening-hours regression: **fixed** — verified window parses as 09:30–17:00, closed Monday.
- Ueno itinerary-before-opening regression: **fixed** — generated plan starts Ueno at 09:30, not 09:00; observed stop ends at 12:30.
- DisneySea mandatory admission regression: **fixed** — no audited ¥1,000–6,000 bounded fallback; canonical variable admission remains unresolved/partial.
- Strong affordability/value claims with unresolved mandatory costs: **fixed** — `budgetWithin`/`budgetGreatValue` require a complete bounded total.
- Kamikochi restriction visibility: **fixed** — seasonal closure, private-car ban, and mandatory shuttle/bus transfer are visible before planning.
- Unknown-hours warning: **preserved** — unverified schedules remain explicitly disclosed and are never presented as operationally validated.

## Bounded systemic audit

The committed generator/report is `scripts/audit/kai-277-operational-trust-audit.ts` and `qa/kai-277/operational-trust-audit.{json,md}`.

- High-exposure records audited: **817** (`role !== "hub" && status !== "beta"`)
- Planner probes: **25**
- Opening-hours semantic defects: **0**
- Planner schedule defects: **0**
- Mandatory variable/unavailable admission fallback defects: **0**
- Hidden critical restrictions: **0**
- Unresolved P0 recurrence: **0**
- Explicit unknown/unverified opening-window residuals: **246** (not converted to estimates)
- Paid-kind open-area wording retained for non-P0 review: **41** legacy/open-area records; these are reported explicitly and are not treated as mandatory gated-venue P0 defects.

The audit JSON and Markdown were generated twice with byte-identical output.

## Validators/tests and build evidence

- Focused KAI-277/regression tests: **57 passed** in the final focused slice; the registry admission guard is also covered by the full suite below.
- Full Vitest: **304 files, 3,600 passed, 2 skipped**.
- TypeScript: `tsc -b --noEmit` passed.
- Lint: passed with existing repository warnings only.
- Prettier: passed.
- Fast catalogue validation: passed, 0 errors.
- Catalogue sync/idempotency: passed; 1,130 detail files and projections current.
- Full catalogue CI checks: passed, 0 errors; warning baseline did not grow and `OPEN_ACCESS_ON_PAID_KIND` improved 58 → 47.
- Production build: passed, including SEO generation, GA4 installation, and PWA precache.
- Visual QA: settled desktop/mobile Kamikochi screenshots verified notice order, readability, no overflow, and no false reservation line.
- Relevant E2E: `e2e/kai-89-data-safety.spec.ts` and `e2e/kai-51-destination-details.spec.ts` — **66 passed** across Chromium desktop/mobile (2.1 minutes).

## Review status

This PR is intentionally left **open for owner review**. It is not auto-merged.
