# Implementation Plan — Phase 2: Recommendation Engine

This plan covers the refined implementation of Phase 2 features based on detailed architecture feedback. We focus on modularizing the recommendation service layer, structured explainability, suitability helpers, and keyword search query parsing.

## Goal Description

Enhance TabiMap's recommendation engine with:

1. **Explainability**: Decouple scoring from explanations using `RecommendationScorer` and `RecommendationExplainability` to produce a structured `RecommendationMatch` payload.
2. **Better Filters**: Implement modular suitability filters in `RecommendationFilters` using configurable thresholds.
3. **Improved Search**: Extract multi-keyword matching into `DestinationSearch` under the recommendation domain.

## Architectural Boundary Rule

> [!IMPORTANT]
> **Everything under `src/shared/services/recommendation/` must be pure and framework-agnostic.**
> It must not import React hooks, Zustand stores, Supabase client code, browser-only APIs, or return JSX/React elements. It should remain 100% pure functions (inputs -> outputs) to allow easy testing and future backend migration.

## Out of Scope

The following features are intentionally deferred to future phases to prevent scope creep:

- Natural language search query parsing
- AI-powered recommendations
- Semantic search / Vector embeddings
- LLM / OpenAI integration

## User Review Required

No breaking changes. The React catalog and detail components will consume clean, unified explanation objects rather than implementing logic inline.

---

## Proposed Changes

### 1. Recommendation Architecture & Types

#### [MODIFY] `src/shared/types/destination.ts`

- Keep `Destination` clean of runtime match state.

#### [MODIFY] `src/shared/services/recommendation/RecommendationTypes.ts` [NEW]

- Define structured match, reason models, and enum types:

```ts
import type { Destination } from "@/shared/types/destination";

export enum MatchReasonType {
  Budget,
  Weather,
  Transport,
  Suitability,
  Seasonal,
  Distance,
  Interest,
  General,
}

export interface MatchReason {
  type: MatchReasonType;
  title: string;
  description?: string;
}

export interface RecommendationMatch {
  confidence: number;
  reasons: MatchReason[];
  matchedPreferences: string[];
  unmatchedPreferences: string[];
  summary?: string;
}

export interface ScoredDestination extends Destination {
  score: number; // internal rank
  match: RecommendationMatch; // UI-facing confidence & reasons
  bestTransportMode?: string;
}
```

#### [MODIFY] `src/shared/services/recommendation/RecommendationContext.ts` [NEW]

- Define `RecommendationContext` to group all scorer and explainer options:

```ts
export interface RecommendationContext {
  tripType: string;
  budget: number;
  carMode: string;
  publicModes: string[];
  partySize: number;
  currentWeatherCondition: string;
  visitedIds: string[];
  currentWeather?: { temp: number; desc: string } | null;
  homeStationCoords?: { lat: number; lng: number } | null;
}
```

#### [MODIFY] `src/shared/services/recommendation/RecommendationFilters.ts` [NEW]

- Define `SUITABILITY_THRESHOLD = 8`.
- Define helper functions:
  - `isCoupleFriendly(destination: Destination): boolean` (checks `ratings.couple >= SUITABILITY_THRESHOLD`)
  - `isFamilyFriendly(destination: Destination): boolean` (checks `ratings.overall >= SUITABILITY_THRESHOLD`)
  - `isSoloFriendly(destination: Destination): boolean`
  - `isAccessible(destination: Destination): boolean`

#### [MODIFY] `src/shared/services/recommendation/RecommendationScorer.ts` [NEW]

- Extract and encapsulate the score calculations from `RecommendationService.ts`.
- Expose `calculateConfidence(score: number): number`.

#### [MODIFY] `src/shared/services/recommendation/RecommendationExplainability.ts` [NEW]

- Expose `createRecommendationMatch(destination: Destination, context: RecommendationContext, score: number): RecommendationMatch`.

#### [MODIFY] `src/shared/services/recommendation/DestinationSearch.ts` [NEW]

- Expose `tokenizeQuery(query: string): string[]` (tokenizes query by spaces).
- Expose `matchesDestination(destination: Destination, tokens: string[]): boolean` (returns true if destination matches all tokens against name, prefecture, tags, categories, highlights, description, and seasonal tags).

#### [MODIFY] `src/shared/services/recommendation/RecommendationService.ts`

- Refactor to act as the orchestrator/facade that coordinates `RecommendationScorer`, `RecommendationExplainability`, `RecommendationFilters`, and `DestinationSearch`.

---

### 2. UI Integration

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

- Display the confidence match indicator using `destination.match.confidence`.
- Display recommendation reasons using the shared `MatchReason` model.

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Display the match confidence and explainability reasons in a section titled **"Why This Matches You"**.

#### [MODIFY] `src/features/home/components/RouletteModal.tsx`

- Render the match percentage on the selected winner card.

#### [MODIFY] `src/features/destinations/components/DestinationFilters.tsx`

- Add suitability checkbox toggles: **Solo**, **Couple**, **Family**, **Accessible**.
- Add interest checkbox toggles: **Nature**, **History**, **Food**, **Hiking**, **Photography**.

#### [MODIFY] `src/features/destinations/Destinations.tsx`

- Update query state to use the new suitability and interest filters.
- Replace query string filtering with `DestinationSearch`.

---

## Performance

- Preserve current recommendation response times.
- Avoid introducing additional API requests.
- Cache parsed search tokens during a single search session where appropriate.

---

## Implementation Order

1. Define Types & `RecommendationContext` in `src/shared/services/recommendation/RecommendationTypes.ts` & `src/shared/services/recommendation/RecommendationContext.ts`.
2. Build `RecommendationScorer.ts` (scoring logic).
3. Build `RecommendationFilters.ts` (suitability threshold helpers).
4. Build `RecommendationExplainability.ts` (builds `RecommendationMatch` payload).
5. Build `DestinationSearch.ts` (multi-keyword parsing and matching).
6. Refactor `RecommendationService.ts` to coordinate scorers, explainers, filters, and search.
7. Integrate UI in `DestinationFilters.tsx`, `Destinations.tsx`, `DestinationCard.tsx`, `DestinationDetails.tsx`, and `RouletteModal.tsx`.
8. Write and execute the unit tests.
9. Perform regression verification checks.

---

## Acceptance Criteria

- [ ] Recommendation ordering remains unchanged under identical inputs.
- [ ] Recommendation results remain deterministic for identical inputs.
- [ ] Every recommendation includes a `RecommendationMatch` object.
- [ ] Cards display confidence and recommendation reasons.
- [ ] Destination details display "Why This Matches You".
- [ ] New suitability filters work correctly.
- [ ] Multi-keyword search returns expected results.
- [ ] All unit tests pass.
- [ ] Production build succeeds.
- [ ] No existing recommendation functionality regresses.

---

## Verification Plan

### Automated Tests

- Create dedicated unit test suites under `src/shared/services/recommendation/__tests__/`:
  - `RecommendationScorer.test.ts`
  - `RecommendationFilters.test.ts`
  - `RecommendationExplainability.test.ts`
  - `DestinationSearch.test.ts`

### Regression Checks

- Verify existing recommendation ordering remains unchanged under default conditions.
- Verify existing weather and budget recommendations match criteria accurately.
- Verify production build finishes with `npm run build`.
