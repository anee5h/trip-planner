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

# Catalogue integrity gate (runs in CI on catalogue-affecting PRs)
npm run check:catalog-ci

# Validate the v2 canonical place, editorial, bilingual, and hierarchy foundation
npm run validate-places

# Align existing budget breakdowns with each destination's recommended total
npm run normalize-destination-budgets

# Apply only reviewed, municipality-level destination-to-hub relationships
npm run apply-city-hub-relationships
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

---

## Catalogue integrity CI checks

`npm run check:catalog-ci` is the single gate that CI runs for catalogue
integrity (workflow: `.github/workflows/catalogue-integrity.yml`, on every
pull request to `main`). It is safe to run locally — it never writes
catalogue files — and developers reproduce any CI failure with exactly this
command.

### When the workflow runs

The command first classifies the changed files with
`parseCatalogueScope` (scripts/cli/changed-scope.ts) and skips itself when
nothing catalogue-affecting changed. The workflow deliberately has **no YAML
`paths` filter**: the TypeScript classifier is the only gate, so a path can
never bypass the check by being missing from a hand-maintained list.

A change under any of these paths forces the full check:

- `src/shared/data/**` — destination index, meta, collections, and the
  transport registries (airports, airport zones, flight/ferry estimates, ferry
  routes, transport topology, ground routes)
- `public/data/**` — generated per-destination detail files and station data
- `scripts/**` — audit code, generators, sync scripts, validators, CLIs, the
  corrections manifest, the pipeline
- `src/shared/types/**` — catalogue schemas
- `package.json`, `package-lock.json` — package scripts control the checks,
  and a lockfile-only change alters what `npm ci` installs, which can change
  audit/generation behaviour
- `.github/workflows/**` — workflow files

No other package-manager/runtime control file exists in this repo (no
`.npmrc`, yarn/pnpm/bun locks; `.nvmrc`/`.node-version` are ignored by CI,
which pins the Node version via `setup-node` in the workflows).

### Stages

1. **Audit** — the read-only `runAudit` from scripts/audit/catalog-integrity.ts
   (no network). Any `error`-severity finding fails the check.
2. **Warning baseline** — warning-severity findings are compared against the
   committed ledger `scripts/audit/catalog-warnings-baseline.json`.
3. **Generated files** — scripts/check-catalog-sync.ts regenerates every
   `public/data/destinations/<id>.json` file and `destinations-meta.json`
   from the index **in memory** (same generator as `sync-destination-details`,
   scripts/catalog/generate-outputs.ts), compares byte-for-byte with the
   committed files, and generates a second time to prove idempotency (zero
   diff). Source/detail/meta field consistency is additionally enforced by
   the audit's category-E rules (SYNC_*).

### The warning baseline

`scripts/audit/catalog-warnings-baseline.json` records the warning debt
accepted on `main` at the time of the last deliberate update (currently 396
instances). It is derived from the exact `main` audit, committed, and
reviewed like any other file.

- **Fingerprints** are `"<CODE>:<destinationId>[:<identity>]"` with
  per-fingerprint instance counts. The identity is a canonical, structured
  description of the violation built from `finding.details`, never from the
  free-form message:
  - relationship list warnings → relationship key + referenced destination
    ID (e.g. `REL_CROSS_PREFECTURE_REF:okayama-city:nearbyDestinationIds|
fukuoka-city`)
  - featured-list warnings → featured destination ID
  - duplicate-coordinate warnings → sorted destination-ID pair
  - municipality-mismatch warnings → the municipality/parent IDs
  - missing/dangling reference warnings → the referenced ID
  - parent warnings → `parentDestinationId`
  - detail-mismatch warnings → the sorted disagreeing field list
  - rules whose code+destination already identifies exactly one violation
    (e.g. `MUNI_HUB_MISSING_NAME_JA`) keep the plain `CODE:destinationId`
    form

  Identity components are stable IDs (never display names); arrays whose
  ordering is irrelevant are sorted; calculated diagnostics (distances,
  counts, coordinate strings, visit-hour values) and timestamps are
  excluded. Two different violations can therefore never share a
  fingerprint, even with the same code and destination — a warning cannot
  be silently exchanged for a different warning of the same code on the
  same record.

- **New instances fail** — a fingerprint with more instances than the
  baseline fails the check, even when another warning was removed in the
  same PR (neither the "same total count" nor the "same record, extra
  instance" loophole exists).
- **Fewer instances pass** — removals are improvements. After verified
  sanitation work that removes warnings, update the baseline in the same PR:

  ```bash
  npm run check:catalog-warnings:update
  ```

  then review the `scripts/audit/catalog-warnings-baseline.json` diff and
  commit it. The update command **refuses to run while new warning instances
  exist**, so the accepted debt can only shrink. CI never regenerates the
  baseline.

- **Why existing warnings are accepted** — they are pre-existing debt on
  `main`; blocking every unrelated catalogue correction until all 396 are
  fixed would stall legitimate work. The ledger keeps that debt visible and
  bounded.
- **Why new warnings are rejected** — a new or extra warning is a
  regression, exactly what the gate exists to catch. New audit rules must
  land with their data fixed in the same PR (the update command will not
  accept their findings).

### Local reproduction

```bash
npm run check:catalog-ci               # everything CI runs (skips when irrelevant)
npm run check:catalog-warnings         # audit + baseline comparison only
npm run check:catalog-warnings:update  # deliberate baseline reduction (refuses growth)
npm run check:catalog-sync             # generated-file currency + idempotency
npm run sync-destination-details       # regenerate committed outputs (if stale)
npm run audit:catalog-integrity        # the read-only audit alone
npm run audit:destination-depth        # deterministic advisory depth report
```

### Destination-depth audit (advisory)

`npm run audit:destination-depth` reads the canonical
`src/shared/data/destinations-index.json` and writes deterministic,
repository-local reports to the ignored `reports/` directory:
`destination-depth-audit.json` and `destination-depth-audit.md`. It never
modifies canonical or generated catalogue data and is not a CI quality gate.

The report covers all 47 prefectures, regional rollups, municipality
concentration, experience/archetype coverage, visit-duration usefulness,
structured season sample coverage, transport diversity, role/place-type
composition, relationship concentration, shell hubs, and fake-depth warnings.
Its six advisory dimensions use the source-audit weights of 25/20/20/15/10/10%.
The scoring formulas are deliberately kept in `scoreDestinationDepth` and
covered by the 978-record golden fixture: geographic distribution is
`100 * (1 - largest municipality count / prefecture total)`; municipality
coverage compares the municipality bucket count with the size-calibrated 4/8/15
expectation; experience is covered archetypes / 14; trip usefulness is
`min(100, (half-day + day-trip) / max(6, prefecture total * 0.5) * 100)` using
`totalTripHours` (`<=4` and `>4..<=8`); seasonality is the number of seasons
with at least 30% of complete vectors scoring >=7, divided by four; and
transport is distinct available modes / the six source-audit modes. Only a
dimension with no season vectors is omitted and its weight renormalized. Other
unknown fields remain visible through sample counts and the source formula's
denominators rather than being converted into positive evidence. The taxonomy
is currently inconsistent, structured seasonality is incomplete, and some
municipality IDs are missing. Scores are signals for QA and expansion review,
not minimum-count targets or merge blockers. Mie follows the app's existing
Kansai region convention.

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
  "recommendedVisitHours": { "min": 1, "max": 2 },
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

## Duration fields (KAI-50)

- `recommendedVisitHours` is the canonical visit duration and must be
  populated for every planned destination.
- `totalTripHours` is deprecated and optional. Do not populate it for new
  records; runtime planning ignores it because legacy values may include
  transport from a fixed origin. Total trip duration is derived at runtime
  from `recommendedVisitHours` plus verified origin-aware travel for exactly
  the transport mode being priced.
- See `docs/trip-duration-model.md` for the full model and migration
  guidance.

---

## Maintenance Note

All catalogue data operations, validation, and repairs are executed through standard CLI tools (`scripts/pipeline.cjs`, `scripts/validate-all.ts`, and `scripts/repair-destination.ts`).
