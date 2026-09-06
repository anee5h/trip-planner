# KAI-278 transport-handoff audit

Baseline: `ff0eeed0c765a973537ed7c99c6ff0c902cdbd17`
Scope: bounded runtime semantic audit over Hakone, Kyoto local access, Tokyo same/different anchors, Shodoshima partial access, and unsupported car.

## Counts

| Metric                         | Count |
| ------------------------------ | ----: |
| cases                          |     8 |
| carTransitMismatches           |     0 |
| endpointMismatches             |     0 |
| localCardOriginScopeLeaks      |     0 |
| sameOriginMisleadingJourneys   |     0 |
| partialAsCompleteDefects       |     0 |
| unsupportedCarTransitFallbacks |     0 |
| directionsBuildersBefore       |     1 |
| directionsBuildersAfter        |     1 |
| journeyResultOwnersBefore      |     5 |
| journeyResultOwnersAfter       |     1 |

## Findings

| Case                            | Mode        | Scope          | Duration | Completeness | Handoff | Checks |
| ------------------------------- | ----------- | -------------- | -------- | ------------ | ------- | ------ |
| hakone-my-car                   | my_car      | origin_journey | 74–94    | complete     | driving | none   |
| hakone-rental-car               | car         | origin_journey | 74–94    | complete     | driving | none   |
| hakone-public-transit           | train       | origin_journey | 69–89    | complete     | transit | none   |
| kyoto-local-fushimi             | train       | local_access   | 17–22    | complete     | transit | none   |
| tokyo-station-same-anchor       | train       | local_access   | 0–0      | complete     | transit | none   |
| tokyo-station-distinct-anchor   | train       | origin_journey | 14–19    | complete     | transit | none   |
| shodoshima-partial-local-access | bus         | final_segment  | —        | partial      | none    | none   |
| shodoshima-unsupported-car      | unavailable | —              | —        | —            | none    | none   |

## Interpretation

- Car and rental-car Journeys expose only a `driving` handoff; no car-to-transit mismatch remains.
- The Kyoto child case is calculated from the canonical Kyoto parent/access anchor and is labelled `local_access`.
- Canonically equivalent Tokyo Station anchors produce a zero-duration same-anchor Journey; a deliberately displaced anchor remains a normal distinct journey.
- Shodoshima keeps known local access as a `partial` final segment and has no directions handoff.
- Unsupported car remains unavailable; no transit fallback is manufactured.
