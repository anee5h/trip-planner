# KAI-292C3 — explicit scheduled-routing temporal contract

## Scope

C3 defines the date/time contract that a future scheduled-transit consumer must
provide. It does not choose a product departure policy, add a time picker, wire
recommendations, or change the existing routers.

The contract is deliberately separate from JavaScript `Date` values and from
planner display strings. A route request receives:

```text
Japan-local GTFS service date
absolute service-day departure seconds
temporal provenance
```

## Product temporal audit

### Trip date

- Home and Explore represent the selected date as an ISO `YYYY-MM-DD` string.
- `TripContext.travelDate` stores one selected date or `null`; `dateSemantics`
  distinguishes `any`, `today`, `tomorrow`, and `custom`.
- The URL uses the `date` parameter. It carries date state only, not a departure
  time.
- `TravelDateSelection.day1` is the selected Day 1 date.
- `TravelConditions.deriveTripDates()` derives Day 2/Day 3 dates for overnight
  condition checks. Day 2 is not serialized as a separate URL date.
- Future dates selected through `TravelDatePicker` remain explicit date values.
  An omitted date means any-date/neutral behavior, not today.

The existing URL/context normalizers use ordinary JavaScript local-date helpers
for product UI semantics, including determining today/tomorrow. C3 does not
reuse those helpers as routing evidence because they depend on host-local Date
behavior and may consult the current date.

### Outbound departure time

No current Home, Explore, recommendation, feasibility, or `TripDurationService`
flow supplies an authoritative scheduled-transit departure time.

`DayPlanWidget` has an existing planner-only `startTime` control:

- initial value: `09:00`;
- visible choices include `08:00`, `09:00`, `10:00`, `11:00`, `13:00`, and
  `14:00`;
- `availableMinutes` produces a planning window and `DayPlanStep.startTime` /
  `endTime` values.

`DayPlanGeneratorService` also has a legacy `09:00` fallback when called without
a planner start time. These values describe a generated itinerary display
window. They are not an established scheduled-routing product policy and C3
does not adapt or consume them.

### Return departure time

There is no canonical return departure-time field in the current product flow.
`returnMode` controls planner endpoint behavior (`anchor`, `nearest_station`, or
`none`); it does not provide a return clock time. Current recommendation and
transport estimate paths do not carry a scheduled return departure context.

### Half-day, one-day, and weekend modes

- `TripDuration` identifies short outing, half-day, full-day, and overnight
  durations.
- Half-day/full-day planner modes have available-minute envelopes and the
  planner-only start-time control described above.
- `WeekendPolicy` defines overnight distance/capacity eligibility, not a clock
  start or return time.
- No authoritative product-level scheduled-transit start/return policy exists
  for any of these modes.

C3 therefore returns unresolved when a scheduled-routing caller lacks an
explicit departure time. It does not turn a duration mode or planner default
into transit evidence.

### Planner/day-plan generation

The planner owns an explicit display window when a caller supplies `startTime`
and `availableMinutes`; generated steps retain `startTime` and `endTime`. It
also supports a computed `(+1 day)` display for a long window. This is useful
future input evidence only after a deliberate product adapter defines what the
window means for scheduled transit. C3 does not make that policy decision.

### Persisted trips and itinerary stops

The persisted `Trip` model stores optional `startDate`/`endDate`. Each
`TripStop` may optionally store `date`, `arrivalTime`, and `departureTime`, but
these are unvalidated itinerary display fields. They do not currently carry a
service-date/timezone contract or prove that a stop is a normalized transit
endpoint. C3 does not reinterpret them.

### Recommendation, feasibility, and transport

The current product path remains:

```text
recommendation / feasibility
  -> TripDurationService
  -> OriginAwareTransportService
  -> compatibility Journey
```

`RecommendationContext` carries optional travel dates for weather/ferry and
planning semantics, but no scheduled departure-time context. `OriginAware-
TransportService` receives coordinates/zones/route estimates, not a canonical
scheduled temporal request. No scheduled router is called from these flows.

## C3 model

`scheduledRoutingTemporal.ts` defines:

```ts
ScheduledRoutingTemporalContext {
  serviceDate: ScheduledRoutingServiceDate;
  earliestDepartureServiceSeconds: ScheduledRoutingServiceDaySeconds;
  provenance: {
    source;
    timeZone: "Asia/Tokyo";
    evidenceId?: string;
  };
}
```

The accepted provenance sources are explicit:

- `explicit_user_selected_trip_date_time`;
- `explicit_planner_generated_time_window`;
- `persisted_itinerary_time`;
- `controlled_internal_test_fixture`.

A provenance label is not awarded automatically. The caller must select the
source that actually supplied the values.

`resolveScheduledRoutingTemporalContext(...)` accepts a strict date string and
strict service-day time string. It returns:

- `resolved` with branded date/seconds and JST provenance;
- `unresolved` for missing date or missing departure;
- `invalid_query` for invalid date, invalid time, or unsupported provenance.

`resolveServiceDayTime(...)` accepts `H+:MM[:SS]`. Hours are not modulo-24:

```text
00:00    -> 0
09:21    -> 33,660
23:59    -> 86,340
25:10    -> 90,600
```

No `Date`, `Date.parse`, `Date.now`, current clock, machine timezone, implicit
09:00, destination opening time, or arbitrary return value is used.

`resolveScheduledRoutingTemporalPlan(...)` resolves outbound and optional
return contexts independently. Each may have a different date, seconds value,
and provenance, allowing a later Day 1 outbound / Day 2 return without changing
the base model.

## Japan and calendar semantics

A service date is a strict Japan-local Gregorian calendar date represented as
`YYYY-MM-DD`. Validation is pure integer calendar validation, including leap
years; it does not construct a host-local `Date`.

Service-day seconds are absolute offsets from the beginning of that service
date. Values at or after 86,400 remain in the same explicit service-day value.
This preserves the GTFS semantics already established by KAI-291/KAI-292. The
existing importer tests continue to prove `24:00:00 -> 86400` without modulo
conversion.

`Asia/Tokyo` is carried as an explicit semantic label. Because C3 converts no
instant and uses no host-local Date, the same input produces the same output in
UTC, JST, or another runtime timezone.

## Internal router boundary

`scheduledTransitRoutingBoundary.ts` is the only new route invocation seam. It
combines:

```text
validated C2 ScheduledTransitDataset
+ resolved C2 origin endpoint
+ resolved C2 destination endpoint
+ resolved C3 temporal context
```

into a request containing exact normalized stop IDs, explicit service date,
explicit service-day seconds, direction, and provenance-bearing context. It
then calls the existing `routeBestScheduledJourney(...)` once.

For `outbound`, the request is origin → destination. For `return`, it swaps the
resolved endpoint IDs and uses the independently supplied return context.

If the dataset, either endpoint, or temporal context is unresolved/invalid, the
boundary returns `not_routed` with inspectable status diagnostics and does not
invoke the router. No C2 crosswalk or dataset behavior is changed.

## Tests and proof

The C3 tests cover:

- normal `09:21` conversion;
- midnight and `23:59`;
- `24:00+`/`25:10` absolute seconds;
- impossible Gregorian dates, including leap-date failures;
- malformed/negative/out-of-range clock fields;
- missing date and missing departure without defaults;
- host timezone independence;
- provenance validation;
- independent outbound/return contexts and next-day return;
- explicit C2 dataset + endpoint resolution into the existing composer;
- endpoint swapping for return routing;
- no router invocation when dataset, endpoint, or temporal input is incomplete.

## Limitations and next slice

C3 establishes a trustworthy temporal seam but does not make scheduled transit
live in recommendations. The remaining product blockers are unchanged:

- canonical live origin identities are still sparse;
- catalogue-to-transit crosswalk coverage is still sparse;
- C2's Sakata mappings remain boundary-pilot identities;
- no product policy currently supplies scheduled outbound/return times;
- canonical scheduled Journey integration into duration/feasibility is not yet
  implemented.

C4 should first prove one fully evidenced real Meguruto corridor before changing
recommendation behavior. New departure-time UX and product policy remain
separate decisions.
