# Technical Implementation Plan: Phase D Passport Page & Achievement Collections Governance

This document specifies the technical implementation plan for Phase D of TabiMap's Curated Collections Governance architecture.

---

## 1. Objectives & Architectural Governance

1. **Explicit Achievement Schema Classification**:
   - Introduce an explicit `isAchievement?: boolean` property to the `Collection` schema.
   - Decouple authority provenance (`type: "official" | "historical"`) from Passport achievement eligibility.
   - Classification Rule: Only fixed, prestigious, completable bucket-list collections have `isAchievement: true`. Open-ended curated categories remain `isAchievement: false` for directory browsing.

2. **Collection ID & Name Alignment Migration**:
   - Migrate `id: "top-100-castles"` -> `id: "japan-top-castles"` (`slug: "japan-top-castles"`) with `expectedMembers: 30`.
   - Update destination membership references across destination JSON files.

3. **100% Derived Read-Only Prefecture State**:
   - Prefecture visited status is 100% automatically derived when destinations are marked visited.
   - Remove manual `toggleVisitedPrefecture` checkbox controls and SVG map write handlers.

4. **Navigation & Passport UI**:
   - Rename navigation item label from "Prefectures" to **"Passport"** (`/passport`).
   - Add automatic fallback redirect from `/visited-map` to `/passport`.
   - Surface a dedicated **Curated Collection Achievements** progress section on the Passport page displaying real-time progress cards for all `isAchievement: true` collections.

---

## 2. Collection Classification Matrix (All 15 Collections)

| Collection ID                | Collection Name               | `isAchievement` | `expectedMembers` | Authority Provenance | Rationale                             |
| :--------------------------- | :---------------------------- | :-------------: | :---------------: | :------------------- | :------------------------------------ |
| `original-12-castles`        | Original 12 Surviving Castles |   **`true`**    |      **12**       | Foundation           | Fixed, prestigious, 100% completable  |
| `unesco-japan`               | UNESCO World Heritage Japan   |   **`true`**    |      **25**       | International        | Fixed, prestigious, 100% completable  |
| `three-great-gardens`        | Three Great Gardens           |   **`true`**    |       **3**       | Historical Consensus | Fixed 3, historic bucket-list         |
| `three-great-views`          | Three Great Views             |   **`true`**    |       **3**       | Historical Consensus | Fixed 3, historic bucket-list         |
| `three-great-waterfalls`     | Three Great Waterfalls        |   **`true`**    |       **3**       | Historical Consensus | Fixed 3, historic bucket-list         |
| `three-great-buddhas`        | Three Great Buddhas           |   **`true`**    |       **3**       | Historical Consensus | Fixed 3, historic bucket-list         |
| `three-great-shrines`        | Three Great Shrines           |   **`true`**    |       **3**       | Association          | Fixed 3, historic bucket-list         |
| `three-cherry-blossom-spots` | Japan's Cherry Blossom Spots  |   **`true`**    |       **3**       | Association          | Fixed 3, historic bucket-list         |
| `japan-top-castles`          | Japan's Top Castles           |   **`false`**   |      **30**       | Foundation           | Curated thematic subset               |
| `national-treasures`         | National Treasures of Japan   |   **`false`**   |      **220**      | Government           | Broad open-ended category (220 sites) |
| `national-parks-japan`       | National Parks of Japan       |   **`false`**   |      **34**       | Government           | Broad open-ended category (34 parks)  |
| `quasi-national-parks-japan` | Quasi-National Parks of Japan |   **`false`**   |      **58**       | Government           | Broad open-ended category (58 parks)  |
| `top-onsen-japan`            | Japan's Top Onsen             |   **`false`**   |      **50**       | Association          | Open-ended curated category           |
| `historic-towns-japan`       | Historic Towns of Japan       |   **`false`**   |      **126**      | Government           | Open-ended curated category           |
| `great-night-views`          | Japan's Night Views           |   **`false`**   |      **20**       | Association          | Open-ended curated category           |

---

## 3. Detailed Component & File Changes

### A. Schema Definition

- **`src/shared/types/collection.ts`**:
  ```ts
  export interface Collection {
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    type: "official" | "historical" | "curated";
    isAchievement?: boolean; // True for completable Passport achievements
    icon: string;
    badgeColor: string;
    sortOrder: number;
    officialSource?: string;
    sourceUrl?: string;
    metadata: CollectionMetadata;
  }
  ```

### B. Collections Data Index & Destination Migration

- **`src/shared/data/collections-index.json`**:
  - Add `"isAchievement": true/false` according to the classification matrix above.
  - Migrate `id: "top-100-castles"` → `id: "japan-top-castles"`, `slug: "japan-top-castles"`, `expectedMembers: 30`.
- **`public/data/destinations/*.json`**:
  - Replace collection ID `"top-100-castles"` with `"japan-top-castles"` in membership arrays.
- **`scripts/pipeline.cjs`**:
  - Run `npm run pipeline` to re-sync `src/shared/data/destinations-index.json`.

### C. Navigation & Routing

- **`src/shared/components/layout/Navbar.tsx`**:
  ```ts
  { name: "Passport", path: "/passport", icon: Compass }
  ```
- **`src/App.tsx`**:
  ```tsx
  <Route path="/passport" element={<PrefectureChecklist />} />
  <Route path="/visited-map" element={<Navigate to="/passport" replace />} />
  ```

### D. Store & Passport UI

- **`src/shared/hooks/useTripStore.tsx`**:
  - Deprecate/remove `toggleVisitedPrefecture`.
  - Retain `visitedPrefectures` array and `isPrefectureVisited(id)` read-only getter.
- **`src/features/map/PrefectureChecklist.tsx`**:
  - Change page header to **"Travel Passport"** and subtitle _"Your automated travel history and curated collection achievements across Japan."_
  - Remove checkbox `<input>` elements and map `onSelect` click handlers. Render read-only prefecture status badges with `✓` indicators when visited.
  - Render **Curated Collection Achievements** progress cards for all `isAchievement: true` collections:
    - Display collection icon, name, visited ratio (e.g. `2 / 12 (16%)`), visual progress bar, and `✓ Completed` badge when 100% complete.

---

## 4. Verification & Validation Plan

1. **Data Validation**: Run `npm run pipeline` — ensure 159 destinations and 15 collections process with 0 warnings.
2. **Linting & Type Check**: Run `npm run lint` and `tsc -b` to verify clean TypeScript compilation.
3. **Unit Tests**: Run `npm run test:run` to confirm all 27 unit tests pass.
4. **Production Build**: Run `npm run build` to verify Vite bundle output.
