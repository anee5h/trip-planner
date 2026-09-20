# Meguruto Catalogue and Data Operations

This directory contains Meguruto's catalogue validators, read-only audits, generated-output checks, authoring helpers, and the legacy broad pipeline. The canonical source is `src/shared/data/destinations-index.json`; generated detail files, metadata, lite/relationship projections, collection data, and transport registries have separate contracts. Read [`docs/data-quality.md`](../docs/data-quality.md) before changing catalogue data.

The focused CI gate is `npm run check:catalog-ci`. It may skip only its catalogue-audit/sync stage when the changed-scope classifier finds no catalogue-affecting files; the npm script still runs its additional structural/model/completeness checks. A skip is not a full catalogue revalidation.

## Current validation entry points

Use the package scripts as the operational source of truth; this README explains
their catalogue-specific boundaries:

- `npm run verify:pr` is the broad local PR gate: unit tests, TypeScript, the
  KAI-256 typecheck, lint/format, localization, branding, catalogue-fast,
  catalogue CI, build, SEO freshness, and Pages Functions verification.
- `npm run test:run` runs Vitest; `npm run build` exercises the production
  build; `npm run seo:check` verifies generated SEO output; and
  `npm run verify:pages-functions` checks the static/Pages Function boundary.
- `npm run check:catalog-ci` is the catalogue integrity entry point. Its audit
  and generated-file stages are conditional on changed scope; downstream
  structural/model checks still run, so a successful skip is not a full
  catalogue revalidation.
- `npm run release:verify` is a broader release-oriented local verification
  sequence. It is not implied to run automatically on every pull request or
  deployment; inspect the workflow that applies to the release context.

The historical KAI-144 performance harness is not a current gate and has been
removed. Current reproducible performance work uses
the maintained `scripts/measure-lab.mjs` and `scripts/measure-main-thread.mjs`
directly when a performance investigation requires them.

---

## Quick Start

Run the consolidated pipeline on the main destination index:

```bash
# Legacy broad pipeline (inspect with --dry-run before allowing writes)
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

## Adding or repairing catalogue data

Do not invent a new regional pipeline or hand-edit generated projections. Use the repository's reviewed authoring path:

1. Edit the canonical source or the explicitly scoped authoring input, preserving provenance, semantic cost states, relationships, and bilingual fields.
2. Run the relevant validator or audit first, then regenerate affected outputs with `npm run sync-destination-details` when required.
3. Run `npm run validate:catalog-fast`, `npm run check:catalog-ci`, and the relevant image/link, localization, transport, or domain audit.
4. Review canonical and generated diffs together. Keep warning-baseline changes deliberate and shrink-only.

`npm run pipeline -- --dry-run` and `npm run pipeline -- --validate-only` remain available for the legacy `scripts/pipeline.cjs` contract. The pipeline can geocode through Nominatim and can write the canonical index plus metadata when run without `--dry-run`; use it only when that mutation is the intended reviewed operation.

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

`scripts/audit/catalog-warnings-baseline.json` records warning debt accepted on
`main` at the time of the last deliberate update. Direct inspection of the
current `origin/main` snapshot on 2026-09-20 found 1,602 stored warning
fingerprints/instances. This is a shrink-only ledger, not the current audit
result; run `npm run check:catalog-warnings` for current findings. It is
derived from a main audit, committed, and reviewed like any other input.

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
  `main`; blocking every unrelated catalogue correction until all accepted
  findings are fixed would stall legitimate work. The ledger keeps that debt
  visible and bounded.
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

## Legacy `pipeline.cjs` behavior

`scripts/pipeline.cjs` is retained for its existing authoring contract; it is
not the sole catalogue CI gate. Its actual stages are:

1. Load the selected JSON input, check duplicate IDs and required legacy fields,
   validate rating/budget/coordinate shapes, and validate collection and
   relationship references.
2. In normal mode, optionally geocode missing coordinates through Nominatim
   with a 1.5-second delay; this is networked and can populate fallback
   coordinates, so prefer `--validate-only` or `--dry-run` for inspection.
3. Normalize selected legacy/default fields, warn on missing hero images, sort
   by ID, and write the selected output plus `destinations-meta.json` unless
   `--dry-run` or `--validate-only` is supplied.

The current semantic model is defined by `src/shared/types/destination.ts`,
the validators under `scripts/validators/`, and [`docs/data-quality.md`](../docs/data-quality.md).
Do not use the old sample schema below as an authoring contract.

---

## Current schema and validation sources

There is no frozen JSON example here because the catalogue contract has evolved
past the old sample schema. Use these sources instead:

- `src/shared/types/destination.ts` — typed record and semantic fields;
- `scripts/validators/destinations.ts` — current destination validation;
- `scripts/audit/catalog-integrity.ts` — read-only relationship, geography,
  timing, naming, and generated-file audit;
- `scripts/check-catalog-sync.ts` — generated-output freshness and idempotency;
- [`docs/data-quality.md`](../docs/data-quality.md) — provenance, unknown versus
  zero, relationships, and safe maintenance.

## Duration fields (KAI-50)

- `recommendedVisitHours` is the canonical visit duration and must be
  populated for every planned destination.
- `totalTripHours` is deprecated and optional. Do not populate it for new
  records; runtime planning ignores it because legacy values may include
  transport from a fixed origin. Total trip duration is derived at runtime
  from `recommendedVisitHours` plus verified origin-aware travel for exactly
  the transport mode being priced.
- See [`docs/recommendation-engine.md`](../docs/recommendation-engine.md) for
  the current duration and feasibility model; transport evidence is defined in
  [`docs/transport-estimation.md`](../docs/transport-estimation.md).

---

## Maintenance Note

Catalogue operations, validation, and repairs use the package scripts in
`package.json`, including `check:catalog-ci`, `validate:catalog-fast`,
`validate-all`, `audit:catalog-integrity`, `sync-destination-details`, and the
focused `validate-*`/`audit:*` commands. `scripts/pipeline.cjs` is a legacy
authoring tool, not a replacement for the current semantic validators.
