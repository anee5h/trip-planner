# KAI-291D1 — Current `transfers.txt` semantics

Checked 2026-09-13 against the [official GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/), revised 2026-04-27. `transfers.txt` is optional. It adds rules and overrides to the transfer opportunities a consumer may otherwise infer from time and stop proximity; an absent file is therefore only an absence of explicit transfer rows, not evidence that transfers are impossible.

## Field contract

| Field | Current GTFS meaning |
| --- | --- |
| `from_stop_id` | Foreign ID for the connection origin in `stops.txt`: a stop (`location_type=0`) or station (`location_type=1`). A station-scoped rule applies to all child stops. Required for transfer types empty/`0`–`3`; optional for `4`/`5`, and a `4`/`5` row must use a stop, not a station. |
| `to_stop_id` | The corresponding connection destination. The same station/child-stop and presence rules apply. |
| `from_route_id` | Optional foreign ID for `routes.route_id`; scopes the arriving trip on that route at `from_stop_id`. If paired with `from_trip_id`, that trip must belong to the route and the trip constraint takes precedence. |
| `to_route_id` | Optional foreign ID for `routes.route_id`; scopes the departing trip on that route at `to_stop_id`. If paired with `to_trip_id`, that trip must belong to the route and the trip constraint takes precedence. |
| `from_trip_id` | Foreign ID for `trips.trip_id`; scopes the arriving trip at `from_stop_id`. Optional for types empty/`0`–`3`; required for `4`/`5`. |
| `to_trip_id` | Foreign ID for `trips.trip_id`; scopes the departing trip at `to_stop_id`. Optional for types empty/`0`–`3`; required for `4`/`5`. |
| `transfer_type` | Required enum: empty or `0` recommended transfer point; `1` timed transfer where the departing vehicle is expected to wait; `2` requires a minimum arrival-to-departure interval; `3` prohibits the transfer; `4` permits an in-seat transfer; `5` disallows an in-seat transfer between sequential trips, requiring alighting and re-boarding. |
| `min_transfer_time` | Optional, non-negative integer seconds. It is the time that must be available for the transfer; the reference says a type-`2` rule specifies its required time here and that it should cover typical movement plus schedule-variance buffer. If it is absent, no exact numeric minimum is evidenced. |

The full row key is `(from_stop_id, to_stop_id, from_trip_id, to_trip_id, from_route_id, to_route_id)`. The field meanings and presence rules above are from the `transfers.txt` section of the [GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/#transfers-txt).

## Coverage meaning

The normalized `transfers` coverage dimension describes ingestion of explicit provider transfer rules from `transfers.txt` only. `imported` means the supplied explicit rule set was parsed and normalized. It does **not** mean that all physically possible transfers are enumerated, and an absent row does not prohibit a transfer: `transfers.txt` is a rules/override input, not an exhaustive connectivity graph. A missing file is therefore `not_imported_in_this_slice`, not `unsupported`.

## Bounded real-feed audit

The ignored local Wakasa GTFS-JP feed contains no `transfers.txt`; the correct result is: **Wakasa has no explicit `transfers.txt` evidence**. Sakata City's official CC BY 4.0 GTFS-JP feed contains `transfers.txt`, but it has zero data rows. Sakata validates optional-file reading, empty-file handling, and empty explicit-rule-set enrichment only; it does not validate normalization of a real non-empty transfer row.

No suitable non-empty official Japanese `transfers.txt` feed was found in the bounded audit search; D1 transfer-row semantics are therefore validated synthetically, while Wakasa and Sakata validate real-feed absence/empty-file behavior.

## Applicability and precedence

For a given ordered pair of arriving and departing trips, select the applicable row with the greatest specificity. The current order is:

1. both trip IDs;
2. one trip ID plus the opposite-side route ID (`from_trip_id` + `to_route_id`, or `from_route_id` + `to_trip_id`);
3. one trip ID;
4. both route IDs;
5. one route ID;
6. only `from_stop_id` and `to_stop_id`.

The specification says that two equally maximal applicable rows should not exist; it defines no tie-breaker. A consumer must not turn a route- or trip-scoped row into a universal stop-to-stop rule, and must not silently discard an unresolved route/trip reference. A station reference expands to its child stops; it does not make every stop in the feed equivalent.

## Linked-trip fields that affect applicability

Types `4` and `5` are linked-trip rules. The linked trips must be operated by the same vehicle. `trips.block_id` identifies sequential trips using the same vehicle but, by itself, is not an in-seat-transfer declaration; the reference says to provide type `4` for that. If a linked-trip rule conflicts with `trips.block_id`, the linked-trip rule wins. For a 1-to-n continuation, every `to_trip_id` must have the same `service_id`; for n-to-1, every `from_trip_id` must have the same `service_id`; n-to-n must satisfy both constraints. Separate continuations must not have overlapping service on any day. These are separate from ordinary route-scoped or stop-scoped passenger transfers.

## GTFS-JP profile

The [MLIT GTFS-JP 3rd-edition specification](https://www.mlit.go.jp/sogoseisaku/transport/content/001981081.pdf), section 2-12, lists `transfers.txt` as optional; it defines `from_stop_id`, `to_stop_id`, and `transfer_type` as required, and `min_transfer_time` as optional, for a type-`2` transfer in non-negative integer seconds. Its transfer table does not define `from_route_id`, `to_route_id`, `from_trip_id`, `to_trip_id`, or current GTFS types `4`/`5`; those semantics therefore come from the current GTFS Schedule Reference, not from an additional GTFS-JP rule. The PDF says it is based on the October 2020 Japanese GTFS reference and does not prevent use of later GTFS versions, so it is not a substitute for the current GTFS contract above.
