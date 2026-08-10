# Meguruto — Conventional Rail Audit (KAI-12 Phase 6)

**Audit date:** 2026-08-10 · **Researcher:** v4-worker agent (DeepSeek V4 Flash Max), run id `7bf761b7-982a-47f`, task "Conventional rail audit" · **Full ledger:** `qa/kai-12/research/CONVENTIONAL_RAIL_AUDIT_DRAFT.md` (31 corridor rows with per-row operator, service type, time + source, base fare + source, LEX surcharge + source, and a strict ✅/⚠️/❌ total-fare-claim verdict).

**Critical context — JR East fare revision effective 2026-03-14:** Tokyo-area 電車特定区間 fares rose ~8–20%; mainline (幹線) fares unchanged. All Tokyo-area figures below use the post-revision official table (`jreast.co.jp/2026unchin-kaitei/...`). **Pre-2026 web figures for Tokyo corridors are stale and must not be reused.**

Fare basis: adult one-way, ordinary class, as stated per row. IC = IC-card fare, 券 = paper ticket. ✅ = total fare claim allowed (base + surcharge both officially verified); ⚠️ = base only verified, total NOT claimable; ❌ = excluded.

---

## 1. Corridor ledger (synthesis of the 31-row draft)

### Verified totals (✅ — base + LEX officially verified)

| corridor | operator | service | time | total fare (adult 1-way) |
|---|---|---|---|---|
| Tokyo↔Yokohama | JR East Tokaido Line | local/rapid | 25–30 min | 528 IC / 530 ticket |
| Tokyo↔Kamakura | JR East Yokosuka Line | local/rapid | 55–65 min | 902 IC / 910 ticket |
| Shinjuku↔Enoshima | Odakyu | LEX Romancecar / regular | 65–75 / 80–95 | 607 IC + 700–750 LEX |
| Kamakura↔Enoshima | Enoden | local | ~34 min | 310 |
| Tokyo↔Nikko | Tobu (Kegon/Revaty LEX) | LEX all-reserved | ~110 min | 1,400 + 1,650 (1,850 peak Aug 1–16) |
| Tokyo↔Kinugawa Onsen | Tobu | LEX | ~120 min | 1,400 + 1,650 |
| Shinjuku↔Hakone-Yumoto | Odakyu + Hakone Tozan | Romancecar LEX | 75–80 min | 1,261 IC + 1,150–1,200 LEX |
| Shinjuku↔Mt Takao | JR East Chuo (Special Rapid) | rapid, no LEX | ~46 min | 715 IC / 720 |
| Osaka(Namba)↔Nara | Kintetsu | LEX all-reserved | 34–35 min | 680 + 520 |
| Kyoto↔Nara | Kintetsu | LEX | 34–40 min | 760 + 520 |
| Osaka↔Kobe (Sannomiya) | JR West Kobe Line | local/rapid | 20–30 min | 420 |
| Osaka(Umeda)↔Kobe | Hankyu | LEX (no surcharge) | 27 min | 330 |
| Osaka↔Himeji | JR West Special Rapid | special rapid | ~60 min | 1,520 |
| Osaka(Namba)↔Wakayama | Nankai Southern LEX | LEX | 60–75 min | 970 + 550–700 |
| Kyoto↔Otsu (Biwako) | JR West Biwako Line | local/rapid | 9–10 min | 200 |
| Nagoya↔Iseshi | Kintetsu | LEX | 75–90 min | 1,740 + 1,340 |
| Nagoya↔Toba | Kintetsu (incl. Shimakaze) | LEX | 89–90 min | 2,070 + 1,340 (Shimakaze total 5,150) |
| Nagoya↔Takayama | JR Central LEX Hida | LEX reserved | ~140 min | 3,410 + 2,950 = **6,360** |
| Nagoya↔Toyohashi | Meitetsu | LEX (μticket opt.) | ~51 min | 1,270 + 450 optional |
| Hiroshima↔Miyajimaguchi | JR West Sanyo (+JR West ferry) | local/rapid + ferry | ~28 + 10 min | 420 + 200 ferry (+100 visitor tax) |
| Okayama↔Kurashiki | JR West Sanyo | local/rapid | 17–20 min | 330 |
| Fukuoka↔Dazaifu | Nishitetsu | local/rapid | 20–29 min | 480 (2026-04-01 revision) |
| Hakata↔Yufuin | JR Kyushu Yufuin no Mori | LEX all-reserved | 132–134 min | **6,130 integrated total** |
| Hakata↔Beppu | JR Kyushu Sonic | LEX reserved | 130–140 min | **6,910 integrated total** |
| Sapporo↔Otaru | JR Hokkaido Rapid Airport | rapid | ~35 min | 800 |
| Sapporo↔Noboribetsu | JR Hokkaido Suzuran | LEX | ~75 min | **4,890 integrated total** |
| Sapporo↔Hakodate | JR Hokkaido Hokuto | LEX | ~230 min | 6,600 + 3,170 = **9,770** |
| Tokyo↔Narita (N'EX) | JR East | LEX all-reserved | 53 min | **3,140 integrated total** |
| Tokyo(Ueno/Nippori)↔Narita | Keisei Skyliner | LEX | 36–41 min | 1,280 + 1,300 = 2,580 |
| Tokyo↔Haneda | Tokyo Monorail | local/rapid | ~18 min | 520 |
| Osaka(Namba)↔KIX | Nankai Rapi:t | LEX | 34 min | 970 + 700/910 (digital 1,410) |
| Fukuoka Airport↔city | Fukuoka Subway | subway | 5–11 min | 260 |
| Sendai↔Sendai Airport | Sendai Airport Access | local/rapid | ~25 min | 680 / 672 IC |

### Base-only verified (⚠️ — total NOT claimable per FARE_POLICY §1)

| corridor | operator | service | time | base fare | missing |
|---|---|---|---|---|---|
| Tokyo↔Nikko (JR alt) | JR East Utsunomiya/Nikko | local/rapid | 120–150 | ~2,640 (derived C表) | pair fare unverified |
| Tokyo↔Odawara | JR East Tokaido | local/rapid | 60–75 | ~1,520 (derived) | pair fare unverified |
| Shinjuku↔Kawagoe | JR East Saikyo/Kawagoe | local/rapid | 45–60 | ~770 (derived) | pair fare unverified |
| Shinjuku↔Kofu | JR East LEX Azusa/Kaiji | LEX reserved | 87–93 | 2,310 (derived) + ~1,510 LEX | total 3,820 official, split derived |
| Shinjuku↔Kawaguchiko | JR East + Fujikyuko | LEX + local | 150–180 | JR ~1,520 (derived) + Fujikyu 1,170 | JR/LEX legs derived |
| Osaka↔Nara | JR West Yamatoji | local/rapid | 33 (Tennoji) | 510 (Tennoji–Nara official); Osaka leg ~700 derived | Osaka leg |
| Kyoto↔Nara | JR West Miyakoji Rapid | rapid | ~45 | ~770 (derived) | pair fare |
| Osaka↔Wakayama | JR West Hanwa/Kuroshio | local/LEX | 72 local / ~35 LEX | 900 (Tennoji–Wakayama official); Osaka leg ~1,190 derived | Kuroshio LEX surcharge |
| Kyoto↔Wakayama | JR West Kuroshio | LEX | 85–95 | ~1,540 (derived) | LEX surcharge unretrieved |
| Nagoya↔Toyohashi | JR Central Tokaido | local/rapid | 53–56 | 1,270 (ekitan, non-official) | official pair fare |
| Hiroshima↔Iwakuni | JR West Sanyo | local/rapid | 54–66 | 770 (ekitan, non-official) | official pair fare |
| Sendai↔Matsushima | JR East Senseki | local/rapid | ~40 | ~420 (derived) | pair fare |
| Sendai↔Yamadera | JR East Senzan | local/rapid | ~63 | ~990 (derived; ekitan 910 — conflicting) | pair fare |
| Tokyo↔Haneda | Keikyu | airport express | 14 (Shinagawa) | ~330 (fare-search tool) | stable fare page |
| Nagoya↔Centrair | Meitetsu μSky | LEX | 28 | ~910 (fare-search tool) + 450 μticket | stable fare page |
| Osaka↔KIX | JR West Haruka | LEX | 45–55 | visitor 1,800 verified; regular split derived | regular LEX split |

### Excluded (❌ — must not ship as conventional-rail claims)

| corridor | reason |
|---|---|
| Hakata↔Nagasaki | conventional Kamome through-service **discontinued 2022-09-23**; today = Relay Kamome (conventional) + Shinkansen Kamome relay — no conventional-only fare exists |
| Hakata↔Kagoshima | primary service is Kyushu Shinkansen (76 min, total 11,420–11,950); conventional Kagoshima Main Line is a slow non-tourist service |
| Nagoya↔Irago | train+bus mix (Toyotetsu); single-rail fare unverified; bus leg dominates final km |
| Hiroshima Airport (rail) | rail does not reach the airport; **bus is primary** (limousine 1,500 / ~50 min) |

## 2. Semantics notes (feeds MODE_SEMANTICS / implementation)

**Destinations reachable only by limited express (surcharge effectively mandatory for a day trip):**
- Nikko/Kinugawa (Tobu LEX all-reserved), Hakone-Yumoto (Romancecar strongly preferred), Takayama (Hida), Yufuin (Yufuin no Mori), Beppu (Sonic), Noboribetsu/Hakodate (Suzuran/Hokuto).
- **Base-only "train" claims on these corridors would understate real cost** — the current registry's prefecture-pair "train" rows (e.g. `osaka→oita train [240,300]`, `tokyo→nagano train [150,210]`) are exactly this risk.

**Corridors mixing JR + private operators (one corridor, two operators, different fares/times):**
Tokyo–Nikko (JR vs Tobu), Tokyo–Hakone (Odakyu vs JR+Hakone Tozan), Tokyo–Kawaguchiko (JR+Fujikyuko, two tickets), Osaka–Nara (JR Yamatoji vs Kintetsu), Osaka–Kobe (JR vs Hankyu vs Hanshin), Osaka–Wakayama (JR Tennoji vs Nankai Namba — different stations), Nagoya–Toyohashi (JR vs Meitetsu), Nagoya–Irago (3 legs), Hakata–Nagasaki (relay since 2022).

**Fare-revision awareness:** JR East 2026-03-14 revision changes Tokyo-area fares; JR West 2025 fact-sheet figures (Osaka–Kobe 420, Tennoji–Nara 510, Tennoji–Wakayama 900) must be confirmed against 2026 sheets before production. Nishitetsu revised 2026-04-01. These are exactly the "stale fare" cases Luna must re-check.

## 3. Implementation-phase action list

1. Ground-route registry extension per FARE_POLICY: `serviceClass`, `operator`, `baseFare`, `lexSurcharge` (or `totalFare` when integrated official), `fareProduct`, `fareSourceUrl`, `checkedAt`; ⚠️ rows store base only with `fareProduct: base` — never total.
2. Add 2026-revision-aware fare validation: any Tokyo-area JR East fare must postdate 2026-03-14 (checkedAt guard + source-URL allowlist).
3. `osaka→oita`/`tokyo→nagano`-style flattened rows: re-model as gateway corridors or mark multi-leg (gap analysis §2.1).
4. Airport rail links (N'EX 3,140, Skyliner 2,580, Rapi:t, μSky, Access Line 680, monorail 520, subway 260) feed the flight access-leg model — they are **verified access legs**, usable when the flight access-leg model lands.
5. Excluded corridors stay out; validator blocks their re-addition without a fresh official source.
