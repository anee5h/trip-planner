# Meguruto — Transport Coverage Baseline (KAI-12 Phase 1)

Run against the **current catalogue** (`src/shared/data/destinations-index.json`, **761 destinations**) on branch `aneeshpatil8/kai-63-remove-default-explore-filters-and-audit-transport-mode` @ **`fdd944a3`** (HEAD at first run was `89ce96b9`; re-run on `fdd944a3` 2026-08-10 — **counts are identical**, later KAI-63 commits touched Explore UI/tests only, not transport registries). KAI-63 is not merged; per the ticket this is the pre-merge baseline. **Re-run this audit after KAI-63 merges** before any implementation.

Method: for each origin (coordinates of the named station) and each mode, every catalogue destination is bucketed as:

- **verified** — an origin-aware estimate exists (`OriginAwareTransportService`, registries);
- **bounded estimated** — `SafeGroundEstimateService` (≤120 km, same major land zone);
- **legacy-only** — topology authorizes the mode but the only evidence is `destination.transportOptions[<mode>]` (static minutes, non-origin-aware);
- **missing** — topology authorizes the mode but no evidence exists at all;
- **topology unsupported** — no zone edge / local mode for the mode;
- **unknown** — destination or origin zone resolves to `unknown` (7 destinations).

Explore-visible counts = destinations passing `getValidModes(dest, "none", [selection], origin)` — the actual Explore filter semantics (note: `getValidModes` requires the legacy `transportOptions[mode]` key as the destination-support gate, so visible counts are **not** identical to evidence buckets).

> ⚠️ Evidence buckets and Explore-visible filter counts are different things and must not be conflated. A destination can be `verified` yet invisible under a filter (missing legacy key), and `legacy-only` yet visible.

---

## 1. Evidence buckets by origin (counts out of 761)

### Nakayama / Yokohama (35.4657, 139.6222 → `mainland-honshu`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **121** | 139 | 403 | 61 | 30 | 7 |
| shinkansen | **0** | 9 | 169 | 496 | 80 | 7 |
| bus | **0** | 14 | 197 | 490 | 53 | 7 |
| flight | **216** | 0 | 0 | 538 | 0 | 7 |

### Tokyo (35.6812, 139.7671 → `mainland-honshu`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **280** | 76 | 308 | 60 | 30 | 7 |
| shinkansen | **202** | 12 | 74 | 386 | 80 | 7 |
| bus | **0** | 16 | 195 | 490 | 53 | 7 |
| flight | **216** | 0 | 0 | 538 | 0 | 7 |

### Osaka (34.7025, 135.4959 → `mainland-honshu`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **248** | 21 | 399 | 56 | 30 | 7 |
| shinkansen | **247** | 19 | 81 | 327 | 80 | 7 |
| bus | **0** | 81 | 130 | 490 | 53 | 7 |
| flight | **79** | 0 | 0 | 675 | 0 | 7 |

### Fukuoka (33.5904, 130.4017 → `mainland-kyushu`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **15** | 48 | 529 | 57 | 105 | 7 |
| shinkansen | **114** | 28 | 90 | 416 | 106 | 7 |
| bus | **0** | 17 | 152 | 482 | 103 | 7 |
| flight | **356** | 0 | 0 | 398 | 0 | 7 |

### Hiroshima (34.3853, 132.4553 → **mis-resolves to `mainland-shikoku`** ⚠️)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **1** | 10 | 552 | 43 | 148 | 7 |
| shinkansen | **0** | 0 | 0 | 0 | 754 | 7 |
| bus | **0** | 8 | 176 | 422 | 148 | 7 |
| flight | **264** | 0 | 0 | 490 | 0 | 7 |

⚠️ **Topology bug (baseline finding):** Hiroshima station coordinates (34.3853, 132.4553) fall inside the `MAINLAND_BOUNDS` shikoku box (`lat [32.5,34.5]`, `lng [132.2,134.9]`), which overlaps Honshu. `resolveOriginTransportZone` returns `mainland-shikoku`, zeroing shinkansen eligibility and distorting bus/train buckets. The shikoku box must be tightened (suggest `lng ≥ 133.2` or `lat ≤ 34.3` and re-test) or mainland boxes removed in favor of prefecture metadata for coordinate origins. **This distorts any Hiroshima-origin recommendation today.**

### Sapporo (43.0618, 141.3545 → `hokkaido`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **0** | 18 | 518 | 43 | 175 | 7 |
| shinkansen | **121** | 0 | 128 | 307 | 198 | 7 |
| bus | **0** | 0 | 2 | 21 | 731 | 7 |
| flight | **461** | 0 | 0 | 293 | 0 | 7 |

⚠️ Sapporo→Hokkaido-prefecture shinkansen `verified=121` relies on the `tokyo→hokkaido`-style registry overgeneralization (see architecture doc §2.1): the prefecture-pair registry can return a shinkansen duration for a *local* Hokkaido destination even though the Hokkaido Shinkansen only reaches Shin-Hakodate-Hokuto today.

### Sendai (38.2682, 140.8694 → `mainland-honshu`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **0** | 24 | 639 | 61 | 30 | 7 |
| shinkansen | **121** | 12 | 164 | 377 | 80 | 7 |
| bus | **0** | 19 | 192 | 490 | 53 | 7 |
| flight | **0** | 0 | 0 | 754 | 0 | 7 |

⚠️ **Sendai has zero verified flights** — SDJ (Sendai Airport) is absent from `airports.json` and the flight registry, so a Sendai origin gets no flight option at all (HND–SDJ is a major daily route; see FLIGHT_AUDIT).

### Nagoya (35.1709, 136.8815 → `mainland-honshu`)

| mode | verified | estimated | legacy | missing | unsupported | unknown |
|---|---|---|---|---|---|---|
| train | **0** | 76 | 587 | 61 | 30 | 7 |
| shinkansen | **145** | 38 | 120 | 371 | 80 | 7 |
| bus | **0** | 39 | 172 | 490 | 53 | 7 |
| flight | **79** | 0 | 0 | 675 | 0 | 7 |

⚠️ Nagoya train `verified=0` (registry has no `aichi`-origin train rows; `tokyo→aichi` is shinkansen-only), yet shinkansen `verified=145` — the registry's origin asymmetry dominates.

---

## 2. Explore-visible filter counts by origin

Counts of destinations visible in Explore with each explicit mode selection (only that mode allowed) and with no filter (`ALL_PUBLIC_MODES`):

| origin | train only | shinkansen only | bus only | flight only | mixed public | no filter |
|---|---|---|---|---|---|---|
| Nakayama/Yokohama | 663 | 178 | 211 | 216 | 732 | 734 |
| Tokyo | 663 | 178 | 211 | 216 | 732 | 734 |
| Osaka | 663 | 178 | 211 | 79 | 711 | 713 |
| Fukuoka | 588 | 176 | 169 | 356 | 637 | 639 |
| Hiroshima (mis-resolved) | 563 | **0** | 184 | 264 | 582 | 584 |
| Sapporo | 536 | 130 | **2** | 461 | 560 | 560 |
| Sendai | 663 | 178 | 211 | **0** | 690 | 691 |
| Nagoya | 663 | 178 | 211 | 79 | 711 | 714 |

Notes:

- Honshu origins share identical train/shinkansen/bus counts (663/178/211): the destination-support gate (`transportOptions` key presence) dominates; mode evidence does not change visibility (KAI-63 semantics: any authorized mode keeps a destination visible).
- `flight only` is the only selection where counts track the origin (nearest same-zone airport + registry route): HND 216 / ITM·KIX 79 / FUK 356 / CTS 461 / NGO 79 / **SDJ missing → 0**.
- Sapporo `bus only = 2`: topology allows bus locally in hokkaido, but only 2 destinations carry `transportOptions.bus`. Bus verified = 0 everywhere.
- Hiroshima `shinkansen only = 0` is **entirely** the box-overlap artifact, not a real product decision.
- `no filter` > `mixed public` in 5 origins: ferry-only destinations (e.g. Naoshima/Teshima) visible only when ferry is in the mode set.

---

## 3. Summary of the baseline

| dimension | value |
|---|---|
| catalogue size | 761 destinations |
| train verified, best origin (Osaka) | 248 / 761 (32.6%) |
| shinkansen verified, best origin (Osaka) | 247 / 761 (32.5%) |
| bus verified, all origins | **0 / 761** |
| flight verified, best origin (Sapporo) | 461 / 761 (60.6%) — CTS route star; Sendai origin: 0 |
| legacy-only train (Yokohama origin) | 403 destinations — largest single legacy bucket |
| registry origin prefectures (ground) | tokyo, osaka, fukuoka only |
| airports in registry | 21 (missing SDJ, OIT, KMI, NGS) |
| flight routes | 34 (23 without provenance; 8 fare=null) |
| destinations with `transportFares` | 0 |
| destinations with explicit `transportZoneId` | 31 (7 = `unknown`) |
| topology box overlap | Hiroshima origin mis-resolves to shikoku |

### Highest-impact gaps for KAI-12

1. **Bus: 0 verified corridors nationwide** — the "Bus" filter currently means legacy static minutes or ≤120 km estimates, never a verified intercity coach.
2. **Sendai origin flight = 0** — missing SDJ airport/registry entries.
3. **Shinkansen overgeneralization** — prefecture-pair registry claims Hokkaido-wide shinkansen access that is actually Shin-Hakodate-Hokuto-only today.
4. **Legacy `transportOptions` still gating visibility** (663 train-visible destinations rest mostly on legacy keys) and still feeding Destination Details display fallback.
5. **Hiroshima origin topology mis-resolution** (box overlap) — distorts a top-8 origin.
6. **Fare coverage: 0 records** with `transportFares`; flight fares mostly unprovenanced (11/34 sourced).
7. **Airport access legs** are generic 250 km nearest-airport heuristics, not verified access routes.

Re-run target after KAI-63 merges: identical script against new main; expected deltas are small (KAI-63 changes Explore defaults, not registries) — the baseline's purpose is a before/after pair for the KAI-12 implementation phases.
