# KAI-205 composition ownership map

Baseline commit: `022373edce9dc24da6d03c70ce8471b8637e0590` (`origin/main`)

The map is intentionally limited to composition and presentation boundaries. The
recommendation scorer/pipeline remains a producer of ranked, eligible candidates;
KAI-205 must not move ranking policy into this map.

## Home

| Rail / section       | Candidate producer                                                                                                                                       |                        Ranked pool / render cap | Eligibility already applied?                                                                                                                                     | Shared card / composition boundary                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Top Matches          | `useTripRecommendations` → `getRecommendations` in `RecommendationService`; `TopMatchesSection` slices `recommendations.slice(0, 10)`                    |               Ranked recommendation result / 10 | Yes: recommendation pipeline applies duration, transport, budget, visited, date/season and context gates                                                         | `HomeMatchCard` inside `HOME_RAIL_CARD_CLASS`; highest-priority discovery rail                                           |
| Continue Exploring   | `useRecentlyViewedDestinations`; `orderRecentlyViewedDestinations` only moves IDs also in Top Matches to the end                                         | User-viewed list / component does not add a cap | User-history semantics, not recommendation eligibility                                                                                                           | `RecentlyViewedRail` + `HomeMatchCard`; should claim IDs only if the product keeps this rail in the dedup priority order |
| Bucket List          | `favorites` → catalogue lookup in `BucketListRail`; Home also computes `bucketListDisplayedIds` with a 10-card slice                                     |                                  Saved IDs / 10 | Saved-item semantics; not re-ranked or re-filtered by active recommendation context                                                                              | `BucketListRail` + `HomeMatchCard`; preserve user data semantics                                                         |
| Seasonal             | `getSeasonalDiscoveryDestinations(recommendedDestinations, referenceDate)` in `DeferredDiscoveryRails`                                                   |    Baseline pinned scenario: 44 candidates / 10 | Yes: starts from the recommendation-eligible pool and applies seasonal evidence/ranking                                                                          | `DiscoveryRail` + `HomeMatchCard`; later priority than Top Matches / user rails                                          |
| Under 60 minutes     | `getUnder60Destinations(recommendedDestinations, originRailContext)`                                                                                     |    Baseline pinned scenario: 41 candidates / 10 | Yes: starts from recommendation pool, then origin-duration and visited filtering                                                                                 | `DiscoveryRail` + `HomeMatchCard`                                                                                        |
| Unexplored Nearby    | `getUnexploredNearbyDestinations(allDestinations, originRailContext)` in `DeferredDiscoveryRails`                                                        |   Baseline pinned scenario: 220 candidates / 10 | **No active budget/vibe recommendation eligibility**; it applies origin transport evidence, duration, coordinates, and visited filtering over the full catalogue | `UnexploredNearbyRail` + `HomeMatchCard`; composition claims IDs after this producer boundary                            |
| Overnight Getaways   | `getOvernightGetawayDestinations(recommendedDestinations)`                                                                                               |               Ranked recommendation result / 10 | Yes: weekend travel-fit and capacity are already evaluated                                                                                                       | `DiscoveryRail` + `HomeMatchCard`                                                                                        |
| Longer Journey       | `getWorthLongerJourneyDestinations(recommendedDestinations)`                                                                                             |               Ranked recommendation result / 10 | Yes: weekend eligibility plus longer-journey band                                                                                                                | `DiscoveryRail` + `HomeMatchCard`                                                                                        |
| Featured Collections | `getCollections()` + catalogue membership in `CollectionsRail`; `getFeaturedCollectionCards` sorts preferred active/sourced collections and slices to 10 |     Collection candidates / 10 collection cards | Collection-specific active/source/member/cover checks; not recommendation semantics                                                                              | Distinct collection hero-card family; **do not put it into destination dedup or change its product semantics**           |

### Final Home composition state

`HomeHeavy` applies the bounded Top Matches diversity pass to the ranked,
recommendation-eligible pool. `DeferredDiscoveryRails.createHomeDiscoveryRailStages`
then seeds `usedIds` with the composed Top Matches plus displayed Continue
Exploring and Bucket List IDs. Each later stage selects only unseen canonical IDs
from its own already-ranked/eligible pool through `selectUniqueRail`, records the
selected IDs, and returns fewer cards when that pool is exhausted.

The final stage order is preserved:

- day trip: Seasonal → Under 60 → Unexplored Nearby;
- overnight: Overnight Getaways → Seasonal → Longer Journey.

The Home nearby stage keeps its own full-catalogue origin-eligibility pool; it
does not inherit recommendation budget/vibe scoring. Composition claims canonical
IDs only after that producer applies transport, duration, coordinate, and visited
filters. Recommendation scoring and the other producers' context semantics remain
unchanged. Featured Collections stays outside destination-ID composition.

## Destination / hub detail

| Rail / section                  | Candidate producer                                                                                                                                                   |                                        Ranked pool / render cap | Eligibility already applied?                                                                | Shared card / composition boundary                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------: | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Top sights (hub)                | `DestinationRelationshipService.getFeaturedChildDestinations`; fallback child list is sliced to 4                                                                    |    Featured relationship IDs, or fallback children / fallback 4 | Relationship validity, same-prefecture/parent/municipality and locale availability          | `DestinationDetailRail` + `DestinationCard`; first claim in hub discovery |
| More things to do (hub)         | `indoorChildren` + `foodAndEveningChildren` in `DestinationDetails`; full ranked pools enter composition                                                             |                                         Combined child pool / 6 | Child relationship, locale, indoor/category filters; no cross-rail claim before composition | `DestinationDetailRail` + `DestinationCard`                               |
| Great additions to this trip    | `findNearbyCombinations(destination, undefined, 6)` → `DestinationCombinationRail`                                                                                   |                          Combination pool / 3 after composition | Local transit/coordinates, visit-time ≤ 600 min, combination semantics                      | `DestinationCombinationRail`                                              |
| Nearby Places                   | `DestinationRelationshipService.getNearbyDestinations`                                                                                                               |                                           Relationship pool / 4 | Relationship/index and locale availability                                                  | `DestinationDetailRail` + `DestinationCard`                               |
| More half-day options           | Parent children filtered to `recommendedVisitHours.max <= 4`; full ranked pool enters composition                                                                    |                      Parent-child pool / 3, zero extra backfill | Parent relation, visit-hour bound, current-place exclusion, locale                          | `DestinationDetailRail` + `DestinationCard`                               |
| Nearby hubs                     | `DestinationRelationshipService.getNearbyHubs(destination, 50)`                                                                                                      |                            All hubs within 50 km; no render cap | Hub role, coordinates, radius, locale                                                       | `DestinationDetailRail` + `DestinationCard`                               |
| Related-place / Go Next section | Page hierarchy in `DestinationDetails`: hub = Top sights/More things, then Great additions/Nearby hubs; non-hub = Great additions → Nearby Places → Half-day options | Ordered composition claims canonical IDs before each render cap | Each producer's own checks remain intact; empty composed rails are hidden                   | `composeDetailRails` is the shared cross-rail composition seam            |

### Detail reproduction on the pinned dense fixture

For `chofu-historic-jindaiji-district` on the pinned baseline before composition:

- Great additions: `ghibli-museum`, `jindaiji`, `kitaro-chaya`;
- Nearby places: `chofu-tokyo`, `jindaiji`, `jindai-botanical-gardens`, `kitaro-chaya`, `fudaten-shrine`;
- More half-day options: `jindaiji`, `jindai-botanical-gardens`, `kitaro-chaya`, `fudaten-shrine`.

The final composed result claims canonical IDs in page order:

- Great additions: `ghibli-museum`, `jindaiji`, `kitaro-chaya`;
- Nearby places: `chofu-tokyo`, `jindai-botanical-gardens`, `fudaten-shrine`;
- More half-day options: hidden because the explicit top-three candidate window is fully claimed by earlier rails; deeper siblings are not mined as filler.

The overlap was between independent candidate producers. `composeDetailRails`
now owns the ordered claim set while preserving each producer's ranking and
eligibility checks.

## Shared presentation families

- Home destination rails: `HOME_RAIL_CARD_CLASS` wrapper + `HomeMatchCard`.
  `HomeMatchCard` already uses a full-height flex column, stable title slot, and
  bottom metadata row; baseline Home equal-height E2E passed when Chromium stayed
  alive.
- Detail relationship rails: `DestinationDetailRail` wrapper + `DestinationCard`.
  `DestinationCard` uses `Card` with `flex flex-col h-full`, `CardContent`
  `flex-grow`, and a `CardFooter`; this is the lowest shared presentation boundary
  for equal detail-card heights.
- Combination rails: `DestinationCombinationRail` owns a separate article-card
  family with fixed image height, two-line title slot, growable explanation, and
  bottom metadata/actions.
- Featured Collections: independent hero cards; excluded from destination-card
  height and canonical-ID composition unless a future ticket explicitly changes
  collection semantics.

## Ownership conclusion

The smallest appropriate production boundary is a shared, deterministic
canonical-ID composition helper consumed by Home staged discovery and the ordered
Detail page rails. It must run after each producer’s own eligibility/ranking and
before the render cap, returning fewer cards when the eligible pool is exhausted.
Top Matches diversity is a separate bounded pass over its already-ranked eligible
pool; it must not modify `RecommendationService` scoring. Card-height changes, if
needed after a stable browser measurement, belong in the three shared card families
above rather than destination-specific CSS.
