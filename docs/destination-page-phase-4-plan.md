# Implementation Plan — Priority 4: Destination Page Polish (TabiMap UI/UX Roadmap)

This plan implements **Priority 4: Destination Page Polish** by adding a nearby recommendations section based on coordinates, enhancing the quick-facts bar, and refining sticky action controls.

---

## User Review Required

> [!NOTE]
> Nearby destinations will be dynamically calculated using the mathematical Haversine coordinate distance function (`getDistance()`).

---

## Proposed Changes

### 1. Nearby Destinations Component / Section

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Calculate top 3 nearest destinations excluding the active destination using `getDistance(destination.coordinates, dest.coordinates)`.
- Render a **📍 Nearby Destinations** section at the bottom of the details view using standard `DestinationCard` components.

---

### 2. Enhanced Quick-Facts Bar

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Add a scannable summary row presenting travel time, estimated budget, walking effort, and peak season rating.

---

## Verification Plan

### Automated Tests

- Run vitest test suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Navigate to `/destinations/tokyo-tower` or any detail page.
- Scroll down to verify the **📍 Nearby Destinations** section displays valid nearby spots.
