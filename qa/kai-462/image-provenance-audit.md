# Meguruto image provenance and quality audit

## Frozen baseline

- Repository: `anee5h/trip-planner`
- Main SHA: `6441d36d0b96c1b680b952e47f364df4ff44d2e7`
- Final validation: run `36234585158`; 1,130 destinations; 0 blocking errors and 0 image-fetch warnings.
- The machine-readable destination-level ledger is [`image-provenance-audit.json`](./image-provenance-audit.json). It includes all 127 warning rows, exact URLs, names, existing metadata, warning messages, evidence, confidence, proposed action, and category overlaps.

## Findings

- 127 warning rows cover 116 unique target destinations and 104 exact URLs. Exact URL variants are not assumed to represent distinct photographs. Pairwise destination overlaps: duplicate/low-resolution 1; duplicate/missing-metadata 4; duplicate/attribution 3; low-resolution/missing-metadata 3; low-resolution/attribution 0; missing-metadata/attribution 0. Category counts overlap.
- **Missing metadata (53):** The rule flags a published record with no optional `imageMetadata` object. Its four required members are absent; alt text and dimensions are not part of that type. All 53 canonical and detail records agree, so there is no normalization loss. Six reviewed hubs trace to one authoring omission; 47 other records had no metadata at introduction. Current Wikimedia delivery hosts do not prove source, creator, or license.
- **Unresolved attribution (23 rows, 20 Unsplash paths):** Three exact image-path/page matches were found; one has a fully evidenced creator and license, and two lack creator identification. The rest remain partly or wholly unresolved. Unsplash pages blocked direct access, so official indexed excerpts are recorded with their limits in [`unsplash-attribution-research.json`](./unsplash-attribution-research.json). The general Unsplash license is not proof that an unmapped CDN path is covered.
- **Duplicate URLs (35 rows, 27 exact URL groups, 62 participating destinations):** Reuse is often supported by parent/child or local-landmark context. Editorial candidates and legacy `image`-field findings are classified per group in the JSON. Legacy `image` is not consumed by current product UI; `heroImage` is user-facing.
- **Low-resolution hero (16):** The validator checks a width hint in the URL, not original pixels or the CSS-rendered box. All 16 current renditions and Commons originals were measured; verified same-file larger renditions are proposals only. The live browser-selected image, actual hero box, and computed crop were not measured. No upgrades or replacements were applied.

## Shared root-cause evidence

- `scripts/add-reviewed-city-hubs.ts` omits image metadata for six reviewed-city hubs. Its current-ID skip preserves existing records, but its creation path fetches/reuses only a hero URL.
- No detail-generation loss was found. A separate generic metadata signature from `scripts/p0-expansion-2026.ts` appears on 105 records and intersects 14 warning rows (11 duplicate, 3 low-resolution). It is not the cause of the missing-metadata or unresolved-attribution cohorts and is not sufficient license evidence.
- Exact validator/schema references, historical cohorts, Commons file evidence, hero source dimensions, and per-destination proposals are in the JSON ledger.

## Disposition

No catalogue records changed and no implementation PR was opened. Preserve unresolved source/license claims; do not change records merely to reduce warnings. The evidence-bounded follow-up candidates are the six-hub generator omission, source review for unresolved image permissions, and same-file rendition upgrades after editorial review.
