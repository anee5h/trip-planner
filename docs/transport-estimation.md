# Meguruto transport estimation

## Purpose

This document describes the transport architecture and uncertainty model used by Meguruto. It focuses on the actual interfaces between topology, curated route data, provider routes, bounded fallbacks, budget, recommendation, detail, and planning. It does not claim nationwide live timetable routing or universal travel-time accuracy.

## Problem statement

A Japan travel estimate is not one number looked up from one table. The result depends on:

- the user's origin coordinates, station identity, municipality, and transport zone;
- the selected mode: train, shinkansen, bus, ferry, flight, rental car, or personal car;
- whether the destination is on the same local network, an intercity corridor, an island, or a remote access zone;
- access legs to a corridor hub or airport/port;
- transfers and directionality;
- date and seasonal operation, especially for ferries;
- whether a fare covers a corridor, local access, or a complete journey;
- provider availability, response limits, quota, and credential configuration; and
- whether the data describes a route, a static topology, a schedule fact, a modelled range, or only a rough geographic fallback.

Meguruto therefore carries duration, fare, confidence, source, completeness, and failure reason separately. A usable estimate can still be estimated; an unavailable estimate is not treated as zero.

## Supported transport modes

[`TransportMode`](../src/shared/services/transport/types.ts) currently contains:

- `train`;
- `shinkansen`;
- `bus`;
- `ferry`;
- `flight`;
- `car` for a rental/vehicle route; and
- `my_car` for a personal-car route.

The application can compare multiple authorized modes for one destination. The canonical `OriginAwareTransportEstimate` is still a single selected mode at a time. The provider-neutral [`Journey`](../src/shared/types/journey.ts) model can represent legs and partial journeys, but not every theoretical multimodal combination is automatically available to the product.

### Public transport

Train, shinkansen, and bus use transport topology plus curated ground/corridor data where a precise origin/destination identity is available. A corridor record can be verified while the complete journey becomes estimated after bounded access time is added. A train request without an exact municipality/corridor row can fall back to a bounded local/regional estimate or remain unavailable.

Ferries and flights use curated route/fare records with operating-period and temporal checks. Their corridor duration/fare can be source-backed while airport/port access is calculated and therefore marked estimated.

### Private and rental car

`car` and `my_car` share the route-duration boundary but differ in cost assumptions. A normalized round trip must contain usable outbound and return routes before it can provide canonical car duration/cost evidence. Toll state can remain unknown even when route distance and duration are available. Rental and personal-car cost options are vehicle/party assumptions, not provider route facts.

## Transport topology

[`TransportTopologyService.ts`](../src/shared/services/transport/TransportTopologyService.ts) resolves the origin and destination into transport zones and determines which modes are authorized. It uses:

- mainland/prefecture mappings;
- non-overlapping island and mainland coordinate bounds;
- local mode declarations;
- explicit topology edges; and
- dedicated ferry/airport zone data.

The topology layer is an authorization input, not a route duration. It can say that a mode may connect two zones without proving a station pair, departure, fare, or door-to-door journey. Islands and remote zones are intentionally prevented from inheriting mainland corridors merely because they share a prefecture.

`getValidModes` then intersects topology-authorized modes with the user's selected modes and destination access rules. An empty result is a conservative “no valid mode” outcome for origin-aware recommendation paths.

## Evidence hierarchy and selection

Meguruto does not use one universal precedence sentence such as “provider data always wins.” The actual hierarchy is mode-specific inside [`getOriginAwareTransportEstimate`](../src/shared/services/transport/OriginAwareTransportService.ts):

1. **Car:** a destination-scoped, usable outbound and return provider route produces a routed estimate. A provider route with unknown tolls still carries unknown toll evidence.
2. **Flight and ferry:** curated route facts are used when their route/temporal rules authorize them; access overhead makes the combined duration estimated, and fare scope remains corridor-only when it does not cover the whole journey.
3. **Train, shinkansen, and bus:** exact municipality/corridor or hub-access route rows are used when the topology and endpoint constraints authorize them. Hub catchment can preserve verified corridor provenance while making the complete duration estimated.
4. **Train fallback:** when a precise ground row is unavailable, `SafeGroundEstimateService` can provide a bounded rough estimate under its geographic and mode policy. Local bounded fare envelopes are separate from complete station-to-station fares.
5. **No defensible result:** the function returns `null`, or the downstream Journey/cost layer returns unknown, partial, or unavailable rather than inventing a duration.

When several requested modes produce estimates, the selector compares **decision semantics** first: a reliable estimate outranks a conservative low-confidence rough estimate. Within the same semantics, it compares decision one-way minutes. Low-confidence rough estimates use a conservative upper bound plus padding; they are not ranked from a midpoint as if they were routed.

Key types and helpers are in [`OriginAwareTransportService.ts`](../src/shared/services/transport/OriginAwareTransportService.ts), [`SafeGroundEstimateService.ts`](../src/shared/services/transport/SafeGroundEstimateService.ts), [`LocalBoundedFareEstimator.ts`](../src/shared/services/transport/LocalBoundedFareEstimator.ts), [`GroundRouteEstimator.ts`](../src/shared/services/transport/GroundRouteEstimator.ts), and [`TransportDurationEvidence.ts`](../src/shared/services/transport/TransportDurationEvidence.ts).

## Confidence, provenance, and completeness

An origin-aware estimate can carry:

- `source`: for example `verified_ground_route`, `verified_car_route`, `verified_ferry`, `verified_flight`, `rough_transit_fallback`, or `car_fallback_model`;
- `evidence`: `verified`, `estimated`, or `unknown`;
- `estimateSource`: `routed`, `route-distance-derived`, or `rough`;
- `confidence`: `high`, `medium`, or `low`;
- `decisionSemantics`: `reliable` or `conservative`;
- fare evidence and fare scope;
- provider/source URL and checked/retrieved time; and
- access distances, fallback reasons, service-period, operator, and reservation details where the source supplies them.

`Journey` adds its own completeness and provenance. A partial local-access Journey explicitly says that the access mode is known while the origin journey/duration remains unavailable. The transport layer does not promote a partial leg to a complete trip.

## Conservative feasibility

The system uses different values for display and decisions when evidence is weak. A low-confidence rough regional estimate can be useful to avoid promising an impossible day trip, but its upper bound is used conservatively and its source remains visible. This prevents two common errors:

- treating a straight-line or regional envelope as an exact station-to-station route;
- using a rough midpoint to make an apparently precise budget or overnight decision.

The distinction is implemented by `getTravelDecisionSemantics` and `getDecisionOneWayMinutes`. It is consumed by `TripDurationService`, recommendation filters, weekend policy, and planning.

## Car routing boundary

The browser adapter is [`CarRouteApiProvider.ts`](../src/shared/services/transport/CarRouteApiProvider.ts). It posts to `/api/car-route` with a validated origin, destination/access-anchor identity, direction, and optional departure time. It maintains a bounded in-memory cache keyed by origin, destination/access anchor, and direction.

The Pages Function [`functions/api/car-route.js`](../functions/api/car-route.js) then:

1. requires `POST`;
2. applies a per-isolate request guard;
3. caps the request body at 4 KiB;
4. parses and validates the allow-listed request shape and coordinates;
5. calls the fixed server-side OpenRouteService endpoint using a secret Pages binding;
6. classifies quota/auth/network/no-route/provider failures;
7. sanity-checks route distance, duration, and implausible speed; and
8. returns Meguruto's normalized route result rather than raw provider JSON.

The endpoint returns validation failures as 4xx. Canonical provider outcomes such as `provider_not_configured`, `no_route`, quota, and network errors remain data in the normalized envelope so clients can keep one contract. A missing key does not turn into a fake route.

Car cost is downstream of route evidence. Without a usable normalized round trip, toll/distance-dependent car cost remains unavailable or modelled according to the explicit car policy; the budget layer does not substitute a global distance heuristic for a provider route.

Tests: [`car-route-core.test.js`](../functions/api/car-route-core.test.js), [`CarRouteApiProvider.test.ts`](../src/shared/services/transport/__tests__/CarRouteApiProvider.test.ts), [`OpenRouteServiceCarRouteProvider.test.ts`](../src/shared/services/transport/__tests__/OpenRouteServiceCarRouteProvider.test.ts), and [`carRouteOutageFallback.test.ts`](../src/shared/services/transport/__tests__/carRouteOutageFallback.test.ts).

## Public transport in the current product path

The current production recommendation/detail/planner path primarily consumes `OriginAwareTransportService` results backed by topology, curated corridor/local data, ferry/flight facts, bounded fallbacks, and car-route refinement. It does not call a nationwide timetable planner for every user request.

The static scheduled-transit seam is conditionally used by [`DayPlanGeneratorService.ts`](../src/shared/services/recommendation/DayPlanGeneratorService.ts) when the planner has an exact scheduled origin product, destination product, dataset mapping, and resolved temporal context. The scheduled result is retained as scheduled evidence; it is not flattened into a generic claim that every origin/destination has timetable coverage.

## ODPT and GTFS boundaries

### ODPT API boundary

[`OdptApiProvider.ts`](../src/shared/services/transport/OdptApiProvider.ts) is a thin browser adapter for `/api/odpt`. It can request allow-listed operations such as nearby stations, stations, railways, fares, calendars, and narrow timetable shapes. The Pages Function [`functions/api/odpt.js`](../functions/api/odpt.js) owns:

- request schema and filter validation;
- provider-key injection;
- request identity and provider scope;
- in-flight deduplication;
- Cloudflare Cache API or isolate-local cache selection;
- per-attempt provider budget;
- bounded 503 retry through the core provider module; and
- normalized `records`, `no_data`, or `error` results.

Broad timetable queries are rejected or fail closed at the 1 MiB response guard. Errors are not cached as empty data. The cache and budget are explicitly isolate/edge scoped; they are not a globally distributed provider quota.

The ODPT direct-timetable resolver is not the current production recommendation path. [`OdptDirectJourneyService.ts`](../src/shared/services/transport/OdptDirectJourneyService.ts) explicitly states that it ships capability only, with no production callers, no JR-East support, and no general transfer/feeder integration. The current product boundary is the implementation and tests linked below; no experimental ODPT capability is presented as deployed coverage.

### Static GTFS/GTFS-JP artifacts

The registry currently pins two scheduled datasets in [`scheduledTransitDatasetRegistry.ts`](../src/shared/services/transport/static/scheduledTransitDatasetRegistry.ts):

- `sakata-runrunbus`;
- `toei-oedo-gtfs-20260314`, published as a gzip static asset with ODPT as its upstream source.

[`scheduledTransitDataset.ts`](../src/shared/services/transport/static/scheduledTransitDataset.ts) validates schema, dataset identity, coverage hash, graph hash, namespace, and entity provenance. [`scheduledTransitRoutingBoundary.ts`](../src/shared/services/transport/static/scheduledTransitRoutingBoundary.ts) refuses to route until dataset, exact origin endpoint, exact destination endpoint, direction, and temporal context all resolve. It returns explicit `not_routed` reasons such as `dataset_unresolved`, `origin_unresolved`, `destination_unresolved`, `temporal_unresolved`, or dataset mismatch.

This is bounded scheduled routing, not nationwide timetable coverage. Current user-origin and catalogue destination records are not automatically mapped to exact scheduled stop identities, and no universal Home/Explore timetable integration is claimed.

### Temporal contract

Scheduled routing requires an authoritative service date and departure time from the caller. A duration mode, planner default, or inferred next departure is not transit evidence. The boundary resolves time in `Asia/Tokyo`, converts valid service-day clock values to service seconds, and returns an explicit unresolved/not-routed outcome when temporal context is absent, malformed, outside the service calendar, or otherwise cannot be bound to the selected dataset. A controlled Journey proof for one corridor does not establish general product coverage or authorize timetable claims for other origins and destinations.

## Downstream consumers

Transport evidence reaches these consumers through shared seams:

- **Home:** [`useTripRecommendations.ts`](../src/features/home/hooks/useTripRecommendations.ts) builds context; the recommendation pipeline uses valid modes and shared travel evidence.
- **Explore:** [`Destinations.tsx`](../src/features/destinations/Destinations.tsx) uses origin-aware mode/duration/budget policies for browse, sort, and filters.
- **Destination detail:** [`DestinationDetails.tsx`](../src/features/destinations/DestinationDetails.tsx) and planning components request detail-scoped estimates and display provenance/unknown states.
- **Budget:** [`tripEstimateEngine.ts`](../src/shared/services/budget/tripEstimateEngine.ts) turns transport evidence into cost components with fare scope and completeness.
- **Planner:** [`DayPlanGeneratorService.ts`](../src/shared/services/recommendation/DayPlanGeneratorService.ts) builds route legs, assumptions, optional scheduled evidence, and plan cost ranges.
- **Journey model:** [`JourneyService.ts`](../src/shared/services/transport/JourneyService.ts) and [`JourneyBuilder.ts`](../src/shared/services/transport/JourneyBuilder.ts) preserve endpoints, legs, directionality, availability, and completeness.

## Failure handling

| Failure                                 | Actual behavior                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Origin missing/unresolved               | Origin-aware estimate is unknown/null; callers retain or block according to the relevant day/overnight policy       |
| Unsupported topology zone/mode          | Mode is not returned by `getValidModes`; no route is fabricated                                                     |
| Curated corridor absent                 | Exact ground lookup returns no result; train may use a bounded fallback, while unsupported modes remain unavailable |
| Low-confidence regional estimate        | Marked rough/low/conservative; upper-bound semantics apply to decisions                                             |
| Car provider unavailable/no route/quota | Normalized error/no-route state; car cost/toll remains unknown or downstream fallback is explicitly labelled        |
| Ferry/flight temporal mismatch          | Route/fare availability is rejected or returned without a verified fare; no year-round assumption is created        |
| ODPT provider error/oversized response  | Canonical `error` outcome; failures are not rewritten to `[]` or cached as no data                                  |
| Static scheduled dataset mismatch       | Typed fail-closed dataset error or `not_routed` boundary result                                                     |
| Cost ingredient missing                 | Component is unavailable, not applicable, or model-estimated; unknown is not zero                                   |

## Known limitations

- There is no universal door-to-door route planner for all Japan.
- Provider/curated corridors do not cover every origin, station, access leg, transfer, or fare.
- Corridor fares can be source-backed while access and complete-journey cost remain estimated.
- Ferry/flight access overhead is calculated, not a fully verified feeder itinerary.
- Car tolls can remain unknown even when route duration is available.
- ODPT direct timetable coverage is pilot-scoped and the direct Journey service is not a general production recommendation caller.
- Static GTFS artifacts require exact reviewed endpoint identities and temporal inputs; most catalogue/user endpoints are not automatically mapped.
- On-train scheduled duration, when available, is not door-to-door time and excludes walking, waiting, transfers, and disruption delay.

## Relevant tests and existing references

- Transport estimate and topology tests: [`src/shared/services/transport/__tests__`](../src/shared/services/transport/__tests__)
- Journey semantics: [`JourneySemantics.test.ts`](../src/shared/services/transport/__tests__/JourneySemantics.test.ts)
- Scheduled boundary tests: [`ScheduledProductJourneyService.test.ts`](../src/shared/services/transport/__tests__/ScheduledProductJourneyService.test.ts), [`scheduledTransitRoutingBoundary.test.ts`](../src/shared/services/transport/static/__tests__/scheduledTransitRoutingBoundary.test.ts)
- ODPT boundary tests: [`functions/api/odpt-core.test.js`](../functions/api/odpt-core.test.js), [`odpt-runtime-protection.test.js`](../functions/api/odpt-runtime-protection.test.js)
The implementation and tests linked throughout this document are the current evidence for these boundaries. Pilot artifacts and intermediate design documents are not production coverage claims.