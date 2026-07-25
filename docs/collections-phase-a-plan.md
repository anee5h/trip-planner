# Implementation Plan — Collections RFC-001 (Phase A: Data Model, Migration & Pipeline Validation)

This plan implements **Phase A of TabiMap Collections (RFC-001)**, establishing the core data schema, referential integrity validation in `scripts/pipeline.cjs`, backfilling all 129 destinations, and initializing the 4 curated collections.

---

## 1. Data Schema Definition (`src/shared/types/collection.ts` & `src/shared/types/destination.ts`)

### `src/shared/types/collection.ts`

```ts
export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  type: "official" | "historical" | "curated";
  icon: string;
  badgeColor: string;
  sortOrder: number;
  officialSource?: string;
  sourceUrl?: string;
}

export interface CollectionMembership {
  collectionId: string;
  confirmed: boolean;
  source?: string;
}
```

### `src/shared/types/destination.ts`

All new fields are **mandatory (required)** after backfill:

```ts
import type { CollectionMembership } from "./collection";

export interface Destination {
  // ... existing fields ...

  /** Mandatory: Destination content verification status */
  status: "verified" | "planned";

  /** Mandatory: Calibration confidence level for travel estimates */
  travelEstimate: {
    confidence: "high" | "medium" | "beta";
  };

  /** Mandatory: Array of collection memberships */
  collections: CollectionMembership[];
}
```

---

## 2. Collection Data Loader (`src/shared/services/collection/CollectionService.ts`)

Export clean data accessor functions to avoid direct JSON imports across components:

```ts
import collectionsData from "@/shared/data/collections-index.json";
import type { Collection } from "@/shared/types/collection";

const collections: Collection[] = collectionsData as Collection[];

export function getCollections(): Collection[] {
  return collections;
}

export function getCollectionById(id: string): Collection | undefined {
  return collections.find((c) => c.id === id);
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug);
}
```

---

## 3. Curated Collections Setup (`src/shared/data/collections-index.json`)

Create `src/shared/data/collections-index.json` with the 4 initial collections:

1. **Original 12 Castles** (`original-12-castles`) — _Type_: `historical`
2. **UNESCO World Heritage Japan** (`unesco-japan`) — _Type_: `official`
3. **Top 100 Castles of Japan** (`top-100-castles`) — _Type_: `official`
4. **Three Great Gardens of Japan** (`three-great-gardens`) — _Type_: `historical`

---

## 4. One-Time Backfill (129 Destinations)

Backfill the new mandatory fields for all 129 existing destination records in `src/shared/data/destinations-index.json` and `public/data/destinations/*.json`.

### Explicit Destination JSON Membership Example:

```json
{
  "id": "matsumoto",
  "name": "Matsumoto Castle",
  "status": "verified",
  "travelEstimate": {
    "confidence": "high"
  },
  "collections": [
    {
      "collectionId": "original-12-castles",
      "confirmed": true
    },
    {
      "collectionId": "top-100-castles",
      "confirmed": true
    }
  ]
}
```

Defaults for backfill:

- `status`: `"verified"`
- `travelEstimate.confidence`: `"high"` (for calibrated Kanto & Chubu) or `"beta"` (for non-calibrated regions).
- `collections`: Mapped array connecting destinations (e.g. Matsumoto, Inuyama, Hikone, Maruoka -> `original-12-castles` & `top-100-castles`; Kenrokuen -> `three-great-gardens`; Mt. Fuji, Shirakawa-go, Nikko -> `unesco-japan`).

---

## 5. Pipeline Referential Integrity & Collection Validation (`scripts/pipeline.cjs`)

Rename validation stages cleanly to **Stage 2: Collection & Referential Integrity Validation**:

- **Duplicate Collection IDs**: FAIL build.
- **Duplicate Collection Slugs**: FAIL build.
- **Duplicate Collection Names**: WARN build.
- **Duplicate `sortOrder`**: WARN build.
- **Referential Integrity**: Validate that any `collectionId` referenced in a destination exists in `collections-index.json`. FAIL build on missing references.
- **Unconfirmed Memberships**: WARN if `confirmed === false`.

---

## Proposed Changes

### Data & Types

#### [NEW] `src/shared/types/collection.ts`

- Define `Collection` and `CollectionMembership` interfaces.

#### [MODIFY] `src/shared/types/destination.ts`

- Add mandatory `status`, `travelEstimate`, and `collections` fields to `Destination` interface.

#### [NEW] `src/shared/data/collections-index.json`

- Initial 4 collections definitions.

#### [NEW] `src/shared/services/collection/CollectionService.ts`

- Data accessors (`getCollections`, `getCollectionById`, `getCollectionBySlug`).

### Build Pipeline

#### [MODIFY] `scripts/pipeline.cjs`

- Implement Stage 2 Collection & Referential Integrity Validation.

### Data Backfill

#### [MODIFY] `src/shared/data/destinations-index.json`

- Backfill all 129 destination records.

#### [MODIFY] `public/data/destinations/*.json`

- Sync all individual public destination detail JSON files.

---

## Verification Plan

### Automated Tests

- Run full Vitest suite and pipeline validation:
  ```bash
  node scripts/pipeline.cjs --validate-only
  npx vitest run
  npm run build
  ```

### Manual Verification

- Verify two-way navigation flow integrity:
  `Destination -> Collection badge -> Collection page -> Destination card -> Back`.
- Check pipeline log output to verify 0 schema errors, 100% referential integrity validation for all 4 collections and 129 destinations.
