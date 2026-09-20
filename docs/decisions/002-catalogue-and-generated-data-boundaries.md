# 002 — Catalogue and generated-data boundaries

**Status:** Current

## Context

Meguruto has a large destination catalogue with different consumers. Search and first paint need small summary data; detail, budget, editorial review, and planning need richer records. Relationships, transport registries, SEO output, and editorial evidence have different ownership and freshness rules. Treating all JSON as one interchangeable blob would make loading cost, data completeness, and source authority ambiguous.

## Considered approaches

The realistic alternatives are:

1. Bundle the full destination index into every browser route.
2. Use one remote catalogue service for discovery and detail.
3. Keep a canonical repository source and generate explicit projections for summary, detail, relationships, SEO, and transport-specific consumers.

The implementation uses the third approach. The alternatives are architectural comparisons, not claims about undocumented historical meetings.

## Decision

`src/shared/data/destinations-index.json` is the canonical destination source. The repository also maintains deliberate projections and registries:

- the lite index supports summary/search/list needs;
- per-destination detail files support detail loading and isolated retries;
- metadata supports account/visited-prefecture flows;
- relationship projections support hub, child, card, and map surfaces without becoming the canonical catalogue;
- static transport artifacts and registries are consumed only by their transport modules;
- editorial fields and source metadata travel with canonical records; and
- generated SEO HTML, sitemap, manifests, and PWA/build assets are derived outputs rather than authoring sources.

`PlaceCatalog` exposes intent-specific loaders. Full data is fetched asynchronously and retried after failure; a lite summary is never returned as a full `Destination`. Build and CI commands regenerate or compare derived outputs rather than asking a runtime consumer to infer whether an asset is current.

## Reasons

The boundary makes data intent explicit. A list surface can pay for a summary projection while detail and planning can await the fields they require. Generated files make public output deterministic and allow byte-for-byte/idempotency checks. Relationship projections prevent a card-oriented subset from being mistaken for the complete catalogue. Editorial provenance stays distinct from generated transport or SEO output.

## Trade-offs

The architecture creates multiple files, generators, loaders, and synchronization checks. A change can require updating canonical data and derived outputs. Runtime failures must distinguish a missing detail record from a failed full-index load. Engineers must understand which file is source, projection, registry, fixture, or generated output.

The separation also does not equal uniform quality. The catalogue contains published, beta, estimated, and legacy records with different evidence maturity.

## Consequences

- Authoring changes belong in canonical inputs, not generated public detail files.
- `check-catalog-ci`, generated-file sync, warning baselines, model checks, and SEO/build checks are part of the data contract.
- Consumers must declare whether they need summary or full data.
- A generated asset can be technically fresh while the underlying editorial fact is still incomplete or stale.

## Evidence

- [`destinations-index.json`](../../src/shared/data/destinations-index.json)
- [`PlaceCatalog.ts`](../../src/shared/services/place/PlaceCatalog.ts)
- [`DestinationService.ts`](../../src/shared/services/destination/DestinationService.ts)
- [`DestinationRelationshipService.ts`](../../src/shared/services/destination/DestinationRelationshipService.ts)
- [`copy-catalogue-assets.mjs`](../../scripts/copy-catalogue-assets.mjs)
- [`check-catalog-sync.ts`](../../scripts/check-catalog-sync.ts)
- [`audit-catalog-integrity.ts`](../../scripts/audit-catalog-integrity.ts)
- [`generate-seo-outputs.ts`](../../scripts/generate-seo-outputs.ts)
- [`PlaceCatalog.test.ts`](../../src/shared/services/place/__tests__/PlaceCatalog.test.ts)
- [`LoaderRegression.test.ts`](../../src/shared/services/place/__tests__/LoaderRegression.test.ts)
- [`DestinationRelationshipService.test.ts`](../../src/shared/services/destination/__tests__/DestinationRelationshipService.test.ts)
- [Data quality](../data-quality.md)
- [Architecture](../architecture.md)

## Current limitations

The catalogue still contains uneven editorial depth and source freshness. Generated-file checks do not prove every source URL or travel fact is currently correct. Runtime-lazy loading is tested in browser fixtures and preview paths, not every deployed cache or device condition.

## Future reconsideration

Reconsider the projection boundary if measured bundle/runtime costs, consumer requirements, or a maintained external catalogue service justify a different ownership model. Any replacement must preserve explicit source authority, generated-output validation, retry behavior, and distinction between summary and full records.
