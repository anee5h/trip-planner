# KAI-204 Phase 3 — Legacy Budget Trust Boundary (Final, incl. hub hardening)

Branch: `fix/kai-204-legacy-budget-trust`
Starting SHA: `e7064fdf4f4ba2133b977ea6d1ef86c33b52af49` (post-#257 main)
Hub-hardening head: `ccddbd1135d21bd258153518c5708a6eaa4337a6` (reviewed) → final (below)

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

## Hub hardening (reviewer blocker resolution)

The reviewer identified a semantic hole: the 24 numeric+absent hubs were
skipped from legacy tagging, but the trust helpers used a NEGATIVE check
(`method !== "unknown" && method !== "legacy"`) which left absent metadata
implicitly trusted — so the hubs still displayed prices, scored, filtered,
and entered complete budgets.

### Phase A — the 24 hubs audited

| id                    | kind      | tickets | model-reproducible?              | class                |
| --------------------- | --------- | ------- | -------------------------------- | -------------------- |
| chiba-city            | city      | 1600    | NO (model: 7600/6600-8600 tix=0) | B. LEGACY_UNVERIFIED |
| chofu-tokyo           | city      | 2000    | NO                               | B                    |
| hachioji-tokyo        | city      | 2000    | NO                               | B                    |
| hakone-town           | town      | 2125    | NO (clear-to-unknown)            | B                    |
| kanazawa              | city      | 2600    | NO (clear-to-unknown)            | B                    |
| kyoto-city            | city      | 2000    | NO                               | B                    |
| machida-tokyo         | city      | 2000    | NO                               | B                    |
| nagano-city           | city      | 2000    | NO                               | B                    |
| nagoya-city           | city      | 1813    | NO                               | B                    |
| niigata-city          | undefined | 3000    | NO (clear-to-unknown)            | B                    |
| ome-tokyo             | city      | 2000    | NO                               | B                    |
| osaka-city            | city      | 2125    | NO                               | B                    |
| saitama-city          | city      | 1400    | NO                               | B                    |
| sendai-city           | city      | 3000    | NO                               | B                    |
| shibuya-city          | ward      | 2100    | NO (clear-to-unknown)            | B                    |
| shirakawa-village     | village   | 1917    | NO (clear-to-unknown)            | B                    |
| tachikawa-tokyo       | city      | 2000    | NO                               | B                    |
| takaoka               | city      | 1800    | NO (clear-to-unknown)            | B                    |
| tokyo-station-chiyoda | undefined | 0       | NO (clear-to-unknown)            | B                    |
| ueno-taito            | undefined | 2250    | NO (clear-to-unknown)            | B                    |
| yokohama-city         | city      | 0       | NO                               | B                    |
| miyoshi-city          | city      | 3000    | NO                               | B                    |
| uwajima-city          | city      | 2500    | NO                               | B                    |
| matsushima-town       | town      | 1500    | NO (clear-to-unknown)            | B                    |

**All 24 = B. LEGACY_UNVERIFIED** — NONE are reproduced by the current
approved budget-model-v1 (which yields tickets=0 + peer-cell medians).
Their tickets≠0 (except 2) violates the hub convention; their ranges are
legacy template/heuristic values. Hub status alone is NOT provenance.

### Phase B — positive trust contract

Replaced the negative checks in `hasKnownBudget` / `hasKnownBudgetRange` /
`getEffectiveBudgetBreakdown` with:

```
hasTrustedBudgetProvenance(dest) → method === "manual" || method === "model"
```

Absent metadata is now UNTRUSTED (no longer implicitly trusted by absence
of a negative marker). Trust is positive and future-proof:
manual → trusted · model → trusted estimate · legacy → untrusted ·
unknown → untrusted · absent → untrusted.

### Phase C — the 24 hubs tagged

All 24 tagged `method: "legacy", confidence: "unknown"` (numbers preserved
in storage, not trusted for consumption). **numeric+absent = 0** after this.

### Phase D — hub CI exception removed

`NUMERIC_BUDGET_WITHOUT_PROVENANCE` now fires for ANY numeric budget without
metadata — hub or not. A hub convention must be represented explicitly by
model provenance, never by missing metadata.

### Phase E — tests

- hub numeric + absent → NOT known (all trust helpers + sortable + free)
- hub method=model → known estimate
- hub method=legacy → NOT trusted despite hub status
- manual → known; legacy → unknown; unknown → unknown; absent → unknown
- generated plan with numeric+absent destination → admission NOT curated
- generated plan with model-provenance hub → curated per model semantics
- ALT regression: absent-metadata zero-range alternative → NOT Free;
  verified manual zero-range alternative → MAY display Free

### Result

- metadata: manual 38 / model 112 / unknown 462 / legacy **353** / absent **92** / invalid 0
- **numeric+absent trusted count: 0** (invariant test added)

### Multi-origin after hub hardening (transport unchanged)

| origin   | finite | unknown | strict | bounded | ONSITE |
| -------- | -----: | ------: | -----: | ------: | -----: |
| Nakayama |    109 |     947 |     49 |      88 |    579 |
| Tokyo    |    129 |     927 |     53 |      68 |    579 |
| Osaka    |     83 |     973 |      7 |       7 |    579 |
| Hakata   |     97 |     959 |     77 |      82 |    579 |
| Naha     |     94 |     962 |     93 |      93 |    579 |

The further drop (vs the 329-tagging pass) is exactly the 24 hub legacy
values leaving trusted consumption. Truth > coverage.

## CI guard (Phase 15)

Added to `scripts/audit/data-quality-rules.ts` (ratchet):

- `NUMERIC_BUDGET_WITHOUT_PROVENANCE` — numeric+absent ANY kind (hub exemption removed; must be tagged)
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
