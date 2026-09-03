# KAI-226 car-route provider evaluation

Date: 2026-09-03

## Scope and evidence boundary

Deterministic tests and the golden harness exercise the provider contract
without network access. On 2026-09-03 a **live validation run** was performed
through Meguruto's own endpoint against the ORS production API (local Pages
Function boundary, key from the gitignored local `.dev.vars`; see the live
record below). No production route values, tolls, traffic timings, quotas, or
latency are fabricated anywhere in this repository.

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

The live representative matrix was run once through Meguruto's own endpoint
against the ORS production API on **2026-09-03** using the local Pages
Function boundary (wrangler pages dev, `functions/api/car-route.js` →
OpenRouteService, key from gitignored local `.dev.vars`) — the full
browser→endpoint→provider→canonical path, not a direct ORS call.

## Live validation record (2026-09-03, local Pages Function boundary, ORS production)

**liveOrsValidated: true** — scope: Meguruto's own `/api/car-route` boundary
against the ORS production API with a real key (local Pages Function
deployment). The Cloudflare-hosted preview still awaits the correctly named
`OPENROUTESERVICE_API_KEY` secret (see below) before the same record can be
reproduced on the remote deployment.

Routes (outbound + return independently; normalized canonical results):

| Route                                                   | Outbound distance | Outbound minutes | Return distance | Return minutes | Result    |
| ------------------------------------------------------- | ----------------: | ---------------: | --------------: | -------------: | --------- |
| Tokyo Station → Karuizawa official parking anchor       |         163.98 km |            136.5 |       163.13 km |          138.0 | available |
| Nakayama/Yokohama → Kamakura (Kanto, candidate coords)  |          31.68 km |             43.9 |        33.35 km |           38.7 | available |
| Nakayama → Chiba Shrine (legacy-car candidate endpoint) |          71.91 km |             69.4 |        70.88 km |           71.5 | available |

All responses: HTTP 200, canonical `CarRouteResult` body only (no raw ORS
`routes/summary/geometry` leak), `toll: unknown`, `confidence: verified`,
`completeness: complete`; per-request direction correct; outbound/return
independently scoped. No key or authorization header appears in responses,
server logs (binding shown as `(hidden)`), or the built client bundle
(bundle-secret scan clean post-run).

Engine consumption (live routes through `TripEstimateEngine`/Journey):
personal car Tokyo→Karuizawa journey legs **136.5 / 138.0 min** with
163.98/163.13 km from the route (no Haversine); fuel+parking known subtotal
survives with toll unknown; party 2 = 1 vehicle, party 11 = 3 vehicles
(×3 known subtotal, both modes). Rental (production `car` mode) uses the same
routed basis with distinct daily-rate costing and the same vehicle scaling.

UI flows (production build served through the same boundary): Personal car
2D1N + Full day and Rental 2D1N + Full day — surfaced top matches are the
acquisition shortlist; 8/10 requests available (+1 honest `no_route` pair for
Mount Tsukuba); displayed travel time provider-backed (Hitachi Seaside Park
"~2 hr" from a 101.8-min leg, Nokogiriyama "~1 hr" from 68.5, Yomiuriland
"~29–37 min" around a 33.7-min leg); station-area POI chips fall back to the
local-access floor (display-only, never canonical cost).

Failure-mode smoke (key removed from the same boundary, no production config
touched): every acquisition returned the canonical `provider_not_configured`
error, the UI fails closed for the car route (no fabricated route, no fake
canonical time/cost), the rail still renders, and the public-train flow is
unaffected. The per-IP rate limiter was also observed returning canonical
429→`quota_exceeded` mid-smoke (12 calls × 4 flows + curls exceeded the
120/10 min local isolate bucket), confirming the bounded-quota path
end-to-end.

The live representative matrix remains **not run** against the **Cloudflare
deployed preview**: the correctly named `OPENROUTESERVICE_API_KEY` secret has
not yet been created in Cloudflare (the secret currently present there is
named `OPENROUTER_API_KEY`, which the Function does not read). Until a
deployment carries the correctly named variable, fixture output is not
production route truth. Missing provider output, missing return output,
unknown tolls, and provider errors remain explicit unavailable or unknown
states; they never become a straight-line distance, average-speed duration,
`distance × ¥18/km`, or zero toll. No Haversine value is ever promoted to
canonical distance/duration/cost.
