# PRD & Technical Implementation Plan: Destination Hierarchy (Parent ↔ Child Relationships)

**Metadata**

- **Status**: Proposed
- **Priority**: Medium
- **Target Release**: v1.5.0
- **Dependencies**: Visited Destinations (`useTripStore`), Destination Index (`destinations-index.json`), Data Pipeline (`scripts/pipeline.cjs`)
- **Breaking Change**: No (Backward-compatible optional fields)

---

## 1. Problem Statement & User Value

Currently, TabiMap treats all 159 destinations as flat, independent entities. However, real-world Japan travel features natural geographical and administrative hierarchies:

- **Major Castle Grounds contain specific historic keeps/palaces** (e.g. _Nijo Castle Honmaru Goten_ inside _Nijo Castle_, or _Kakegawa Castle Ninomaru Goten_ inside _Kakegawa Castle_).
- **Major Cultural Parks contain independent historic attractions** (e.g. _Kenroku-en Garden_ and _Kanazawa Castle Park_ within the _Kanazawa Cultural District_).
- **Resort Areas contain specific hot spring villages/sights** (e.g. _Kinugawa Onsen_ inside _Nikko_, or _Atami Seaside_ inside _Atami_).

Without parent-child relationship modeling, users cannot easily discover sub-attractions within a destination or understand how sights relate to one another.

---

## 2. Product Requirements (Implementation-Agnostic)

1. **Optional Parent Association**: A destination MAY optionally specify a single parent destination ID (e.g. `parentId: "nijo-castle-kyoto"`).
2. **Sub-Destination Discovery**: Navigating to a parent destination page MUST display a dedicated _"Included Sights & Sub-Destinations"_ gallery.
3. **Parent Breadcrumb Navigation**: Navigating to a child destination MUST display a prominent breadcrumb link back to its parent destination.
4. **Backward Compatibility**: Existing flat destinations (without a parent) MUST remain completely unaffected, requiring zero extra steps for users or creators.
5. **Referential Integrity**: The data pipeline (`scripts/pipeline.cjs`) MUST validate that every `parentId` references a valid, existing destination ID.

---

## 3. Success Metrics

- **Zero Data Migration Errors**: All 159 existing destinations validate without error.
- **Bi-directional Navigation**: Users can seamlessly navigate `Parent Destination` ↔ `Child Destination`.
- **Pipeline Integrity**: Invalid `parentId` references break the pipeline build with explicit diagnostic errors.
- **Zero Impact on Flat Destinations**: 100% of non-hierarchical destinations render without layout shifts or extra steps.

---

## 4. Technical Design & Architecture Options

### Selected Option: Bi-Directional Derived Hierarchy via `parentId`

Instead of manually duplicating arrays on both sides, we store an optional `parentId?: string` on child destination JSONs. The system automatically derives `childDestinations` by filtering the index for destinations where `d.parentId === parent.id`.

```typescript
// src/shared/types/destination.ts
export interface Destination {
  id: string;
  parentId?: string; // Optional reference to parent destination ID
  // ... existing fields
}
```

#### Advantages

- Single source of truth (prevents orphaned or mismatched child array references).
- Zero schema overhead for the majority of standalone destinations.
- Easily queried across `destinations-index.json`.

---

## 5. Proposed File Changes

### A. Schema Definition

#### [MODIFY] `src/shared/types/destination.ts`

- Add `parentId?: string;` to the `Destination` interface with TSDoc documentation.

### B. Data Pipeline Validation

#### [MODIFY] `scripts/pipeline.cjs`

- Add Stage 2 referential integrity check:
  - If `dest.parentId` is present, verify `destinationsIndex.some(d => d.id === dest.parentId)`.
  - Log diagnostic error if `parentId` is unresolvable or self-referential (`dest.parentId === dest.id`).

### C. User Interface & Components

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- **Parent Breadcrumb**: If `destination.parentId` exists, render a top-level breadcrumb pill linking to the parent destination:
  ```tsx
  <Link
    to={`/destinations/${parent.id}`}
    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800"
  >
    <FolderTree className="w-3.5 h-3.5" /> Part of {parent.name}
  </Link>
  ```
- **Child Destinations Section**: If child destinations exist for the current destination (`destinationsIndex.filter(d => d.parentId === destination.id)`), render an _"Included Sights & Sub-Destinations"_ card gallery using `<DestinationCard />`.

---

## 6. Future Considerations (Out of Scope for Initial Release)

- **Multi-level Hierarchy**: Supporting grand-parent/child (3+ levels deep).
- **Automatic Visited Roll-ups**: Automatically marking a parent as "visited" if all its child sub-destinations are marked visited.
- **Hierarchical Map Cluster Pins**: Grouping child pins under parent map markers on the interactive map.

---

## 7. Verification Plan

### Automated Verification

1. `npm run pipeline` — Enforce Stage 2 parent ID validation across all destinations.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure all unit tests pass.
4. `npm run build` — Verify production build compilation.

### Manual Verification

1. Create/tag a test child destination with `parentId`.
2. Open child destination page and verify parent breadcrumb link works.
3. Open parent destination page and verify "Included Sights & Sub-Destinations" gallery renders child cards cleanly.
