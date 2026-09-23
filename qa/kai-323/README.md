# KAI-323 — Official-Source Admission Pilot

Base: `a94556fcf2718a05a90c69df878c7c2b44779492`

This is a read-only research pilot. It does not modify `src/shared/data/destinations-index.json`, generated catalogue assets, Supabase, Cloudflare configuration, or production services.

## Deliverables

- [`baseline.json`](baseline.json) / [`baseline.md`](baseline.md): deterministic before-state snapshot for 25 canonical destination IDs.
- [`source-registry.json`](source-registry.json): official source URLs, source language, robots probe, technical result, and explicit terms/automation boundary.
- [`extraction-results.json`](extraction-results.json): sanitized structured extraction records using the KAI-323 field set.
- [`proposed-updates.json`](proposed-updates.json) / [`proposed-updates.md`](proposed-updates.md): deterministic current-versus-extracted proposal; no row authorizes automatic catalogue mutation.
- [`manual-verification.md`](manual-verification.md): accepted-result review, precision definition, and unresolved cases.
- [`apify-evaluation.md`](apify-evaluation.md): HTTP comparison, $0 usage, and the no-Actor recommendation.
- [`fixtures/price-parser-fixtures.json`](fixtures/price-parser-fixtures.json): sanitized parser fixtures; no raw third-party page dumps.

Generate/check the report with:

```bash
npm run audit:kai-323
```

The generator is deterministic and fails on duplicate IDs, missing catalogue IDs, stale artifacts, or invalid cohort size. Generated report files are byte-canonical and are intentionally excluded from Prettier because the generator is the source of truth.

## Pilot result

- Attempted: **25** attractions.
- Official page responses at HTTP 200: **17**.
- Accepted structured/manual results: **8**.
- Accepted-result precision: **8/8 = 100%** after manual review.
- Pilot coverage: **8/25 = 32%**; this is not a catalogue-wide accuracy claim.
- Apify Actors/requests/credits/cost: **0 / 0 / 0 / $0**.
- Terms pages were not systematically located; no recurring automation permission is claimed.

The accepted records preserve adult/age-band, online/counter, date/time, surcharge, reservation, and product conditions. Variable products remain variable; “from” or date-selected values are not promoted to a fixed range.

## Handoff boundaries

- KAI-306 remains the overlapping recognizable-destination quality dataset; this pilot cross-links by canonical ID rather than duplicating its QA report.
- KAI-324 owns provenance, conflicts, and approval gates; this pilot records source evidence but does not implement approval semantics.
- KAI-325 owns budget-engine integration; this pilot does not change budget calculations or catalogue facts.
- KAI-327 scheduling and recurring scraping are out of scope.
