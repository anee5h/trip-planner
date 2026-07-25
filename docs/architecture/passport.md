# Architecture Specification: Passport & Travel Progression Hub

## 1. Domain Purpose

Passport serves as TabiMap's central travel hub, tracking personal history, regional exploration, and achievements.

## 2. Core Passport Sub-Sections

The 6 canonical sub-sections of Passport are:

1. **Overview**: Asymmetric 12-column motivational dashboard.
   - **Hero Progress Card**: Overall Japan exploration percentage (`38%`) & prefecture count (`18/47`).
   - **Next Milestone Goal**: Dynamic calculation of nearest region / collection achievement.
   - **Benchmark Goals**: Progress bars for UNESCO sites, 12 Castles, etc.
   - **Recent Activity Feed**: Latest logged visits.
2. **Japan Map**: Interactive prefecture map & regional breakdown checklist (`PassportJapanMap`).
3. **Timeline**: Chronological visit feed & activity log (`PassportTimeline`).
4. **Achievements**: Official heritage list benchmarks (`PassportAchievements`).
5. **Badges**: Unlockable milestone & regional exploration badges (`PassportBadges`).
6. **Statistics**: Explored sights breakdown by category & analytics (`PassportStatistics`).

## 3. Explicit Ownership Rules & Domain Responsibilities

- **Collections** (`/collections`): Own curated list completion and destination tracking.
- **Achievements** (`/passport` > Achievements): Consume collection completion events and high-level travel milestones (_First Journey_, _Castle Master_, _Japan Complete_).
- **Badges** (`/passport` > Badges): Evaluate traveler behavior and identity (_Rail Traveler_, _Onsen Lover_, _Fuji Explorer_). Displayed as circular enamel pins with **zero progress bars**.
- **Passport**: Renders these systems but owns none of their internal evaluation logic.

## 4. Badge Rarity Tiers

- **Common** (~10–12 badges): Base exploration badges.
- **Rare** (~6–8 badges): Regional exploration & specialized interests.
- **Epic** (~2–3 badges): High-intensity travel milestones.
- **Legendary** (~1–2 badges): Premier achievements (e.g. _Japan Complete_) with gold foil borders & shimmer effects.

## 5. Configuration & State Orchestration

Passport internal sub-tab state is derived from `PASSPORT_SECTIONS` in `src/features/passport/constants.ts`. Badge evaluations are orchestrated by `BadgeEngine.ts` and achievement triggers by `AchievementEngine.ts`.
