# KAI-290 — ODPT integration-readiness (eligibility) coverage

Deterministic OFFLINE audit. No network, no provider call, no credential.

- Total catalogue records: **1130**
- Exact ODPT destination station identities: **0**
- Deterministically resolvable destination identities: **0**
- Ambiguous destination identities: **0**
- Unavailable destination identities: **1130**
- Current departure-time input: **absent**
- Current user-facing eligible cohort: **0** (scope: `catalogue`)

## Input availability

| Input                      | Availability   | Available | Classification               | Notes                                                                   |
| -------------------------- | -------------- | --------- | ---------------------------- | ----------------------------------------------------------------------- |
| originStationIdentity      | unavailable    | no        | unavailable                  |                                                                         |
| destinationStationIdentity | unavailable    | no        | unavailable                  |                                                                         |
| serviceDate                | flow_dependent | no        | deterministically_resolvable | exists only in some flows (navState.travelDate\|tripContext.travelDate) |
| departureTimeInput         | unavailable    | no        | unavailable                  |                                                                         |

## Blocking reasons

| Reason                                 | Records |
| -------------------------------------- | ------- |
| destination_station_identity_missing   | 1130    |
| destination_station_identity_ambiguous | 0       |
| origin_station_identity_missing        | 0       |
| departure_time_input_absent            | 0       |
| service_date_context_absent            | 0       |

Eligibility is decided per record by ONE precedence rule, and the cohort above
is derived directly from those verdicts. Inputs that are absent on current main
are declared as such rather than inferred, and a `flow_dependent` input can
satisfy a record only when the evaluation is scoped to a flow that supplies it.
