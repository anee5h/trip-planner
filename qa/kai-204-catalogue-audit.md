# KAI-204 — Catalogue / On-site Budget Completeness & Systemic Repair (Phase 2)

Branch: `fix/kai-204-onsite-budget-provenance`
Starting SHA: `cabe34878f861caf1be6cb1103893822d90a903a` (post-#256 main)

## Baseline (dynamic, Phase 0)

| budgetMetadata method | Count |
| --------------------- | ----: |
| manual                |     6 |
| model                 |   112 |
| unknown               |   470 |
| absent                |   469 |
| invalid               |     0 |
| **total**             |  1057 |

Additional structural facts:

- records with budgetMin: **493** · budgetMax: **493** · budgetRecommended: **493** · budgetBreakdown: **489**
- numeric budget fields with metadata method **unknown**: **0**
- numeric budget fields with metadata **absent**: **377** (all full min/rec/max triples)
- records with metadata but no usable numeric range: **472**
- explicit zero values (budgetMin=0): **29** · budgetMin=0 & budgetMax=0: **0**
- records currently displayed as "Free" via isFreeDestination: **4** (all keyword-based, absent metadata)
- records displayed as unavailable: all unknown/absent without numbers

## Audit classes (Phase 1) — `scripts/qa/kai-204-onsite-budget-audit.ts`

| Class                        | Count | Meaning                                                                           |
| ---------------------------- | ----: | --------------------------------------------------------------------------------- |
| A_VERIFIED_SOURCE_BACKED     |     6 | manual metadata + numeric                                                         |
| B_MODEL_DECLARED             |   106 | model metadata + numeric (6 model records with ledger tickets counted separately) |
| C_SOURCE_EXISTS_META_LOST    |    36 | ledger has a ticket price, record metadata absent/unknown                         |
| D_NUMERIC_WITHOUT_PROVENANCE |   351 | numeric budget, no metadata, no ledger                                            |
| E_EXPLICIT_UNKNOWN           |   454 | method=unknown, no evidence, not hub                                              |
| F_EXPLICIT_VERIFIED_FREE     |     7 | ledger jpy=0                                                                      |
| G_POSSIBLY_FREE_UNVERIFIED   |     4 | free-looking, no ledger proof                                                     |
| H_GENUINE_UNKNOWN            |    55 | no metadata/numeric/evidence                                                      |
| I_NOT_APPLICABLE             |    38 | hub class convention                                                              |

## Root causes — 470 unknown (Phase 2)

| Cause                                                                                  | Count |
| -------------------------------------------------------------------------------------- | ----: |
| NO_SOURCE_ADMISSION_CLEARED (model cleared, no verified ticket)                        |   378 |
| VOLATILE_DESTINATION_SPECIFIC (admission/food/access volatile or destination-specific) |    63 |
| LEDGER_PRICE_EXISTS (verified ticket in ledger but metadata unknown — provenance LOST) |    11 |
| HUB_NO_ADMISSION_CLASS                                                                 |     2 |
| OTHER                                                                                  |    16 |

NO_SOURCE_ADMISSION_CLEARED kind breakdown: nature 99, museum 61, castle 56, ... (mostly parks/temples/shrines/nature where admission is genuinely free or unknown).

## Root causes — 469 absent (Phase 3)

| Cause                                                              | Count |
| ------------------------------------------------------------------ | ----: |
| NUMERIC_LEGACY_UNTAGGED (formula/template budgets, never verified) |   351 |
| NO_DATA_NO_EVIDENCE (no budget, no evidence)                       |    55 |
| HUB_NO_ADMISSION_CLASS                                             |    36 |
| LEDGER_VERIFIED_FREE                                               |     4 |
| LEDGER_HAS_PRICE_META_ABSENT (provenance recoverable)              |    22 |
| FREE_LOOKING_UNVERIFIED                                            |     1 |

## Systemic root causes (Phase 4)

1. **Eligibility dead-end** (`scripts/derive-destination-models.ts:250-251`): once a record is
   `budgetMetadata.method="unknown"`, it is removed from budget-eligibility forever. A ledger
   ticket verified LATER (the calibration ledger was added in #174, after the KAI-89 model ran)
   can never rescue it. → 11 records with ledger prices but cleared to unknown (koko-en-garden,
   genbudo-cave-park, ikuno-silver-mine, genkyuen-garden, miho-museum-koka, sakai-city-museum,
   kenroku-en, shikisai-no-oka, hakone-open-air-museum, cupnoodles-museum-osaka-ikeda,
   farm-tomita).
2. **Generators emit budgets without metadata** (`scripts/pr12c-kyushu-expansion.ts:688-748`,
   `add-destination-hub-expansion.ts`, etc.): formula-derived breakdowns
   (transport=35%·min, food=40%·min, cafe=10%·min) with no `budgetMetadata`, no fieldSources.
   → 38 pr12c-formula records; 351 absent-numeric records total.
3. **Corrections pass applied tickets without metadata**: `kai-89-corrections.json
budgetTicketCorrections` wrote 22 verified tickets but never tagged the records' metadata.
   → 22 records with ledger price + absent metadata (hamarikyu-gardens, kiyosumi-gardens,
   hiroshima-castle, ...).
4. **Manual-ticket conflicts**: 3 records claim "verified ticket ¥X preserved" in basis but have
   `breakdown.tickets=0` (mukojima-hyakkaen 150, buaiso 1500, tachikawa-manga-park 400).

## Verified-free evidence (ledger jpy=0) — Phase 5

8 records: amanohashidate-kyoto (FREE_AREA_SEPARATE_PAID_FACILITIES), ikebukuro-toshima
(LEDGER_VERIFIED free district), mount-yoshino-nara (FREE_AREA_SEPARATE_PAID_FACILITIES),
odaiba-minato (LEDGER_VERIFIED free district), yokohama-cosmo-world (FREE_ENTRY_PAY_PER_RIDE),
kitaro-chaya (FREE_ENTRY_PURCHASES_VARIABLE), cupnoodles-museum-osaka-ikeda
(FREE_ENTRY_PAID_EXPERIENCES), farm-tomita (FREE_ENTRY).

## Numeric-without-provenance (Phase 6)

- 25 non-hub absent-numeric with ledger ticket → provenance recoverable (manual upgrade)
- 25 hub absent-numeric → hub convention/legacy (22 have tickets≠0 — legacy values that violate
  the hub convention; 3 have tickets=0)
- 327 pure legacy numeric, no evidence anywhere → **accepted debt, remain absent** (not fabricated,
  not hidden)

## Model cohort (Phase 7)

112 model records: all carry ledger or hub-convention tickets (invariant holds, 0 mismatches);
100% low confidence (peer n<30); 106 hubs + 6 non-hubs; no range inconsistencies.
