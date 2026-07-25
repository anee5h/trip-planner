# Implementation Plan — Mobile Optimization & Responsiveness Redesign

This plan outlines the mobile-friendly responsive enhancements across key features in TabiMap to provide a native-app-like mobile user experience, ensuring the UI adapts gracefully to smaller touchscreens instead of simply shrinking desktop layouts.

---

## Proposed Changes

### 1. Unified Mobile Trip Details & Itinerary View

#### [MODIFY] `src/features/trips/TripDetails.tsx`

- Replace desktop 3-column layouts with a responsive **Mobile Tab Switcher** (tabs: "Stops", "Map View", "Journal") for screens below `lg` (1024px) breakpoint.
- Stacking the toolbar title and action icons into a clean flex-wrap block on mobile to prevent clipping.

---

### 2. Mobile Card Comparison View

#### [MODIFY] `src/features/compare/Compare.tsx`

- Transform wide comparison tables on mobile to a swipable comparison card stack or list view with collapsible attribute sections (e.g. comparing two destinations side-by-side in stacked cards instead of columns).

---

### 3. Mobile Questionnaire Tap Targets

#### [MODIFY] `src/features/onboarding/Onboarding.tsx`

- Improve layout padding, question cards stacking, and increase touch target heights to a minimum of 48px to accommodate finger taps on mobile.

---

### 4. Interactive Prefectures Map Scale

#### [MODIFY] `src/features/map/PrefectureChecklist.tsx`

- Scale the interactive SVG prefecture map to fit exactly within small screen bounds without clipping or requiring horizontal scrolling.

---

## Verification Plan

### Automated Tests

- Run all test suites:
  ```bash
  npx vitest run
  ```

### Manual Verification

- Resize the browser window to mobile widths (e.g., 375px - iPhone SE bounds) or use Chrome DevTools device mode.
- Verify that the comparison page renders stackable cards instead of wide tables.
- Verify that the Trip Planner detail page displays the Stops/Map/Journal tab bar switcher.
