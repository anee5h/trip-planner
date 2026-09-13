# KAI-292B — one-transfer scheduled Journey contract

`routeOneTransferScheduledJourney` is an internal pure primitive over the normalized C2/D1 GTFS/GTFS-JP graph. It composes exactly two distinct scheduled services and exactly one passenger transfer into the canonical two-leg `Journey`; it does not integrate with `OriginAwareTransportService`, planner, recommendations, UI, or fare routing.

## Service-date boundary

All scheduled times remain absolute GTFS service-day seconds. A journey may cross midnight within the requested service date, including `23:58:00` to `24:05:00`; the seven-minute connection is evaluated as `420` seconds. The router never modulo-reduces times and never automatically evaluates the following calendar date. Switching from service date `D` to a distinct `D+1` calendar evaluation is deferred to later routing work.

## Transfer policy and evidence

`MEGURUTO_SAME_STOP_TRANSFER_MIN_SECONDS` is `300`. It is a Meguruto policy requiring a five-minute buffer for an ordinary same-exact-stop connection, including an explicit type-0 recommendation that supplies no numeric minimum. It is not provider evidence, walking time, station-wide interchange time, or a default for different stops.

Different-stop movement requires an applicable explicit D1 rule with usable semantics. Parent-station relationships, coordinates, names, shared routes, and proximity never create a transfer in this slice. An explicit type-0 rule without a numeric minimum remains provider recommendation evidence, but Phase B may accept it only at the same exact normalized stop using the separate 300-second Meguruto policy; the policy value is not claimed as provider evidence. A provider `transfers: "imported"` coverage state means only that the explicit `transfers.txt` rule set was parsed and normalized; it does not enumerate every physically possible transfer.

Type 2 numeric minimums are enforced; a missing type-2 minimum is unknown and never zero. Type 1 uses nonnegative schedule chronology without the Meguruto 300-second buffer. Type 3 prohibits the candidate. Types 4 and 5 remain linked-trip evidence and are not ordinary passenger-transfer edges.

The router returns a canonical `Journey` with two transit legs and a separate evidence wrapper containing transfer wait, required transfer time, transfer basis, service/route/pattern/calendar provenance, and total scheduled duration. Fares remain unknown and no walking leg is fabricated.

## Bounded Sakata audit

The ignored official Sakata City GTFS-JP feed has `transfers.txt` with zero data rows. The bounded fixed-date audit found three exact-same-stop journeys using the `meguruto_same_stop_policy` basis; these validate the empty explicit-rule-set path, not real non-empty transfer-row normalization. No raw feed data is committed.
