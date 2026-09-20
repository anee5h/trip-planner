# Meguruto data quality

## Purpose

This document explains how Meguruto keeps incomplete or inconsistent catalogue data from becoming misleading product behavior. It covers canonical records, relationships, editorial provenance, semantic cost states, generated outputs, validation scripts, CI boundaries, and a safe maintenance workflow. Current transport and testing boundaries are documented in [`transport-estimation.md`](transport-estimation.md) and [`testing-strategy.md`](testing-strategy.md).

## Catalogue overview

The canonical source is [`src/shared/data/destinations-index.json`](../src/shared/data/destinations-index.json). At the current `main` source it contains 1,130 unique records by canonical `id`. That is a record count, not a claim that every record has identical editorial depth or verified transport/cost evidence.

Related data products include:

- [`destinations-index.lite.json`](../src/shared/data/destinations-index.lite.json): summary projection for list/search intent;
- [`destinations-meta.json`](../src/shared/data/destinations-meta.json): metadata used by visited-prefecture/account flows;
- generated `public/data/destinations/<id>.json` detail files;
- [`destination-relationships.json`](../src/shared/data/destination-relationships.json): compact relationship/card/map projection;
- [`collections-index.json`](../src/shared/data/collections-index.json) and collection definitions;
- static transport topology, route, fare, ferry, flight, and scheduled-transit artifacts; and
- generated SEO destination HTML, sitemap, and public-destination manifest.

The full/lite/detail/relationship separation is a runtime and correctness contract. A summary record must not be passed to a consumer that requires full budget, transport, editorial, or provenance fields.

## Data relationships

Destination records use explicit roles and relationship fields in [`src/shared/types/destination.ts`](../src/shared/types/destination.ts):

- `hub` represents an administrative or area container used for coherent browsing;
- `poi` represents an attraction/point of interest that can belong to a hub;
- `standalone` represents a deliberate root such as a regional, island-wide, or multi-municipality place;
- `relationships.parentDestinationId` links a child to its parent where the relationship is explicit;
- `featuredDestinationIds` identifies editorially featured child places; and
- `nearbyDestinationIds` supports nearby grouping without claiming containment.

[`DestinationRelationshipService.ts`](../src/shared/services/destination/DestinationRelationshipService.ts) enforces application-side relationship rules including:

- a hub cannot feature itself;
- administrative containers cannot be treated as attraction children merely because they are nearby;
- child candidates must satisfy prefecture and explicit parent/municipality rules;
- unparented multi-area natural regions are not silently inserted into a hub's Top Sights rail; and
- sparse rails are not padded with unrelated nearby places.

Collections are separate from parent/child relationships. A collection can represent a curated or official grouping without implying that its members are geographic children of one hub.

## Invariants and semantic contracts

### Record and generated-file integrity

The catalogue audit checks relationship integrity, geography suspicion signals, duration/timing completeness, municipality/naming consistency, source/generated-file consistency, and recommendation-impact summaries. It is read-only and reports findings; it does not auto-fix catalogue data.

The generated-file sync check regenerates detail files, metadata, lite index, and relationship projection in memory and compares them byte-for-byte with committed outputs. It also runs a second generation to detect a non-idempotent generator. The implementation is [`check-catalog-sync.ts`](../scripts/check-catalog-sync.ts).

### Cost facts

The KAI-214/KAI-218 semantics separate:

- **value state:** verified paid, verified free, documented estimate, variable price, not applicable, unavailable, or legacy unverified;
- **provenance:** verified source, model, legacy, transitional, or none; and
- **reason code:** why a non-numeric or partial state exists.

Scoped `admission` and `localTransport` facts reuse this taxonomy. [`factValidation.ts`](../src/shared/services/budget/factValidation.ts) is the shared runtime validator used by cost consumers. Invalid persisted facts fail closed to unavailable behavior; they are not promoted to numeric or free values.

A verified free fact requires explicit free evidence, source provenance, source URLs, and a valid checked date. A missing ticket field is not automatically free. A city/hub may be not applicable for a single admission product; that is different from a verified free attraction.

### Provenance, editorial lifecycle, and review metadata

Destination records can carry source fields, `checkedAt` dates, editorial lifecycle/review data, score metadata, and budget/transport evidence. New or changed content begins as `draft`, moves through `in_review` and `approved`, and is `published` only with a source, review date, reviewer, change summary, `checkedAt`, and freshness state. Existing `legacy` records remain visible but are not newly approved content. Source labels distinguish official, government, tourism-board, Wikipedia, editor observation, calculated, and legacy manual evidence; AI assistance is change-history context, not a factual source.

English is the canonical fallback. A bilingual release requires reviewed Japanese name, description, and highlights; otherwise the locale resolver may use English. Freshness (`current`, `review_due`, `stale`, or `conflicting`) is separate from publication status.

The overall score rubric keeps evidence maturity separate from the numeric score: verified and estimated scores use the same rubric when enough evidence exists; below-threshold evidence becomes unavailable rather than a fabricated neutral score.

Relevant definitions are in [`destination.ts`](../src/shared/types/destination.ts), [`scoreRubric.ts`](../src/shared/services/recommendation/scoreRubric.ts), [`budgetState.ts`](../src/shared/services/budget/budgetState.ts), and [`PlaceCatalog.ts`](../src/shared/services/place/PlaceCatalog.ts).

## Unknown versus zero

The runtime distinguishes at least these cases:

- `verified_free`: explicit source-backed evidence that the cost is zero;
- `not_applicable`: there is no single admission product, such as a city/hub or open area;
- `unavailable`: a cost could exist but evidence is missing or invalid;
- `documented_estimate`: a bounded approved model range exists; and
- `variable_price`: a fixed number would be misleading.

The budget engine uses the same distinction for transport and local access. Missing admission, an unknown toll, a route without a verified fare, and a free public area must never collapse into the same numeric zero. This is why the UI can show a partial or unavailable component while still presenting a bounded planning range for the other ingredients.

## Validation pipeline

The repository has multiple checks with different scopes. They are not all run on every pull request.

### Catalogue checks

- [`audit-catalog-integrity.ts`](../scripts/audit-catalog-integrity.ts) runs the read-only integrity audit. It can print JSON, target a prefecture/destination, or fail on warnings with `--strict`.
- [`check-catalog-warnings.ts`](../scripts/check-catalog-warnings.ts) fails on audit errors or new warning fingerprints compared with [`catalog-warnings-baseline.json`](../scripts/audit/catalog-warnings-baseline.json). The baseline is shrink-only debt; CI does not regenerate it automatically.
- [`check-catalog-sync.ts`](../scripts/check-catalog-sync.ts) verifies generated outputs are current and idempotent.
- [`check-deprecated-fields.ts`](../scripts/check-deprecated-fields.ts) is a shrink-only ratchet for legacy generic budget-field authorship.
- [`check-catalog-ci.ts`](../scripts/check-catalog-ci.ts) first classifies the diff. It skips the catalogue gate when no catalogue-affecting file changed; otherwise it runs warning and generated-file checks.

### Cost and editorial checks

- Admission-focused audit/migration work exists under [`scripts/audit/kai-285-admission-audit.ts`](../scripts/audit/kai-285-admission-audit.ts) and the KAI-219 admission cohorts under [`scripts/`](../scripts/).
- Runtime and authoring cost semantics share the fact validators and free-evidence rules rather than maintaining separate “free” or checked-date interpretations.
- Editorial freshness/quality reporting exists in [`report-editorial-freshness.ts`](../scripts/report-editorial-freshness.ts) and [`report-editorial-quality.ts`](../scripts/report-editorial-quality.ts).

### Localization and SEO

- [`check-translation-parity.cjs`](../scripts/check-translation-parity.cjs) checks English/Japanese leaf-key parity and placeholder parity.
- [`generate-seo-outputs.ts`](../scripts/generate-seo-outputs.ts) generates prerendered destination pages, sitemap, and the public destination manifest. Its `--check` mode compares output bytes without writing.
- Build/SEO checks require canonical name, description, and hero content; incomplete public output fails rather than shipping an empty prerender silently.

### Transport-data audits

Transport maintenance has its own bounded scripts, including:

- [`audit-gtfs-topology.ts`](../scripts/transit/audit-gtfs-topology.ts);
- [`audit-gtfs-schedule.ts`](../scripts/transit/audit-gtfs-schedule.ts);
- [`audit-gtfs-transfers.ts`](../scripts/transit/audit-gtfs-transfers.ts);
- [`audit-kai-290-odpt-coverage.mjs`](../scripts/audit/kai-290-odpt-coverage.mjs);
- [`audit-kai-290-odpt-eligibility.mjs`](../scripts/audit/kai-290-odpt-eligibility.mjs); and
- the ODPT/GTFS import and refresh modules under [`scripts/transit`](../scripts/transit/).

These audits validate particular feeds or pilot contracts. Their existence does not mean that a full nationwide data refresh runs on every PR or that a pilot feed is universal production coverage.

## Build and CI boundary

The catalogue-integrity workflow [`catalogue-integrity.yml`](../.github/workflows/catalogue-integrity.yml) runs the catalogue CI command for relevant pull requests and manual dispatch. The changed-scope classifier can make the command skip when the diff has no catalogue-affecting files.

The general Data Quality workflow [`validate.yml`](../.github/workflows/validate.yml) runs Fast Validation on push/pull request and runs the full validation framework only on schedule or manual dispatch. `pr-checks.yml` separately runs quality, unit tests, E2E, PWA, accessibility, privacy scans, and other gates. KAI-310 is the deeper CI/release-evidence reference; this document only records the boundaries relevant to data quality.

No claim in this document means that every audit runs on every pull request.

## Data provenance limits

The catalogue contains published, verified, and beta records. A published record is not proof that every field is source-backed. A transport corridor can be verified while its access leg is estimated; an admission price can be modelled or unavailable; a relationship projection can be generated from the canonical index but still be narrower than the source catalogue.

The product exposes these distinctions through `status`, `scoreMetadata`, editorial fields, cost state/provenance, transport evidence, and explicit assumptions. It does not make every destination equally complete and does not treat a missing source as evidence of average quality or free access.

Focused current references:

- [Architecture](architecture.md)
- [Recommendation engine](recommendation-engine.md)
- [Transport estimation](transport-estimation.md)
- [Testing strategy](testing-strategy.md)

## Safe maintenance workflow

When changing destination data:

1. **Edit the canonical source**, normally `src/shared/data/destinations-index.json`, a reviewed detail/source file, or an explicitly scoped collection/transport input. Do not hand-edit generated `public/data/destinations/<id>.json` output as the source of truth.
2. **Preserve semantic state.** For cost changes, provide the correct state/provenance/reason code, source URLs, and valid checked date. Keep verified free, not applicable, unavailable, and estimated meanings distinct.
3. **Update relationships deliberately.** Confirm parent/child IDs, prefecture/municipality consistency, collection membership, and whether the change affects generated relationship output.
4. **Regenerate through the repository command** when generated outputs are affected: `npm run sync-destination-details`.
5. **Run the relevant read-only audit** for the changed area, then run `npm run check:catalog-ci`. If the change is not catalogue-affecting, the command may skip by design.
6. **Run parity/build checks** when localized fields, public data, SEO, or transport assets are involved: `npm run validate:i18n`, `npm run build`, `npm run seo:check`, and the relevant transport/audit command.
7. **Inspect the diff before committing.** Review canonical and generated values together, run `git diff --check`, and stage only intended files. Never update a warning/deprecated-field baseline merely to make a new violation pass.

This workflow keeps the canonical input, generated projections, semantic validators, and CI baselines aligned without mutating production data.
