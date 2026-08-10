# Meguruto — Domestic Direct-Flight Audit (KAI-12 Phase 7)

**Audit date:** 2026-08-10 · **Researcher:** v4-worker agent (DeepSeek V4 Flash Max), run id `b8118c28-46b0-4f1`, task "Domestic flight audit" · **Full ledger:** `qa/kai-12/research/FLIGHT_AUDIT_DRAFT.md` (34-row verified ledger with per-route source URLs).

Scope: every route in the current registry `src/shared/data/flight-estimates.json` (34 routes, 21 airports) verified against **official airline/airport sources** (ANA/JAL/JAC/JTA/Solaseed/AirDo/Skymark/ORC/Peach/Jetstar pages, official airport sites, ANA S26 official fare PDF, prefecture route lists). Wikipedia/Rome2Rio not used.

---

## 1. Headline results

| question | answer |
|---|---|
| False direct routes in registry? | **None** — all 34 entries are physically direct routes (no connection-only entries). |
| Duration errors | **4** (TAK→OKA, CTS→OKA, KOJ→ASJ, HND→ISG/MMY over/understated) |
| Seasonal-only routes presented as year-round | **2** (ITM→ISG, FUK→KUM) |
| Airports with no scheduled service in registry | **1** (SDO Sado — no scheduled flights since April 2014) |
| Catalogue-relevant airports missing | **4** (SDJ, KMI, OIT, NGS — all with confirmed HND directs) |
| Operator attribution errors | 6 (Spring Japan status, KIX-CTS cargo-only, NGO-FUK Peach, OKA-ISG/MMY RAC/Peach, HND-AKJ ADO codeshare, CTS-OKA ANA implication) |
| Fares with verified standard basis | 26 routes (ANA standard-fare table; JAL flex fares partially) |
| Fares NULL (LCC-only, no published standard) | 8 routes |

**Direct-route rule holds:** the model is direct-only and must stay so — connecting itineraries (e.g. ANA selling CTS→OKA via HND) are **not** registry routes.

## 2. Registry corrections required (implementation phase)

| route | current | verified truth | action |
|---|---|---|---|
| TAK→OKA | flightTime [60,75] | ANA NH1621 ≈ **110–120 min**, 1 RT/day, year-round, ANA-only | fix time |
| CTS→OKA | [180,210], source implied ANA | Peach-only, ≈ **200–225 min**, daily year-round; ANA/JAL = connection via HND only | fix time + operator |
| KOJ→ASJ | [40,55] | JAL + ANA/JAC (NH4371), ≈ **70–85 min**, 2 RT/day | fix time |
| HND→ISG | [195,220] | ANA-only direct, ≈ **165–185 min** (NH89), year-round incl. W26, 1–2 RT/day | fix time (route confirmed direct) |
| HND→MMY | [180,205] | ANA-only direct, ≈ **170–185 min** (NH1079), year-round | fix time |
| ITM→ISG | year-round | **seasonal Jul 17–Aug 28**, ANA NH1165/1166 1 RT/day | add seasonality; exclude outside window |
| FUK→KUM | year-round | **seasonal Jul 1–Aug 31**, JAC 1 RT/day (KOJ→KUM, ITM→KUM remain year-round) | add seasonality |
| NRT→CTS | — | Spring Japan **not operating** at audit date; Peach/Jetstar only | operator metadata fix |
| KIX→CTS | — | Spring KIX-CTS = **cargo-only** (IJ438/439); Peach/Jetstar passenger | operator metadata fix |
| NGO→FUK | fare from 9,000 (LCC hint) | ANA only (incl. codeshares); **no Peach** | fare/source fix |
| OKA→ISG | — | JTA/ANA/SNA; **no RAC/Peach** | operator metadata fix |
| OKA→MMY | — | JTA/RAC/ANA; **no Peach** | operator metadata fix |
| HND→AKJ | — | ANA = **ADO codeshare** (physical ADO); JAL own flights | operator metadata fix |
| SDO (Sado) | airport with zone | **no scheduled service since April 2014** (charter test flights only, e.g. Toki Air May 2026) | remove from usable flight gateways; Sado stays ferry-only |

## 3. Airports to add (with verified routes)

| code | airport | verified HND directs | source |
|---|---|---|---|
| SDJ | Sendai | ANA, JAL, ADO (3 RT), IBEX (3 RT), Peach (2 RT), ~70 min | sendai-airport.co.jp; pref.miyagi.jp |
| KMI | Miyazaki | ANA 12/day, JAL 6/day, Solaseed 7/day, ~105–120 min | miyazaki-airport.co.jp; solaseedair.jp |
| OIT | Oita | ANA, JAL, Solaseed 4 RT, ~95–110 min | oita-airport.jp |
| NGS | Nagasaki | ANA, JAL, Solaseed 4 RT, ~115–130 min | nagasaki-airport.jp |

Adding SDJ alone fixes the baseline's "Sendai origin flight = 0" defect. **Rule:** add each airport together with only verified route pairs (see §4).

## 4. Fare decisions per FARE_POLICY

- **26 routes** carry verified standard-fare ranges from the **ANA S26 official one-way standard fare table** (`ana.co.jp/guide/plan/fare/domestic/pdf/26s_standard_oneway_250529.pdf`), e.g. HND–CTS 13,420–48,290; HND–FUK 14,740–52,250; HND–OKA 13,090–58,850.
- **8 LCC-only routes (NRT/ITM/KIX→CTS/OKA/FUK, FUK→ISG, CTS→OKA)** have **no published standard fare** → `fare: null`, `fareStatus: "unverified"`. Promo/dynamic prices are never stored.
- JAL exact flex fares captured for 2 routes (HND–CTS, HND–MYJ); other JAL routes cite official from-price pages — the fare field must cite the ANA table only where ANA operates, else remain NULL.
- Fares exclude PFC (airport facility fee) — documented in fare metadata.
- Seasonal routes (ITM→ISG, FUK→KUM) need `operatingPeriods` (ferry model) so the fare never applies outside the window.

## 5. Architecture notes (feeds TRANSPORT_MODEL_GAP_ANALYSIS)

1. `FlightRoute` needs: `operator`, `operatingPeriods` (seasonality), `directOnly` invariant already implicit, and fare validity windows to fully satisfy FARE_POLICY.
2. Access legs stay generic estimates; verified airport-access legs remain a future model (e.g. SDJ access via Sendai Access Line is real but unmodeled).
3. `airport-zones.json` gains SDJ/KMI/OIT/NGS assignments (SDJ→mainland-honshu, KMI/OIT/NGS→mainland-kyushu) with the same validator coverage.

## 6. Validator additions (implementation phase)

- `sourceUrl` + `checkedAt` required for **every** flight route (currently only fare-carrying routes); future-date check.
- Seasonal routes require `operatingPeriods`; validator errors if a route outside its window claims year-round availability.
- SDO-like dead airports: validator warns when an airport zone entry has no scheduled routes.
- New routes may only be added with DIRECT=verified official source (no connection-only, no codeshare-as-operator).
- **Registry-conflict quarantine (Luna-confirmed, 2026-08-10):** until `flight-estimates.json` is updated, the registry's TAK→OKA [60,75] and CTS→OKA [180,210] values conflict with audited official figures ([110,120] ANA; [200,225] Peach) — rows `fl-err-001/002` in the ledger. No runtime claim may be built on the old values; ingestion must update them or mark unverified/null.
- Validator reference date must be centralized (currently `REFERENCE_TODAY = 2026-08-05` in `transport-topology.ts`) and set ≥ latest checkedAt before ingestion (gap analysis §5 gate 1).

*Ledger provenance: 34-row route table with per-route URLs in `research/FLIGHT_AUDIT_DRAFT.md`; canonical source list in §5 of that draft.*
