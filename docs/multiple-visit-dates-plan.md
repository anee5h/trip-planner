# Implementation Plan: Multiple Visit Dates per Destination

This plan introduces support for recording **Multiple Visit Dates & Visit History** for destinations in TabiMap (e.g., visiting Mount Fuji in `2024`, `May 2025`, and `July 24, 2026`), updating local storage schemas, store helpers, `VisitedDateModal`, `DestinationDetails`, and the Passport Activity Log.

---

## 1. Schema & Data Model

### Backward Compatible Data Structure

Currently, `visitedDates` is stored in LocalStorage as `Record<string, string>`. We will upgrade `visitedDates` to support `Record<string, string[] | string>`:

- **Getter Helper (`getVisitedDates(id)`)**:
  - Automatically normalizes legacy single-string formats (`"2026-07-24"`) to arrays (`["2026-07-24"]`).
  - Returns `string[]` sorted chronologically.
- **Store Functions**:
  - `addVisitedDate(id: string, date: string)`: Appends a new visit date to `visitedDates[id]` (preventing duplicates). Marks destination as visited if not already.
  - `removeVisitedDate(id: string, date: string)`: Deletes a specific date entry. If no dates remain, unmarks destination as visited.
  - `getLatestVisitedDate(id: string)`: Returns the most recent date for UI summary displays.
  - `getVisitCount(id: string)`: Returns the total number of recorded visits for the destination.

---

## 2. Proposed Component Architecture & Changes

### A. Store Architecture

#### [MODIFY] `src/shared/hooks/useTripStore.tsx`

- Upgrade `visitedDates` state & local storage parsing to support `Record<string, string[] | string>`.
- Add `getVisitedDates`, `addVisitedDate`, `removeVisitedDate`, `getLatestVisitedDate`, `getVisitCount`.
- Update `toggleVisited` to manage visit date arrays seamlessly.

### B. Visited Date & Visit History Modal

#### [MODIFY] `src/features/destinations/components/VisitedDateModal.tsx`

- Render **Visit History Log**: List all recorded visit dates for the destination with formatted date badges and a delete button for each entry.
- Render **Add New Visit Date**: Precision selector (`Exact Date`, `Month & Year`, `Year Only`) allowing users to log another visit.
- Show **Visit Counter Badge**: e.g., `3 Visits Logged`.

### C. Destination Details Header

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Update Visited action button to display visit count & latest visit date (e.g., `Visited 3x • Latest: Jul 24, 2026`).
- Open `VisitedDateModal` when clicked to view history or log additional visits.

### D. Passport Activity Log & Timeline

#### [MODIFY] `src/features/map/components/PassportTimelineCalendar.tsx`

- Map every individual visit date to an event entry in the Activity Log tree.
- A destination visited multiple times across different years/months will automatically appear in each corresponding Year/Month section of the Travel Passport.

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Verify data pipeline integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure unit test suite passes.
4. `npm run build` — Confirm clean production build compilation.

### Manual Verification

1. Open a destination detail page (e.g. Kyoto / Fushimi Inari).
2. Mark as visited with an exact date (`2024-04-15`).
3. Click "Visited 1x" again, add a second visit date (`2026-07-24`).
4. Verify history list shows both dates (`Apr 15, 2024` & `Jul 24, 2026`).
5. Open `/passport` and confirm the destination appears under both `2024` and `2026` Year accordions.
