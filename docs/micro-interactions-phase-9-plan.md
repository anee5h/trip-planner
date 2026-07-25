# Implementation Plan — Priority 9: Micro-interactions (TabiMap UI/UX Roadmap)

This plan outlines **Priority 9: Micro-interactions**, adding subtle card hover lift effects and button tap feedback across TabiMap.

---

## User Review Required

> [!NOTE]
> Micro-interactions will use hardware-accelerated CSS transforms (`translate-y`, `scale`) for 60fps performance without triggering layout shifts.

---

## Proposed Changes

### 1. Card Hover Lift & Tap Scale Feedback

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

- Add `hover:-translate-y-1 hover:shadow-hover transition-all duration-300` to the root `Card` container.
- Add `active:scale-95 transition-transform duration-150` tap feedback to Bookmark and Visited toggle buttons.

---

## Verification Plan

### Automated Tests

- Run vitest test suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Hover over destination cards to verify smooth upward hover lift.
- Click bookmark icon to verify tactile tap scale response.
