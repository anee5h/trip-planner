# TabiMap v2.0 Roadmap

## Mission

- [ ] Build the most trusted domestic travel decision engine for people living in Japan.
- [ ] Help users answer: **“Given where I am, my budget, my available time, my preferences, and current conditions, where should I actually go?”**
- [ ] Keep recommendations—not catalogue size—as the product’s main value.
- [ ] Maintain equal English and Japanese capability and editorial quality.
- [ ] Finish every stage with visible product integration, a release PR, and a Git tag.

---

# Current Release State

- [x] Current prerelease: `2.0.0-alpha.2`
- [x] Current tag: `v2.0.0-alpha.2`
- [x] Stage 1 release commit: `d7f07fd`
- [x] Protected `main`
- [x] Pull requests required
- [x] Strict required checks enabled
- [x] Administrator enforcement enabled
- [x] Squash merge and automatic branch cleanup enabled
- [x] Conventional PR titles enforced

---

# Completed Foundation

## Editorial and Catalogue

- [x] Canonical place schema
- [x] Hub/destination hierarchy
- [x] Relationship validation
- [x] Source taxonomy and field provenance
- [x] Change history and freshness tracking
- [x] Lifecycle/publication controls
- [x] Structured audits and deterministic finding codes
- [x] Scoped, dry-run repair tooling
- [x] Detail/index synchronization
- [x] Bilingual publication controls

## Recommendation Foundation

- [x] Weighted recommendation scoring
- [x] Structured reason codes and explanations
- [x] Budget, weather, season, transport, walking, and party-size inputs
- [x] Visited-destination handling
- [x] Confidence-aware rating contribution
- [x] Recommendation regression tests

## Planning Foundation

- [x] Origin, available time, budget, interests, and transport inputs
- [x] Planner state persistence
- [x] Destination comparison and collections
- [x] Hub relationships
- [x] Visit-duration and budget estimates

## Engineering and Delivery

- [x] Parallel PR validation jobs
- [x] Required checks: `quality`, `tests`, `catalogue-fast`, `build`, `validate-title`
- [x] Dependabot updates
- [x] Release verification
- [x] Stage-based prerelease versioning
- [x] Version visible in the application

---

# Stage 1 — Recommendation Quality and Measurement

## Status

- [x] **Complete**
- [x] Product integration complete
- [x] Released as `v2.0.0-alpha.1`

## Completed PRs

- [x] PR #12 — Recommendation feedback events
- [x] PR #13 — Recommendation quality analytics
- [x] PR #14 — Recommendation telemetry pipeline
- [x] PR #15 — Recommendation confidence calibration
- [x] PR #16 — History-based personalization
- [x] PR #17 — Recommendation experiment framework
- [x] PR #19 — Surface recommendation intelligence controls
- [x] PR #20 — Prepare `v2.0.0-alpha.1`

## Completed capabilities

- [x] Versioned analytics contracts
- [x] Feedback events and deduplication
- [x] Privacy-safe, non-blocking telemetry
- [x] CTR, save, comparison, reason-code, confidence-band, fallback, and no-result metrics
- [x] Deterministic confidence calibration
- [x] Saved/visited history personalization
- [x] Novelty preference controls
- [x] Personalization reset and opt-out
- [x] Deterministic experiments, expiration, and kill switches
- [x] Visible confidence badges and tooltips
- [x] Visible personalization and privacy settings
- [x] Changelog, app version display, release tag

## Stage 1 follow-up polish

- [x] Replace the duplicate top-row thumbs-up action with **Add to bucket list**
- [x] Use a bookmark/list-plus icon
- [x] Keep thumbs up/down only in the “Was this helpful?” row
- [x] Ensure bucket-list clicks emit a save event, not helpful-feedback
- [x] Confirm English/Japanese label parity

Suggested PR:

```text
fix: replace duplicate like action with bucket list control
```

---

# Stage 2 — Travel Decision Planning

## Status

- [x] **Complete**
- [x] Complete five feature PRs
- [x] Complete visible product integration
- [x] Released as `v2.0.0-alpha.2`

## PR 6 — Trip-duration classification

- [x] Add short outing, half-day, full-day, and weekend classifications
- [x] Include total travel and visit time
- [x] Exclude impossible options
- [x] Warn on borderline options
- [x] Add localized labels and reason codes
- [x] Add deterministic tests
- [x] Surface duration visibly in cards/planner

```text
feat: add trip duration classification
```

## PR 7 — Nearby destination combinations

- [x] Find compatible nearby destinations
- [x] Apply distance and travel-time constraints
- [x] Prevent duplicates and repetitive combinations
- [x] Include weather compatibility
- [x] Calculate combined duration and cost
- [x] Add explanation reason codes
- [x] Add visible “Pair with…” UI

```text
feat: recommend nearby destination combinations
```

## PR 8 — Suggested day plans

- [x] Add morning/afternoon/evening structure
- [x] Add destination order, travel segments, buffers, and meal breaks
- [x] Add overfilled-plan warnings
- [x] Disclose missing/uncertain opening hours
- [x] Allow removing and reordering suggestions
- [x] Keep plans usable without an account
- [x] Add visible editable plan UI

```text
feat: add generated day-plan suggestions
```

## PR 9 — Combined trip-cost modelling

- [x] Add transport, tickets, food, café, and parking estimates
- [x] Add per-person and party totals
- [x] Add minimum/maximum ranges and confidence
- [x] Add lower-cost alternatives
- [x] Prevent ticket costs for free destinations
- [x] Keep totals consistent across cards, planner, and persisted state
- [x] Add visible cost breakdown UI

```text
feat: add combined trip cost modelling
```

## PR 10 — Hub-based planning

- [x] Allow hub-first planning
- [x] Show destinations within a hub
- [x] Separate travel-to-hub from local movement
- [x] Count travel-to-hub cost once
- [x] Add half-day and full-day hub plans
- [x] Add hub-specific budget summaries
- [x] Integrate related collections
- [x] Add visible hub-plan UI

```text
feat: improve hub-based travel planning
```

## Stage 2 release checklist

- [x] All five feature PRs merged
- [x] Visible UI review complete
- [x] Mobile and bilingual parity verified
- [x] Stage 2 analytics events added
- [x] `CHANGELOG.md` updated
- [x] Version bumped to `2.0.0-alpha.2`
- [x] `release:verify` passes
- [x] Tag `v2.0.0-alpha.2` created

```text
release: prepare v2.0.0-alpha.2
```

---

# Stage 3 — Editorial Trust at Scale

## Status

- [ ] **Not started**
- [ ] Complete editorial dashboard and tooling
- [ ] Complete regional review PRs
- [ ] Release as `v2.0.0-beta.1`

## PR 11 — Editorial quality dashboard

- [x] Show lifecycle, published, reviewed, and assisted counts
- [x] Show stale records, low-confidence ratings, missing sources, provenance, and Japanese coverage
- [x] Identify high-risk hubs
- [x] Export deterministic review queues
- [x] Keep reports non-destructive

## PR 12A — Tokyo and Kanto review

- [ ] Review descriptions, categories, transport, cost, visit duration, sources, relationships, Japanese content, and confidence

## PR 12B — Kansai review

- [ ] Review descriptions, categories, transport, cost, visit duration, sources, relationships, Japanese content, and confidence

## PR 12C — Regional city review

- [ ] Review descriptions, categories, transport, cost, visit duration, sources, relationships, Japanese content, and confidence

## PR 13 — Editorial import and review tooling

- [ ] Add schema-safe import, dry-run, diff preview, duplicate detection, and field-level source mapping
- [ ] Require lifecycle assignment
- [ ] Prohibit automatic publication
- [ ] Make repeated imports idempotent
- [ ] Keep detail files and index synchronized

## Stage 3 completion checklist

- [ ] At least 500 canonical records
- [ ] Reviewed count measured separately from raw count
- [ ] Priority hubs have strong bilingual coverage
- [ ] Published records meet source standards
- [ ] Assisted records cannot bypass review
- [ ] Monthly editorial review process documented
- [ ] Version bumped and tagged `v2.0.0-beta.1`

---

# Stage 4 — Product Experience and Polish

## Status

- [ ] **Not started**
- [ ] Complete four feature PRs
- [ ] Release as `v2.0.0-rc.1`

## PR 14 — Recommendation-first homepage

- [ ] Prominent planning inputs and fast recommendation entry
- [ ] Explanation-first recommendation cards
- [ ] Visible time, budget, confidence, and weather assumptions
- [ ] Helpful fallback and no-result states
- [ ] Reduced catalogue-first emphasis

## PR 15 — Mobile planning refinement

- [ ] Touch-friendly filters and cards
- [ ] Mobile comparison and sticky summary
- [ ] Responsive day plans and maps
- [ ] Safe-area and keyboard-safe forms
- [ ] No horizontal overflow
- [ ] Long Japanese text tested

## PR 16 — Accessibility completion

- [ ] Keyboard navigation and visible focus
- [ ] Semantic headings, landmarks, labels, and error announcements
- [ ] Screen-reader recommendation summaries
- [ ] Contrast and reduced-motion fixes
- [ ] Automated accessibility checks

## PR 17 — Search and onboarding refinement

- [ ] Improve Japanese, English, kana, and romanized matching
- [ ] Add typo tolerance
- [ ] Distinguish hubs from destinations
- [ ] Add recent searches and first-use guidance
- [ ] Use privacy-safe defaults
- [ ] Allow onboarding skip

## Stage 4 completion checklist

- [ ] Core flows work on mobile and keyboard
- [ ] English/Japanese parity passes
- [ ] Recommendation assumptions are visible
- [ ] Search distinguishes hubs and destinations
- [ ] Version bumped and tagged `v2.0.0-rc.1`

---

# Stage 5 — Production Readiness and Launch

## Status

- [ ] **Not started**
- [ ] Complete monitoring/performance PR
- [ ] Complete critical-journey test PR
- [ ] Release `v2.0.0`

## PR 18 — Monitoring and performance budgets

- [ ] Add error, recommendation-failure, no-result, API-failure, and weather-fallback monitoring
- [ ] Add Core Web Vitals and route/bundle size budgets
- [ ] Add privacy documentation and operational dashboard
- [ ] Include release identifiers in errors
- [ ] Ensure monitoring cannot break the application

## PR 19 — Critical journey coverage

- [ ] Test complete-input recommendations
- [ ] Test weather and budget fallbacks
- [ ] Test half-day, full-day, nearby-combination, hub-planning, and cost-range flows
- [ ] Test bilingual parity, mobile flow, analytics opt-out, personalization disabled, feedback, invalid relationships, and stale data
- [ ] Use real application flows
- [ ] Isolate network-dependent checks

## PR 20 — Final release

- [ ] Bump version to `2.0.0`
- [ ] Update changelog
- [ ] Verify migrations
- [ ] Run final catalogue, recommendation, editorial, accessibility, and performance reports
- [ ] Review production preview
- [ ] Document rollback
- [ ] Confirm monitoring active
- [ ] Tag exact deployed commit as `v2.0.0`

---

# Version Milestones

- [x] Stage 1 — `v2.0.0-alpha.1`
- [x] Stage 2 — `v2.0.0-alpha.2`
- [ ] Stage 3 — `v2.0.0-beta.1`
- [ ] Stage 4 — `v2.0.0-rc.1`
- [ ] Stage 5 — `v2.0.0`

---

# PR Count

## Completed

- [x] Stage 1 roadmap PRs: 8
- [x] Stage 2 roadmap PRs: 6
- [x] Stage 3 roadmap PRs: 1 (PR 11 Editorial Quality Dashboard)
- [x] Additional production CSS fix: 1

## Remaining planned roadmap PRs

- [ ] Stage 1 polish: 1
- [ ] Stage 3: 5 including three regional data PRs, tooling, and release PR
- [ ] Stage 4: 5 including release PR
- [ ] Stage 5: 3 including final release PR

## Totals

- [x] Completed roadmap PRs: 15
- [ ] Remaining planned roadmap PRs: 14
- [ ] Expected final roadmap PR total: 29

---

# Branch and Release Checklist

For every normal PR:

- [ ] Branch from current `main`
- [ ] Keep one focused concern
- [ ] Use conventional PR title
- [ ] Pass all five required checks
- [ ] Resolve conversations
- [ ] Squash merge
- [ ] Confirm automatic branch deletion
- [ ] Fast-forward local `main`
- [ ] Confirm clean working tree

For every stage release:

- [ ] Create dedicated `release:` PR
- [ ] Update `package.json`
- [ ] Update `CHANGELOG.md`
- [ ] Update this roadmap
- [ ] Run `release:verify`
- [ ] Review production preview
- [ ] Merge through protected `main`
- [ ] Create and push tag
- [ ] Record exact commit SHA
- [ ] Confirm version visible in app

---

# Deferred Beyond v2.0

- [ ] Advanced multi-day itinerary optimization
- [ ] Real-time collaboration
- [ ] Live transport routing and fare guarantees
- [ ] Event recommendations
- [ ] JR Pass optimization
- [ ] AI travel assistant
- [ ] Public API
- [ ] Offline travel support
- [ ] Booking integrations
- [ ] Public itinerary marketplace
- [ ] Native mobile application

---

# Current Next Actions

- [x] Stage 2 Release `v2.0.0-alpha.2` complete
- [x] Stage 3 PR 11 Editorial Quality Dashboard complete
- [ ] Begin Stage 3 PR 12A Tokyo and Kanto editorial review
