# Implementation Plan — Priority 7: Explore Page Enhancements (TabiMap UI/UX Roadmap)

This plan details the implementation of **Explore Page Enhancements** (`Destinations.tsx`), adding an active filter pill bar, live results counter styling, and view toggle ARIA accessibility.

---

## User Review Required

> [!NOTE]
> Active filter pills will visually show applied filters (e.g., `Budget ≤ ¥50,000`, `Solo`, `Outdoor`) with single-click dismiss buttons.

---

## Proposed Changes

### 1. Active Filter Pills & Live Results Counter

#### [MODIFY] `src/features/destinations/Destinations.tsx`

- Compute active filter count and active filter tags.
- Render active filter pills bar above results grid with dismiss controls and "Reset All" button.
- Add ARIA labels (`aria-label="Switch to grid view"`, `aria-label="Switch to map view"`) to view mode toggles.

---

## Verification Plan

### Automated Tests

- Run vitest test suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Navigate to `/destinations` page.
- Apply a filter (e.g. budget slider or suitability filter).
- Verify active filter pill bar appears with matching live destination count.
