# Implementation Plan: Fix Visit Operations Logic & Modal Workflows

This plan fixes logical issues across `useTripStore.tsx`, `VisitedDateModal.tsx`, `DestinationCard.tsx`, `DestinationDetails.tsx`, and `PassportTimelineCalendar.tsx` to ensure predictable state updates, non-destructive visit toggles, clean visit history management, and proper React state updater separation.

---

## 1. Identified Logical Issues & Solved Behaviors

### Issue A: Destructive `toggleVisited` Wiping Visit History

- **Root Cause**: `toggleVisited(id, date)` overwrote `visitedDates[id]` with a single date string. Clicking the Visited button on an already-visited sight called `toggleVisited`, immediately clearing all visit dates.
- **Solution**:
  - Update `toggleVisited(id)` to be non-destructive: if visited, open `VisitedDateModal` to allow managing history or explicit deletion.
  - Fix `useTripStore.tsx` so `toggleVisited` delegates to `addVisitedDate` or `removeVisitedDate` cleanly.

### Issue B: Nested React State Updater Anti-Pattern

- **Root Cause**: `removeVisitedDate` called `setVisited((prev) => ...)` inside the `setVisitedDates((prev) => ...)` callback function.
- **Solution**: Refactor `removeVisitedDate` to calculate remaining dates and update `visited`, `visitedDates`, and `visitedPrefectures` sequentially in separate top-level statements.

### Issue C: `VisitedDateModal` Open Behavior for Visited Sights

- **Root Cause**: Clicking the Visited button on cards/details when already visited toggled the state off rather than allowing users to view history or log additional visits.
- **Solution**:
  - Make `VisitedDateModal` open upon clicking the Visited button for both visited and unvisited sights.
  - Include an explicit "Unmark Sight as Visited" button inside `VisitedDateModal` if users want to remove all visits for a sight.

### Issue D: `PassportTimelineCalendar` State Dependency

- **Root Cause**: `useMemo` in `PassportTimelineCalendar.tsx` had `getVisitedDates` (function reference) in its dependency array instead of `visitedDates` (the actual state object).
- **Solution**: Pass `visitedDates` in the dependency array so the calendar automatically re-renders when visit dates change.

---

## 2. Proposed Code Changes

### A. Store Architecture

#### [MODIFY] `src/shared/hooks/useTripStore.tsx`

- Refactor `removeVisitedDate` to avoid calling state setters inside other state updater callbacks.
- Refactor `toggleVisited` to preserve existing visit arrays.
- Add `clearAllVisitedDates(id)` to allow explicitly unmarking a destination as visited.

### B. Visited Date & Visit History Modal

#### [MODIFY] `src/features/destinations/components/VisitedDateModal.tsx`

- Add an explicit "Unmark Sight as Visited" action at the bottom of the history log.
- Ensure adding a visit date calls `addVisitedDate` directly.

### C. Destination Card & Details

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Open `VisitedDateModal` when clicking the Visited button regardless of current visit status.

### D. Passport Activity Log

#### [MODIFY] `src/features/map/components/PassportTimelineCalendar.tsx`

- Include `visitedDates` in `useMemo` dependency array for automatic reactivity.

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Verify data pipeline integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure unit test suite passes.
4. `npm run build` — Confirm clean production build compilation.

### Manual Verification

1. Open a destination card or detail page.
2. Click Visited button when unvisited -> Modal opens -> Log visit date -> Card updates to "Visited 1x".
3. Click Visited button on the visited card -> Modal opens showing history log -> Click "+ Add Visit Entry" -> Log 2nd visit date -> Card updates to "Visited 2x".
4. Delete one visit entry -> Count drops to 1x.
5. Click "Unmark Sight as Visited" -> Destination is unvisited.
