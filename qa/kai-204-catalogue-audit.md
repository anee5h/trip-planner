# KAI-204 — Catalogue / On-site Budget Completeness & Systemic Repair (Final)

Branch: `fix/kai-204-onsite-budget-provenance`
Starting SHA: `cabe34878f861caf1be6cb1103893822d90a903a`

## Before → After (TABLE A — catalogue metadata)

| budgetMetadata method | Before | After |
| --------------------- | -----: | ----: |
| manual                |      6 |    38 |
| model                 |    112 |   112 |
| unknown               |    470 |   462 |
| absent                |    469 |   445 |
| invalid               |      0 |     0 |
| **total**             |   1057 |  1057 |

## Root causes (TABLE B)

### 470 unknown — before

| Root cause                                                                   | Count |
| ---------------------------------------------------------------------------- | ----: |
| NO_SOURCE_ADMISSION_CLEARED (model cleared, no verified ticket)              |   378 |
| VOLATILE_DESTINATION_SPECIFIC                                                |    63 |
| LEDGER_PRICE_EXISTS (verified ticket but metadata unknown — provenance LOST) |    11 |
| HUB_NO_ADMISSION_CLASS                                                       |     2 |
| OTHER                                                                        |    16 |

### After repair

| Root cause                    | Before | After |           Remaining |
| ----------------------------- | -----: | ----: | ------------------: |
| LEDGER_PRICE_EXISTS (unknown) |     11 |     2 | 2 (ambiguous kinds) |
| NO_SOURCE_ADMISSION_CLEARED   |    378 |   376 |                 376 |
| VOLATILE_DESTINATION_SPECIFIC |     63 |    63 |                  63 |
| HUB_NO_ADMISSION_CLASS        |      2 |     2 |                   2 |
| OTHER                         |     16 |    16 |                  16 |

### 469 absent — before

| Root cause                                                         | Count |
| ------------------------------------------------------------------ | ----: |
| NUMERIC_LEGACY_UNTAGGED (formula/template budgets, never verified) |   351 |
| NO_DATA_NO_EVIDENCE                                                |    55 |
| HUB_NO_ADMISSION_CLASS                                             |    36 |
| LEDGER_HAS_PRICE_META_ABSENT                                       |    22 |
| LEDGER_VERIFIED_FREE                                               |     4 |
| FREE_LOOKING_UNVERIFIED                                            |     1 |

### After repair

| Root cause                   | Before | After |                        Remaining |
| ---------------------------- | -----: | ----: | -------------------------------: |
| LEDGER_HAS_PRICE_META_ABSENT |     22 |     0 |                                0 |
| LEDGER_VERIFIED_FREE         |      4 |     2 |    2 (ambiguous free-area kinds) |
| NUMERIC_LEGACY_UNTAGGED      |    351 |   351 | 351 (accepted debt, no evidence) |
| NO_DATA_NO_EVIDENCE          |     55 |    55 |                               55 |
| HUB_NO_ADMISSION_CLASS       |     36 |    36 |                               36 |
| FREE_LOOKING_UNVERIFIED      |      1 |     1 |                                1 |

## Repairs applied

1. **Eligibility dead-end fix** (`scripts/derive-destination-models.ts`): ledger-backed
   `method="unknown"` records are re-eligible (except ambiguous evidence kinds), so a
   verified ticket that appeared after the KAI-89 model run can be restored. 8 records
   rescued with minimal verified-ticket breakdowns.
2. **26 absent-metadata records** with ledger tickets upgraded to `manual` (verified ticket
   in `breakdown.tickets` + basis citing the ledger source).
3. **3 manual-ticket conflicts** reconciled (mukojima-hyakkaen 0→150, buaiso 0→1500,
   tachikawa-manga-park 0→400, fukuoka-tower 800→1000).
4. **3 verified-free** records marked manual with free evidence (farm-tomita,
   ikebukuro-toshima, odaiba-minato).
5. **8 ambiguous-evidence records left unknown** (bundle/activities/variable kinds —
   the ledger itself flags the product ambiguity).
6. **`isFreeDestination` hardened** (Phase 5): a zero range requires manual/model
   provenance; absent-metadata min=0/max=0 never becomes "Free".

## Numeric-without-provenance (TABLE C)

- 351 records have numeric budgets with no metadata and no evidence.
- 25 were non-hub with ledger tickets → repaired to manual (in the 26 count above).
- 25 are hubs (legacy non-convention values) → left as accepted debt.
- **327 remain gated**: pure legacy formula/template numbers, no evidence anywhere.
  They stay absent (consumed as legacy known but unverified) — NOT hidden, NOT
  fabricated, documented debt.

## Verified free (TABLE D)

| id                            | evidence class                     | metadata after      |
| ----------------------------- | ---------------------------------- | ------------------- |
| farm-tomita                   | FREE_ENTRY (ledger)                | manual              |
| ikebukuro-toshima             | LEDGER_VERIFIED free district      | manual              |
| odaiba-minato                 | LEDGER_VERIFIED free district      | manual              |
| amanohashidate-kyoto          | FREE_AREA_SEPARATE_PAID_FACILITIES | absent (ambiguous)  |
| mount-yoshino-nara            | FREE_AREA_SEPARATE_PAID_FACILITIES | absent (ambiguous)  |
| cupnoodles-museum-osaka-ikeda | FREE_ENTRY_PAID_EXPERIENCES        | unknown (ambiguous) |
| yokohama-cosmo-world          | FREE_ENTRY_PAY_PER_RIDE            | model (tickets=0)   |
| kitaro-chaya                  | FREE_ENTRY_PURCHASES_VARIABLE      | manual (original)   |

## Origin-aware complete budget (TABLE E)

| Origin         | Finite before→after | Unknown before→after | Strict complete before→after | Bounded before→after |
| -------------- | ------------------: | -------------------: | ---------------------------: | -------------------: |
| Nakayama       |             352→356 |              704→700 |                      189→190 |              281→282 |
| Tokyo          |             403→407 |              653→649 |                      199→200 |              232→233 |
| Osaka          |             224→230 |              832→826 |                        30→30 |                36→36 |
| Hakata/Fukuoka |             273→276 |              783→780 |                      209→211 |              222→224 |
| Naha           |             257→261 |              799→795 |                      246→250 |              246→250 |

Transport unchanged; on-site component repaired. ONSITE_BUDGET_COMPONENT_UNAVAILABLE
reason count: 587→579 across all origins.

## Lowest Budget recommendation (Phase 15)

Coverage remains structurally weak: of 1,057 destinations, only ~38 manual + 112 model +
351 legacy-numeric carry any displayed price, and the legacy-numeric cohort is unproven.
The on-site repair added ~32 source-backed records, but the dominant blockers remain
genuine unknown (no evidence). **Recommendation: keep Lowest Budget hidden** — data is
not mature enough for a defensible lowest-budget ranking.

## Safety

- unknown never becomes ¥0 (validators enforce two-truths invariant)
- free never inferred without evidence (isFreeDestination hardened + tests)
- no invented costs: only ledger-verified tickets restored
- no paid/runtime API introduced
- KAI-204 local bounded rail unchanged (transport untouched)
