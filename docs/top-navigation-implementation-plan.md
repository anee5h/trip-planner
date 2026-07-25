# Implementation Plan: Primary Navigation & Passport Architecture Refactor

Establish a scalable information architecture and refactor Passport into a modular feature domain according to the design principles defined in [`docs/top-navigation-architecture-plan.md`](file:///home/aneesh/Desktop/projects/trip/docs/top-navigation-architecture-plan.md).

---

## Goal Description

1. Upgrade top navigation bar (`Navbar.tsx`) with three primary categories (`Discover ▼`, `Plan ▼`, `Passport ▼`), active category route matching, forgiving dropdown hover delay (150–200ms), accessibility attributes (`aria-expanded`, `aria-haspopup`, focus restoration), and mobile accordions.
2. Refactor Passport out of `PrefectureChecklist.tsx` into a dedicated `src/features/passport/` domain module using internal tab state (`activeTab: PassportTab`) driven by a single source of truth configuration (`PASSPORT_SECTIONS` in `constants.ts`).

---

## Architecture Principles

- **User Intent Navigation**: Organize navigation by user intent rather than individual pages.
- **Stable Categories**: Keep primary navigation limited to three stable categories (`Discover`, `Plan`, `Passport`).
- **Pillar-First Expansion**: New features should be added to an existing category whenever possible.
- **Passport Hub**: Passport serves as the central hub for travel history and progress.
- **Cohesive Feature Modules**: Feature modules should remain cohesive and independent.
- **Configuration Over Duplication**: Single source of truth (`PASSPORT_SECTIONS`) for navigation metadata.
- **Unidirectional Subcomponent Flow**: Passport subcomponents communicate through Passport container state.

---

## Proposed Changes

```
src/features/passport/
├── Passport.tsx                  [NEW] Container component managing activeTab state
├── index.ts                      [NEW] Barrel export
├── types.ts                      [NEW] Derived PassportTab type definition
├── constants.ts                  [NEW] Central source of truth (PASSPORT_SECTIONS array)
├── hooks/                        [NEW] Custom hooks for passport data
└── components/
    ├── PassportNav.tsx           [NEW] Sticky Segmented Control sub-navigation
    ├── PassportOverview.tsx      [NEW] Travel stats summary & overview card
    ├── PassportJapanMap.tsx      [NEW] Interactive Japan map section
    ├── PassportCalendar.tsx      [NEW] Travel calendar view
    ├── PassportTimeline.tsx      [NEW] Chronological feed view
    ├── PassportCollections.tsx   [NEW] Heritage collections progress
    ├── PassportBadges.tsx        [NEW] Unlocked badges grid
    └── PassportStatistics.tsx    [NEW] Regional statistics breakdown
```

---

### Suggested Implementation Order (Phased Rollout)

1. **Create Passport Feature Module Structure**: Build `src/features/passport/` with `constants.ts`, `types.ts`, and `index.ts`.
2. **Move Map Component into `PassportJapanMap.tsx`**: Encapsulate interactive Japan map & prefecture checklist.
3. **Assemble `Passport.tsx` & Route Setup**: Connect `/passport` route in `App.tsx` to `src/features/passport/Passport.tsx`.
4. **Implement Internal Navigation (`PassportNav.tsx`)**: Wire up segmented control tabs using `activeTab: PassportTab` state derived from `PASSPORT_SECTIONS`.
5. **Implement Primary Top Navigation Dropdowns (`Navbar.tsx`)**: Implement `Discover ▼`, `Plan ▼`, and `Passport ▼` with active category highlight and 150–200ms close delay window.
6. **Implement Mobile Accordion Drawer**: Replace hover dropdowns with tap accordions in mobile view.
7. **Accessibility & Quality Verification**: Add ARIA attributes (`aria-expanded`, `aria-haspopup`), focus restoration on `Escape`, and run test suite.

---

## Acceptance Criteria

- [ ] Primary navigation contains exactly three categories (`Discover`, `Plan`, `Passport`).
- [ ] Exactly one category is active at any time based on current URL route.
- [ ] Passport is implemented as its own feature module (`src/features/passport/`).
- [ ] Passport navigation uses internal state (`activeTab`) derived from `PASSPORT_SECTIONS` in `constants.ts`.
- [ ] Navigation is keyboard accessible with ARIA attributes and focus restoration.
- [ ] Mobile navigation uses accordions.
- [ ] All automated quality gates pass (`npm run lint`, `npm run test:run`, `npm run build`).

---

## Verification Plan

### Automated Tests

Run quality gates and test suite:

```bash
npm run lint
npm run test:run
npm run build
```

### Manual Verification

1. **Desktop Navigation**:
   - Verify active category highlight when visiting `/destinations`, `/collections`, `/my-trips`, `/bucket-list`, `/passport`.
   - Test hover dropdown close delay (150–200ms grace window).
   - Test keyboard `Escape` closing dropdowns and restoring focus.
2. **Passport Page**:
   - Navigate to `/passport`.
   - Click segmented control sub-tabs (Overview, Japan Map, Travel Calendar, Timeline, Collections, Badges, Statistics).
   - Confirm tabs switch cleanly via internal state without changing URL hashes.
3. **Mobile Drawer**:
   - Shrink browser width to mobile size.
   - Verify category accordions expand/collapse on tap.
