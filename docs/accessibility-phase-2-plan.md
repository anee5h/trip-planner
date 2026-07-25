# Implementation Plan — Priority 2: Accessibility Improvements (TabiMap UI/UX Roadmap)

This plan outlines the implementation of **Accessibility Improvements** across TabiMap, focusing on ARIA labels for icon-only buttons, keyboard focus rings, and touch target sizing (≥44px).

---

## User Review Required

> [!NOTE]
> All icon-only buttons across the site will receive explicit `aria-label` properties, and interactive controls will be audited to meet 44px touch boundaries.

---

## Proposed Changes

### 1. ARIA Labels for Icon-Only Buttons

#### [MODIFY] `src/features/trips/TripDetails.tsx`

Add explicit `aria-label` attributes to:

- Calendar Exporter Popover button (`aria-label="Export to calendar options"`)
- Print PDF button (`aria-label="Print or save trip to PDF"`)
- Share Trip button (`aria-label="Share trip link"`)

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

Add explicit `aria-label` attributes to:

- Favorite button (`aria-label={isFavorite ? "Remove from bucket list" : "Add to bucket list"}`)
- Visited toggle button (`aria-label={visited ? "Mark destination as unvisited" : "Mark destination as visited"}`)

#### [MODIFY] `src/features/home/Home.tsx`

Add `aria-label` attributes to:

- Surprise Me roulette button (`aria-label="Open destination roulette wheel"`)

#### [MODIFY] `src/features/compare/Compare.tsx`

Add `aria-label` attributes to:

- Remove from comparison button (`aria-label="Remove destination from comparison list"`)

---

### 2. Touch Target Sizing & Focus Ring Styling

#### [MODIFY] `src/shared/components/ui/button.tsx`

Ensure base focus rings (`focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none`) are cleanly configured for keyboard navigation.

---

## Verification Plan

### Automated Tests

- Run vitest suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Test keyboard tabbing using `Tab` and `Shift+Tab` to verify focus outline rings appear on buttons.
- Inspect accessibility tree using Chrome DevTools Accessibility tab to verify `aria-label` attributes.
