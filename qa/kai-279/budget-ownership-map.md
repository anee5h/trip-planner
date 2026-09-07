# KAI-279 budget ownership map (current main, pre-change)

Baseline: `5e8d80aac43094611802893ffc6cc2bb13683298` (post-KAI-278 main)

> Outcome (KAI-279 landed): this map documents the PRE-CHANGE state. The
> implemented model makes the tier ceilings flat whole-trip party-total caps,
> adds Custom-total entry (Home planner + Explore filter), routes presets AND
> custom through one canonical cap (budgetConstraint) into the existing
> affordability path, and carries the constraint in TripContext. See
> `qa/kai-279/budget-constraint-audit.{json,md}` for the measured matrix.

## Headline Phase-0 finding

Preset ceilings ARE canonical and un-recalibrated:

- `BUDGET_TIER_LIMITS` (`src/shared/types/planner.ts`): economy `50000`, standard `100000`, comfortable `200_000`, luxury `Infinity` — annotated "Party-total ceilings for the baseline two-person full-day context".

BUT current main does NOT treat them as flat party-total caps everywhere:

- `PlannerBudgetPolicy` (`src/features/home/services/PlannerBudgetPolicy.ts`) derives `PER_PERSON_DAILY_LIMITS = tier/2` and `getPlannerBudgetLimit(tier, party, duration) = perPersonDaily × partySize × days + accommodationProfile×nights`. So a "Standard" cap scales with party size AND duration (Standard 4p half-day = ¥300,000; Economy 1p short outing = ¥12,500). The tier is a per-person-per-day comfort model masquerading as a budget label, and accommodation is added back on top of already-scaled daily spend (double-scale risk flagged by the audit).
- KAI-279's required semantics (cap is a fixed party-total ¥ that never scales with party/duration) therefore changes derived behavior at Home/Explore — the ¥50k/¥100k/¥200k ceilings themselves are NOT recalibrated. This is documented, not silent.

## Field ownership table

| Field        | Home                                                                         | Explore                                                               | Detail                                 | Compare                                                 | Planner      | Canonical owner                                                                                    |
| ------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| preset       | `PlannerControlsState.budgetTier` (draft/applied in HomePlannerStateContext) | `budgetTier` URL param → state                                        | TripContext `budget.tier`              | TripContext                                             | same as Home | `BudgetTier` in `shared/types/planner.ts`                                                          |
| custom cap   | none (no Custom control)                                                     | numeric `budget` URL param → `maxBudget` (parsed as tier "standard"!) | TripContext `budget.cap` (numeric URL) | TripContext                                             | none         | none — ad-hoc per surface                                                                          |
| party size   | `PlannerControlsState.partySize`                                             | `partySize`/`party` params                                            | TripContext.partySize                  | TripContext                                             | same         | TripContext / PlannerControlsState                                                                 |
| duration     | `tripDuration`                                                               | `duration` param                                                      | TripContext.duration                   | TripContext                                             | same         | TripContext                                                                                        |
| resolved cap | `getPlannerBudgetLimit(tier,party,duration)` (scaled)                        | same scaled fn when tier !== any/luxury; `maxBudget` when numeric     | TripContext cap (parseBudget)          | cap passed through compareEstimate (not used to filter) | —            | **scattered: PlannerBudgetPolicy + destinationSearchParams + TripContext.parseBudget (3+ owners)** |

## Surface-by-surface path

- **Home**: `useTripPlannerState` resolves `budget = getPlannerBudgetLimit(controls.budgetTier, partySize, tripDuration)` (SCALED). Default planner tier = Standard (`DEFAULT_PLANNER_BUDGET_TIER`). Home budget state is draft/applied in `HomePlannerStateContext`; recommendations receive `resolvedApplied.budget`.
- **Home → Explore serialization**: `serializePlannerSearchParams` writes `budgetTier` + `budget` (numeric resolved budget; `flexible` for luxury). So Home sends a SCALED resolved ¥ to Explore, not a tier identity alone.
- **Explore**: `parseDestinationSearchParams`:
  - `budgetTier` any → budgetTier "any", `maxBudget` = default ¥100,000 (unused for affordability filtering when any — verified ExploreAnyBudget test: Any bypasses filtering).
  - real tier → `maxBudget = BUDGET_TIER_LIMITS[tier]` (flat!), but the FILTER at Destinations.tsx:594 uses `getPlannerBudgetLimit(tier, partySize, tripDuration)` (scaled) — inconsistent: parse stores flat, filter uses scaled.
  - numeric `budget` (custom-ish) → `budgetTier = "standard"` + `maxBudget = number` — then the filter applies the SCALED STANDARD limit via tier, IGNORING the user's numeric custom cap. Defect.
  - Filter: `evaluateBudgetAffordability(estimate, tierLimit)`, keep `fits | partial`; `any`/`luxury` skip.
- **TripContext (KAI-276 canonical)**: `TripBudget = {kind:"any",tier?} | {kind:"cap",cap,tier?}`. `parseBudget`: `any` → any; numeric `budget` → `{kind:"cap",cap:N,tier?}`; tier WITHOUT numeric budget → `{kind:"cap", cap: 75000, tier}` — hard-coded ¥75,000 regardless of tier (economy tier ⇒ ¥75k cap, wrong vs ¥50k). Default context budget `{cap:75000,tier:"standard"}`.
- **Detail**: consumes TripContext budget (cap or any) for cost/affordability display; `calculateTripEstimate` (TripEstimateEngine) is the canonical estimator; partial/unknown hardening from KAI-277 preserved via completeness semantics.
- **Compare**: `compareEstimate.ts` — "A finite cap remains context for affordability; it must not filter."
- **Ranking**: `RecommendationScorer` calls `evaluateAffordability(engineResult, budget)` → `fits|may_exceed|over|unknown`; RecommendationPipeline hard-passes modes with max ≤ cap; budget affects ranking/affordability gate, never eligibility basis beyond filter.

## Canonical affordability classifiers (already exist — reuse, do not duplicate)

- `evaluateAffordability(result, budget)` → fits | may_exceed | over | unknown (tripEstimateEngine.ts:1114)
- `evaluateBudgetAffordability(result, budget)` → fits | partial | exceeds | unknown (tripEstimateEngine.ts:1145; Explore partial-aware policy)
- `TripEstimateEngine.estimate(context)` — canonical party-total estimate; overnight accommodation via ACCOMMODATION_PROFILES.

## Preset threshold definition owners (measured)

1. `BUDGET_TIER_LIMITS` — planner.ts (canonical ceilings)
2. `PER_PERSON_DAILY_LIMITS` — PlannerBudgetPolicy.ts (tier/2 — derived scaling)
3. `ACCOMMODATION_PROFILES[tier]` — tripEstimateEngine.ts (overnight)
4. `DURATION_BUDGET_MULTIPLIERS` — PlannerBudgetPolicy.ts
5. `defaults.maxBudget = BUDGET_TIER_LIMITS.standard` — destinationSearchParams.ts
6. TripContext parseBudget hard-coded `75000` fallback

## Findings that drive implementation

1. Custom cap identity is lost: numeric URL budget parses as tier "standard"; TripContext has no preset-vs-custom distinction beyond optional `tier`.
2. Explore filter IGNORES a numeric custom cap (uses scaled standard).
3. TripContext tier-only parse hard-codes ¥75,000 for any tier.
4. Party/duration scaling of caps (`PER_PERSON_DAILY_LIMITS` × party × days) contradicts the party-total invariant.
5. Home has no Custom-total control; tiers are not numerically labelled anywhere user-facing.
6. "Any" exists as a first-class BudgetFilter on Explore but Home's default is Standard; TripContext default is a ¥75k cap.

## Reproduction artifacts

See `before-reproduction.json` for the numeric matrix across party 1/2/4 × duration × tier × custom parse results.
