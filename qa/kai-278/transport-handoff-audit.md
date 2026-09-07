# KAI-278 transport-handoff audit

Baseline: `ff0eeed0c765a973537ed7c99c6ff0c902cdbd17`
Scope: bounded runtime semantic audit over Hakone, Kyoto local access, Tokyo same/different anchors, a provider-backed car access anchor (Karuizawa), Shodoshima partial access, and unsupported car. Same-origin is audited through the traveller-facing display-boundary predicate (destinationSharesOriginAnchor) used by cards and Detail rows, plus the canonical Journey seam. Builder/owner counts are MEASURED by scanning the base ref and the working tree, not hard-coded.

## Counts

| Metric                               | Count |
| ------------------------------------ | ----: |
| cases                                |     9 |
| carTransitMismatches                 |     0 |
| endpointMismatches                   |     0 |
| localCardOriginScopeLeaks            |     0 |
| sameOriginMisleadingJourneys         |     0 |
| sameOriginDisplayBoundaryNotApplied  |     0 |
| karuizawaAccessAnchorHandoffFailures |     0 |
| partialAsCompleteDefects             |     0 |
| unsupportedCarTransitFallbacks       |     0 |
| directionsUrlBuilderFilesBefore      |     1 |
| directionsUrlBuilderFilesAfter       |     1 |
| canonicalSeamCallerFilesBefore       |    16 |
| canonicalSeamCallerFilesAfter        |    17 |

## Measured directions-URL builders

| Tree                 | Files building a Google Maps directions URL          |
| -------------------- | ---------------------------------------------------- |
| before (origin/main) | 1 — src/features/destinations/DestinationDetails.tsx |
| after (working tree) | 1 — src/shared/services/transport/JourneyHandoff.ts  |

## Findings

| Case                            | Mode        | Scope          | Duration | Completeness | Handoff | Checks |
| ------------------------------- | ----------- | -------------- | -------- | ------------ | ------- | ------ |
| hakone-my-car                   | my_car      | origin_journey | 74–94    | complete     | driving | none   |
| hakone-rental-car               | car         | origin_journey | 74–94    | complete     | driving | none   |
| hakone-public-transit           | train       | origin_journey | 69–89    | complete     | transit | none   |
| kyoto-local-fushimi             | train       | local_access   | 17–22    | complete     | transit | none   |
| tokyo-station-same-anchor       | train       | local_access   | 0–0      | complete     | transit | none   |
| tokyo-station-distinct-anchor   | train       | origin_journey | 14–19    | complete     | transit | none   |
| karuizawa-car-access-anchor     | my_car      | origin_journey | 148–148  | complete     | driving | none   |
| shodoshima-partial-local-access | bus         | final_segment  | —        | partial      | none    | none   |
| shodoshima-unsupported-car      | unavailable | —              | —        | —            | none    | none   |

## Interpretation

- Car and rental-car Journeys expose only a `driving` handoff; no car-to-transit mismatch remains.
- The Kyoto child case is calculated from the canonical Kyoto parent/access anchor and is labelled `local_access`.
- Canonically equivalent Tokyo Station anchors produce a zero-duration same-anchor Journey AND a zero same-anchor estimate on the user-facing duration resolver; a deliberately displaced anchor remains a normal distinct journey.
- The provider-backed Karuizawa car case hands off in `driving` to the verified parking anchor (36.357333, 138.633287), not the town centroid.
- Shodoshima keeps known local access as a `partial` final segment and has no directions handoff.
- Unsupported car remains unavailable; no transit fallback is manufactured.
