# KAI-324 — Provenance, conflict detection, and approval gates

KAI-324 is a read-only, deterministic governance pilot. It evaluates the merged KAI-323 research artifacts before any admission fact could become trusted catalogue data. It does not scrape, call Apify, mutate the catalogue, call Supabase, change budget calculations, or schedule refreshes.

## Source-of-truth audit

The current production ownership path is:

1. **Canonical persisted catalogue:** [`src/shared/data/destinations-index.json`](../../src/shared/data/destinations-index.json), where `Destination.admission` stores the KAI-214/KAI-218 state, provenance, reason code, cost shape, scope, basis, source URLs, and checked date.
2. **Runtime validation:** [`src/shared/services/budget/factValidation.ts`](../../src/shared/services/budget/factValidation.ts). Invalid facts fail closed; missing or unresolved facts do not become zero or free.
3. **Budget consumers:** [`tripEstimateEngine.ts`](../../src/shared/services/budget/tripEstimateEngine.ts), [`BudgetService.ts`](../../src/shared/services/budget/BudgetService.ts), and [`GeneratedPlanCostService.ts`](../../src/shared/services/budget/GeneratedPlanCostService.ts).
4. **Derived assets:** the lite index, relationship assets, and public catalogue assets are generated/derived outputs. They are not independent admission sources of truth.
5. **Eventual approved import target:** `Destination.admission` in `src/shared/data/destinations-index.json`. This PR does not execute that import.

The KAI-323 baseline was created before its PR merge (`a94556fcf2718a05a90c69df878c7c2b44779492`); KAI-324 evaluates those preserved artifacts against merged main (`c25fb10ad594b539799d23e1edc7cd60f3051393`). The canonical catalogue JSON was verified byte-for-byte by parsed-content SHA-256 against that merged-main commit; no catalogue values changed in the KAI-323 merge.

## Provenance and decision records

`decision-report.json` stores one record per canonical destination and exact field (`/admission`). Each record retains:

- existing value and proposed candidate value;
- exact source URL, official source type, language, registry URL, technical result, and sanitized evidence quotation;
- extracted-at, verified-at when explicitly present, and applicable validity window;
- ticket product, visitor category, conditions, adult/child observations, online/counter observations, currency, tax basis, and confidence;
- `approved`, `held_for_review`, or `rejected` decision;
- reviewer/rule, machine-readable reason codes, human reason, and validation result;
- the earlier KAI-323 proposal followed by the KAI-324 evaluation in append-only `decisionHistory`;
- an explicit `currentFactUntouched: true` marker.

Missing KAI-323 metadata remains missing. The report does not infer tax basis, verification date, product equivalence, date validity, or a child category from a numeric token.

## Deterministic commands

```bash
npm run generate:kai-324  # regenerate the byte-canonical dry-run report
npm run audit:kai-324     # verify the checked-in report is current
```

The dry run reads only:

- `src/shared/data/destinations-index.json`;
- `qa/kai-323/baseline.json`;
- `qa/kai-323/proposed-updates.json`;
- `qa/kai-323/extraction-results.json`;
- `qa/kai-323/source-registry.json`.

Current result:

- 25 records evaluated;
- 0 automatically approved;
- 11 held for manual review;
- 14 proposed replacements rejected;
- 8 KAI-323 accepted/manual research candidates represented;
- 25 current admission facts untouched;
- 0 Apify use and $0 spend.

The eight accepted KAI-323 records are candidates only. They remain held because the artifacts do not establish all automatic-equivalence prerequisites, and several contain age, product, date, online/counter, surcharge, or bundled-ticket conditions.

## Conservative rules

- Automatic approval requires exact destination identity, HTTPS official source identity, successful source access, sanitized evidence, explicit product/category/scope/tax/date metadata, valid JPY values, manual verification, equivalence with the trusted current fact, and no conflict.
- Fixed, bounded, date/time-dependent, variable, free, not-applicable, unknown, and temporarily unavailable semantics remain distinct.
- “From ¥X” or a text-level minimum/maximum is not a verified adult range.
- A failed or unresolved source is rejected as a replacement and leaves the current trusted fact untouched.
- A variable/date-dependent, stale, changed-source, bundled, premium, online/counter, age-band, or condition-ambiguous candidate is held.
- Free requires explicit free evidence. Zero, missing, or unavailable prices are not free.
- Legacy records are not invalidated solely because KAI-324 fields did not exist when they were authored; missing metadata is flagged when the record is proposed for replacement.

## Explicit publish boundary

The module contains `publishApprovedCatalogue()` and `restoreCatalogueBackup()` for a future reviewed import. Publishing requires a separate approval artifact containing:

- the deterministic report SHA-256;
- the catalogue snapshot SHA-256 used to evaluate the existing facts;
- reviewer and review date;
- explicit publish confirmation;
- destination IDs that exactly equal the report’s automatic approvals.

Before writing, the helper validates every approved change, the exact current `/admission` value, the catalogue snapshot, unique IDs, the supported field path, and safe non-production paths. It then writes a target-specific backup and uses an atomic replacement. Re-running the same approved import is idempotent; the backup can restore an existing target or remove a newly created target. Production paths, symlinks, and hard links are always blocked; there is no environment override. No approval artifact was created and no publish was executed in this PR.

## Tests and handoff

Focused tests cover:

- fixed, variable, date-dependent, free, N/A, unknown, and temporarily unavailable admissions;
- Japanese yen formats and observed-token semantics;
- age/product/scope conflicts and unknown-to-free protection;
- source failure, URL drift, degraded access, and duplicate inputs;
- actual KAI-323 accepted and corrected-action outcomes;
- exact approval artifact matching, idempotency, rollback, and partial-failure safety.

KAI-325 may not integrate any admission candidate until a reviewer creates an approval artifact for the exact report, confirms provenance and applicable conditions, validates the production `AdmissionCostFact`, and separately verifies the catalogue/generated-asset workflow. KAI-324 does not change KAI-325 budget logic or KAI-327 scheduling.
