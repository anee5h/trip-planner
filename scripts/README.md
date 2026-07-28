# TabiMap Data Pipeline Guide

This directory contains the data pipeline scripts for processing, validating, geocoding, and outputting destination dataset files for TabiMap.

---

## Quick Start

Run the consolidated pipeline on the main destination index:

```bash
# Run full pipeline (validate -> geocode -> normalize -> sort -> output)
npm run pipeline

# Validate schema only (no external API calls or file writes)
npm run pipeline -- --validate-only

# Dry-run mode (runs all stages without writing changes to disk)
npm run pipeline -- --dry-run

# Regenerate lazy-loaded public details after changing the destination index
npm run sync-destination-details

# Confirm every public detail file matches the destination index
npm run validate-destination-details

# Align existing budget breakdowns with each destination's recommended total
npm run normalize-destination-budgets
```

---

## Processing New Regions (e.g. Kansai, Kyushu, Hokkaido)

When adding a new region or batch of destinations:

1. **Create Raw Data File**:
   Draft your new destinations JSON file (e.g., `scripts/data/kansai_raw.json`).

2. **Run Pipeline on New Batch**:

   ```bash
   node scripts/pipeline.cjs --input scripts/data/kansai_raw.json --output src/shared/data/destinations-index.json
   ```

3. **Verify Build**:
   ```bash
   npm run build
   ```

---

## Pipeline Stages

```
Source JSON ➔ [1. Validate Schema] ➔ [2. Geocode] ➔ [3. Normalize] ➔ [4. Asset Check] ➔ [5. Sort & Output]
```

1. **Schema & Content Validation**:
   - Ensures all required fields (`id`, `name`, `prefecture`, `region`, `categories`, `description`, `budgetMin`, `budgetMax`, `transportOptions`, `ratings`, `crowd`, `season`) exist.
   - Validates rating scores are numbers within 1–10.
   - Validates `budgetMin <= budgetMax`.

2. **Coordinates & Geocoding**:
   - Checks if `coordinates` (`lat`, `lng`) are missing.
   - Uses OpenStreetMap Nominatim API with 1.5s rate-limiting to auto-geocode locations.

3. **Data Normalization**:
   - Auto-calculates `budgetRecommended = Math.round((budgetMin + budgetMax) / 2)`.

4. **Asset Validation**:
   - Flags missing `heroImage` links or missing assets.

5. **Output Formatting**:
   - Deterministically sorts destinations by `id`.
   - Formats JSON with 2-space indentation.

---

## Destination JSON Schema Reference

```json
{
  "id": "hakone",
  "name": "Hakone",
  "prefecture": "Kanagawa",
  "region": "Kanto",
  "categories": ["Onsen", "Nature", "Culture"],
  "heroImage": "https://images.unsplash.com/photo-...",
  "gallery": [],
  "description": "Famed hot spring town near Tokyo with views of Mt. Fuji.",
  "highlights": ["Onsen", "Lake Ashi Cruise", "Hakone Ropeway"],
  "budgetMin": 16200,
  "budgetMax": 24200,
  "budgetRecommended": 20200,
  "transportOptions": {
    "train": 85,
    "car": 90,
    "shinkansen": 45
  },
  "totalTripHours": 8,
  "walkingMin": 45,
  "walkingSunMin": 30,
  "walkingShadeMin": 15,
  "indoorPercent": 40,
  "coordinates": { "lat": 35.2324, "lng": 139.1069 },
  "ratings": {
    "overall": 9.2,
    "couple": 9.5,
    "summer": 8.0,
    "winter": 9.0,
    "rain": 8.5,
    "food": 8.8,
    "photography": 9.0,
    "relaxation": 9.5,
    "value": 8.5,
    "uniqueness": 9.0
  },
  "crowd": { "weekday": 3, "weekend": 5, "holiday": 5 },
  "season": { "spring": 5, "summer": 4, "autumn": 5, "winter": 4 },
  "bestMonths": [3, 4, 10, 11],
  "bestSeason": "Autumn",
  "weatherDependence": "moderate",
  "tags": ["Onsen", "Mt. Fuji Views", "Romantic"],
  "reservation": "Recommended for popular ryokans",
  "parking": "Available at major spots",
  "restaurants": ["Hakone Bakery", "Toya Soba"],
  "cafes": ["Timuny Cafe"],
  "notes": "Purchase Hakone Free Pass for unlimited transit."
}
```

---

## Archival Note

Older one-off fixer scripts (`add_coords.cjs`, `fix_budgets.cjs`, `fix_details.cjs`, `update_data.js`, etc.) have been moved to `scripts/archive/` for historical reference. All data operations should now be executed through `scripts/pipeline.cjs`.
