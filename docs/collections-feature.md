# TabiMap Collections

## Requirements Specification (RFC-001)

**Version:** 1.2

**Status:** Approved & Implemented

---

## 1. Purpose

Collections introduce curated groupings of destinations that exist alongside the existing Region and Prefecture hierarchy.

Collections are intended to:

- improve destination discovery
- group related destinations
- provide official and historical categorizations
- enable progress tracking

---

# 2. Design Principles

### 2.1 Minimal evolution

The data model evolves only when required by planned features. Speculative abstractions are avoided.

### 2.2 Provenance

Every collection exposes its official or historical source authority where applicable.

### 2.3 Progressive enhancement

Collections function cleanly without requiring complex backend dependencies.

---

# 3. Data Model

## 3.1 Collection Interface (`src/shared/data/collections-index.json`)

```ts
interface Collection {
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
```

---

# 4. Curated Collections Catalog & Provenance

| Collection ID                | Collection Name                           | Type       | Official / Historical Source                                        |
| ---------------------------- | ----------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `original-12-castles`        | Original 12 Surviving Castles             | historical | Japan Castle Foundation                                             |
| `unesco-japan`               | UNESCO World Heritage Japan               | official   | UNESCO World Heritage Centre                                        |
| `national-treasures`         | National Treasures of Japan               | official   | Agency for Cultural Affairs (国宝)                                  |
| `top-100-castles`            | Top 100 Castles of Japan                  | official   | Japan Castle Foundation (日本100名城)                               |
| `three-great-gardens`        | Three Great Gardens of Japan              | historical | Japan National Tourism Organization (日本三名園)                    |
| `three-great-views`          | Three Great Scenic Views of Japan         | historical | Japan National Tourism Organization (日本三景)                      |
| `three-great-waterfalls`     | Three Great Waterfalls of Japan           | historical | Japan National Tourism Organization (日本三名瀑)                    |
| `three-great-buddhas`        | Three Great Buddha Statues of Japan       | historical | Agency for Cultural Affairs (日本三大仏)                            |
| `three-great-shrines`        | Three Great Shrines of Japan              | official   | Association of Shinto Shrines (神社本庁)                            |
| `three-cherry-blossom-spots` | Three Great Cherry Blossom Spots          | historical | Japan Cherry Blossom Association (日本さくらの会)                   |
| `top-onsen-japan`            | Top Hot Springs & Onsen Towns             | official   | Japan Onsen Association (温泉協会)                                  |
| `historic-towns-japan`       | Preserved Historic Towns                  | historical | Important Preservation District for Groups of Traditional Buildings |
| `great-night-views`          | Japan's Great Night Views & Observatories | official   | Night View Convention & Tourism Bureau                              |

---

# 5. Pipeline Integrity Validation

`scripts/pipeline.cjs` validates at build time:

- All `collectionId` references exist in `collections-index.json`.
- Duplicate collection IDs or slugs throw errors.
- Duplicate memberships per destination throw errors.
- `confirmed=false` produces validation warnings.

---

# 6. Regional Calibration Rules

Destinations outside the core calibrated travel region use:

```text
travelEstimate.confidence = "beta"
```

The UI displays an informational notice explaining that regional travel estimates are undergoing calibration.
