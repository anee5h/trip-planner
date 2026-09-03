# KAI-226 car-route provider evaluation

Date: 2026-09-03

## Scope and evidence boundary

This is a provider-selection and validation record. The repository has no configured
OpenRouteService credential, so no production route values, tolls, traffic timings,
quotas, or latency are fabricated. KAI-226 now includes a replaceable hosted ORS
adapter; deterministic tests and the golden harness exercise its contract without
network access.

## Documentation comparison

| Capability              | OpenRouteService hosted directions                                                                                    | NAVITIME car route                                                                                                         | Google Routes API Compute Routes                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Japan road routing      | `driving-car` returns routed road distance/duration for coordinate pairs; KAI-226 supplies the verified access anchor | `route_car` accepts coordinates, node IDs, and ICs; Japan-specific road data is documented                                 | `DRIVE` routes use global Google road data; coordinates/addresses/places are supported                                         |
| Duration/distance       | `routes[0].summary.distance` and `.duration`; normalized independently and labeled provider-backed                    | Route summary exposes movement information; `start_time`/`goal_time` and optional probe traffic are documented             | `duration` and `distanceMeters`; `TRAFFIC_AWARE` and departure-time options are documented                                     |
| Toll detail             | Not consumed by this adapter; KAI-226 keeps toll unknown unless separately evidenced                                  | `fares`; `condition` supports toll/free preferences; `etc` supports time-aware ETC pricing; Smart IC is an explicit option | `tollInfo.estimatedPrice` and toll passes are supported; toll calculation has billing implications and prices are estimates    |
| Japan-specific controls | Road snapping is provider-owned; ferry/restriction handling remains fail-closed at the KAI-264 access layer           | Smart IC, ETC-only tollgate avoidance, IC waypoints, ferry, vehicle regulation, and free-road modes are documented         | Toll passes and route modifiers are documented; Japan-specific IC/ETC behavior requires live validation                        |
| Failure behavior        | HTTP, quota, network, malformed, and unroutable responses normalize to explicit fail-closed states                    | Failed routes are omitted from multi-route responses; API/contract limits and long-route errors are documented             | HTTP/API errors and no-route responses must be normalized; provider response must never be exposed directly                    |
| Traffic/departure       | Departure is accepted as boundary metadata; this initial adapter makes no live-traffic precision claim                | `start_time` plus optional `use_traffic=probe`; probe traffic is an optional contracted feature                            | Traffic-aware routing and departure-time inputs are documented; live precision must be conditional on request and response     |
| Pricing/quota           | Public hosted service; runtime key is injected by deployment and never committed                                      | Corporate/API-market service; price and request limits are contract-dependent and must be obtained from NAVITIME           | Google Cloud billing applies; field masks are required; toll computation is a higher-billed capability                         |
| Caching/licensing       | No route payload is persisted by KAI-226; review ORS terms before adding cache                                        | Contract/API-market terms must be reviewed before caching or persisting routes                                             | Google Maps Platform terms and attribution restrictions require legal/product review; no route payload is persisted by KAI-226 |

Primary sources:

- OpenRouteService directions API: <https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/json/post>
- OpenRouteService API usage/limits: <https://openrouteservice.org/plans/>
- NAVITIME route-car specification: <https://api-sdk.navitime.co.jp/api/specs/api_guide/route_car.html>
- NAVITIME API/SDK service overview: <https://api-sdk.navitime.co.jp/api/>
- Google Compute Routes: <https://developers.google.com/maps/documentation/routes/compute_route_directions>
- Google toll calculation: <https://developers.google.com/maps/documentation/routes/calculate_toll_fees>
- Google TollInfo reference: <https://developers.google.com/maps/documentation/routes/reference/rest/v2/TollInfo>
- NEXCO Drive Plaza route/toll search (validation oracle candidate): <https://www.driveplaza.com/dp/SearchTop>
- Shuto Expressway fee information: <https://www.shutoko.jp/fee/fee-info/>
- Hanshin Expressway fee information: <https://www.hanshin-exp.co.jp/drivers/ryoukin/>

## Live representative-route matrix

Status for every row: **not run — credentials/client unavailable**. These routes
are the required follow-up matrix, not fixture output and not asserted production
truth.

- Nakayama/Yokohama → Hakone
- Nakayama/Yokohama → Karuizawa
- Tokyo → Karuizawa
- Tokyo → Kawaguchiko
- Tokyo → Nikko
- Rural Nagano → Karuizawa
- Rural Gunma → Karuizawa
- Toll-free route
- Expensive expressway route
- Parking + walk destination (route must terminate at the access anchor)
- Seasonal/restricted road case
- Island/ferry-required case

For each live run, record provider, request options, departure instant/timezone,
origin/access-anchor IDs, road distance, duration, toll amount and basis, route
availability, retrieval timestamp, response/error code, and the NEXCO/Shuto/Hanshin
oracle result where applicable. Run outbound and return independently.

## Decision

OpenRouteService is the first hosted adapter for KAI-226. The application remains
provider-neutral. Production acquisition flows through the server-side Pages
Function `/api/car-route` (`functions/api/car-route.js`), which holds the ORS
credential ONLY in `OPENROUTESERVICE_API_KEY` (Pages Function env / `.dev.vars`);
the browser never receives the key and no `VITE_*` ORS variable exists. The
endpoint accepts only origin/target coordinates + direction, never provider
URLs, and returns Meguruto's canonical normalized `CarRouteResult`.

Flow:

    browser view model
        → carRouteAcquisition.acquireCarRoutes (client, bounded shortlist)
        → POST /api/car-route (Pages Function)
        → ORS driving-car (server-side key)
        → canonical CarRouteResult × outbound + return
        → RecommendationContext.carRoutes
        → TripDurationService / TripEstimateEngine / Journey (canonical)

The adapter requests only `driving-car` route facts, targets the KAI-264 access
anchor (explicit anchor or derived candidate), and leaves tolls unknown. Google
and NAVITIME remain future replaceable candidates after product, quota, legal,
and Japan-specific toll validation.

The live representative matrix remains **not run — no credential configured in
this environment**. Until a deployment runs it, fixture output is not production
route truth. Missing provider output, missing return output, unknown tolls, and
provider errors remain explicit unavailable or unknown states; they never become
a straight-line distance, average-speed duration, `distance × ¥18/km`, or zero
toll. No Haversine value is ever promoted to canonical distance/duration/cost.
