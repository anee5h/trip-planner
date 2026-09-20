# 001 — Transport evidence and uncertainty

**Status:** Current

## Context

Meguruto must answer an origin-aware question even when Japan-wide door-to-door route, fare, access, and timetable evidence is incomplete. A single numeric travel time can hide whether it came from a routed provider response, a curated corridor, a local model, or a geographic guess. Treating those values as interchangeable would make feasibility, ranking, and budget decisions appear more certain than their evidence.

## Considered approaches

The implementation exposes three realistic design choices:

1. Treat catalogue `transportOptions` values as authoritative route facts.
2. Make one universal live timetable/provider planner the source for every request.
3. Use a layered evidence contract in which route facts, curated corridors, scheduled artifacts, bounded estimates, rough fallbacks, and unknown states remain distinguishable.

The repository implements the third approach. It does not claim that the first two were historically rejected in a recorded design meeting.

## Decision

`OriginAwareTransportService` is the shared transport seam for recommendation, detail, planning, cards, roulette, and budget. It returns evidence-bearing estimates rather than raw mode flags.

The current evidence ladder is mode-specific:

- verified provider routes for car when usable outbound and return routes are present;
- curated ground, ferry, flight, and corridor facts when topology, endpoint, route, and temporal rules authorize them;
- scheduled Journey evidence only when a registered dataset, exact origin and destination endpoint identities, direction, and temporal context all resolve;
- bounded local/regional estimates for narrow same-zone situations;
- rough regional fallbacks with `estimated` evidence and conservative decision semantics; and
- `null`, unknown, partial, or unavailable results when no defensible evidence exists.

The scheduled boundary refuses to route on a missing dataset, unresolved endpoint, dataset identity mismatch, invalid direction, or unresolved temporal context. A duration mode or inferred next departure is not a timetable fact. The current registry contains bounded scheduled artifacts, including Sakata RunRun Bus and a Toei Oedo GTFS snapshot; the ODPT API and direct Journey code are capability/pilot seams, not nationwide production timetable coverage.

## Reasons

Evidence type changes what the product is allowed to infer. The service therefore carries `source`, `evidence`, `estimateSource`, confidence, fare scope, provenance, and failure reason separately. `TransportTopologyService` authorizes possible modes; it does not prove a station pair, departure, fare, or door-to-door journey.

This makes the boundary legible to consumers. A corridor can remain verified while access makes the complete estimate estimated. A provider failure remains a normalized provider state. A missing route does not become a fabricated duration.

## Trade-offs

Conservative exclusion reduces coverage. A destination may be omitted from a constrained day-trip recommendation when every available mode is unknown or conservative-only, even though a traveler might eventually find a workable route. Conversely, bounded estimates keep nearby discovery useful without presenting a rough midpoint as an exact journey. The product accepts fewer apparently complete recommendations in exchange for avoiding false precision in feasibility, budget, and explanation.

This is not mathematically optimal route selection and has not been independently validated as nationwide travel accuracy. It is a fail-closed evidence policy for the supported data.

## Consequences

- Consumers must use the origin-aware service instead of unproven catalogue duration fields.
- Transport callers need to handle verified, estimated, partial, unknown, and unavailable outcomes.
- Adding a route source requires identity, scope, temporal, provenance, and failure semantics—not only a number.
- The system has more types and policy seams than a single duration lookup.

## Evidence

- [`OriginAwareTransportService.ts`](../../src/shared/services/transport/OriginAwareTransportService.ts)
- [`SafeGroundEstimateService.ts`](../../src/shared/services/transport/SafeGroundEstimateService.ts)
- [`TransportTopologyService.ts`](../../src/shared/services/transport/TransportTopologyService.ts)
- [`scheduledTransitRoutingBoundary.ts`](../../src/shared/services/transport/static/scheduledTransitRoutingBoundary.ts)
- [`scheduledTransitDatasetRegistry.ts`](../../src/shared/services/transport/static/scheduledTransitDatasetRegistry.ts)
- [`OriginAwareTransportService.test.ts`](../../src/shared/services/transport/__tests__/OriginAwareTransportService.test.ts)
- [`TransportTopologyService.test.ts`](../../src/shared/services/transport/__tests__/TransportTopologyService.test.ts)
- [`ScheduledProductJourneyService.test.ts`](../../src/shared/services/transport/__tests__/ScheduledProductJourneyService.test.ts)
- [`scheduledTransitRoutingBoundary.test.ts`](../../src/shared/services/transport/static/__tests__/scheduledTransitRoutingBoundary.test.ts)
- [Transport estimation](../transport-estimation.md)

## Current limitations

There is no universal door-to-door route planner, nationwide live timetable coverage, or guarantee of current provider availability. Static scheduled artifacts require exact reviewed identities and temporal inputs; most catalogue and user endpoints are not automatically mapped. Ferry/flight access and some corridor access remain estimated, and car tolls can remain unknown.

## Future reconsideration

Reconsider this boundary when measured provider coverage, stable endpoint mappings, temporal inputs, fare/access completeness, and operational failure behavior justify broader integration. A future provider must preserve the same evidence and failure contract rather than flattening new data into a universal numeric duration.
