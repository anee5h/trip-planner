# KAI-291C1 — GTFS/GTFS-JP topology adapter

## Scope

C1 proves that the KAI-291B1 `NormalizedTransitGraph` can ingest a static
GTFS-family feed without creating a provider-specific graph. The pipeline is:

```text
local GTFS/GTFS-JP ZIP
  -> bounded in-memory ZIP reader
  -> strict CSV decoder
  -> GTFS/GTFS-JP topology adapter
  -> NormalizedTransitGraph + coverage/provenance
```

The adapter does not connect to Journey, TripDuration, recommendation, Explore,
planner, destination UI, or browser runtime requests. `stop_times.txt` is used
only to derive ordered route-stop patterns. Calendar, fare, timetable,
frequency, transfer, shape, and routing semantics remain outside C1.

## Selected real feed

- **Provider/operator:** GTFS-JP / 若狭町営バス (Wakasa Town Bus); the feed's
  `agency.txt` publisher is 若狭町営バス and `feed_info.txt` publisher is 若狭町.
- **Official dataset page:** <https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/gtfs_jp.html>
- **Direct download origin:** <https://www.pref.fukui.lg.jp/doc/dx-suishin/opendata/gtfs_jp_d/fil/wakasa_bus.zip>
- **Format:** GTFS-JP. The official page labels the collection GTFS-JP and the
  archive contains the `routes_jp.txt` extension; it is not labelled GTFS-JP
  merely because it is Japanese.
- **Licence:** The Fukui open-data page states that public data without an
  exception are provided under Creative Commons Attribution 4.0 International
  (CC BY 4.0): <https://creativecommons.org/licenses/by/4.0/deed.ja>.
  CC BY permits sharing and adaptation with attribution, licence notice, and
  modification notice as applicable. The raw archive is nevertheless kept
  local and ignored; it is not a repository fixture.
- **Size:** 29,699 bytes (the official page displays 30 KB).
- **Published update:** the official table lists 若狭町営バス as updated
  2026-04-02; `feed_info.txt` reports version `20260401_A0001`, valid
  2026-04-01 through 2027-03-31. The download responded without credentials
  and reported `application/zip`.
- **Authentication:** none observed or required for the direct official GET.
- **Required families:** `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`,
  and `stop_times.txt` are all present.

The local audit archive belongs at:

```text
.cache/transit/gtfs/wakasa-bus/wakasa_bus.zip
```

The repository ignores `.cache/`; CI never downloads or requires this file.

## Stable identity namespace

The audit uses `gtfs:wakasa-bus`. It is a logical feed identifier and is not
derived from the retrieval timestamp, URL query, filename version, local path,
or ZIP hash. GTFS feed-local IDs remain feed-local:

```text
gtfs-jp:stop:gtfs%3Awakasa-bus:<stop_id>
gtfs-jp:route:gtfs%3Awakasa-bus:<route_id>
```

Provider, entity kind, namespace, and exact source ID remain separate. No
name, coordinate, proximity, or cross-provider crosswalk is used.

## ZIP and CSV safety

`scripts/transit/gtfsFeedReader.ts` is Node-only and accepts in-memory bytes.
It:

- validates ZIP central-directory structure before inflation;
- rejects non-ZIP, malformed, encrypted, unsupported-compression, and CRC-invalid
  allow-listed entries; ZIP64, multi-disk, duplicate, absolute, and traversal
  entries are rejected before any member is read;
- rejects slash or backslash path ambiguity, including `../` and `..\\`;
- enforces 8 MiB compressed archive, 64 MiB expanded archive, 16 MiB per-file,
  and 128-entry caps by default;
- inflates only the C1 allow-list: the five required files, `feed_info.txt`,
  and `routes_jp.txt`; unrelated archive members are checked for safe names and
  declared size but not inflated, extracted, or parsed;
- decodes UTF-8 with an optional BOM and uses the maintained `csv-parse`
  implementation for quoted commas, escaped quotes, CRLF, and LF;
- fails when any required family is absent.

No arbitrary archive path is written to the repository filesystem.

## Topology derivation

A normalized `TransitRoute` remains one GTFS `route_id`; `trip_id` is never
turned into a route. Each trip's `stop_times` rows are validated for resolved
trip/stop references, a `stop_id` that resolves to `location_type=0`, integer
unique `stop_sequence`, and at least two serviced stops. Consecutive
`stop_sequence` values are not required.
Trips with identical ordered stop IDs share a deterministic pattern ID derived
from the route ID and ordered stop IDs. Different patterns receive different
IDs. Pattern evidence retains only compact `tripIds` and `serviceIds` arrays in
route `sourceSemantics`, so later calendar/timetable slices can recover the
source identities without copying full CSV rows. Normalized membership order
is canonical `1..N`, while raw GTFS `stop_sequence` is retained separately for
source-row provenance. Each emitted membership uses a stable representative
trip and raw sequence tuple; it does not use `trip_id` as a normalized route.

`TransitRouteStop.patternId` is optional for legacy B1 ODPT memberships and is
populated for every GTFS membership. The existing flattened route query returns
an empty result for a multi-pattern route; callers must use the explicit
pattern query. This prevents a branch, short-turn, or direction from being
flattened into a false universal sequence.

Pattern classifications are:

- `consistent`: one ordered stop pattern;
- `multiple_compatible_directional`: patterns are exact directional reverses;
- `multiple_conflicting`: branches, short-turns, skipped stops, or other
  non-reverse differences.

The Wakasa audit has one route (`1_1`) with two patterns. The return pattern
contains the full reverse sequence while the outbound pattern skips stop
`29_1`, so this feed is `multiple_conflicting`, not a fabricated single order.

## Provider-specific semantics

The generic graph gained only the smallest provider-neutral extension needed to
preserve evidence:

- C1 GTFS provenance populates `checkedAt` alongside `retrievedAt` on every
  normalized entity; the generic field remains optional for legacy B1 records;
- `TransitStopType.platform` prevents a non-bus GTFS location from being
  mislabelled as a bus stop;
- optional `TransitStop.sourceSemantics` retains `location_type`,
  `parent_station`, and `platform_code` in separate GTFS and GTFS-JP branches;
- `TransitRoute.sourceSemantics` has separate GTFS and GTFS-JP branches,
  retaining raw `route_type`, agency, names, colours, pattern evidence, and
  GTFS-JP `route_update_date`;
- a single-agency feed without `agency_id` uses the stable logical feed
  namespace for operator identity, while retaining the agency name as display
  data;
- optional dataset publisher metadata retains the compact `feed_info.txt`
  publisher identity.

No timetable, calendar, fare, transfer, or Journey model was added.

All C1 stops require both valid WGS84 coordinates. A half pair, missing pair,
nonnumeric value, or out-of-range value fails closed. `location_type=1` must
not have `parent_station`; a type-0 parent must resolve to a type-1 station.
Type 0 with a parent is a `platform`; an unparented type-0 stop is a
`bus_stop` only when bus service evidence exists, otherwise it is rejected.

Route type mapping is explicit and tested: `0 -> tram`, `1/2/7/12 -> rail`,
`3/11 -> bus`, `4 -> ferry`, `5 -> tram`, and `6 -> other`. Unknown and
extended values fail closed with `unsupported_route_type`; they are not guessed
into `other`. Stop `location_type=0` is `bus_stop` for bus-only service and
`platform` when non-bus service is evidenced; `location_type=1` is `station`.
Other location types fail closed in this slice.

## Real-feed audit aggregate

Command:

```bash
npx tsx scripts/transit/audit-gtfs-topology.ts
```

The audit ran against the local copy downloaded from the official origin and
reported:

- provider/format: `gtfs-jp` / GTFS-JP;
- ZIP bytes: `29,699`;
- contained members: `agency.txt`, `calendar.txt`, `calendar_dates.txt`,
  `fare_attributes.txt`, `fare_rules.txt`, `feed_info.txt`, `office_jp.txt`,
  `routes.txt`, `routes_jp.txt`, `shapes.txt`, `stop_times.txt`, `stops.txt`,
  `translations.txt`, `trips.txt`;
- agencies/stops/routes/trips/stop_times: `1 / 31 / 1 / 4 / 120`;
- observed route types: `3`;
- route-pattern classification: `1_1 -> multiple_conflicting`, 2 patterns;
- normalized operators/stops/routes/routeStops/calendars: `1 / 31 / 1 / 60 / 0`;
- topology coverage: `imported` (the official archive is the complete static
  Wakasa provider feed; conflicting patterns are retained explicitly);
- timetable: `not_imported_in_this_slice`;
- fare: `not_imported_in_this_slice`;
- realtime: `not_evaluated`;
- unsupported semantics: none;
- semantic content hash:
  `f11f9fee55b9fc642621489f0e59bb117119f63e37e38705297c8e9bf2ed0ea8`.

The raw ZIP is local-only and is not tracked.

## Synthetic CI fixture

CI uses only `scripts/transit/__tests__/fixtures/gtfs-c1-fixture.json`, which
is converted to an in-memory ZIP in tests. It covers two agencies, quoted CSV,
escaped quotes, BOM, CRLF/LF, station/platform/bus-stop semantics with a
parent station, bus and rail routes, opposite-direction patterns, feed-scoped
IDs, same-looking cross-provider identity separation, malformed references,
duplicate IDs, duplicate stop sequences, non-consecutive stop sequences,
zero/one-stop trips, station-targeting stop_times, coordinates, service ID
retention, and unsupported route/location values. No test performs a network
request.
