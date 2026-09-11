# KAI-290 — ODPT integration-readiness (eligibility) coverage

Deterministic OFFLINE audit. No network, no provider call, no credential.

- Total catalogue records: **1130**
- Exact ODPT destination station identities: **0**
- Deterministically resolvable destination identities: **0**
- Ambiguous destination identities: **0**
- Unavailable destination identities: **1130**
- Current departure-time input: **absent**
- Current user-facing eligible cohort: **0**

## Input availability

| Input                      | Available | Classification |
| -------------------------- | --------- | -------------- |
| originStationIdentity      | no        | unavailable    |
| destinationStationIdentity | no        | unavailable    |
| serviceDate                | no        | unavailable    |
| departureTimeInput         | no        | unavailable    |

## Blocking reasons

| Reason                                 | Records |
| -------------------------------------- | ------- |
| destination_station_identity_missing   | 1130    |
| destination_station_identity_ambiguous | 0       |
| origin_station_identity_missing        | 0       |
| departure_time_input_absent            | 0       |
| service_date_context_absent            | 0       |
