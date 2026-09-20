# 004 — Recommendation and feasibility policy

**Status:** Current

## Context

A useful recommendation must reflect what the user wants, what transport evidence supports, how long the visit and travel can take, what the budget evidence means, and whether the result is too similar to earlier choices. These are related questions but not the same question. A single score or distance shortcut would make it difficult to tell why a candidate was excluded, retained, or ranked.

## Considered approaches

The realistic alternatives are:

1. Rank all catalogue records directly from preference and rating fields.
2. Make hard feasibility and budget filters decide everything before any preference ranking.
3. Separate context, evidence-aware eligibility, feasibility, affordability, preference scoring, explanation, and diversity into explicit stages.

The current pipeline implements the third approach. The alternatives describe design space, not undocumented historical decisions.

## Decision

The browser builds a `RecommendationContext` containing origin, duration, selected modes, budget intent, party size, dates, preferences, visited IDs, feedback, and optional personalization. The pipeline then:

1. removes records marked ineligible or already visited;
2. resolves topology-authorized modes and origin-aware travel evidence;
3. applies day-trip duration or overnight policy, including ferry date coverage and activity capacity;
4. evaluates per-mode budget evidence and removes only candidates that are definitely over budget under sufficiently strong evidence;
5. calculates deterministic preference and catalogue signals;
6. attaches match reasons, evidence, and cost state; and
7. consolidates overnight areas/Tokyo wards and applies diversity/relationship suppression.

Unknown information is not uniformly treated. An origin-aware constrained request may exclude a candidate when no usable mode exists or all available travel evidence is conservative-only. A missing fare or incomplete cost component is generally retained neutrally or with a warning rather than converted into free or zero. A score orders eligible candidates; it is not a guarantee that every underlying route, fare, or editorial fact is verified.

## Reasons

Eligibility answers “can this request be supported under the current evidence and policy?” Scoring answers “among supported candidates, which signals match this user?” Diversity answers “does the final rail contain useful variety rather than near-duplicates?” Keeping these questions separate makes explanations and tests more meaningful and prevents a preference match from overriding an impossible route or an unsafe cost assumption.

## Trade-offs

Conservative feasibility can reduce recommendation coverage when evidence is incomplete. Diversity can place a lower raw-score destination ahead of a near-duplicate with a higher score. Range-first affordability can retain a may-exceed or partial result instead of giving a binary answer. The resulting ordering is deterministic and policy-driven, but it is not mathematically optimal and has not been independently validated against user outcomes or conversion data.

## Consequences

- Changes to transport, duration, budget, or relationship policy can affect eligibility before scoring.
- Every preference is not automatically a ranking input; the scorer must read it explicitly.
- The same origin-aware transport seam is reused across Home, Explore, detail, budget, and planning.
- Maintaining the pipeline requires tests for both exclusion decisions and ranking/composition behavior.

## Evidence

- [`RecommendationPipeline.ts`](../../src/shared/services/recommendation/RecommendationPipeline.ts)
- [`RecommendationScorer.ts`](../../src/shared/services/recommendation/RecommendationScorer.ts)
- [`TripDurationService.ts`](../../src/shared/services/recommendation/TripDurationService.ts)
- [`WeekendPolicy.ts`](../../src/shared/services/recommendation/WeekendPolicy.ts)
- [`RecommendationExplainability.ts`](../../src/shared/services/recommendation/RecommendationExplainability.ts)
- [`useTripRecommendations.ts`](../../src/features/home/hooks/useTripRecommendations.ts)
- [`RecommendationScorer.test.ts`](../../src/shared/services/recommendation/__tests__/RecommendationScorer.test.ts)
- [`DayTripFeasibility.test.ts`](../../src/shared/services/recommendation/__tests__/DayTripFeasibility.test.ts)
- [`WeekendPolicy.test.ts`](../../src/shared/services/recommendation/__tests__/WeekendPolicy.test.ts)
- [`RecommendationExplainability.test.ts`](../../src/shared/services/recommendation/__tests__/RecommendationExplainability.test.ts)
- [Recommendation engine](../recommendation-engine.md)

## Current limitations

The ranking formula is deterministic and catalogue-driven, not learned from outcomes. Live origin weather is not a general destination-ranking input. Personalization is optional. Route coverage, fare evidence, catalogue quality, and production provider availability remain uneven.

## Future reconsideration

Reconsider the policy if measured user-outcome evidence, broader verified transport coverage, or a new product objective justifies changing the eligibility/scoring boundary. Any learned or optimized ranking would require a separately documented evaluation method and safety checks; none is claimed here.
