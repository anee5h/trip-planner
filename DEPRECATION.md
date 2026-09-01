# DEPRECATION — generic destination budget fields (KAI-218 / KAI-220)

This document is the retirement contract for the generic destination budget
fields. KAI-220 completed the catalogue field strip after KAI-260 made the
range-first estimator the canonical traveller-facing source.

## Retired fields

The following generic fields are no longer authored in the canonical catalogue
or generated detail assets:

- `budgetMin`, `budgetRecommended`, `budgetMax`
- `budgetBreakdown` (including `transport`, `food`, `cafe`, and legacy
  `tickets`)
- `budgetMetadata`

Their semantic replacements are the scoped `admission` and `localTransport`
facts plus the context-sensitive `TripEstimateEngine` result. Food, cafe,
parking, shopping, and optional activities are not silently folded into the
canonical required-trip total.

## The new facts

- `admission?: AdmissionCostFact` — explicit on-site admission truth,
  KAI-214 state/provenance/reasonCode, per-person.
- `localTransport?: LocalTransportAccess` — explicit required local
  transport, never a generic city allowance, per-person.

Facts preserve verified free, verified paid, bounded variable, open-ended,
not-applicable, and unavailable semantics. Missing or unknown values are never
converted to numeric zero. Validators live in
`scripts/audit/data-quality-rules.ts`.

## Canonical estimate boundary

`src/shared/services/budget/tripEstimateEngine.ts` is the only runtime engine
for traveller-facing trip ranges. It combines scoped facts with deterministic
transport/local/admission/meal/accommodation models and returns:

- `total` only when every required component is bounded;
- `knownSubtotal` plus explicit missing components for partial results;
- `evidenceCompleteness` separately from bounded usability;
- `estimateQuality` (`verified`, `estimated`, or `rough`) for honest display.

A bounded model range may be used for planning and budget matching. A source
fact is never presented as verified merely because the total is bounded.
Flexible is a matching policy: it has an infinite ceiling and uses a neutral
standard profile only when a display estimate is needed.

## Reader migration

All production traveller surfaces now consume the canonical engine or a
canonical generated-plan result:

| Surface                             | Canonical path                                             |
| ----------------------------------- | ---------------------------------------------------------- |
| Home cards / recommendation scoring | `RecommendationPipeline` → `calculateTripEstimate`         |
| Explore filter and Budget sort      | `Destinations` / `exploreSorting` → canonical range        |
| Destination cards and detail        | `DestinationCard` / `DestinationDetails` → canonical range |
| Hub and cost breakdown widgets      | `TripCostBreakdownWidget` / `DestinationAtAGlance`         |
| Compare page and modal              | `calculateTripEstimate` on-site context                    |
| Generated itinerary summaries       | `GeneratedPlanCostService` canonical component result      |

`BudgetService` retains a small deprecated compatibility facade for historical
fixtures and external callers; it is not imported by production cost
calculation paths and no catalogue record supplies its old fields. New code
must use `calculateTripEstimate` and must not add another projection or scalar
writer. `check:deprecated-fields` is now a zero-writer ratchet.

## Verification status

- Catalogue: 1,107 records with explicit admission and local-transport state.
- Generic-field authoring: 0 records; generated detail assets are synchronized.
- KAI-219 debt audit: all four debt counters are zero; prose conflicts are
  empty.
- `check:catalog-sync`: two-generation idempotency and byte-identical committed
  outputs pass.

The old KAI-218 scheduled-deletion milestone is therefore complete. The
remaining compatibility facade is intentionally bounded and documented rather
than a second source of truth.
