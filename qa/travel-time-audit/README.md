# Travel-time accuracy audit and estimator redesign

This audit records the provenance of the displayed estimate before changing its
model. It is intentionally separate from the catalogue's corridor registry:
a prefecture-pair row is not a route from an arbitrary origin to an arbitrary
attraction in that prefecture.

## Canonical provenance

The destination detail path is:

```text
DestinationDetails
  -> getOriginAwareTransportEstimate
    -> JourneyService / JourneyBuilder
      -> TravelEstimateDisplayMetadata
        -> formatTravelEstimateLabel
```

Car routing is attempted before the fallback on the scoped car-route path:

```text
CarRouteProvider
  -> CarRouteApiProvider
    -> /api/car-route (Cloudflare Function)
      -> OpenRouteService driving-car JSON
  -> endpoint/identity/sanity validation
  -> JourneyBuilder
  -> car outage fallback only for temporary provider failures
```

The canonical fallback path is now:

```text
SafeGroundEstimateService
  -> GroundFallbackModel
     car: straight-line distance -> detour factor -> road distance
         -> urbanity/topology speed band -> overhead -> range
     train: access + waiting + in-vehicle + transfer + destination access
            metro/suburban bands, or low-confidence regional boundary
```

`getTransportEstimates` / `estimateBetween` remains a legacy generic API used
only by its own compatibility tests; repository search found no production UI
caller. The audit does not treat that dead generic path as the displayed
origin-aware estimate.

## Mandatory regression provenance

The following is the output of `scripts/audit/travel-time-accuracy-benchmark.ts`
and a direct provenance harness run against the current catalogue. `provider`
is `none` in this offline unit run: no production ORS response is claimed. In
production, a car provider result is accepted only when it has positive route
distance/duration, route distance at least the straight-line distance, and an
average speed in the sanity band. Otherwise the explicit provider error is
carried into the fallback reason.

| Case                                | straight-line km | mode  | provider / result | fallback reason                         | canonical/display range | source / confidence | implied vs reference km/h |
| ----------------------------------- | ---------------: | ----- | ----------------- | --------------------------------------- | ----------------------- | ------------------- | ------------------------: |
| Nakayama → Roppongi Hills           |             23.6 | train | none              | `metro_transit_topology_unavailable`    | 40–74 min               | rough / medium      |               24.8 / 25.7 |
| Shizu → Kirin Beer Yokohama Factory |             62.4 | train | none              | `suburban_transit_topology_unavailable` | 99–190 min              | rough / medium      |               25.9 / 31.7 |
| Yokohama → central Tokyo            |             25.9 | car   | none              | `car_provider_unavailable_or_unusable`  | 51–75 min               | rough / medium      |                         — |
| Yokohama → Kawagoe                  |             55.4 | car   | none              | `car_provider_unavailable_or_unusable`  | 86–118 min              | rough / medium      |                         — |
| Yokohama → Boso Peninsula           |             32.4 | car   | none              | `car_provider_unavailable_or_unusable`  | 85–128 min              | rough / medium      |                         — |
| Chidoribashi → Hikone Castle        |             97.8 | train | none              | `regional_transit_topology_unmodeled`   | 180–420 min             | rough / low         |               19.6 / 46.9 |
| Chidoribashi → Amanohashidate       |            101.1 | train | none              | `regional_transit_topology_unmodeled`   | 180–420 min             | rough / low         |               20.2 / 30.6 |
| Kuga → Tsuwano Castle               |             50.7 | train | none              | `regional_transit_topology_unmodeled`   | 180–420 min             | rough / low         |                10.1 / 8.6 |

The low-confidence regional rows are deliberately not presented as narrow
ranges. The UI renders them as **Travel time uncertain — check directions**.
They also carry `decisionSemantics: "conservative"` through Journey and
recommendation layers: feasibility uses the upper bound plus safety overhead,
while ranking/transport bonuses and budget-origin cost synthesis do not treat
the rough midpoint as authoritative. This prevents a false 50-minute result
from making a regional day trip appear feasible.

## Root causes proved by the trace

1. Broad ground-route rows were being treated as personalized origin-to-
   destination facts. This is the direct failure behind the Osaka regional
   cases and other distant destinations. The fallback now accepts only an
   exact municipality corridor or an access-hub route; otherwise it uses an
   explicit fallback or unavailable result.
2. The generic coordinate fallback used `distance / speed + small overhead`.
   It had no origin access, waiting, transfer, destination access, or regional
   topology boundary. That made train cruising speed look like door-to-door
   journey speed and produced repeated narrow upper bounds.
3. Car fallback used one 65 km/h assumption with a generic range. It did not
   distinguish urban congestion, suburban expressway likelihood, regional
   connectivity, or peninsula detours.
4. A successful ORS HTTP response was not enough: malformed/zero facts and
   physically impossible route facts could reach the route handoff. Validation
   now rejects those responses and records the reason.
5. Display formatting previously treated estimated and routed durations too
   similarly. The UI now labels rough estimates and suppresses precision for
   low-confidence regional transit.

## ORS audit contract

`functions/api/car-route-core.js` and the client provider now check:

- ORS coordinate order remains `[lng, lat]` at the request boundary.
- The server owns the endpoint and secret; the client cannot supply a provider
  URL or API key.
- 429 is `quota_exceeded`, 5xx is `provider_http_5xx`, timeout/network errors
  remain observable, and unroutable is authoritative (no rough car fallback).
- empty, malformed, zero-distance, zero-duration, below-straight-line, and
  implausible-speed results are not usable routes.
- client requests abort after a bounded timeout.
- cache keys include origin, destination coordinates, destination id, access
  anchor, and direction; failures are not cached.
- valid routed results are selected before the outage fallback and are never
  replaced by weaker fallback data.

A live ORS-routed cohort is intentionally reported as unavailable by the
offline benchmark rather than inventing provider output. Populate it with the
provider-boundary smoke against the deployed Cloudflare function and a real
production key.

## Benchmark

The benchmark contains the eight independent reference-backed journeys plus
internal catalogue regression fixtures. These cohorts are intentionally kept
separate:

### Reference-backed accuracy cohort

The eight mandatory user-provided comparisons are the only rows used for
accuracy claims. Their recorded Google/reference journey times are independent
of the estimator. The report includes before/after ranges for every mandatory
route and, by cohort:

- median absolute error;
- median percentage error;
- P75, P90, and maximum absolute error;
- reference-above-upper-bound rate;
- material-underestimate rate;
- worst cases; and
- implied versus reference effective speed for transit.

### Internal regression cohort

The catalogue rows sourced from `ground-routes.json` are useful for checking
route selection, endpoint semantics, provenance stability, and accidental
regressions. Their existing ranges are not independent ground truth, so they
are reported only as `internalRegression` rows and are excluded from all
accuracy metrics.

Run it with:

```bash
npx tsx --tsconfig tsconfig.app.json \
  scripts/audit/travel-time-accuracy-benchmark.ts
```

The JSON report contains `referenceBackedAccuracy` and `internalRegression`
separately. No live ORS result is synthesized. The `orsRoutedCar` cohort stays
empty until a small provider-boundary smoke captures real deployed responses.

## Files

- `src/shared/services/transport/GroundFallbackModel.ts` — systemic car and
  transit fallback model with component diagnostics.
- `src/shared/services/transport/SafeGroundEstimateService.ts` — canonical
  fallback selection and provenance.
- `src/shared/services/transport/OriginAwareTransportService.ts` — exact
  corridor policy and origin-aware handoff.
- `src/shared/services/transport/CarRouteProvider.ts` — route sanity and
  identity validation.
- `src/shared/services/transport/CarRouteApiProvider.ts` and
  `functions/api/car-route-core.js` — timeout, cache, proxy, and ORS boundary.
- `src/shared/services/transport/formatters.ts` — evidence-aware UI labels.
- `scripts/audit/travel-time-accuracy-benchmark.ts` — 72-journey evaluation.
- `src/shared/services/transport/__tests__/TravelTimeAccuracyAudit.test.ts` —
  mandatory regression/provenance/effective-speed tests.
