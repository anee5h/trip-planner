# Architecture Document: Primary Navigation & Information Architecture

This document defines the core information architecture, navigation design principles, and Passport feature domain structure for TabiMap.

---

## 1. Architecture Principles

- **User Intent Navigation**: Organize navigation by user intent rather than individual pages.
- **Stable Categories**: Keep primary navigation limited to three stable categories (`Discover`, `Plan`, `Passport`).
- **Pillar-First Expansion**: New features should be added to an existing category whenever possible.
- **Passport Hub**: Passport serves as the central hub for travel history, regional progress, and achievements.
- **Cohesive Feature Modules**: Feature modules should remain cohesive and independent.
- **Configuration Over Duplication**: Shared navigation metadata (labels, order, identifiers, icons) should have a single source of truth (`PASSPORT_SECTIONS`).
- **Unidirectional Subcomponent Flow**: Passport subcomponents communicate through Passport container state rather than importing one another directly.

---

## 2. Product Philosophy & Primary Navigation Pillars

TabiMap organizes user workflows around the three fundamental stages of travel:

1. **Discover**: Exploring destinations, regional sights, and curated thematic collections (`/destinations`, `/collections`).
2. **Plan**: Building custom itineraries, mapping daily routes, and managing saved places (`/my-trips`, `/bucket-list`).
3. **Passport**: Tracking personal travel history, explored prefectures, timelines, and heritage achievements (`/passport`).

```
TabiMap Information Architecture

Discover ▼                 Plan ▼                     Passport (Direct Link)
├── Destinations           ├── My Trips               Internal Sub-Tabs:
└── Collections            └── Bucket List            ├── Overview
                                                      ├── Japan Map
                                                      ├── Timeline
                                                      ├── Achievements
                                                      ├── Badges
                                                      └── Statistics
```

---

## 3. Passport Domain Ownership & Responsibilities

### Responsibilities

**Passport owns:**

- Travel history & visit records
- Prefecture progress tracking
- Heritage achievements & milestone badges
- Personal exploration analytics

**Passport does NOT own:**

- Itinerary planning (owned by `Plan` / `MyTrips`)
- Destination discovery & search (owned by `Discover` / `Destinations`)
- Search & recommendation engines

---

## 4. Core Navigation Rules & Governance

- **Stable Product Pillars**: Navigation categories are stable product pillars and should only change when introducing a new core workflow. `Discover` and `Plan` feature dropdown menus for sub-pages, while `Passport` functions as a direct top-level link to `/passport`.
- **Future-Proof Expansion**: New features should be added to existing navigation groups before considering new top-level navigation categories.
- **Single Active Category**: Exactly one primary category (`Discover`, `Plan`, or `Passport`) is active at any time.
- **Child Page Active State**: The primary category remains highlighted while viewing any child page or route belonging to that category (e.g., viewing `/bucket-list` highlights `Plan`).
- **Mutual Exclusivity**: Opening one navigation dropdown automatically closes all others.
- **Dismissal Controls**: Dropdowns close when clicking outside, pressing the `Escape` key, or navigating to a route.
- **Mobile Drawer**: Mobile navigation uses tap accordions for `Discover` and `Plan`, and a direct button for `Passport`.

---

## 5. Dropdown Interaction & Accessibility Specifications

### Desktop Visual Styling Specifications (Framework-Agnostic)

- **Active Category Button**:
  - Green text font color
  - 2–3 px green bottom accent line
  - Subtle tinted background fill
  - Medium / semibold font weight
- **Inactive Category Button**:
  - Neutral text color
  - Transparent background fill
  - Smooth hover color transition and underline reveal

### Interaction Timing

- **Open Delay**: 0 ms (immediate open on hover/click)
- **Close Delay**: 150–200 ms forgiving hover grace window to prevent accidental menu dismissal.

### Accessibility Standards

- `aria-expanded` dynamically synced to dropdown open state.
- `aria-haspopup="true"` on category triggers.
- Keyboard navigation: `Tab`, `Shift+Tab`, `Escape`, `ArrowDown`, `ArrowUp`.
- Focus management: Keyboard focus returns to the category trigger element upon closing dropdown via `Escape` key.

---

## 6. Passport Feature Domain Architecture

Passport section switching within `/passport` is managed via internal component state (`activeTab: PassportTab`) derived from a single configuration source (`PASSPORT_SECTIONS` in `constants.ts`).

### Performance Requirement

- **Lazy-Loading Passport Tabs**: Passport sub-tabs should be independently lazy-loadable to reduce initial bundle size.

### Domain Folder Structure (`src/features/passport/`)

```
src/features/passport/
├── Passport.tsx                  # Container component & tab state orchestrator
├── constants.ts                  # Single source of truth (PASSPORT_SECTIONS array)
├── types.ts                      # Derived PassportTab type & domain interfaces
├── index.ts                      # Barrel export for feature module
├── hooks/                        # Custom hooks for Passport data
└── components/
    ├── PassportNav.tsx           # Sticky Segmented Control sub-navigation
    ├── PassportOverview.tsx      # High-level travel summary & dashboard cards
    ├── PassportJapanMap.tsx      # Interactive Japan map & prefecture checklist
    ├── PassportTimeline.tsx      # Chronological visit feed & calendar log
    ├── PassportAchievements.tsx  # Unlocked heritage list benchmarks
    ├── PassportBadges.tsx        # Earned regional & milestone badges
    └── PassportStatistics.tsx    # Detailed regional exploration analytics
```

---

## 7. Passport Internal Section Definitions & Future Extensibility

### Core Sections

1. **Overview** — High-level dashboard summary (prefectures explored count, achievements, active streaks).
2. **Japan Map** — Interactive prefecture map and region checklist (`PassportJapanMap`).
3. **Timeline** — Chronological travel activity feed & calendar log (`PassportTimeline`).
4. **Achievements** — Unlocked heritage benchmarks & curated Japanese travel lists (`PassportAchievements`).
5. **Badges** — Earned regional & travel milestone badges (`PassportBadges`).
6. **Statistics** — Regional exploration metrics and category breakdowns (`PassportStatistics`).

### Future Extensibility

Future Passport sections may be added without modifying the primary navigation. Examples include:

- Travel Journal
- Photo Memories
- Annual Recap
- Countries Visited
