# Architecture Specification: Destination Relationship Model

## 1. Domain Purpose

The Destination Relationship Model structures TabiMap's travel catalog into a graph of interconnected destinations. Cities, towns, wards, villages, castles, shrines, temples, museums, and natural landmarks remain first-class destinations (`Destination`), while supporting rich parent-child navigation and peer recommendations.

---

## 2. Graph Schema & Invariants

```text
Japan
│
└── Aichi Prefecture (Administrative Geography)
    │
    └── Nagoya City (Hub Destination)
        │
        ├── Nagoya Castle (POI Destination)
        ├── Atsuta Shrine (POI Destination)
        ├── Osu Shopping Street (POI Destination)
        └── SCMAGLEV Museum (POI Destination)

Nearby Municipalities (Peer Edge)
──────────────────────────────
Inuyama City | Toyota City | Okazaki City

Thematically Related (Peer Edge)
──────────────────────────────
Kyoto City | Osaka City
```

```typescript
export interface DestinationRelationships {
  parentDestinationId?: string; // Primary container parent (e.g. Nagoya Castle -> Nagoya City)
  featuredDestinationIds?: string[]; // Strictly curated editorial top sights for a hub page
  nearbyDestinationIds?: string[]; // Neighboring municipalities or nearby sights
  relatedDestinationIds?: string[]; // Thematically related / "You may also like" sights
}
```

### Invariants

1. **Navigational Metadata**: `relationships` exists strictly to power UI navigation and recommendations. It must never duplicate or replace canonical destination data (`prefecture`, `region`, `collections`).
2. **Immutable IDs**: Destination IDs are immutable and globally unique. Relationships always reference IDs, never display names.
3. **Hub Ownership**: Only parent hubs define `featuredDestinationIds` and `nearbyDestinationIds`. Children never store inverse arrays; the UI infers parent links cleanly.
4. **Editorial `featuredDestinationIds`**: `featuredDestinationIds` is strictly curated editorial content (never auto-generated).
5. **Fallback Precedence for Nearby**: Explicit `nearbyDestinationIds` → Same `parentDestinationId` → Same `prefecture`.
6. **O(1) Service Indexing**: `DestinationRelationshipService.ts` maintains lookup maps (`byIdMap`, `childrenByParentMap`) for instant graph traversal.

---

## 3. Municipality Naming Standard

All municipal destinations include their administrative type in display names (`Nagoya City`, `Shibuya City`, `Hakone Town`, `Shirakawa Village`). Slugs remain immutable (`nagoya-city`, `shibuya-city`). Informal and multilingual queries are handled via the `aliases` array (`aliases: ["Nagoya", "名古屋", "名古屋市"]`).
