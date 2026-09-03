# KAI-226 car-route provider evaluation

Date: 2026-09-03

## Scope and evidence boundary

This is a provider-selection record, not a claim that live routes were observed. The
repository has no configured NAVITIME or Google Routes API client/credential, so no
production route values, tolls, traffic timings, quotas, or latency were fabricated.
The KAI-226 domain boundary is provider-neutral and the tests use deterministic
fixtures only.

## Documentation comparison

| Capability              | NAVITIME car route                                                                                                                    | Google Routes API Compute Routes                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Japan road routing      | `route_car` accepts coordinates, node IDs, and ICs; Japan-specific road and vehicle options are documented                            | `DRIVE` routes use global Google road data; coordinates/addresses/places are supported                                                    |
| Duration/distance       | Route summary exposes movement information; `start_time`/`goal_time` and optional probe traffic are documented                        | `duration` and `distanceMeters`; `TRAFFIC_AWARE` and departure-time options are documented                                                |
| Toll detail             | `fares`; `condition` supports toll/free preferences; `etc` supports time-aware ETC pricing; Smart IC is an explicit option            | `tollInfo.estimatedPrice` and toll passes are supported; toll calculation has billing implications and prices are estimates               |
| Japan-specific controls | Smart IC, ETC-only tollgate avoidance, IC waypoints, road restrictions, ferry, vehicle regulation, and free-road modes are documented | Toll passes and route modifiers are documented; Japan-specific IC/ETC behavior requires live validation                                   |
| Failure behavior        | Failed routes are omitted from multi-route responses; API/contract limits and long-route errors are documented                        | HTTP/API errors and no-route responses must be normalized; provider response must never be exposed directly                               |
| Traffic/departure       | `start_time` plus optional `use_traffic=probe`; probe traffic is an optional contracted feature                                       | Traffic-aware routing and departure-time inputs are documented; live precision must be conditional on the request and response            |
| Pricing/quota           | Corporate/API-market service; price and request limits are contract-dependent and must be obtained from NAVITIME                      | Google Cloud billing applies; field masks are required; toll computation is a higher-billed capability according to the API documentation |
| Caching/licensing       | Contract/API-market terms must be reviewed before caching or persisting routes                                                        | Google Maps Platform terms and caching/attribution restrictions require legal/product review; no route payload is persisted by KAI-226    |

Primary sources:

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

- Yokohama/Tokyo → Karuizawa
- Yokohama → Hakone
- Tokyo → Kawaguchiko
- Tokyo → Nikko
- Rural Nagano/Gunma
- Metropolitan expressway routing
- Toll-free route
- Expensive expressway route
- Smart IC/ETC-sensitive route
- Parking + walk destination (route must terminate at the access anchor)
- Seasonal/restricted road case
- Long-distance case

For each live run, record provider, request options, departure instant/timezone,
origin/access-anchor IDs, road distance, duration, toll amount and basis, route
availability, retrieval timestamp, response/error code, and the NEXCO/Shuto/Hanshin
oracle result where applicable. Run outbound and return independently.

## Decision

KAI-226 intentionally does **not** commit the production app to either provider.
`CarRouteProvider` is the replaceable boundary, and provider-specific JSON cannot
cross it. NAVITIME is the leading Japan-specific integration candidate because its
documented contract exposes IC/Smart IC, ETC, free/toll route preferences, vehicle
regulation, and Japan road controls. Google remains a viable traffic-aware fallback
candidate because it exposes route duration/distance and toll-pass handling. Neither
candidate is selected on documentation alone: the live matrix above must be run and
pricing, quota, caching, attribution, and contract terms must be approved first.

Until then, the fixture provider is test-only. Missing provider output, missing
return output, unknown tolls, and provider errors remain explicit unavailable or
unknown states; they never become a straight-line distance, average-speed duration,
`distance × ¥18/km`, or zero toll.
