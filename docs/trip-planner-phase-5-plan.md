# Implementation Plan — Priority 5: Trip Planner Polish (TabiMap UI/UX Roadmap)

This plan outlines the visual timeline flow upgrade for the **Trip Planner** (`ItineraryPlanner.tsx`), replacing the flat list with a vertical timeline node layout with connected lines and ARIA labels.

---

## User Review Required

> [!NOTE]
> The itinerary stop order remains fully editable (Up/Down controls), with a vertical connecting line (`border-l-2`) and node numbers visually representing sequence flow (Stop 1 → Stop 2 → Stop 3).

---

## Proposed Changes

### 1. Vertical Timeline Presentation & ARIA Accessibility

#### [MODIFY] `src/features/trips/components/ItineraryPlanner.tsx`

- Replace flat list wrapper with a vertical timeline flow container.
- Render vertical connecting line (`absolute left-[1.125rem] top-6 bottom-6 w-0.5 bg-emerald-500/30 dark:bg-emerald-500/40`).
- Update sequence node markers (`w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black`).
- Add ARIA labels to `ArrowUp` (`aria-label="Move stop up"`), `ArrowDown` (`aria-label="Move stop down"`), and `Trash2` (`aria-label="Remove stop from itinerary"`) buttons.

---

## Verification Plan

### Automated Tests

- Run vitest test suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Navigate to `/my-trips` -> open any itinerary trip.
- Verify vertical connecting lines link sequential itinerary stops cleanly.
