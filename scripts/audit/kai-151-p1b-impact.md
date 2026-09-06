# KAI-151 P1-B season evidence impact

Base: `609219e8dc69d56a3d11405840b3c06f6daa3b71`
Catalogue: **1130** records (unchanged)

## Cohort

Predicate: `frozen 79-record P1-B seed queue with season == null and bestMonths == null on merged main`

- Before missing structured season: **79**
- Source-backed mutations: **3**
- After missing structured season: **76**
- Residual rows: **76**
- Year-round with independent seasonal peak: **0**

## Mutated records

- `farm-tomita`
- `kenroku-en`
- `kirigamine-highlands`

The other 76 seed rows remain explicitly unresolved or conflicting. Generic seasonal language and inferred year-round suitability were not promoted to structured fields.

## Invariants

- Unique IDs: **pass**
- Catalogue count unchanged: **pass**
- No out-of-cohort season changes: **pass**
