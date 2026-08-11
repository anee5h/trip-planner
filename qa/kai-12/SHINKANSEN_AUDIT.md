# Meguruto — Shinkansen Network Audit (KAI-12 Phase 5)

**Audit date:** 2026-08-10 · **Researcher:** v4-worker agents (DeepSeek V4 Flash Max), run ids `1337e0b6-89dc-499` (research) + `00541593-6a2b-409` (draft from salvaged verified findings) · **Full ledger:** `qa/kai-12/research/SHINKANSEN_AUDIT_DRAFT.md` (30 corridor rows + gateway table + UNVERIFIED list, checkedAt 2026-08-10).

Method: operator-official pages only (JR Central, JR West, JR East/eki-net, JR Kyushu, JR Hokkaido). Wikipedia/aggregators cross-reference only, never evidence. **Fare basis always stated** (ordinary reserved vs non-reserved); no fares invented; UNVERIFIED rows name the page that would carry the missing figure.

**Fare-revision basis (current at checkedAt):** JR Central 2023-10-01 · JR East **2026-03-14** (Tohoku/Joetsu/Hokuriku/Akita/Yamagata) · JR West 2023-10-01 · JR Kyushu **2025-04-01**. Pre-revision figures are stale.

---

## 1. Verified corridor ledger (synthesis of the 30-row draft)

### Tokaido (JR Central)

| corridor           | service patterns                               | fastest time | fare (adult 1-way, JPY)                                                                                                        |
| ------------------ | ---------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Tokyo–Shin-Osaka   | Nozomi fastest; Hikari ~3h; Kodama ~4h         | 141–150 min  | non-reserved 13,870; Nozomi reserved 14,720; Hikari/Kodama reserved 14,400                                                     |
| Tokyo–Nagoya       | Nozomi/Hikari/Kodama                           | ~100 min     | Nozomi reserved 11,300; Hikari/Kodama reserved 11,090; non-reserved 10,560 (derived per rule 31 — flagged)                     |
| Tokyo–Kyoto        | **direct on Tokaido** (no Shin-Osaka transfer) | ~135 min     | Nozomi reserved 14,170 (fare 8,360 + fee 5,810); non-reserved 13,320. ⚠️ ¥12,430 online = EX早特21 discount, NOT ordinary fare |
| Tokyo–Shizuoka     | **Nozomi skips**; Hikari/Kodama stop           | 60–75 min    | non-reserved 5,940 (Kodama); reserved 6,470                                                                                    |
| Nagoya–Shin-Osaka  | Nozomi/Hikari/Kodama                           | 50–60 min    | Nozomi reserved 6,480; other bases UNVERIFIED                                                                                  |
| Tokyo–Gifu-Hashima | **Nozomi skips**; Kodama/some Hikari           | UNVERIFIED   | UNVERIFIED (Gifu gateway)                                                                                                      |
| Tokyo–Maibara      | **Kodama only**                                | UNVERIFIED   | UNVERIFIED (Shiga gateway)                                                                                                     |

### Sanyo (JR West)

| corridor                  | service patterns                              | fastest time                             | fare (adult 1-way, JPY)                                                                                 |
| ------------------------- | --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Shin-Osaka–Hiroshima      | Nozomi fastest; Sakura/Kodama                 | 80–86 min                                | **UNVERIFIED** — conflicting cached figures rejected (draft §4)                                         |
| Shin-Osaka–Okayama        | Nozomi/Sakura/Kodama                          | ~44 min                                  | UNVERIFIED                                                                                              |
| Shin-Osaka–Hakata         | Nozomi/Mizuho ~2h21; Sakura ~2h38; Kodama ~4h | 140–142 min                              | Nozomi/Mizuho reserved 16,020; Sakura/Kodama reserved 15,520; non-reserved 15,020 (2023-10-01, current) |
| Hiroshima–Hakata          | Nozomi/Sakura/Kodama                          | ~60 min (Nozomi; not directly confirmed) | UNVERIFIED                                                                                              |
| Shin-Osaka–Kagoshima-Chuo | Mizuho through (no Hakata transfer); Sakura   | 222–226 min (Mizuho 3h42)                | Mizuho/Nozomi reserved 23,050                                                                           |

### Tohoku / Hokkaido (JR East + JR Hokkaido)

| corridor                   | service patterns                                             | fastest time | fare (2026-03-14 revision, JPY)                                            |
| -------------------------- | ------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------- |
| Tokyo–Sendai               | Hayabusa fastest; Hayate/Yamabiko/Nasuno                     | 89–92 min    | reserved: Hayabusa 11,430, Hayate/Yamabiko 11,110; non-reserved 10,780     |
| Tokyo–Shin-Aomori          | Hayabusa fastest; Hayate/Yamabiko                            | 179–187 min  | reserved: Hayabusa 17,910; Hayate/Yamabiko 17,390                          |
| Tokyo–Shin-Hakodate-Hokuto | Hayabusa/Hayate                                              | 237–242 min  | reserved: Hayabusa 24,000; Hayate 23,480 (JR Hokkaido page 23,760 = stale) |
| Tokyo–Morioka              | Hayabusa fastest; Komachi couples/splits                     | 135–139 min  | reserved 15,250                                                            |
| Sendai–Shin-Aomori         | Hayabusa/Hayate/Yamabiko                                     | 93–100 min   | reserved: Hayabusa 11,440; Hayate/Yamabiko 11,370                          |
| Tokyo–Akita                | Komachi (all-reserved, mini-shinkansen, branches at Morioka) | 228–233 min  | reserved 18,260                                                            |
| Tokyo–Yamagata             | Tsubasa (all-reserved, branches at Fukushima)                | 158–164 min  | reserved 11,470                                                            |
| Tokyo–Fukushima            | **Hayabusa skips**; Yamabiko/Tsubasa stop                    | ~95 min      | UNVERIFIED                                                                 |
| Tokyo–Ichinoseki           | Hayabusa (subset)/Hayate/Yamabiko                            | ~130 min     | reserved 13,610                                                            |

### Joetsu / Hokuriku (JR East + JR West)

| corridor           | service patterns                              | fastest time            | fare (2026-03-14, JPY)               |
| ------------------ | --------------------------------------------- | ----------------------- | ------------------------------------ |
| Tokyo–Niigata      | Toki fastest; Tanigawa                        | 97–110 min              | reserved 10,780; non-reserved 10,560 |
| Tokyo–Nagano       | Asama (terminates); Hakutaka/Kagayaki through | 77–91 min               | reserved 8,250; non-reserved 7,920   |
| Tokyo–Toyama       | Kagayaki fastest (all-reserved); Hakutaka     | 125–130 min             | reserved 12,980                      |
| Tokyo–Kanazawa     | Kagayaki fastest (all-reserved); Hakutaka     | 144–147 min             | Kagayaki reserved 14,400             |
| Tokyo–Shin-Tsuruga | Kagayaki/Hakutaka + Tsurugi local             | ~188 min (fastest 3h08) | reserved 16,380                      |
| Nagano–Kanazawa    | Kagayaki/Hakutaka                             | ~65 min                 | UNVERIFIED                           |

⚠️ Source-URL caveat: the four Hokuriku fares above are salvage-confirmed eki-net/JR East regular fares (checked 2026-08-10) but the exact 2026-03-14 price-table PDF URL was not preserved — recorded in ledger; re-capture URL before ingestion.

### Kyushu (JR Kyushu, 2025-04-01 revision)

| corridor              | service patterns                                                                                                                            | fastest time | fare (JPY)                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| Hakata–Kagoshima-Chuo | Mizuho fastest; Sakura/Tsubame; **non-reserved cars 1–3** (8-car sets)                                                                      | 76–80 min    | reserved 11,950 (base 6,270 + fee 5,680); non-reserved amount UNVERIFIED |
| Hakata–Kumamoto       | Mizuho/Sakura/Tsubame                                                                                                                       | ~33 min      | reserved 5,840 (base 3,300 + fee 2,540)                                  |
| Hakata–Nagasaki       | **Kamome (shinkansen, Takeo-Onsen–Nagasaki) + Relay Kamome (conventional, Hakata–Takeo-Onsen), same-platform transfer, one through ticket** | ~80 min      | reserved 6,490 (base 3,300 + fee 3,190)                                  |
| Hakata–Shin-Tosu      | Tsubame/Sakura/Mizuho                                                                                                                       | UNVERIFIED   | UNVERIFIED (nearest station for Saga City)                               |

## 2. Gateway semantics (required, per MODE_SEMANTICS §1)

| city/region                                                                                                                                                                                         | shinkansen gateway                       | notes                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokyo                                                                                                                                                                                               | Tokyo Stn (also Shinagawa/Ueno)          | —                                                                                                                                                                                                                                          |
| Osaka                                                                                                                                                                                               | Shin-Osaka                               | —                                                                                                                                                                                                                                          |
| Kyoto                                                                                                                                                                                               | Kyoto Stn (on Tokaido, direct)           | —                                                                                                                                                                                                                                          |
| Nagoya                                                                                                                                                                                              | Nagoya                                   | —                                                                                                                                                                                                                                          |
| Hiroshima                                                                                                                                                                                           | Hiroshima                                | —                                                                                                                                                                                                                                          |
| Fukuoka                                                                                                                                                                                             | Hakata                                   | —                                                                                                                                                                                                                                          |
| Sendai                                                                                                                                                                                              | Sendai                                   | —                                                                                                                                                                                                                                          |
| Sapporo                                                                                                                                                                                             | **none** (nearest: Shin-Hakodate-Hokuto) | extension ~FY2030/31                                                                                                                                                                                                                       |
| Niigata / Nagano / Toyama / Kanazawa / Okayama / Kagoshima-Chuo / Kumamoto / Shin-Yamaguchi / Shin-Aomori / Akita / Yamagata / Fukushima / Shizuoka / Gifu-Hashima / Maibara / Shin-Kobe / Nagasaki | as named                                 | Akita/Yamagata = mini-shinkansen; Shizuoka/Gifu-Hashima = Nozomi skips; Maibara = Kodama only; Fukushima = Hayabusa passes                                                                                                                 |
| **Mie, Nara, Wakayama, Tottori, Shimane, Shikoku (all 4), Miyazaki, Oita, Saga city**                                                                                                               | **none**                                 | Mie→Nagoya; Nara→Kyoto; Wakayama→Shin-Osaka; Tottori/Shimane→Okayama; Shikoku→Okayama/Takamatsu; Miyazaki→Kagoshima-Chuo/Kokura; Oita→Kokura/Hakata; Saga→Shin-Tosu (~15 km) — each requires an onward leg that must be separately modeled |

**Rule:** a destination is Shinkansen-eligible only if (a) it has a gateway station with stopping services and (b) the onward leg is representable. Prefecture-pair rows must not overgeneralize.

## 3. Current-status facts (must not be contradicted)

1. **Hokkaido Shinkansen terminus = Shin-Hakodate-Hokuto.** "Tokyo→Sapporo by shinkansen" is FALSE as of 2026-08-10 (extension target ~FY2030/31). The existing `tokyo→hokkaido shinkansen [235,300]` registry row is an overgeneralization (baseline: Sapporo origin shows shinkansen verified=121 via Hokkaido-prefecture rows).
2. **Hokuriku terminus = Shin-Tsuruga** since 2024-03-16 (Kanazawa–Tsuruga extension, JR West). Not Kanazawa.
3. **Nishi-Kyushu opened 2022-09-23** (Takeo-Onsen–Nagasaki); Hakata–Nagasaki is a **two-train relay** (Kamome + Relay Kamome, one through ticket) — never a single conventional "train" claim (existing `fukuoka→nagasaki shinkansen [90,140]` row is close but should state the relay).
4. **Seat semantics (verified 2026-08-10, official sources):** since the **2025-03-15 timetable change**, Nozomi has non-reserved cars 1–2 outside peak periods (all-reserved in designated peak windows; car 3 changed from non-reserved to reserved); Mizuho/Sakura have non-reserved cars 1–3 (8-car sets, per-train variation); Kagayaki/Komachi/Tsubasa/Hayabusa are all-reserved. Fare basis must match service and seat product: a Nozomi journey time may never carry a non-reserved fare that does not exist for it in the travel window, and an all-reserved service must use reserved fares (FARE_POLICY §2).

## 4. UNVERIFIED — EXCLUDED (absence of verified data, not negative claims)

Shin-Osaka–Hiroshima/Okayama fares; Hiroshima–Hakata exact time+fare; Tokyo–Gifu-Hashima & Tokyo–Maibara times+fares; Tokyo–Fukushima fare; Nagano–Kanazawa fare; Hokuriku price-table URLs (figures kept, caveat recorded); Hakata–Shin-Tosu; Kyushu non-reserved amounts. Each entry names the page that would carry it (draft §4).

## 5. Implementation-phase action list

1. Registry: add Shinkansen corridor facts with `serviceClass` + `fareProduct` + `operatingPeriods`-free (year-round) + per-row `sourceUrl`/`checkedAt`; replace the 35 existing prefecture-pair shinkansen rows where they conflict (esp. `tokyo→hokkaido`).
2. Fares: ingest only rows with both bases verified or an explicit single-basis label; keep UNVERIFIED cells null.
3. Service-pattern metadata (Nozomi-skips / Kodama-only / all-reserved) must ride along so the UI never implies a service that doesn't stop.
4. Gateway model (Phase B) consumes §2 table; until then no new "shinkansen" claims for gateway-less destinations (Nara/Wakayama/Tottori/Shimane/Shikoku/Miyazaki/Oita).
5. Validators: (a) no route marked verified from legacy `transportOptions`; (b) Sapporo/Hokkaido shinkansen claims blocked unless corridor = Shin-Hakodate-Hokuto; (c) Nozomi-fare-vs-Kodama-time mixing blocked.
