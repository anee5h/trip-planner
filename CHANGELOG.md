# TabiMap Changelog

All notable changes to TabiMap are documented in this file.

## [v2.0.0-alpha.2] - 2026-08-02

### 🚀 Roadmap v2.0 — Stage 2 Complete (Travel Decision Planning)

#### Features & Improvements

- **Trip Duration Classification** (`PR #25` / Stage 2 PR 6): Added short outing, half-day, full-day, and weekend classifications with total travel and visit duration estimates, localized reason codes, and filter integration.
- **Nearby Destination Combinations** (`PR #26` / Stage 2 PR 7): Implemented compatible nearby place recommendation engine considering distance, travel time, weather compatibility, and combined trip budget.
- **Suggested Day Plans** (`PR #27` / Stage 2 PR 8): Added morning/afternoon/evening itinerary generator complete with transit segments, buffer times, meal breaks, and interactive reordering controls.
- **Combined Trip Cost Modelling** (`PR #28` / Stage 2 PR 9): Implemented comprehensive cost estimation combining transport, attraction tickets, food, café, and parking into per-person and party total ranges.
- **Hub-Based Planning** (`PR #30` / Stage 2 PR 10): Introduced hub-first travel planning, destination grouping by city/region hub, single travel-to-hub cost calculation, and hub budget summaries.

---

## [v2.0.0-alpha.1] - 2026-07-30

### 🚀 Roadmap v2.0 — Stage 1 Complete (Recommendation Quality and Measurement)

#### Features & Improvements

- **Feedback Controls & Events** (`PR #12`): Added typed analytics event contracts (`recommendation_feedback`, `destination_click`, `compare`, `save`, `dismiss`) with zero-PII protection, opt-out support, and bilingual feedback controls on `DestinationCard`.
- **Quality Analytics Engine** (`PR #13`): Added click-through rate (CTR %), save rate %, comparison rate %, and reason-code/confidence-band metrics to the QA Dashboard.
- **Telemetry Pipeline** (`PR #14`): Implemented background event batching (10 events / 5s), exponential backoff retries, 50KB payload cap enforcement, and pluggable `TelemetrySink`.
- **Confidence Calibration** (`PR #15`): Implemented `RecommendationConfidenceScorer` separating Data Confidence (catalog completeness & provenance) from Recommendation Confidence (live weather/transit precision), with localized explanations (`HIGH`, `MEDIUM`, `LOW`).
- **Preference & History Personalization** (`PR #16`): Implemented `PersonalizationService` extracting implicit user profiles from saved (2.0x) and visited (1.0x) destinations, with repeated-interest weighting, novelty preferences (`NOVEL` vs `FAMILIAR` vs `BALANCED`), and history reset actions.
- **A/B Experimentation Framework** (`PR #17`): Implemented `ExperimentFramework` with FNV-1a deterministic hashing into 100 session buckets (`0..99`), expiration date safeguards, kill switch overrides, and QA Dashboard integration.
- **Tailwind v4 CSS Pipeline Fix** (`PR #18`): Updated `src/index.css` to `@import "tailwindcss"; @config "../tailwind.config.js";`, restoring full Preflight CSS resets, design tokens, and utility styles in production.
- **Product Integration Controls** (`PR #19`): Surfaced Confidence Badges with popover tooltips on `DestinationCard`, and added Personalization enable/disable switches, Novelty selectors, Profile reset buttons, and Privacy opt-out controls to `Settings`.

---
