# Repository hygiene Phase B audit

## Purpose and source

This Phase B audit investigates redundant historical screenshots and committed audit artifacts without changing product behavior or reproducibility contracts.

- **Starting source:** `origin/main` at `e14a7749aceb7731ed177f96e092d96334cc5e9c` (Phase A merge commit)
- **Branch:** `chore/repository-hygiene-phase-b`
- **Method:** Git-backed inventory, repository-wide filename/stem searches, inspection of generators/tests/CI references, screenshot-group review, decoded-image comparison for KAI-205 variants, and privacy review of retained representative screenshots.

## Inventory before cleanup

Measured from the starting Git tree:

| Category | Files | Bytes |
| --- | ---: | ---: |
| Tracked tree | 2,571 | 156,831,002 |
| `docs/` | 112 | 30,950,038 |
| `qa/` | 159 | 18,468,564 |
| `scripts/audit/` | 143 | 40,554,064 |
| Raster screenshots/images | 124 | 47,241,034 |
| `scripts/audit/*.json` | 62 | 33,925,714 |
| Markdown | 132 | 7,637,479 |

The detailed Git-backed inventory is maintained outside the repository during the audit; no large inventory dump is committed.

## Confirmed-safe deletions

Ten unconsumed KAI-206 screenshot variants were removed after reviewing the complete 16-image matrix and the generator:

- `docs/KAI-206-screenshots/kai206-after-destination-desktop.png`
- `docs/KAI-206-screenshots/kai206-after-destination-ja-desktop.png`
- `docs/KAI-206-screenshots/kai206-after-destination-ja-mobile.png`
- `docs/KAI-206-screenshots/kai206-after-hub-ja-desktop.png`
- `docs/KAI-206-screenshots/kai206-after-hub-mobile.png`
- `docs/KAI-206-screenshots/kai206-before-destination-desktop.png`
- `docs/KAI-206-screenshots/kai206-before-destination-ja-desktop.png`
- `docs/KAI-206-screenshots/kai206-before-destination-ja-mobile.png`
- `docs/KAI-206-screenshots/kai206-before-hub-ja-desktop.png`
- `docs/KAI-206-screenshots/kai206-before-hub-mobile.png`

These files had no active source, test, script consumer, or CI input. `scripts/kai-206-audit.mjs` generates the matrix; it does not read committed screenshots. The audit retains the original measurements and now documents six representative before/after captures covering English destination mobile, Japanese hub mobile, and English hub desktop. The ten removed files remain retrievable from the starting commit in Git history.

- **Screenshot files removed:** 10
- **Screenshot bytes removed:** 10,807,340
- **Representative screenshots retained:** 6
- **Audit JSON files removed:** 0

## Significant dependencies discovered and retained

### Canonical and regression evidence — KEEP

- `qa/kai-205/composition-audit.json` is read and compared by `qa/kai-205/reproduce-composition.test.ts`; its generator and test remain.
- KAI-205 full-page and viewport screenshot variants remain because full-page captures establish page-length/rail-layout evidence while smaller captures establish readable viewport evidence. Crop comparisons do not prove semantic equivalence.
- `qa/kai-205/default-home-visual-audit.json` remains. It is not consumed by code, but its pinned before/after recommendation result differs from the newer composition artifact and is unique historical evidence.
- KAI-297 evidence and `docs/assets/meguruto-homepage.png` remain unchanged.

### KAI-252 local-transport research — KEEP_REPRODUCIBILITY / KEEP_HISTORICAL

The manifest, source cache, research decisions, unavailable ledger, unavailable-ID grouping, semantic review, and predecessor evidence are a coupled authoring/review record. `build-kai-252-research-ledger.ts`, `kai-252-local-transport-cohort.ts`, and committed tests consume the machine-readable inputs. The large Markdown ledgers contain unique source attempts, unresolved reasons, and semantic decisions; lack of a direct Markdown link is not evidence that they are disposable.

### KAI-256/KAI-257 Wikipedia enrichment — KEEP_REPRODUCIBILITY

Phase 3/4 caches, reports, cohorts, manifests, and legacy reports are referenced by enrichment, adjudication, reconciliation, and tests. Their fingerprints deliberately freeze external-provider responses and historical adjudication boundaries. They cannot be regenerated equivalently without changing external API responses.

### KAI-151 Sakura sensitivity — KEEP_REPRODUCIBILITY

The JSON and Markdown outputs are both written by and checked by `scripts/audit/kai-151-sakura-sensitivity.ts`; package scripts expose audit/check commands and Vitest reads the JSON. Neither file is disposable.

### KAI-219E2 admission evidence — KEEP_REPRODUCIBILITY

`scripts/audit/kai-219e2-candidates.json` is required by `scripts/kai-219e2-admission-cohort.ts` and its tooling test. It is a reviewed admission-fact ledger, not an unused intermediate output.

### KAI-226/KAI-264 car-route evidence — KEEP_HISTORICAL

The provider evaluation and car-access audit contain unique provider-boundary, access-anchor, and uncertainty evidence. They are not runtime inputs, but removing them would discard engineering evidence without a complete replacement.

## Screenshot evidence retained

All non-KAI-206 historical groups were retained: UI polish, card rail, hero actions, KAI-259, KAI-138, KAI-205, KAI-255, KAI-43, KAI-57, KAI-65, KAI-41, KAI-212, and KAI-297. Direct links, dynamic references, unique locale/viewport/state coverage, or unresolved historical ownership prevented safe deletion. Exact duplicate-pixel search found no duplicate screenshot groups.

The six retained KAI-206 pairs were reviewed for privacy. No visible personal data, email addresses, account identifiers, credentials, tokens, or private itineraries were present.

## Reproducibility boundaries

- A moved or deleted file is not removed from historical Git commits.
- No canonical catalogue data, runtime asset, test fixture, generator, audit input, cache, manifest, or CI workflow was removed.
- Wikipedia and source-retrieval caches remain because external responses change and offline reproduction depends on committed snapshots.
- The KAI-206 generator can regenerate the full screenshot matrix against a local preview; current committed visual evidence is intentionally representative, not exhaustive.
- No production writes, external provider mutations, Supabase changes, or Cloudflare changes were performed.

## Validation status

Final command results and exact-head CI are recorded in the PR description after the committed cleanup head is verified. Required checks are `npm ci`, `npm run format:check`, `git diff --check`, repository-wide Markdown/image-reference validation, focused KAI-206 reference checks, and `npm run check:catalog-ci`. Because no `scripts/audit/` file changes, the catalogue classifier may skip the catalogue audit/sync stage; that skip must not be reported as a full catalogue audit.

## Remaining candidates requiring investigation

- Other unlinked screenshot groups and KAI-205 full/viewport variants; preserve until a report-specific representative set is approved.
- Large KAI-252, KAI-256, KAI-151, KAI-219, KAI-226, and KAI-264 artifacts; dependency and historical-evidence boundaries are established as retention reasons, not deletion approval.
- Any future Phase C cleanup must prove a complete replacement for unique source evidence or a reproducibility-critical cache before deletion.
