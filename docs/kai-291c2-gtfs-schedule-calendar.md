# KAI-291C2 — GTFS/GTFS-JP service calendars and scheduled stop facts

KAI-291C2 extends the provider-neutral static transit graph from KAI-291C1.
C1 proves topology ingestion. C2 adds the static facts needed to answer:

> For this GTFS trip and service date, which stops does it serve and at what
> scheduled times?

This is still ingestion and pure querying. It is not journey search.

## Boundary

C2 adds:

- bounded reading of `calendar.txt` and `calendar_dates.txt` through the C1 ZIP
  reader;
- provider-specific GTFS and GTFS-JP service-calendar semantics;
- normalized scheduled-service records for GTFS `trip_id` values;
- normalized scheduled stop-time facts linked to the C1 route pattern;
- pure service-date and static schedule queries;
- honest timetable coverage for complete, partial, and permitted timing data.

C2 does not add Journey, `OriginAwareTransportService`, `TripDurationService`,
recommendation, ranking, feasibility, budget, planner, UI, runtime provider
calls, transfers, fares, routing, RAPTOR, CSA, or whole-feed downloads at user
request time.

## Source contract

The implementation follows the official GTFS Schedule Reference:

<https://gtfs.org/documentation/schedule/reference/>

The reference defines `calendar.txt` and `calendar_dates.txt` as conditionally
required. A feed may define service with weekly calendars, explicit dates, or
both. `calendar_dates` uses `(service_id, date)` as its key and exception types
`1` (added) and `2` (removed). C2 rejects duplicate keys rather than choosing a
row.

The existing C1 `gtfsFeedReader.ts` remains the only ZIP reader and CSV parser.
It now allow-lists the two schedule files in addition to the C1 topology files.
All ZIP limits and protections remain unchanged: compressed, expanded, and
per-file caps; entry count; safe filenames; duplicate names; CRC; encrypted and
unsupported-compression rejection; and the ZIP64 policy. No archive is extracted
to the repository.

## Calendar normalization

A normalized `TransitServiceCalendar` keeps the exact feed-scoped `service_id`
as its provider identity:

```text
gtfs:<calendar>:<identity namespace>:<service_id>
gtfs-jp:<calendar>:<identity namespace>:<service_id>
```

GTFS and GTFS-JP use separate discriminated source-semantics branches. The
normalized branch contains only the reviewed schedule facts:

```text
base: {
  monday..sunday: 0 | 1,
  startDate: YYYYMMDD,
  endDate: YYYYMMDD
} | null
exceptions: [
  { date: YYYYMMDD, exceptionType: added | removed }
]
```

An exception-only `service_id` is valid and has `base: null`. Calendar rows are
validated for non-empty unique service IDs, exact weekday flags, real Gregorian
dates, and an inclusive start/end range. Exception rows are validated for a
real date and exception type `1` or `2`. Every `trips.service_id` must resolve
to a calendar row or an exception row; otherwise import fails closed with
`unknown_service_reference`.

`isGtfsServiceActiveOnDate(calendar, date)` is pure and accepts strict
`YYYY-MM-DD` input. It returns an evidence reason rather than only a boolean:

- `exception_added`;
- `exception_removed`;
- `base_weekday`;
- `base_inactive_weekday`;
- `outside_base_range`;
- `exception_only_no_match`.

An explicit exception wins over the weekly base calendar. Without an exception,
the date must be inside the inclusive base range and its GTFS weekday flag must
be `1`. There is no ambient clock or timezone conversion.

## Scheduled services

C2 adds `TransitScheduledService` as a separate normalized entity. A GTFS
`trip_id` is never converted into a route:

```text
id                 provider + scheduled_service + feed namespace + trip_id
providerServiceId  exact GTFS trip_id
routeId            normalized C1 route ID
patternId          exact C1 ordered-pattern ID
calendarId         normalized service-calendar ID
provenance         provider, feed namespace, source family, observation metadata
```

Only compact trip semantics are retained: `trip_headsign`, `direction_id`, and
`block_id` when supplied. Arbitrary `trips.txt` columns are not copied.

C2 calls the C1 topology importer and shares its exported
`gtfsPatternIdFor(route_id, ordered_stop_ids)` helper. For every trip, C2
reconstructs the ordered stop IDs, obtains that same pattern ID, and asserts
that the pattern exists on the normalized C1 route. A divergence fails closed
with `topology_schedule_mismatch`.

## Scheduled stop facts

C2 adds `TransitScheduledStopTime` records:

```text
serviceId
stopId
patternId
order
provider
arrivalServiceSeconds
departureServiceSeconds
sourceSemantics
provenance
```

`order` is the canonical C1 ordinal `1..N`. Raw `stop_sequence` remains in
source semantics and provenance. `pickup_type`, `drop_off_type`, and
`timepoint` are retained as compact source facts; the complete source row is
not copied.

A trip must have at least two C1-validated stop-time rows. Rows do not need
consecutive `stop_sequence` values.

## GTFS service-day time model

The official reference accepts `H:MM:SS` and `HH:MM:SS` with service-day hours
that may extend past midnight. C2 parses the value directly into absolute
service-day seconds:

```text
23:55:00 -> 86100 seconds
24:00:00 -> 86400 seconds
24:10:00 -> 87000 seconds
25:35:00 -> 92100 seconds
```

Values are never reduced modulo 24 hours and are never passed to `Date.parse`.
Malformed hours, minutes, seconds, or grammar fail closed.

For each trip, C2 validates known times in canonical stop order:

- arrival must not be after departure at the same stop;
- known events must not move backward in service-day time;
- arrival is required at the first and last stops;
- both arrival and departure are required for `timepoint=1`;
- permitted missing intermediate values become `null`;
- no missing value is interpolated or guessed.

`timepoint=0` is retained as a provider fact. It does not authorize C2 to
interpolate a missing value.

This is intentionally different from ODPT chronology. GTFS explicitly encodes
post-midnight service-day values above 24 hours; the ODPT 23-to-00 chronology
rule is not reused.

## Queries

The static query layer exposes only deterministic lookups:

- `getScheduledService(graph, serviceId)`;
- `getScheduledStopTimesForService(graph, serviceId)`;
- `isScheduledServiceActiveOnDate(graph, serviceId, date)`;
- `getActiveScheduledServicesForRoutePattern(graph, routeId, patternId, date)`.

The queries do not select departures, find paths, model transfers, or rank
journeys. Those are KAI-292 concerns.

## Hash and serialization compatibility

`NormalizedTransitGraph` gains optional `scheduledServices` and
`scheduledStopTimes` containers. C1 and ODPT graphs omit them, so their
serialized shape and B1/B2 semantic output remain unchanged. The B1 ODPT
importer, test, and normalized golden are untouched.

When C2 containers are present, calendars, scheduled services, and scheduled
stop facts participate in the semantic content hash. Observation metadata
(`datasetId`, `retrievedAt`, `checkedAt`, source descriptor, and local path)
does not. Raw stop-sequence numbering and equivalent accepted time formatting
are evidence, not semantic schedule values, so renumbering or formatting alone
does not change the hash. Calendar flags, exceptions, trip service IDs, route or
pattern linkage, stop order, and numeric scheduled times do change it.

## Coverage

`timetable = imported` means that Meguruto-controlled scheduled facts are
faithfully available for C2's supported contract: every imported trip resolves
to a service calendar and C1 pattern, and all supported scheduled stop facts are
present with required timing evidence. It does not mean Meguruto can route a
user's journey yet.

For a complete provider dump:

- topology remains the C1 topology state;
- timetable is `imported` when all route schedules are complete;
- timetable is `partial` when permitted timing gaps remain;
- fare remains `not_imported_in_this_slice`;
- realtime remains `not_evaluated`.

A fixture or bounded subset remains partial even when its rows parse cleanly.
Missing intermediate times are retained as `null` and make the affected route's
timetable coverage partial. Missing first/last required arrival times,
`timepoint=1` times, malformed times, backward chronology, unknown services, or
pattern divergence are import failures rather than guessed facts.

## ODPT KAI-290 compatibility

C2 does not duplicate or alter ODPT calendar precedence. The existing pure
`resolveApplicableCalendars(...)` implementation remains the only ODPT resolver
for Specific-over-base, Holiday-over-Saturday, and multiple-Specific merging.
C2 adds a compatibility test that calls that existing resolver with the existing
ODPT-shaped calendar contract. GTFS date evaluation stays in its own pure
resolver because its weekly flags and explicit service-day exceptions are a
different provider contract.

## Wakasa Town Bus audit

The audit reuses the existing local-only archive:

```text
.cache/transit/gtfs/wakasa-bus/wakasa_bus.zip
```

The archive is from the official Fukui Prefecture GTFS-JP source and remains
ignored; no raw feed is committed. The fixed C2 audit does not print timetable
rows and does not use the network.

Aggregate results:

- provider/format: `gtfs-jp` / GTFS-JP;
- ZIP bytes: `29,699`;
- agencies/stops/routes/trips/stop_times: `1 / 31 / 1 / 4 / 120`;
- route type: `3`;
- route pattern: `1_1 -> multiple_conflicting`, 2 patterns;
- calendar rows: `3`;
- calendar-date rows: `72`;
- distinct service IDs: `3`;
- scheduled services: `4`;
- scheduled stop facts: `120`;
- normalized operators/stops/routes/routeStops: `1 / 31 / 1 / 60`;
- earliest/latest service-day time: `06:58:00 / 19:09:00`;
- times at or after 24:00: `0`;
- calendar validity range: `20260401` through `20270331`;
- exception additions/removals: `36 / 36`;
- fully timed scheduled services: `4 / 4`;
- partially timed scheduled services: `0 / 4`;
- rejected/unsupported scheduled services: `0 / 4`;
- topology/timetable coverage: `imported / imported`;
- fare/realtime: `not_imported_in_this_slice / not_evaluated`;
- C2 semantic content hash:
  `9dd4953f85c6ee3bd9675e332895825b1028cdd7f7fe395d375b1bdca9dc545a`.

Fixed service-date audit cases use dates within the declared range plus one
outside it:

- `2026-04-01` ordinary weekday: 2 active services, 3 active trips;
- `2026-04-04` Saturday: 2 active services, 3 active trips;
- `2026-04-05` Sunday: 2 active services, 3 active trips;
- `2026-04-29` exception date: 2 active services, 3 active trips;
- `2026-03-31` outside validity: 0 active services, 0 active trips.

## Synthetic offline fixture

The existing in-memory ZIP fixture now covers:

- weekday and weekend `calendar.txt` services;
- added, removed, and exception-only `calendar_dates.txt` evidence;
- two agencies and bus/rail routes;
- C1 station/platform/bus-stop semantics and parent station;
- reverse route patterns and feed-scoped identity;
- normal daytime and `24:00:00` service-day times;
- equal arrival/departure values;
- permitted missing intermediate time values without interpolation;
- malformed time, backward chronology, duplicate calendar keys, invalid dates,
  unknown service IDs, and topology-pattern mismatch;
- no network requests.

The fixture remains an offline test input, not a live feed snapshot.
