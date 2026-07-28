# TabiMap Editorial Workflow

## Lifecycle

1. Add or update a place in `destinations-index.json`.
2. Add canonical content through `PlaceCatalog`; new content begins as `draft`.
3. Record every editorial source as `official`, `wikipedia`, or `manual`.
4. Move the record through `in_review` and `approved` after an editor checks facts, hierarchy, and both locales.
5. Set `published` only with a source, review date, reviewer, and change summary.
6. Run `npm run validate-places`, then regenerate public details when catalog data changes.

Existing catalog records are intentionally marked `legacy` until individually reviewed. Legacy records remain visible but must not be presented as newly approved content.

## Bilingual content

English is the canonical fallback. Add a reviewed Japanese `name`, `description`, and `highlights` before marking a place as part of a bilingual editorial release. The locale resolver will use English until all Japanese fields are available.
