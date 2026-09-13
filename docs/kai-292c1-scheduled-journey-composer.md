# KAI-292C1 — scheduled Journey composer

## Contract

`routeBestScheduledJourney(...)` is a pure orchestration primitive over the existing KAI-292A and KAI-292B routers:

```ts
routeBestScheduledJourney({
  graph,
  coverage,
  originStopId,
  destinationStopId,
  serviceDate,
  earliestDepartureServiceSeconds,
})
```

It invokes each router once with the same exact normalized graph, coverage, stop IDs, service date, and absolute service-day departure seconds. It does not parse formatted clock strings, search the next calendar date, mutate inputs, add access/egress legs, or implement additional routing depth.

A verified result returns the selected canonical `Journey`, `selected: "direct" | "one_transfer"`, `transferCount: 0 | 1`, and composition evidence. Evidence retains both strategy attempts, dataset identity/content hash, absolute initial departure/final arrival, total duration, and a decisive `selectionReason`. It never duplicates the unselected Journey.

## Aggregation

- Direct verified + transfer inconclusive → verified direct.
- Direct inconclusive + transfer verified → verified one-transfer.
- No verified candidate + at least one inconclusive → inconclusive; no route absence is claimed.
- Both attempts no-match → no-match.

Both attempts remain in diagnostics so an inconclusive alternative never disappears behind one selected failure reason.

## Selection

When both strategies verify, candidates are ordered by:

1. earliest final arrival;
2. fewer transfers;
3. earlier initial departure;
4. higher existing Journey confidence;
5. stable lexical strategy key.

The composer preserves the selected Journey and its existing confidence. A medium-confidence KAI-292B same-stop policy Journey remains medium; composition never upgrades it. Individual scheduled legs and verified timetable duration evidence remain unchanged.

## Product integration boundary

This PR does not wire the composer into `TripDurationService`, `OriginAwareTransportService`, recommendation, feasibility, planner, or UI. The input availability audit is in [`kai-292c1-scheduled-integration-readiness.md`](./kai-292c1-scheduled-integration-readiness.md).

The audit finds no production-safe scheduled graph/coverage loader, no exact normalized origin/destination stop bridge, and no earliest-departure service-seconds input. Existing flows therefore remain on the compatibility origin-aware estimate path.
