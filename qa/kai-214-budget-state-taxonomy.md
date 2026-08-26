# KAI-214 — Budget-State Taxonomy & Hard CI Contract

Branch: `feat/kai-214-budget-state-taxonomy`
Starting SHA: `f77aecc554524072efa01eb18c53a35f43777e98` (post-#263 main)

## Objective

KAI-204 made current budget data honest. KAI-214 defines the PERMANENT
production contract needed to reach 100% classified budget coverage, 0
legacy debt, 0 absent metadata, 0 mystery unknown, 0 numeric-without-
provenance, 0 free-without-evidence. This PR is ARCHITECTURE + TYPES +
VALIDATION + SEMANTIC CONTRACT — NOT the bulk catalogue cleanup (that is
KAI-215 through KAI-219).

## Architecture decision (Option B — separate state from provenance)

The legacy `budgetMetadata.method` single axis conflated FOUR concepts:
VALUE STATE, PROVENANCE, TRUST, APPLICABILITY. Extending it with more
strings would continue the overload. Instead, KAI-214 adds explicit
orthogonal axes while keeping `method` for backward compatibility.

### Value-state axis (BudgetValueState)

| state               | meaning                                                         |
| ------------------- | --------------------------------------------------------------- |
| verified_paid       | source-backed required/base price exists                        |
| verified_free       | free/open access with EXPLICIT evidence (never inferred)        |
| documented_estimate | deterministic approved model output                             |
| variable_price      | cost varies materially by date/product/package/season           |
| not_applicable      | no single admission price conceptually applicable               |
| unavailable         | budget could exist but evidence missing (must carry reasonCode) |
| legacy_unverified   | temporary migration state (KAI-215 target: 0), always untrusted |

### Provenance axis (BudgetProvenance)

verified_source · model · legacy · transitional · none

### Reason-code axis (BudgetReasonCode)

source_missing · price_variable_by_date · price_variable_by_product ·
optional_paid_experiences_only · free_area_with_optional_paid_components ·
no_single_admission_product · hub_budget_not_applicable ·
activity_specific_pricing · seasonal_pricing ·
legacy_provenance_unrecovered · insufficient_model_evidence ·
transitional_unclassified

### Type safety

`budgetMetadata` gains optional additive fields `state` / `provenance` /
`reasonCode`. `NormalizedBudgetState` is a discriminated interface with
`trustLevel: "trusted" | "trusted_estimate" | "untrusted"`. Impossible
combinations are prevented at the type level (e.g. `verified_paid` requires
`verified_source` provenance) AND enforced by CI.

## Compatibility mapping (deterministic, explicit, tested)

`normalizeBudgetState()` (src/shared/services/budget/budgetState.ts) derives
the full semantic state from `method` + numeric fields when the new fields
are absent:

| current method                     | normalized state    | provenance      | trust            |
| ---------------------------------- | ------------------- | --------------- | ---------------- |
| manual + numbers                   | verified_paid       | verified_source | trusted          |
| manual + tickets=0 + free evidence | verified_free       | verified_source | trusted          |
| model                              | documented_estimate | model           | trusted_estimate |
| legacy                             | legacy_unverified   | legacy          | untrusted        |
| unknown (basis volatile)           | unavailable         | none            | untrusted        |
| unknown (other)                    | unavailable         | none            | untrusted        |
| absent                             | unavailable         | none            | untrusted        |

NEW production data must author `state` explicitly; CI forbids new records
that rely on the transitional path.

## CI contract

New hard-error codes (PREVENTIVE_CODES in data-quality-rules.ts) that fire
ONLY when the new explicit fields are present:

- KAI214_TRUSTED_STATE_REQUIRES_VERIFIED_PROVENANCE
- KAI214_VERIFIED_FREE_REQUIRES_EVIDENCE
- KAI214_NON_NUMERIC_STATE_REQUIRES_REASON
- KAI214_LEGACY_UNVERIFIED_HIGH_CONFIDENCE
- KAI214_NOT_APPLICABLE_WITH_TICKETS
- KAI214_UNAVAILABLE_WITH_NUMERIC
- KAI214_CONTRADICTORY_STATE_PROVENANCE

Existing catalogue debt is untouched (0 new warnings; baseline 615 intact).
NEW debt is impossible: any new record with explicit `state` that violates
the contract fails validate:catalog-fast.

## Catalogue accounting (deterministic audit)

`scripts/qa/kai-214-budget-state-audit.ts` assigns every destination exactly
ONE normalized state and reconciles to the dynamic catalogue size:

```
total: 1057
by VALUE STATE:
  unavailable           554   (462 unknown + 92 absent)
  legacy_unverified     353
  documented_estimate   112
  verified_paid          34
  verified_free           4
by PROVENANCE:
  none                  554
  legacy                353
  model                 112
  verified_source        38
by TRUST:
  untrusted             907
  trusted_estimate      112
  trusted                38
invalid combinations: 0
reconciled: 1057 === 1057 ✓
```

Two runs produce byte-identical output (deterministic).

## Runtime safety preserved (KAI-204 regression)

- KAI-204 diagnostic: identical to post-#263 (finite Nakayama 109 / Tokyo
  129 / Osaka 83 / Hakata 97 / Naha 94; ONSITE 579) — no semantic regression
- legacy numeric → not shown as trusted price (unchanged)
- absent metadata → not trusted (unchanged)
- unknown/unavailable → not cheap (unchanged)
- untrusted zero → not Free (unchanged)
- GeneratedPlanCostService → does not consume untrusted admission (unchanged)
- Lowest Budget → remains HIDDEN (unchanged)

## UI

Minimal fallback copy added for future variable/not-applicable states:

- EN: `destination.budget.priceVaries` "Price varies",
  `destination.budget.noSingleAdmissionPrice` "No single admission price"
- JA: 「料金は変動します」「単一の入場料はありません」
  No UI redesign; no state leaks raw enums; unavailable still renders
  "Cost unavailable"/「料金不明」.

## Tests

- `budgetState.test.ts` (10): source-backed paid, verified free, model
  estimate, legacy, unknown, absent, forward-path explicit states,
  variable/not-applicable, verified-vs-model epistemic distinction,
  determinism
- `data-quality.test.ts` (+7): KAI-214 hard-contract error codes
  (verified_paid without provenance, verified_free without evidence,
  unavailable without reason, not_applicable with tickets, contradictory
  state+provenance, valid explicit state passes, existing records untouched)

## Verification

- Vitest: 244 files / 2814 tests pass
- tsc · lint · format · validate:i18n · check:catalog-ci · check:catalog-sync
- build · seo:check · verify:pages-functions · check:bundle-budget
  (383 KB gzip home — unchanged)
- KAI-214 audit deterministic (2 runs byte-identical)
- KAI-204 diagnostic deterministic, no regression
