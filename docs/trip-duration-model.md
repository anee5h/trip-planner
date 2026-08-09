# Trip Duration Model (KAI-50)

This document defines the canonical duration model enforced by Meguruto
after KAI-50. It supersedes the ambiguous legacy semantics described in
`docs/KAI-6-research-report.md`.

## Canonical fields

### `recommendedVisitHours` (canonical)

`recommendedVisitHours: { min, max }` is the time spent experiencing the
destination itself, in hours. It is origin-independent and is the only
source used for:

- visit-duration banding (`getVisitBand`, `matchesVisitDuration`);
- weekend capacity scoring;
- destination card/details visit labels;
- the visit component of runtime total duration estimates.

Every destination that can be duration-planned must carry valid
`recommendedVisitHours` (`0 < min <= max <= 48`).

### `totalTripHours` (deprecated legacy compatibility)

`totalTripHours` is optional and deprecated. Historical imports and
expansion scripts populated it with two incompatible meanings:

- on-site visit time, matching `recommendedVisitHours`; or
- a whole-trip estimate from a fixed origin (often Tokyo/Yokohama),
  including one-way or round-trip transport.

Runtime planning never reads `totalTripHours`. Records must not be
required to carry it merely to clear an old audit warning, and new
catalogue data must not populate it. Existing values remain in the
catalogue for historical review only.

### Travel duration evidence (runtime)

Every origin-aware duration carries one of three evidence states:

- `verified`: a canonical origin-aware route from the ground, flight, or
  ferry registry (`getOriginAwareTransportEstimate`).
- `estimated`: a bounded coordinate/local-ground estimate used only for a
  day-trip feasibility/display decision. It requires finite coordinates,
  one of the four major land-transport zones (Honshu, Hokkaido, Kyushu, or
  Shikoku) on both endpoints, same-zone local topology, an already authorized
  ground mode, destination mode support, no `localAccessUnestimated`
  restriction, and a distance of at most 120 km. It is never a registry fact.
- `unknown`: no usable duration evidence. It is not eligible for a
  personalized constrained day trip.

Canonical verified evidence always wins. The estimated policy is deliberately
narrow: remote/small-island zones, ferry routes, flight routes, and cross-zone
long-distance registry gaps never gain train/car feasibility from coordinate
distance. A configured origin zone without coordinates also remains unknown.

### Total trip duration (runtime-derived)

Total trip duration is derived at runtime:

```text
visit duration + round-trip origin-aware travel + legitimate buffers
```

For constrained day trips, verified travel is preferred. Estimated travel
uses the upper bound plus a conservative 30-minute one-way padding before it
is compared with the Short outing / Half day / Full day envelope. Weekend
(`2D1N`) planning keeps its separate canonical travel policy.

Total trip duration is **mode-dependent**. Budgeting and recommendation
scoring derive the duration for exactly the transport mode being priced
(`estimateTripDuration(dest, context, [mode])`), never a shared fastest-mode
total. A slow mode therefore gets its own meal count, rental tier, and cost
range even when a faster verified mode exists. Estimated travel is never used
to calculate transport fares or budget ranges.

When no origin is known, the runtime total is the visit duration alone.
When an origin is known but travel evidence is unknown, the candidate is
excluded from personalized constrained day-trip planning rather than being
assigned a fabricated total. Cards render estimated travel with `~` / `約`,
and recommendation explanations never describe estimated travel as verified.

## Unknown-duration budget policy

If `recommendedVisitHours` is missing, or the specific mode has no verified
origin-aware duration, duration-dependent budget components are reported as
unavailable:

- Meals: `getDiningFoodRange` returns `null`; no meal count is invented.
- Rental car: the rental tier cannot be selected, so `getTransportCost`
  returns `null` (transport unavailable) instead of pricing a guessed tier.
- `getEstimatedBudgetRange` returns `range: null` with
  `durationIncluded: false`; scoring and explainability do not award a
  budget bonus/penalty or an affordability reason from that incomplete
  estimate.

There is no generic fallback duration. Unknown trip length is never treated
as zero cost and never approximated with `totalTripHours`, category
defaults, opening hours, or a fixed constant.

## Legacy fallback policy

A destination without `recommendedVisitHours` has no canonical visit
duration. `estimateTripDuration` returns `null` for such records; it never
substitutes `totalTripHours`, because that value may already include
transport from an assumed origin. This prevents travel from being counted
twice.

As of the KAI-50 catalogue, every destination already has valid
`recommendedVisitHours`, so this policy changes no current eligibility.
Legacy records lacking the field should be migrated by authoring
`recommendedVisitHours` from editorial evidence, not by inferring it from
`totalTripHours`.

## Audit

The catalogue integrity audit enforces the canonical planning model:

- `TIME_INVALID_VISIT_HOURS` (error): malformed `recommendedVisitHours`.
- `TIME_MISSING_CANONICAL_DURATION` (warning): a non-hub, non-published-POI
  record cannot be duration-planned because it lacks valid
  `recommendedVisitHours`.
- `TIME_POI_MISSING_VISIT_HOURS` / `TIME_HUB_MISSING_VISIT_HOURS`
  (warning): published POI / hub variants of the same check.
- `TIME_INVALID_TOTAL_TRIP_HOURS` (error): `totalTripHours` is present but
  non-positive. The field is optional; a missing value is not a warning.

The old `TIME_MISSING_TOTAL_TRIP_HOURS` warning is removed. Valid modern
records with `recommendedVisitHours` and no `totalTripHours` produce no
timing warning and contribute no warning-baseline debt.

## Migration guidance for legacy records

1. Add or confirm `recommendedVisitHours` from an authoritative visit
   estimate.
2. Leave `totalTripHours` untouched in this PR; do not fabricate values.
3. Optionally remove `totalTripHours` in a later data cleanup PR once no
   historical tooling reads it.
4. Never derive `recommendedVisitHours` from `totalTripHours`, opening
   hours, transport estimates, or sibling records.
