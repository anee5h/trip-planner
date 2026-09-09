# KAI-285 admission applicability audit

Base: 29aaaa3a5fc20501c023e12f5d0347540537c5bd (fix/kai-285-admission-na-semantics)

## Phase 0 result

Current main already stores explicit admission facts, including `not_applicable`, and Budget v2 preserves unknown/free/N/A as distinct states. It does **not** yet have one canonical admission-applicability boundary: `TripEstimateEngine` still owns an internal mandatory-kind list plus broad fallback profiles, and the generated-plan UI renders `Not applicable` as an admission row. Therefore the stop condition for an equivalent canonical N/A implementation does not apply.

The current traveller-facing failure is concentrated in 68 records whose admission component is unresolved: 43 `unavailable` and 25 `variable_price`. The engine marks all 68 estimates partial. Fourteen are deterministic N/A candidates by entity semantics; they are not changed in PR A because catalogue cleanup is reserved for PR B.

## Canonical representation and consumers

- Canonical persisted fact: `Destination.admission` (`AdmissionCostFact`) with shared Budget v2 state/provenance/reason-code axes and `DestinationCostFact` value shapes.
- Legacy compatibility: `getEffectiveBudgetBreakdown()` projects only validated bounded admission facts; N/A, variable, unavailable, and malformed facts fail closed instead of becoming scalar zero.
- TripEstimateEngine: `admissionComponent()` handles the persisted fact, otherwise uses legacy metadata and an internal `isMandatoryAdmissionDestination()` / `defaultAdmissionProfile()` fallback.
- Destination-detail cost breakdown: `DestinationPlanningSection` → `calculateGeneratedPlanCost()` → `TripCostBreakdownWidget`.
- Planner totals: `GeneratedPlanCostService` aggregates canonical components, excludes N/A components, and deduplicates destination steps; route legs remain separate curated components.
- Explore/recommendations: `Destinations.tsx`, `RecommendationPipeline.ts`, and `RecommendationScorer.ts` call `calculateTripEstimate()` and the canonical affordability evaluators.
- Compact destination cards and detail glances consume the same estimate or validated legacy projection; they do not own admission arithmetic.

## Catalogue totals

- Total records audited: **1130**; unique IDs: **1130**.
- Admission facts present: **1130**; absent: **0**.
- Current admission states: `not_applicable/not_applicable` 757, `unavailable/unavailable` 43, `variable_price/bounded` 23, `variable_price/open_ended` 6, `variable_price/variable` 25, `verified_free/bounded` 38, `verified_paid/bounded` 238.
- Current estimate completeness: **1062 complete**, **68 partial**.
- Admission-driven incomplete estimates: **68 / 68**.

## Requested semantic cohorts

| Cohort                      | Records | Admission states                                                                                                                                                                                           | Complete estimates | Admission-driven incomplete |
| --------------------------- | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------: | --------------------------: |
| city_town_village_ward      |     176 | not_applicable/not_applicable: 174, verified_free/bounded: 2                                                                                                                                               |                176 |                           0 |
| city_travel_hub             |     164 | not_applicable/not_applicable: 163, verified_free/bounded: 1                                                                                                                                               |                164 |                           0 |
| neighbourhood_district_area |      26 | not_applicable/not_applicable: 25, verified_free/bounded: 1                                                                                                                                                |                 26 |                           0 |
| beach                       |      29 | not_applicable/not_applicable: 24, verified_free/bounded: 2, verified_paid/bounded: 3                                                                                                                      |                 29 |                           0 |
| hiking_trail_region         |      40 | not_applicable/not_applicable: 27, unavailable/unavailable: 10, variable_price/variable: 1, verified_free/bounded: 2                                                                                       |                 29 |                          11 |
| open_scenic_nature_area     |     394 | not_applicable/not_applicable: 286, unavailable/unavailable: 26, variable_price/bounded: 3, variable_price/open_ended: 2, variable_price/variable: 4, verified_free/bounded: 19, verified_paid/bounded: 54 |                364 |                          30 |
| public_open_park            |     196 | not_applicable/not_applicable: 149, unavailable/unavailable: 3, variable_price/bounded: 4, variable_price/open_ended: 2, variable_price/variable: 11, verified_free/bounded: 8, verified_paid/bounded: 19  |                182 |                          14 |
| market_street_public_area   |      54 | not_applicable/not_applicable: 48, unavailable/unavailable: 3, variable_price/bounded: 1, verified_free/bounded: 2                                                                                         |                 51 |                           3 |
| normal_paid_attraction      |     196 | verified_paid/bounded: 196                                                                                                                                                                                 |                196 |                           0 |
| verified_free_attraction    |      21 | verified_free/bounded: 21                                                                                                                                                                                  |                 21 |                           0 |

## High-confidence N/A projection (PR B candidate set)

- Deterministic N/A candidates: **391**.
- Of those, currently admission-unknown/unavailable: **14**.
- Currently incomplete estimates in that candidate set: **14**.
- Projected recovered estimates if only those explicit records are corrected to N/A: **14**.
- Projected admission-driven incomplete estimates: **54**; reduction **20.59%**.

This is a bounded projection, not a data mutation. PR A leaves the 14 records unchanged. PR B may update only the high-confidence rows after review; medium-confidence nature/park/onsen/temple/shrine cases remain untouched until source review.

## Current failure examples

- **DisneySea** `disneysea`: kind absent/role absent, admission `variable_price/variable`, estimate **partial**, assessment **review_candidate**.
- **Ikaho Stone Steps** `ikaho-stone-steps`: street/standalone, admission `unavailable/unavailable`, estimate **partial**, assessment **deterministic_na_candidate**.
- **Nakamachi and Nawate Streets** `matsumoto-nakamachi-nawate`: street/poi, admission `unavailable/unavailable`, estimate **partial**, assessment **deterministic_na_candidate**.
- **Onioshidashi Park** `onioshidashi-park`: park/standalone, admission `unavailable/unavailable`, estimate **partial**, assessment **review_candidate**.
- **Yanagimachi Street** `yanagimachi-street-ueda`: street/standalone, admission `unavailable/unavailable`, estimate **partial**, assessment **deterministic_na_candidate**.

## Parent-area review

- Parent-like records with a non-N/A admission fact: **2**.
- Verified-paid parent-like records: **0**.
- Verified-free parent-like records requiring semantic review: **2**.
- These are review candidates, not proof of inherited child fees. No parent-area paid fact was found in this audit.

## Deterministic regression matrix

| Fixture                        | Admission representation | Estimate completeness | Admission missing |
| ------------------------------ | ------------------------ | --------------------- | ----------------- |
| city_hub_no_destination_ticket | `not_applicable`         | complete              | no                |
| municipality                   | `not_applicable`         | complete              | no                |
| open_scenic_nature             | `not_applicable`         | complete              | no                |
| genuinely_paid_poi             | `bounded`                | complete              | no                |
| verified_free_poi              | `bounded`                | complete              | no                |
| applicable_unknown_poi         | `unavailable`            | partial               | yes               |

The matrix preserves the invariant `unknown admission ≠ ¥0 ≠ not applicable`; it also confirms that explicit N/A is excluded from completeness requirements without creating an exact zero-cost admission fact.

## Deferred

- PR A: canonical applicability boundary, engine/UI integration, deterministic audit tooling/artifact, and representative fixtures only; no catalogue cleanup beyond what is required to prove the contract.
- PR B: reviewed high-confidence N/A corrections and any separately evidenced parent-area corrections. Ambiguous records remain unchanged.
- No broad external research was performed; existing suspicious or ambiguous facts are listed for bounded follow-up.
