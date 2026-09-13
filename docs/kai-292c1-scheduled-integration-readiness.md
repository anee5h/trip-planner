# KAI-292C1 — scheduled journey integration readiness

## Scope

This audit measures whether the normal Meguruto product runtime can invoke the pure `routeBestScheduledJourney(...)` composer today. It does not infer readiness from the existence of the static importers or from architectural possibility.

The composer is intentionally not wired into product services in this slice. It accepts exact normalized stop identities, a matching normalized graph and coverage report, an explicit `YYYY-MM-DD` service date, and absolute earliest-departure service seconds.

## Current product path

The current compatibility path is:

```text
recommendation / feasibility
  -> RecommendationPipeline
  -> TripDurationService.getTravelDurationEvidence(...)
  -> OriginAwareTransportService.getOriginAwareTransportEstimate(...)
  -> JourneyBuilder / Journey
```

Evidence:

- `src/shared/services/recommendation/RecommendationPipeline.ts:397-419` selects the existing origin-aware estimate path.
- `src/shared/services/recommendation/TripDurationService.ts:167-240` calls `getOriginAwareTransportEstimate(...)` and builds a compatibility Journey for that estimate.
- `src/shared/services/transport/JourneyService.ts:234-270` exposes the existing origin-aware Journey seam and delegates to `getTravelDurationEvidence(...)`.
- `src/shared/services/transport/JourneyBuilder.ts:237-267` converts one origin-aware estimate into one canonical Journey leg.
- `src/shared/services/transport/OriginAwareTransportService.ts:104-170` defines a single-mode `OriginAwareTransportEstimate`; it has no scheduled graph, coverage, exact stop IDs, service date, or earliest-departure seconds.

`routeBestScheduledJourney(...)` is not imported by any product runtime module. The static GTFS schedule/transfer modules are pure import/routing primitives used by tests, audits, and transit scripts.

## Required runtime inputs

| Input | Status | Evidence and blocker |
|---|---|---|
| Normalized graph | **unavailable** | `NormalizedTransitGraph` is produced by static importers such as `src/shared/services/transport/static/gtfsScheduleImporter.ts:622-797`. No production `src` module loads a scheduled GTFS/GTFS-JP graph. The existing runtime uses estimator/topology code instead. |
| Matching `TransitCoverageReport` | **unavailable** | Coverage is returned by the static importers alongside the graph, but no product runtime loader supplies it to recommendation, feasibility, JourneyService, or JourneyBuilder. |
| Exact normalized origin stop ID | **unavailable / ambiguous** | `RecommendationContext` stores optional `homeStationCoords`, `originAnchorId`, municipality, prefecture, and zone data (`src/shared/services/recommendation/RecommendationContext.ts:72-120`). `useTripSync` resolves station labels to coordinates only (`src/shared/hooks/useTripSync.ts:263-376`). `originAnchorId` is optional and is not proven to be a normalized GTFS stop ID. |
| Exact normalized destination stop ID | **unavailable / ambiguous** | `Destination` has catalogue `id`, coordinates, transport zones, and optional relationship IDs (`src/shared/types/destination.ts:485-589`), but no normalized scheduled-stop identity. `JourneyEndpoints.ts:95-124` creates a destination endpoint from the catalogue ID/coordinates, not a graph stop ID. |
| Explicit `YYYY-MM-DD` service date | **flow-dependent** | `TravelDateSelection.day1` is an explicit ISO date when selected (`src/shared/services/recommendation/TravelConditions.ts:20-38`). `RecommendationContext.travelDates` is optional (`RecommendationContext.ts:112-116`). Home/Explore derive it only when a date is selected (`src/features/destinations/Destinations.tsx:279-292`). This is not enough without the other inputs. |
| Earliest departure service seconds | **unavailable** | Neither `RecommendationContext` nor `TripDurationContext` contains a departure-time field (`RecommendationContext.ts:72-133`). Planner `DayPlanOptions.startTime` is an optional presentation/planning window and defaults to `09:00` in `DayPlanGeneratorService.ts:270-277,445-450`; it is not a user-confirmed transit departure and must not be converted into a fabricated service-time input. |

## Flow-by-flow readiness

### Home recommendation

**Cannot invoke scheduled routing today.** Home recommendation has optional origin coordinates, transport modes, and optional travel dates, but no production graph, matching coverage, exact normalized origin/destination stop IDs, or earliest-departure service seconds. The current pipeline remains the origin-aware estimate path (`RecommendationPipeline.ts:397-419`). No zero-eligible scheduled branch is added.

### Explore

**Cannot invoke scheduled routing today.** Explore derives optional `TravelDateSelection` values (`Destinations.tsx:279-292`) and uses the same origin-aware estimator for transport checks. It does not load the scheduled graph/coverage or resolve both endpoints to exact normalized stop IDs, and it has no earliest service departure input.

### Destination detail

**Cannot invoke scheduled routing today.** Destination detail calls `getOriginAwareTransportEstimate(...)` using the home origin coordinates (`DestinationDetails.tsx:918-925`). Destination catalogue coordinates and nearest-station prose/relationships are not exact normalized graph stop identities, and no scheduled graph, coverage, service date, or departure seconds enter this path.

### Planner generation

**Cannot invoke scheduled routing today.** `DayPlanOptions` can carry an optional `travelDate` and `startTime` (`DayPlanGeneratorService.ts:270-277`), but planner generation has no matching normalized graph/coverage or exact normalized origin/destination stop IDs. `startTime` is a planning-window value with a `09:00` fallback (`DayPlanGeneratorService.ts:445-450`), not a defensible scheduled departure input. Existing planner travel steps remain rough/bounded display planning, not scheduled Journey composition.

## Dataset and identity findings

- A production-safe scheduled graph is **not loaded today**. No scheduled graph artifact exists under `public`; static GTFS schedule/transfer importers are not runtime loaders. The runtime station data loaded by `useTripSync` is `/data/stations-by-prefecture.json` for coordinate lookup only (`useTripSync.ts:263-273`).
- Matching coverage is **not loaded today**. Static C2/D1 coverage remains in importer results and audit/script paths.
- Existing destination station-anchor evidence is not a scheduled-router endpoint bridge. `qa/kai-291/destination-station-anchors.json:53-58,112-119` records ODPT provider station IDs such as `odpt.Station:...`; it does not provide normalized GTFS stop IDs. The normalized graph identity contract keeps provider/feed namespaces explicit (`src/shared/services/transport/static/transitGraphTypes.ts:8-15,120-146`). No crosswalk proves that the QA ODPT anchor namespace equals a runtime GTFS/GTFS-JP graph namespace.
- Coordinates are not exact stop identities. Human station labels are resolved to coordinates, not to normalized stops. Catalogue destination IDs and nearest-station relationships are not normalized stop IDs.
- Travel date is not departure time. Current wall-clock time is not a planned departure and is not used as one.

## Product integration decision

Do **not** modify `TripDurationService`, `OriginAwareTransportService`, `RecommendationContext`, recommendation ranking, feasibility, planner generation, or UI in KAI-292C1.

At least one required input is unavailable or ambiguous in every normal product flow, so adding a zero-eligible production branch would be dishonest. The correct next seam requires an explicit, reviewed runtime contract for:

1. production-safe graph and matching coverage loading;
2. exact normalized origin-stop resolution;
3. exact normalized destination-stop resolution/crosswalk;
4. explicit service-date ownership;
5. explicit earliest-departure ownership;
6. preserving a canonical multi-leg Journey rather than flattening it into `OriginAwareTransportEstimate.mode`.

Until those are supplied and proven, the C1 composer remains an internal pure routing primitive and the current compatibility estimate path remains unchanged.
