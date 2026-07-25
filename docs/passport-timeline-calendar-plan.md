# Implementation Plan: Passport Activity Timeline & Calendar View

This plan adds a **Timeline & Activity Calendar View** to the Travel Passport page (`/passport`), allowing users to visually track their past visits, travel dates, and scheduled itinerary activities across Japan in both an interactive monthly calendar grid and a chronological vertical timeline.

---

## 1. Feature Specifications & User Value

- **Dual View Modes**:
  1. **Interactive Monthly Calendar**: Standard 7-day grid showing day cells with color-coded activity badges for visited destinations and trips. Navigation controls to step through months (`‹ Previous Month`, `Next Month ›`, `Today`).
  2. **Chronological Timeline Stream**: A vertical timeline list grouped by Year and Month, rendering cards with hero image thumbnails, prefecture badges, visit dates, and quick link actions to destination details.
- **Data Integration**:
  - `visitedDates`: Recorded visit dates (exact `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`).
  - `visited`: List of visited destination IDs matched against `destinationsIndex`.
  - `trips`: Active user trips with start/end dates and stops.
- **Interactive Controls**:
  - View Switcher: `Calendar Grid` ↔ `Timeline Stream`.
  - Activity Filter: `All Activities` | `Visited Sights` | `Itineraries`.

---

## 2. Proposed Component Architecture

### A. New Component: `PassportTimelineCalendar.tsx`

#### [NEW] `src/features/map/components/PassportTimelineCalendar.tsx`

- Encapsulates calendar grid rendering, month navigation, activity timeline stream, and filters.
- Supports light/dark theme styling using existing design system tokens (`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800`).

### B. Passport Page Assembly

#### [MODIFY] `src/features/map/PrefectureChecklist.tsx`

- Insert `<PassportTimelineCalendar />` between the Explored Prefectures Map panel and the Passport Achievements panel.
- Pass `visited`, `visitedDates`, and `trips` from `useTripStore()`.

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Verify data pipeline integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure all 27 unit tests pass.
4. `npm run build` — Confirm clean production build compilation.

### Manual Verification

1. Open `/passport` in light & dark modes.
2. Verify month navigation (`‹ Previous Month`, `Next Month ›`, `Today`) in Calendar View.
3. Mark a destination as visited with an exact date (`2026-07-24`), month (`2026-07`), or year (`2026`) and confirm it appears accurately in both Calendar and Timeline views.
4. Switch to Timeline Stream view and verify chronological grouping by Year & Month.
