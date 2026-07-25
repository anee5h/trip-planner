# Implementation Plan — Collections RFC-001 (Phase B: UI Integration, Directory & Detail Pages)

This plan implements **Phase B of TabiMap Collections (RFC-001)** across two clean internal milestones (B1: UI Foundation & Filters; B2: Directory & Detail Pages).

---

## 1. Internal Milestone Breakdown

### Milestone B1: UI Foundation & Filter Integration

1. **Reusable Badge Component (`src/shared/components/ui/CollectionBadge.tsx`)**:
   - Renders collection badges with custom `badgeColor` and icon.
   - Displays up to top 3 collection badges sorted by `sortOrder` (highest priority first), with an overflow pill (`+N`).
   - Clicking a badge navigates to `/collections/:slug`.
2. **Card & Details Integration**:
   - Embed `CollectionBadge` in `DestinationCard.tsx` and `DestinationDetails.tsx`.
3. **Collections Filter on `/destinations`**:
   - Add Collection Multi-Select to `DestinationFilters.tsx` and update `Destinations.tsx` filtering logic.
4. **Reassuring Beta Travel Notice**:
   - Display banner on `DestinationDetails.tsx` when `travelEstimate.confidence === "beta"`:
     _ℹ️ "Travel estimates for this region are still being refined. Actual travel times may vary slightly."_

### Milestone B2: Collections Pages, Progress & Routing

1. **Progress & Data Utilities (`src/shared/utils/collections.ts`)**:
   - `getCollectionDestinations(collectionId)`
   - `getCollectionProgress(collectionId, visitedDestinationIds)` (dynamically derived, 0 storage mutation).
2. **Collections Directory Page (`/collections`)**:
   - Renders cards for all 4 collections with icon, category, `type` badge ("Official" / "Historical"), description, official source link, total destination count, and visited progress bar.
3. **Collection Detail Page (`/collections/:slug`)**:
   - Look up collection by **slug**.
   - Hero header with source attribution, progress tracker (`X of Y Visited • Z% Complete`), empty state handling, and grid of destination cards.
4. **Routing**:
   - Register `/collections` and `/collections/:slug` in `src/App.tsx`.

---

## Proposed Changes

### UI Components & Utils

#### [NEW] `src/shared/components/ui/CollectionBadge.tsx`

- Priority-sorted badge rendering & navigation link.

#### [NEW] `src/shared/utils/collections.ts`

- Utility functions for collection destination lookup and derived progress calculations.

#### [NEW] `src/features/collections/CollectionsDirectory.tsx`

- Directory page for `/collections`.

#### [NEW] `src/features/collections/CollectionDetails.tsx`

- Detail page for `/collections/:slug`.

### Page Updates

#### [MODIFY] `src/App.tsx`

- Add `/collections` and `/collections/:slug` routes.

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

- Embed priority-sorted `CollectionBadge` component.

#### [MODIFY] `src/features/destinations/components/DestinationFilters.tsx`

- Add Collections multi-select dropdown option.

#### [MODIFY] `src/features/destinations/Destinations.tsx`

- Add `selectedCollections` state and filtering logic.

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Embed `CollectionBadge` and reassuring Beta Calibration notice banner.

---

## Verification Plan

### Automated Tests

- Run full Vitest suite and build checks:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Test two-way navigation flow: `Destination -> Collection badge -> /collections/:slug -> Destination card -> /collections -> Back`.
- Test multi-filter interaction: `UNESCO selected -> Region selected -> Search -> Clear Filters`.
- Test visited progress bar updates dynamically when checking/unchecking visited destinations.
- Verify empty states when no destinations match.
