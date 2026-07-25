# Implementation Plan: Option B Visit Logic & Multi-Date Management

This plan implements **Option B**:

1. When an **unvisited** sight is clicked -> Opens a focused **`MarkVisitedModal`** (Quick Date Picker to log the initial visit).
2. When an **already visited** sight is clicked -> Opens a dedicated **`VisitHistoryModal`** (to view past visits, add additional visit dates, delete specific visits, or unmark the sight).

---

## 1. Clean Data Model & Store API

### `useTripStore.tsx`

- **`visited`**: `string[]` — Visited destination IDs.
- **`visitedDates`**: `Record<string, string[] | string>` — Map of destination ID to array of visit dates (`["2024-04-10", "2026-07-24"]`).

### Store Operations:

- `addVisitedDate(id: string, dateStr: string)`: Adds a visit date to the sight's history array and marks the sight as visited.
- `removeVisitedDate(id: string, dateStr: string)`: Removes a specific visit date entry. If no visit dates remain, unmarks the sight.
- `clearAllVisits(id: string)`: Unmarks the sight completely and clears all visit date entries.
- `getVisitedDates(id: string): string[]`: Returns sorted array of recorded visit dates.
- `getLatestVisitedDate(id: string): string | undefined`: Returns the latest visit date.
- `getVisitCount(id: string): number`: Returns total count of recorded visits.

---

## 2. Modals & Component Responsibilities

### A. `MarkVisitedModal.tsx` (For Unvisited Sights)

- Opened when clicking "Mark Visited" on an unvisited destination.
- Focused Quick Date Picker:
  - Precision selector (`Exact Date`, `Month & Year`, `Year Only`).
  - Presets (`Today`, `Yesterday`, `1 Week Ago`).
  - "Confirm Visit" button calls `addVisitedDate(id, selectedDate)` and closes modal.

### B. `VisitHistoryModal.tsx` (For Already Visited Sights)

- Opened when clicking the `Visited (Nx)` badge on a visited destination.
- Clean 3-part layout:
  1. **Visit History List**: List of all logged visit dates with delete trash buttons (`removeVisitedDate(id, dateStr)`).
  2. **Log Another Visit Form**: Inline date picker + precision selector to add a 2nd/3rd visit date (`addVisitedDate(id, newDateStr)`).
  3. **Unmark Destination**: "Unmark as Visited" button (`clearAllVisits(id)`).

### C. `DestinationCard.tsx` & `DestinationDetails.tsx`

- Condition check:
  - `if (!isVisited(id))` -> Open `MarkVisitedModal`.
  - `if (isVisited(id))` -> Open `VisitHistoryModal`.

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Verify data pipeline integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure unit test suite passes.
4. `npm run build` — Confirm clean production build compilation.

### Manual Verification

1. Unvisited sight -> Click "Mark Visited" -> `MarkVisitedModal` opens -> Select `Today` -> Confirmed -> Becomes "Visited 1x".
2. Click "Visited 1x" -> `VisitHistoryModal` opens -> Shows `Today` in history list -> Add `2024-04-15` -> Updates to "Visited 2x".
3. Delete `2024-04-15` from history list -> Updates back to "Visited 1x".
4. Click "Unmark Destination as Visited" -> Sight becomes unvisited.
