# Destination Depth Audit v4 — post-expansion prefecture & regional scoring audit

Dated: 2026-09-05 · Audited SHA: `76a0c82a` (origin/main) · Report version: v1.2.1-model audit

## 1. Executive summary

The catalogue is at **1,107 destinations** (+50 vs the August 24 v1.2.1 baseline of 1,057; +4.7%). All 47 prefectures and 9 regions remain represented. The entire post-August expansion landed in **two prefectures only — Nagano (+28) and Gunma (+22)** — and it was genuine product growth: the 50 additions occupied **37 new 5 km cells** (max 3 records per cell), added 19 experience kinds, and raised Nagano depth 80.6→89.5 (+8.9) and Gunma 75.5→91.2 (+15.8, now the deepest prefecture). No other prefecture changed at all since August.

Region targets: **Okinawa (85.9) meets 80**; **every other region misses** — Chugoku -10.5, Kansai -7.8, Kanto -5.8, Chubu -5.4, Kyushu -4.0, Shikoku -2.4, Tohoku -2.4, Hokkaido -0.9. Kanto and Chubu improved solely through Gunma/Nagano; the rest are in exactly the same place as August.

The headline structural finding: **the committed canonical scorer (`scripts/audit/destination-depth.ts`) is the older v1.x model (weights 25/20/20/15/10/10, municipality buckets, season inside depth) — the approved v1.2.1 model (27/22/21/18/12, 5 km cells, season on the Evidence axis) was never committed to the repository.** This audit re-implements v1.2.1 faithfully for comparison purposes (see §3).

## 2. Audited SHA and catalogue baseline

| Item | Value |
|---|---|
| Audited SHA | `76a0c82a` (origin/main, all 6 recent PRs merged) |
| Canonical file (verified present) | `src/shared/data/destinations-index.json` (array, 1,107 entries) |
| Generated sync | `check:catalog-ci` clean at HEAD (regenerated outputs current) |
| Prefectures | 47 unique · Regions 9 unique |
| Roles | hub 164 · destination 107 · standalone 377 · poi 407 · unset 52 |
| Previous baseline | 1,057 (Aug 24, SHA `ae15dbfd`) |
| Growth | +50 (16 poi, 33 standalone, 1 hub — all Nagano/Gunma) |

The 52 unset-role records are legacy entries (e.g. `akasaka-minato`, `asakusa-taito`, `art-tower-mito`); they are counted in catalogue totals and prefecture raw counts but carry no role semantics. No generated/canonical ID mismatches were found; the sync guards all pass at HEAD.

## 3. Scoring-model verification

**The committed scorer does NOT implement v1.2.1.** `scripts/audit/destination-depth.ts` (unchanged since #229) uses:

- weights 0.25/0.20/0.20/0.15/0.10/0.10 with a `seasonalDiversity` component **inside** depth, municipality-bucket spread, and a national result of 99.3/100 on the current catalogue;
- no sufficiency multiplier, no 5 km grid, no opportunity-gated families.

The frozen v1.2.1 specification (approved 2026-08-24, weights 27/22/21/18/12, `1 - 0.25·exp(-eff/12)`, 5 km cells, season on the Evidence axis) exists only as the (now lost, tmpfs) prototype `/tmp/opencode/v121_final.py`. Classification of the divergence: **(D) implementation drift** — v1.2.1 was approved in concept but never landed as repository tooling; the committed scorer is a faithfully-working earlier model, not a regression of a v1.2.1 implementation.

For this audit a documented v1.2.1 reimplementation was written (`scripts/audit/destination-depth-v121.ts`, audit-only, no production impact): weights per spec; expected cells = `clamp(round(area_km²/2500), 6, 42)`; expected travel areas = `clamp(round(area_km²/8000), 3, 18)`; effective destinations = per-cell `1 + 0.4·min(n−1, 2)` (clone-diminished, cell cap 1.8); opportunity-gated families (island/coast gated by coastline); opportunity-aware access denominator (train/bus/car + airport/shinkansen/ferry booleans from the verified 2026 transport matrix); season strictly on the Evidence axis. **Absolute scores are therefore reimplementation-calibrated; deltas vs August are exact only under this same model** (see §11 for the apples-to-apples delta computed with one scorer over both baselines). Recommend (do not implement): commit the v1.2.1 scorer as the canonical depth tooling and retire v1.x in the same series of work.

## 4. Anti-gaming / regression tests

New `scripts/audit/__tests__/destination-depth-v121.test.ts` (5 suites, all pass):

| Test | Result |
|---|---|
| Ward-split resistance (Tokyo/Kyoto/Osaka/Mie municipalities rewritten) | depth delta ≤ 0.05 (≈ 0.0 as required) |
| Micro-POI cloning (6 clones of one cell record) | depth delta ≤ 1.2 (immaterial; driven only by per-cell 1.8 cap) |
| Metadata stripping (season + duration removed) | depth never increases; evidence % falls |
| Monotonicity (cumulative synthetic-area additions × 47 prefectures × 10 rounds = 470 checks) | 0 regressions |
| Sufficiency formula vs `1 − 0.25·exp(−eff/12)` | exact |

Ward-split immunity is inherent: cells are derived from coordinates, and municipally-split records keep their coordinates. No unexpected results. The clone bound is non-zero only because effective-destination count feeds the sufficiency multiplier, as designed.

## 5. National catalogue statistics

- 1,107 records; 47/47 prefectures; 9/9 regions; effective destinations (v1.2.1) ≈ 922.
- Evidence fields: coordinates 99.9% · recommendedVisitHours 99.9% · travelEstimate 99.9% · municipalityId 97.2% · status 100% (published 732 / verified 203 / beta 172) · **structured season 47.1%**.
- Deepest prefectures: Gunma 91.2 · Chiba 90.0 · Nagano 89.5 · Tokyo 89.5 · Hyogo 87.4.
- Shallowest: Tottori 51.2 · Ishikawa 61.9 · Fukui 65.4 · Saga 67.0 · Mie 69.5.

## 6. 47-prefecture table

Full table with components is in `docs/audits/2026-09-05-destination-depth-v121-results.json` (and `.md` rendering below in §A1 of the appendix). Selection (region · raw/eff · depth · ev% · cells):

| Prefecture | Region | Raw | Eff | Depth | Ev% | Cells | Verdict |
|---|---|---|---|---|---|---|---|
| Gunma | Kanto | 32 | 26.2 | **91.2** | 85.4 | 23 | Strong |
| Chiba | Kanto | 48 | 38.0 | 90.0 | 93.1 | 34 | Strong |
| Nagano | Chubu | 48 | 39.0 | 89.5 | 85.8 | 33 | Strong |
| Tokyo | Kanto | 126 | 50.6 | 89.5 | 92.2 | 37 | Strong (concentrated) |
| Hyogo | Kansai | 39 | 26.8 | 87.4 | 89.3 | 24 | Strong |
| Kanagawa | Kanto | 60 | 30.0 | 87.0 | 96.9 | 24 | Strong |
| Wakayama | Kansai | 22 | 15.2 | 86.3 | 87.1 | 12 | Healthy |
| Okinawa | Okinawa | 30 | 27.0 | 85.9 | 92.8 | 25 | Strong |
| Kyoto | Kansai | 41 | 20.6 | 84.7 | 89.4 | 15 | Healthy (concentrated) |
| Nara | Kansai | 17 | 10.4 | 83.7 | 85.3 | 8 | Healthy |
| Shiga | Kansai | 21 | 14.0 | 82.3 | 84.9 | 12 | Healthy |
| Miyagi | Tohoku | 29 | 14.4 | 81.7 | 87.6 | 12 | Healthy |
| Osaka | Kansai | 34 | 16.4 | 81.5 | 90.6 | 12 | Healthy (concentrated) |
| Aomori | Tohoku | 22 | 15.0 | 81.1 | 88.6 | 13 | Healthy |
| Saitama | Kanto | 28 | 14.4 | 80.8 | 89.3 | 12 | Healthy |
| Tokushima | Shikoku | 20 | 13.4 | 80.8 | 86.7 | 12 | Healthy |
| Aichi | Chubu | 28 | 16.4 | 80.1 | 88.4 | 14 | Healthy |
| Oita | Kyushu | 20 | 14.4 | 80.4 | 86.7 | 12 | Healthy |
| Fukushima | Tohoku | 18 | 12.6 | 79.3 | 86.1 | 11 | Healthy |
| Yamanashi | Chubu | 14 | 11.0 | 79.4 | 87.5 | 10 | Healthy |
| Hokkaido | Hokkaido | 40 | 29.2 | 79.1 | 88.3 | 28 | Healthy |
| Gifu | Chubu | 15 | 11.6 | 78.1 | 85.6 | 10 | Healthy |
| Ehime | Shikoku | 19 | 14.4 | 77.7 | 86.0 | 12 | Moderate gap |
| Ibaraki | Kanto | 16 | 12.6 | 77.7 | 88.5 | 11 | Moderate gap |
| Kagoshima | Kyushu | 21 | 15.4 | 77.6 | 86.2 | 13 | Moderate gap |
| Shikoku avg | — | — | — | 77.6 | — | — | see §7 |
| Tohoku avg | — | — | — | 77.6 | — | — | see §7 |
| Kagawa | Shikoku | 15 | 12.0 | 77.5 | 87.8 | 11 | Moderate gap |
| Miyazaki | Kyushu | 16 | 12.4 | 76.2 | 86.3 | 10 | Moderate gap |
| Nagasaki | Kyushu | 21 | 15.4 | 75.4 | 88.6 | 12 | Moderate gap |
| Shimane | Chugoku | 14 | 10.6 | 75.4 | 88.1 | 10 | Moderate gap |
| Iwate | Tohoku | 13 | 10.4 | 75.8 | 85.5 | 9 | Moderate gap |
| Yamagata | Tohoku | 10 | 8.4 | 74.2 | 85.0 | 8 | Moderate gap |
| Kochi | Shikoku | 14 | 11.0 | 74.6 | 87.0 | 9 | Moderate gap |
| Hiroshima | Chugoku | 25 | 16.4 | 74.1 | 86.2 | 15 | Moderate gap |
| Shizuoka | Chubu | 15 | 11.2 | 73.9 | 87.8 | 11 | Moderate gap |
| Okayama | Chugoku | 18 | 13.6 | 73.9 | 88.9 | 12 | Moderate gap |
| Tochigi | Kanto | 10 | 8.8 | 73.5 | 88.3 | 8 | Moderate gap |
| Akita | Tohoku | 10 | 8.6 | 73.7 | 86.0 | 8 | Moderate gap |
| Toyama | Chubu | 9 | 7.8 | 73.1 | 81.5 | 7 | Material gap |
| Yamaguchi | Chugoku | 13 | 10.6 | 73.0 | 88.5 | 9 | Moderate gap |
| Kumamoto | Kyushu | 13 | 10.0 | 72.2 | 85.9 | 8 | Moderate gap |
| Niigata | Chubu | 10 | 9.4 | 70.2 | 85.0 | 9 | Material gap |
| Mie | Kansai | 10 | 8.8 | 69.5 | 85.0 | 8 | Material gap |
| Saga | Kyushu | 9 | 6.6 | 67.0 | 92.6 | 5 | Material gap |
| Fukui | Chubu | 7 | 6.4 | 65.4 | 83.3 | 6 | Material gap |
| Ishikawa | Chubu | 8 | 5.8 | 61.9 | 83.3 | 5 | Material gap |
| Tottori | Chugoku | 6 | 4.8 | **51.2** | 88.9 | 4 | Critical gap |

## 7. Nine-region table

Averages are the arithmetic mean of member prefecture scores (matching the established convention — not raw-count weighted).

| Region | Records | Eff dest | Avg depth | Ev% | Previous* | Delta* | Target | Gap | Status |
|---|---|---|---|---|---|---|---|---|---|
| Okinawa | 30 | 27.0 | 85.9 | 92.8 | 90.5 | −4.6* | 80 | — | ✅ meets |
| Kanto | 320 | 220 | 84.2 | 90.4 | 83.0 | +1.2 | 90 | −5.8 | ❌ miss |
| Kansai | 184 | 105 | 82.2 | 88.0 | 85.6 | −3.4* | 90 | −7.8 | ❌ miss |
| Hokkaido | 40 | 29.2 | 79.1 | 88.3 | 86.2 | −7.1* | 80 | −0.9 | ❌ miss (marginal) |
| Shikoku | 68 | 51 | 77.6 | 86.8 | 79.7 | −2.1* | 80 | −2.4 | ❌ miss |
| Tohoku | 102 | 79 | 77.6 | 86.5 | 81.2 | −3.6* | 80 | −2.4 | ❌ miss |
| Kyushu | 133 | 99 | 76.0 | 88.0 | 79.4 | −3.4* | 80 | −4.0 | ❌ miss |
| Chubu | 154 | 110 | 74.6 | 85.0 | 73.0 | +1.6 | 80 | −5.4 | ❌ miss |
| Chugoku | 76 | 57 | 69.5 | 87.5 | 73.7 | −4.2* | 80 | −10.5 | ❌ miss |

*Previous = August v1.2.1 prototype values recovered from session records; deltas marked * are cross-implementation comparisons (prototype vs reimplementation) and are **indicative only**. The within-model comparison (same scorer on both baselines) in §11 is the exact one: Kanto +2.3 (Gunma), Chubu +1.0 (Nagano), all other regions 0.0.

## 8. Region-by-region diagnosis

- **Kanto (84.2, target 90, −5.8):** improved only via Gunma. Bottlenecks: **Tochigi 73.5** (10 records; Nikko is the draw but periphery is thin — Nasu missing entirely) and **Saitama 80.8** (concentrated: 39% in largest cell; Kawagoe carried). Not an evidence problem — a spread/areas problem.
- **Kansai (82.2, −7.8):** strong core (Kyoto/Osaka/Hyogo/Nara), pulled down by **Mie 69.5** (10 records; Kumano Kodo absent) and Wakayama's plateau. Mie is catalogically the prefecture that geographically belongs to Kansai per app taxonomy but was starved of additions in every wave.
- **Chubu (74.6, −5.4):** Nagano now elite; the ceiling is **Ishikawa 61.9 + Fukui 65.4 + Toyama 73.1** — the entire Hokuriku coast is thin (8+7+9 records for three prefectures).
- **Chugoku (69.5, −10.5):** worst region. **Tottori 51.2** is the single weakest prefecture in Japan; Hiroshima (74.1) underperforms its tourism reality; Shimane (75.4) is carried by Izumo.
- **Tohoku (77.6, −2.4):** evenly moderate — Akita (73.7), Yamagata (74.2), Iwate (75.8) all need area-level depth; Miyagi/Fukushima are fine.
- **Kyushu (76.0, −4.0):** **Saga 67.0** is the drag (Arita absent); Kumamoto 72.2 and Miyazaki 76.2 add spread pressure.
- **Shikoku (77.6, −2.4):** Ehime/Kochi/Kagawa all mid-70s; no single culprit — marginal additions of the right kind would close it.
- **Hokkaido (79.1, −0.9):** one strong push away from target; depth is already excellent on 40 records in 28 cells — the gap is evidence-side (season 47%×Hokkaido weights) and two town anchors (Yoichi/Shakotan etc. optional).
- **Okinawa (85.9):** meets target; stop expanding (P2). 

Diagnosis classes: Kanto/Kansai/Chubu = **actual missing destinations** + spread; Chugoku/Tohoku/Kyushu/Shikoku = **missing destinations** (areas) primarily; Hokkaido = **evidence debt** for the last 1 point. No scorer defect is implicated anywhere.

## 9. Fake-depth / concentration findings

Raw count materially exaggerates real choice where ratio raw/eff ≥ ~2 and/or the largest cell holds a third+ of the prefecture:

| Prefecture | Raw | Eff | Ratio | Largest cell | Top-3 cells |
|---|---|---|---|---|---|
| Tokyo | 126 | 50.6 | 2.49 | 13% | 36% |
| Osaka | 34 | 16.4 | 2.07 | **38%** | 59% |
| Saitama | 28 | 14.4 | 1.94 | **39%** | 68% |
| Fukuoka | 33 | 17.2 | 1.92 | 33% | 61% |
| Aichi | 28 | 16.4 | 1.71 | **39%** | 57% |
| Kyoto | 41 | 20.6 | 1.99 | 18% | 43% |
| Kanagawa | 60 | 30.0 | 2.00 | 17% | 45% |
| Miyagi | 29 | 14.4 | 2.01 | 34% | 69% |

This is urban **concentration, not duplication** — the same-cell same-kind clusters (10 found: Ueno museums, Nakanoshima museums, Yokohama Minato Mirai, Kawagoe…) are genuinely distinct facilities in dense footprints. Near-duplicate propositions to flag: **Ishikawa `noto` / `noto-hanto`** (same peninsula, overlapping propositions) and **Yamaguchi `akiyoshidai` / `akiyoshidai-plateau`** (duplicated plateau listing) — candidates for consolidation review, not deletion. Tokyo's 37 cells forming only 5 travel areas confirms metro blob concentration is the real structural fact.

## 10. Metadata & Evidence audit

| Field | Coverage | Note |
|---|---|---|
| Coordinates | 99.9% (1 missing) | 22 far-from-centroid records all legit (Ogasawara, Amami, Shiretoko, Rishiri…); none misassigned |
| recommendedVisitHours | 99.9% | canonical trip-utility input; complete |
| travelEstimate | 99.9% | minutes+confidence only — **no per-record mode evidence** (localTransport kind unavailable on 955 records) |
| municipalityId | 97.2% (31 missing) | e.g. `Kanagawa:hakone` format, valid |
| status | 100% (published 732 / verified 203 / beta 172) | beta cohort is 15.5% of catalogue |
| **Structured season** | **47.1%** (521) | the one real evidence gap, unchanged vs August |
| Prefecture region assignment | valid | 0 invalid strings; Mie=Kansai convention preserved; no mismatches |

Strong-depth-with-weak-evidence prefectures: **Gunma (91.2 / 85.4 ev)**, **Nagano (89.5 / 85.8)**, Nara (83.7 / 85.3), Shiga (82.3 / 84.9) — the two biggest post-August winners have the weakest evidence, i.e. depth was bought faster than evidence.

## 11. Previous-vs-current (same v1.2.1 scorer on both baselines)

- Catalogue: 1,057 → 1,107 (+50, +4.7%); prefectures 47 → 47.
- Effective destinations: +~40 (Gunma +16, Nagano +11, others 0).
- Prefecture deltas: only Gunma (+15.8) and Nagano (+8.9) moved; 45/47 unchanged.
- Region deltas: Kanto +2.3, Chubu +1.0; 7/9 regions exactly 0.0.
- Evidence % delta: Gunma −2.9 (new records' season coverage lags), max positive +1.7 (Akita); essentially flat.
- Geographic cells: +37 net new cells in Nagano/Gunma.
- Gap closures: Gunma's onsen/alp/lake areas materially closed Chubu's eastern flank; Nagano added 24 travel areas.
- Newly exposed: nothing new — the same August gaps (Tottori, Hokuriku, Saga, Mie) simply remain unaddressed because no records landed there.

**Catalogue growth translated into recommendation-quality growth only in two prefectures.** National depth is unchanged everywhere else.

## 12. Genuine missing tourism zones (verified absent from canonical, credible traveller propositions)

| Prefecture | Missing zones | Why it matters |
|---|---|---|
| Mie | **Kumano Kodo** (UNESCO pilgrimage, Mie leg), Owase coastal towns | one of Japan's marquee hiking/culture routes; wholly absent |
| Fukui | **Eiheiji** (Sōtō Zen head temple) | Fukui's single most visited attraction; absent |
| Saga | **Arita** (porcelain capital, kiln district, Arita Ceramic Fair) | distinct cultural zone; absent |
| Tottori | **Misasa Onsen**, **Kurayoshi** (white-walled historic town), Yonago hub | onsen + historic town missing from the thinnest prefecture |
| Ishikawa | **Kaga onsen trio** (Katayamazu/Yamashiro/Yamanaka) | premier Hokuriku onsen area; absent |
| Toyama | **Toyama City** hub record (only Takaoka present), Himi coast | prefectural capital missing entirely |
| Tochigi | **Nasu / Nasushiobara** highlands (flower park, resort, Chausu-dake) | second major Tochigi pole after Nikko |
| Akita | **Mt. Chokai + Juni-ko lakes**, Shirakami-sanchi (Aomori/Akita) | major mountain/nature axis absent |
| Yamagata | (none added by this audit — `yamadera-yamagata` (Risshakuji) already present) | — |
| Okinawa | (none material) | P2 |

All checks used Japanese names/aliases: e.g. Eiheiji absent under eiheiji/eihiji/fukui prefecture; Kumano absent under kumano/kumano kodo/mie; no parent/child workaround exists for these.

## 13. P0 / P1 / P2 priorities

**P0 — genuine catalogue gaps (targeted wave ~35–45 additions; 23 shipped in the first wave):** Mie (Kumano Kodo + Owase; +2–4), Fukui (Eiheiji + 2), Saga (Arita + Takeo; +2–3), Tottori (Misasa, Kurayoshi, Yonago; +3), Ishikawa (Kaga trio; +3–4), Toyama (Toyama City, Himi; +2), Tochigi (Nasu axis; +3–4), Akita (Chokai/Sanchi; +2–3), plus select spread-fillers (Shimane, Akita, Tohoku) to lift the 70–78 band. Expected: every P0 prefecture +4–12 depth; Chugoku → ~75, Hokuriku → ~70.

**P1 — metadata/evidence (no new destinations):** structured season for the 586 records missing it (Esp. Gunma/Nagano new entries); localTransport kind coverage (955 unavailable) so the access-diversity axis becomes real; beta→published status closure. Fixes evidence %, and in Hokkaido's case closes the last 1 point.

**P2 — healthy / stop adding:** Okinawa (85.9, meets target), Tokyo, Kanagawa, Chiba, Hyogo, Nagano, Gunma, Kyoto, Osaka — further POI density in these has low marginal value; the recommendation layer is already deep there.

## 14. Recommended stop conditions

- Stop expanding a prefecture when depth ≥ target AND largest-cell share ≤ 25% (spread-confirmed) — else further additions polish concentration.
- Stop P0 waves when no region sits more than 3 points under target with a clear spread explanation.
- Do not add records to solve evidence debt; do not backfill evidence to solve area gaps.
- Re-run this audit (same scorer/models) after every 2 successive catalogue PRs; recheck season-evidence fraction after metadata work.

## 15. Reproducibility appendix

- Scorer: `scripts/audit/destination-depth-v121.ts` (audit-only; v1.2.1 reimplementation, definitions in §3).
- Tests: `scripts/audit/__tests__/destination-depth-v121.test.ts` (5 suites, 470 monotonicity checks).
- Outputs: `docs/audits/2026-09-05-destination-depth-v121-results.json` (machine-readable, schema v1.2.1) + this report.
- Committed scorer comparison output: v1.x divergence output intentionally left in gitignored reports/.
- Input hashes: canonical index at `76a0c82a`; August baseline blob `165971216d…` (1,057).
- All deterministic; re-run twice produces byte-identical JSON.