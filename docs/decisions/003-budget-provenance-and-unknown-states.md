# 003 — Budget provenance and unknown states

**Status:** Current

## Context

Travel cost inputs have different meanings: a verified ticket, an explicit free admission fact, a modelled planning band, an open-ended “from” price, a city with no single admission product, or a missing fare. Collapsing these into numbers makes an unknown toll look free and makes a partial trip look complete.

## Considered approaches

The realistic alternatives are:

1. Normalize every missing or inapplicable component to zero so arithmetic is always complete.
2. Show only fully verified totals and hide any destination with incomplete cost data.
3. Keep value state, provenance, reason, scope, derivation, and completeness separate, while exposing bounded partial planning information where it is defensible.

Meguruto implements the third approach. This records the implemented policy, not an undocumented historical choice between named alternatives.

## Decision

Persisted facts use a semantic taxonomy: verified paid, verified free, documented estimate, variable price, not applicable, unavailable, and legacy/unverified, with provenance and reason codes. `factValidation.ts` validates these combinations and fails invalid facts closed to unavailable behavior.

Runtime estimates are range-first:

- bounded ranges retain their minimum and maximum rather than collapsing to a midpoint;
- open-ended values retain a lower bound without pretending to have an upper bound;
- not-applicable costs are distinct from verified free costs;
- missing fare, toll, admission, or local access evidence creates an unavailable or partial component; and
- a complete result may carry a bounded total, while partial or unavailable results do not carry a definite total.

The trip engine includes origin travel, local transport, admission, meals, and, for overnight planning, a party-total accommodation allowance. It deliberately excludes shopping, souvenirs, optional activities, snacks/cafes, parking, and contingency uplifts from the canonical estimate.

## Reasons

Unknown is a meaningful product state. A user can decide with a known lower/subtotal range and an explicit missing component, but should not be told that an unsupported amount is ¥0 or that a corridor-only fare covers the whole journey. The shared validator keeps authoring and runtime consumers from maintaining different definitions of “free,” “verified,” or “checked.”

## Trade-offs

Some destination totals remain unavailable or visibly partial, which is less convenient than a single precise-looking number. The implementation requires discriminated unions, state/provenance validation, source metadata, and component-level UI handling. Modelled ranges remain planning aids rather than independently validated price forecasts.

## Consequences

- UI and recommendation code must handle partial and unavailable states.
- A numeric range does not by itself establish a verified price.
- Adding a cost field requires source scope, state, provenance, reason, and checked-date decisions.
- Budget eligibility can be neutral-retained or warning-bearing rather than hard-rejected when evidence is insufficient.

## Evidence

- [`tripEstimateEngine.ts`](../../src/shared/services/budget/tripEstimateEngine.ts)
- [`budgetV2.ts`](../../src/shared/services/budget/budgetV2.ts)
- [`budgetState.ts`](../../src/shared/services/budget/budgetState.ts)
- [`factValidation.ts`](../../src/shared/services/budget/factValidation.ts)
- [`admissionApplicability.ts`](../../src/shared/services/budget/admissionApplicability.ts)
- [`tripEstimateEngine.test.ts`](../../src/shared/services/budget/__tests__/tripEstimateEngine.test.ts)
- [`budgetV2.test.ts`](../../src/shared/services/budget/__tests__/budgetV2.test.ts)
- [`budgetState.test.ts`](../../src/shared/services/budget/__tests__/budgetState.test.ts)
- [`kai285-admission-semantics.test.ts`](../../src/shared/services/budget/__tests__/kai285-admission-semantics.test.ts)
- [Data quality](../data-quality.md)
- [Transport estimation](../transport-estimation.md)

## Current limitations

Modelled meal, local-transport, admission, accommodation, and some route-cost ranges are not universal verified prices. A complete range can still contain modelled ingredients; source freshness and provider fare availability remain external or record-specific concerns.

## Future reconsideration

Reconsider the policy when source-backed fare/access coverage materially expands, when users need a separate budget mode for open-ended costs, or when a new cost product can preserve scope and provenance without turning unknown into zero.
