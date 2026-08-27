## KAI-219B — First deterministic admission cohort (150 records → explicit v2 facts)

**Scope:** admission ONLY for the 150 records previously on trusted-transitional numeric admission. No local-transport research in this PR. No new research — every fact is derived from committed evidence (kai-89 calibration truth, budgetMetadata basis, editorial/notes, official websites, peer-cell model output), ranked by the source hierarchy: **destination-specific official/source-backed fact > defensible bounded model > unavailable**.

### Cohort migration delta (deterministic audit — review-repair v2)

| Metric                                       | Before (main) | After (this PR)                 |
| -------------------------------------------- | ------------- | ------------------------------- |
| admission.explicit                           | 0             | **150**                         |
| verified_paid                                | 0             | **39**                          |
| verified_free                                | 0             | **3**                           |
| documented_estimate                          | 0             | **0**                           |
| not_applicable                               | 0             | **108** (106 hub + 2 free-area) |
| unavailable                                  | 0             | **0**                           |
| admission.absent                             | 1057          | **907**                         |
| **transitional_legacy_numeric_used**         | **150**       | **0**                           |
| transitional_legacy_non_numeric_or_untrusted | 907           | 907                             |
| localTransport.explicit                      | 0             | 0 (out of scope)                |

**The entire trusted-transitional cohort migrated off the legacy fallback (150 → 0).** Local transport untouched (0 facts — future cohort).

### Review-repair corrections (v2)

**1. Five model records — source hierarchy applied (documented_estimate [X,X] removed).**
The 5 non-city model records had kai-89 **SOURCE-BACKED** evidence (FIXED_PAID / FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL with official source URLs), which outranks the peer-cell scalar — promoted to `verified_paid`:

| Record                            | Before (peer-cell)                | After (source-backed)                                                                                                                              |
| --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| hiraizumi-chusonji-iwate          | documented_estimate [1000,1000]   | verified_paid ¥1,000 (FIXED_PAID, chusonji.or.jp)                                                                                                  |
| national-museum-western-art-tokyo | documented_estimate [500,500]     | verified_paid ¥500 (FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL, nmwa.go.jp/en/visit)                                                                   |
| oura-church-nagasaki              | documented_estimate [1000,1000]   | verified_paid ¥1,000 (FIXED_PAID, oura-church.jp/guide-en)                                                                                         |
| sannai-maruyama-jomon-aomori      | documented_estimate **[410,410]** | **verified_paid ¥500** — committed notes state "site-wide viewing fee ¥500 adult since April 2019" + official site; the ¥410 was a peer-cell error |
| tomioka-silk-mill-gunma           | documented_estimate [1000,1000]   | verified_paid ¥1,000 (FIXED_PAID, tomioka-silk.jp visit page)                                                                                      |

No zero-width certainty is fabricated from a model point estimate — every verified_paid here carries a real source URL + checkedAt 2026-08-14.

**2. yokohama-cosmo-world corrected** — official Cosmo World states admission is FREE, individual attractions are paid, no required unlimited-entry ticket. Was `unavailable` ("paid park" — factually wrong) → now `not_applicable` + `free_area_with_optional_paid_components` (kai-89 FREE_ENTRY_PAY_PER_RIDE evidence), consistent with kitaro-chaya. Ride costs excluded from canonical admission.

**3. Prose contradiction audit (deterministic, in the KAI-219 audit).** Scans the 150 migrated records' price-bearing prose (notes, description, content.en.notes, content.ja.notes) for literal ¥/円 prices conflicting with the source-backed bounded fact. **hakone-open-air-museum** was the defect: prose said "Admission ¥1,800" / "大人入館料1,800円" vs the official ¥2,000 fact → prose repaired to ¥2,000 (EN + JA). Audit now reports `proseConflicts: []` and a regression test fails on any future conflict.

**4. Migration script hardened + TRUE IDEMPOTENCY** — cohort detection uses the AUTHORITATIVE KAI-219A semantics (`normalizeBudgetState` + `getEffectiveBudgetBreakdown`), the intended 150-ID baseline is FROZEN (`scripts/audit/kai-219-baseline-cohort.json`) with exact ID-set equality asserted (fails loudly on any mismatch), verified-paid asserts a source-backed evidence kind + non-empty source URL, verified-free asserts an allowed free kind AND jpy===0 AND a non-empty source URL (a FREE_IDS entry alone is never enough — positive/non-free ledger evidence FAILS CLOSED, never synthesizes [0,0]), kitaro asserts FREE_ENTRY_PURCHASES_VARIABLE, cosmo asserts FREE_ENTRY_PAY_PER_RIDE. Three-state idempotency: **STATE A** (all 150 still transitional) → migrate all; **STATE B** (all 150 already carry the EXPECTED facts, deep-equal validated) → exit 0, ZERO file changes (safe no-op — re-running on migrated data never fails); **STATE C** (mixed/partial/unexpected classification) → FAIL CLOSED. The script never skips a destination with admission — it validates the expected post-migration state for all 150 IDs.

### Classification rationale (v2 — all from committed data, zero fabrication)

| Cohort                                                      | Count | Fact                                                       | Evidence                                                                                                      |
| ----------------------------------------------------------- | ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Manual paid museums/parks/gardens/towers/castles            | 34    | `verified_paid` bounded                                    | kai-89 ticketEvidence (LEDGER_VERIFIED/FIXED_PAID) + sourceUrls + checkedAt 2026-08-14                        |
| Manual free (farm-tomita, ikebukuro-toshima, odaiba-minato) | 3     | `verified_free` [0,0]                                      | ledger FREE_ENTRY / LEDGER_VERIFIED free basis + sourceUrls                                                   |
| kitaro-chaya                                                | 1     | `not_applicable` + free_area_with_optional_paid_components | ledger FREE_ENTRY_PURCHASES_VARIABLE                                                                          |
| yokohama-cosmo-world                                        | 1     | `not_applicable` + free_area_with_optional_paid_components | kai-89 FREE_ENTRY_PAY_PER_RIDE (official: free entry, paid attractions)                                       |
| City hubs                                                   | 106   | `not_applicable` + hub_budget_not_applicable               | kind=city/hub role; ¥0 is the hub class convention (NOT free)                                                 |
| Non-city model w/ source-backed kai-89 evidence             | 5     | `verified_paid`                                            | kai-89 FIXED_PAID / FIXED_COLLECTION_PLUS_VARIABLE_SPECIAL + official URLs (sannai ¥500 from committed notes) |

### Architecture / files

- `scripts/kai-219b-admission-cohort.ts` — deterministic, idempotent, fail-closed migration script (authoritative cohort semantics + frozen baseline assert + evidence-kind asserts)
- `scripts/audit/kai-219-baseline-cohort.json` — the frozen 150-ID KAI-219A baseline cohort
- `scripts/audit/kai-219-migration-audit.ts` — NEW `proseConflicts` section (deterministic price-bearing-prose contradiction audit)
- `scripts/catalog/client-index.ts` — admission + localTransport added to DROPPED_FIELDS (detail/audit-only; KAI-82 assertClassified guard)
- `src/shared/data/destinations-index.json` + 150 detail files + meta + lite index + relationships (via `npm run sync-destination-details`)
- hakone-open-air-museum notes/content prose repaired (¥1,800 → ¥2,000)

### Validation

- **Clean-main worktree double-run**: run 1 (STATE A) produces the expected deterministic changes; run 2 from fresh clean state → byte-identical; exact migrated ID set == frozen 150-ID baseline; **re-running on the committed index is a validated STATE B no-op → exit 0 → zero diff** (integration test).
- Migration tooling tests: **11 passed** (STATE B no-op via real CLI, classifier expectations, verified-free fail-closed incl. FREE_ID + jpy>0 → throws, cohort semantics)
- `validate:catalog-fast` ✓ · `check:catalog-ci` ✓ (0 errors; KAI-218A fact validators accepted all 150 facts) · `check:catalog-sync` ✓
- Full vitest **3054 passed** | 2 skipped · tsc ✓ · lint ✓ · build ✓ · E2E **16/16**
- Audit deterministic (run twice → byte-identical), `proseConflicts: []`

### Notes

- The 108 not_applicable records are epistemically SATISFIED (non-numeric) — complete for admission, no numeric claim (N/A ≠ ¥0, per the KAI-219A hasNumericTotal guard).
- Deprecated legacy fields remain authored — DEPRECATION.md retirement is a separate later step; ratchet unchanged.
- **Not merged.** Awaiting review. No local-transport cohort started.
