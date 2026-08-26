# KAI-204 Phase 3 — Legacy Budget Trust Boundary (Final)

Branch: `fix/kai-204-legacy-budget-trust`
Starting SHA: `e7064fdf4f4ba2133b977ea6d1ef86c33b52af49` (post-#257 main)

## Phase 0 — reproduced current state (dynamic)

| bucket    | before phase 3 |
| --------- | -------------: |
| manual    |             38 |
| model     |            112 |
| unknown   |            462 |
| absent    |            445 |
| invalid   |              0 |
| **total** |       **1057** |

numeric+absent: **353** (24 hubs + 327 pure legacy + 2 ambiguous-ledger).
All 353 passed `hasKnownBudget` / `hasKnownBudgetRange` today; 327 passed
`getEffectiveBudgetBreakdown` (full breakdown). All were card-visible,
scored, filtered, and entered complete origin-aware budgets as if verified.

## Trust states (Phase 1) — explicit

| state                               | storage                | consumption         |
| ----------------------------------- | ---------------------- | ------------------- |
| VERIFIED (manual)                   | numbers                | trusted             |
| BOUNDED_MODEL (model)               | numbers                | trusted as estimate |
| LEGACY_UNVERIFIED (**legacy**, new) | numbers preserved      | NOT trusted         |
| UNKNOWN                             | numbers must be absent | never numeric       |
| NOT_APPLICABLE                      | hub class convention   | separate policy     |

`budgetMetadata.method` union extended: `"model" | "manual" | "unknown" | "legacy"`
(mirrors the existing `transportMetadata.method: "legacy-fallback"` precedent).

## Consumer trust matrix (Phase 2) — subagent-verified

| consumer                  | reads budget via                                        | absent/legacy trusted before | after                           |
| ------------------------- | ------------------------------------------------------- | ---------------------------- | ------------------------------- |
| DestinationCard           | hasKnownBudgetRange                                     | YES (displayed as price)     | NO → Cost unavailable           |
| DestinationDetails        | getEffectiveBudgetBreakdown / calculateItemizedTripCost | YES                          | NO → unavailable                |
| TripCostBreakdownWidget   | cost.budgetAvailable / planCostBreakdown                | YES                          | NO (plan admission source gate) |
| RecommendationScorer      | budgetRecommended + getEstimatedBudgetRange             | YES (bonus/penalty)          | NO (range null → skip)          |
| Explore filter            | hasKnownBudgetRange + getEstimatedBudgetRange           | YES (passes tiers)           | NO (excluded)                   |
| DestinationCombination    | hasKnownBudgetRange (both sides)                        | YES                          | NO (null range)                 |
| GeneratedPlanCostService  | budgetBreakdown.tickets direct                          | YES (leak)                   | NO (trusted-only)               |
| getSortableVerifiedBudget | getEstimatedBudgetRange                                 | YES (finite)                 | NO (Infinity)                   |
| isFreeDestination         | hasKnownBudget                                          | 4 free-tag records           | NO (legacy blocked)             |

## hasKnownBudget finding (Phase 3)

**CONFIRMED the central trust leak**: `hasKnownBudget` / `hasKnownBudgetRange`
returned true for ANY record with valid numbers unless `method === "unknown"`.
Absent metadata was treated as trusted. Fixed by treating `"legacy"` like
`"unknown"` for consumption. Blast radius computed BEFORE implementation:
327 card displays, 327 complete-budget contributors, ~226 finite-count
reduction per origin (truthful, not misleading).

## GeneratedPlanCostService (Phase 4/14)

**CONFIRMED correctness bug in-scope**: `calculateGeneratedPlanCost` read
`dest.budgetBreakdown?.tickets` with NO metadata check (L116), so legacy
tickets entered plan admission totals with `source: "curated"`, and
`TripCostBreakdownWidget.hasKnownCost = Boolean(planCostBreakdown || ...)`
treated a populated plan object as known regardless of provenance.
**Fixed**: trusted-provenance-only ticket reads + widget gates on
`admission.source !== "unknown"`. Follow-up KAI-210 already logged the issue;
this phase fixes it at the source.

## Provenance recovery (Phase 5/6)

- 327 pure-legacy: **no recoverable provenance** (generator history =
  pr12c-formula 38, normalize-midpoint signature 90%, template shapes —
  heuristic/template-generated, never individually verified)
- 24 hubs: separate hub-convention policy class (not legacy)
- 2 ambiguous-ledger (amanohashidate-kyoto, mount-yoshino-nara): tagged
  legacy — the ledger itself flags their numbers as not-admission
- **Provenance recovered: 0** (none existed to recover)
- **Still unverified: 327 + 2 = 329** (now explicitly marked, not trusted)

## Before / after (Phase 16)

### TABLE A — trust cohorts

| cohort              | before |   after |
| ------------------- | -----: | ------: |
| manual              |     38 |      38 |
| model               |    112 |     112 |
| unknown             |    462 |     462 |
| legacy              |      0 | **329** |
| absent (no numbers) |    445 | **116** |
| invalid             |      0 |       0 |

### TABLE D — multi-origin complete budget (transport unchanged)

| origin   | finite before→after | unknown before→after | strict before→after | bounded before→after |
| -------- | ------------------- | -------------------- | ------------------- | -------------------- |
| Nakayama | 356→130             | 700→926              | 190→51              | 282→100              |
| Tokyo    | 407→153             | 649→903              | 200→57              | 233→78               |
| Osaka    | 230→100             | 826→956              | 30→8                | 36→9                 |
| Hakata   | 276→115             | 780→941              | 211→94              | 224→99               |
| Naha     | 261→115             | 795→941              | 250→114             | 250→114              |

The drop is EXACTLY the 329 legacy records that were inflating finite/complete
counts with unproven numbers. Transport unchanged; on-site trust hardened.
Truthful 12-15% finite coverage > misleading 25-38%.

### TABLE E — free safety

| class                                | count | after                           |
| ------------------------------------ | ----: | ------------------------------- |
| trusted free (manual/model + ledger) |     3 | Free                            |
| unverified zero (legacy min=0/max=0) |     0 | n/a                             |
| free-tag legacy (4)                  |     4 | NOT free (hasKnownBudget false) |
| unknown zero-like                    |     0 | never free                      |

## CI guard (Phase 15)

Added to `scripts/audit/data-quality-rules.ts` (ratchet):

- `NUMERIC_BUDGET_WITHOUT_PROVENANCE` — numeric+absent non-hub (must be tagged)
- `ZERO_RANGE_FREE_WITHOUT_PROVENANCE` — min=0/max=0 without manual/model
- `UNKNOWN_METADATA_WITH_NUMERIC` — two competing truths
- `LEGACY_METADATA_BAD_CONFIDENCE` — legacy must declare confidence unknown

Baseline: 615 warnings (accepted debt), 0 errors, no new instances.

## Product impact

- Cards/Explore/Details: 329 legacy records now show "Cost unavailable" /
  料金不明 instead of unverified prices
- Filters: legacy records excluded from strict budget tiers
- Recommendations: legacy numbers no longer earn cheap-trip bonuses
- Generated plans: legacy tickets excluded from plan costs (assumption
  emitted), widget shows unavailable when admission is untrusted
- Complete origin-aware budgets: truthful reduction (see TABLE D)
- Lowest Budget: remains HIDDEN (coverage now honestly ~12-15% finite)

## Safety

- unknown != zero (validator + guards)
- legacy != verified (hasTrustedBudgetProvenance gate)
- free requires evidence (isFreeDestination + tests)
- no invented costs, no model-fill, no category averages
- numbers preserved in storage (Phase 8 — STORAGE separated from TRUST)
- no paid API; no runtime catalogue computation; bundle unchanged (383 KB gzip)

## Verification

- Vitest: **243 files / 2789 tests pass** (incl. legacy trust boundary,
  generated-plan provenance, free safety, provenance invariants)
- tsc · lint · format · i18n · localization · branding · catalog-fast ✓
- check:catalog-ci ✓ (0 errors, baseline clean, idempotent generation)
- check:catalog-sync ✓ (zero diff)
- KAI-204 diagnostic run twice → deterministic
- KAI-204 audit run twice → byte-identical
- repair script run twice → zero diff, zero work
- build · seo:check · verify:pages-functions · bundle-budget ✓
