# Meguruto — Transport Coverage Gaps (KAI-12 Phase 12)

This report deliberately does not hide remaining weaknesses. Categorization per ticket taxonomy; ranking by user impact (Beta critical / High-value follow-up / Nice-to-have), prioritizing famous/high-traffic Meguruto destinations. Baseline numbers from `TRANSPORT_COVERAGE_BASELINE.md` (2026-08-10, 761-destination catalogue).

**Legend:** 🅱️ Beta critical · 🅷 High-value follow-up · 🅽 Nice-to-have

---

## 1. Gap categories

### 1.1 Missing gateway mapping

| gap                                                                                                                                           | evidence                                         | rank |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---- |
| No station/airport/terminal gateway entities; `relationships.gatewayHubId` (40 records) is unused by transport services                       | `GATEWAY_INVENTORY.md` §1; architecture doc §2.5 | 🅱️   |
| Destination→gateway last-mile leg not modeled for any destination (nearest-airport 250 km heuristic only)                                     | `GATEWAY_INVENTORY.md` §2                        | 🅱️   |
| 34 standalone records without `municipalityId` (kanazawa, fukui, noto, mount-fuji, naoshima…) resolve via gatewayHubId that transport ignores | baseline + catalogue stats                       | 🅷    |

### 1.2 Missing route registry

| gap                                                                                                                                                                                                             | evidence                                                                    | rank |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---- |
| **Intercity bus: zero verified corridors** (bus verified = 0 for all 8 baseline origins)                                                                                                                        | baseline; `HIGHWAY_BUS_AUDIT.md` §1 (27 verified corridors ready to ingest) | 🅱️   |
| Ground registry origin prefectures = tokyo/osaka/fukuoka only — Nagoya, Sendai, Sapporo, Hiroshima origins have few/no verified train/shinkansen corridors (Nagoya train verified = 0; Sendai = 0; Sapporo = 0) | baseline §1                                                                 | 🅱️   |
| Sendai (SDJ), Miyazaki (KMI), Oita (OIT), Nagasaki (NGS) airports missing from `airports.json` → Sendai origin flight = 0                                                                                       | `FLIGHT_AUDIT.md` §3                                                        | 🅱️   |
| SDO (Sado) in airport registry has no scheduled service since 2014                                                                                                                                              | `FLIGHT_AUDIT.md` §2                                                        | 🅷    |
| Intra-prefecture municipality corridors: 14 rows, Tokyo/Osaka/Hiroshima/Miyazaki/Naha only                                                                                                                      | ground-routes inventory                                                     | 🅷    |

### 1.3 Route known but duration unverified

| gap                                                                                                                                                                                      | evidence                     | rank |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---- |
| All 66 current ground routes sourced from Wikipedia/Japan-guide/Navitime (secondary) — operator-timetable re-sourcing pending (rail ledger has verified times for the top ~40 corridors) | `CONVENTIONAL_RAIL_AUDIT.md` | 🅱️   |
| JR West Kuroshio (Osaka/Kyoto–Wakayama), Haruka regular LEX splits, Hiroshima–Iwakuni, Sendai–Matsushima/Yamadera, JR Central Nagoya–Toyohashi pair fares                                | rail ledger ⚠️ rows          | 🅷    |
| Shinkansen corridors not covered by salvage/ledger (see SHINKANSEN_AUDIT.md when landed)                                                                                                 | —                            | 🅷    |

### 1.4 Duration verified but fare unknown

| gap                                                                                                                                                                           | evidence                          | rank                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------- |
| Ground registry has **no fare field**; `transportFares` unprovenanced and unused (0 records)                                                                                  | architecture §2.5; FARE_POLICY §0 | 🅱️                         |
| 8 flight routes have `fare: null` (LCC-only: NRT/ITM/KIX→CTS/OKA/FUK, FUK→ISG, CTS→OKA) — correct per policy, but budget shows "transport excluded" for popular LCC corridors | `FLIGHT_AUDIT.md` §4              | 🅷                          |
| JAL flex fares only partially captured (2 routes exact; rest via from-price pages)                                                                                            | flight ledger                     | 🅽                          |
| Base-only ⚠️ rail rows must never present as total (FARE_POLICY §1)                                                                                                           | `CONVENTIONAL_RAIL_AUDIT.md` §1   | 🅱️ (enforcement, not data) |

### 1.5 Seasonal/date logic missing

| gap                                                                                                                       | evidence                    | rank |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---- |
| ITM→ISG (Jul 17–Aug 28) and FUK→KUM (Jul 1–Aug 31) are seasonal-only but registered year-round                            | `FLIGHT_AUDIT.md` §2        | 🅱️   |
| FlightRoute has no `operatingPeriods` field (ferry model exists)                                                          | types.ts; gap analysis §2.2 | 🅷    |
| Bus seasonality (Sapporo–Asahikawa winter 2.4 h vs summer 2.1 h; Tokyo–Matsuyama specific-date operation) unrepresentable | `HIGHWAY_BUS_AUDIT.md` §1   | 🅷    |
| Tobu peak-season LEX surcharge (Aug 1–16 ¥1,850 vs ¥1,650)                                                                | rail ledger                 | 🅽    |

### 1.6 Multi-leg unsupported

| gap                                                                                                                                                                                                                  | evidence                               | rank               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------ |
| No transfer representation: `osaka→oita train [240,300]` (ferry or Shinkansen+Sonic), `osaka→gunma train [240,300]` (Shinkansen+local), `tokyo→nagano train [150,210]` (mostly Shinkansen) are flattened single legs | architecture §2.1; gap analysis §2.1   | 🅱️                 |
| Hakata→Nagasaki post-2022 = Relay Kamome + Shinkansen relay — no conventional-only claim possible                                                                                                                    | rail ledger (excluded row)             | 🅱️ (must not ship) |
| Hakata→Kagoshima conventional excluded (Shinkansen-primary)                                                                                                                                                          | rail ledger                            | 🅷                  |
| `tokyo→hokkaido shinkansen` prefecture-pair overgeneralization: Sapporo presented as Shinkansen-reachable before 2031                                                                                                | architecture §2.1; baseline §1 Sapporo | 🅱️                 |

### 1.7 Last-mile unsupported

| gap                                                                                                                                                                                                                                                      | evidence                                          | rank |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---- |
| Flight access legs are generic distance estimates (origin→airport, airport→dest) — no verified access routes (though verified airport-rail links exist: N'EX ¥3,140, Skyliner ¥2,580, Rapi:t, μSky, Sendai Access Line ¥680, monorail ¥520, subway ¥260) | `CONVENTIONAL_RAIL_AUDIT.md` §1; flight estimator | 🅷    |
| Hiroshima Airport reachable only by bus (¥1,500/50 min) — rail ledger notes it; flight access-leg model would need it                                                                                                                                    | rail ledger                                       | 🅷    |
| Bus corridors are terminal-pair; destination-side last mile (e.g. 博多BT→Hakata hotel area) unmodeled                                                                                                                                                    | `HIGHWAY_BUS_AUDIT.md`                            | 🅽    |

### 1.8 Topology unknown

| gap                                                                                                                                                | evidence                       | rank |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---- |
| **Hiroshima origin mis-resolves to `mainland-shikoku`** (box overlap) — zeroes shinkansen eligibility for a major origin, distorts recommendations | baseline §1; gap analysis §2.4 | 🅱️   |
| `okinawa-main` localModes includes `train` (monorail) — "Train" filter shows Okinawa destinations                                                  | topology inventory             | 🅷    |
| Coordinate-only origins (postal) rely on mainland boxes; prefecture metadata path only when station label present                                  | topology service               | 🅷    |

### 1.9 Source unavailable/ambiguous

| gap                                                                                                                                          | evidence                    | rank |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---- |
| Willer Express fares dynamic/JS-rendered — corridor verified, fares marked dynamic                                                           | `HIGHWAY_BUS_AUDIT.md` §4.7 | 🅷    |
| JR West 2025 fact-sheet fares vs 2026 sheets (Osaka–Kobe 420, Tennoji–Nara 510, Tennoji–Wakayama 900) — confirm before production            | rail ledger                 | 🅱️   |
| FUK→ISG W26 and HND→MMY W26 exact schedules unpublished at audit date                                                                        | flight ledger               | 🅽    |
| JR East derived C表 fares (Kawagoe/Odawara/Nikko/Otsuki/Sendai lines) — pair-published confirmation needed                                   | rail ledger                 | 🅷    |
| JR Central fare PDF (`global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf`) returns 404 — replaced in ledger with verified `en/tickets/` page | ledger sk-001-f             | 🅱️   |

### Validator/infrastructure gaps (Luna review findings, 2026-08-10)

| gap                                                                                                                                                                  | evidence                                   | rank |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---- |
| Validator `REFERENCE_TODAY = 2026-08-05` vs audit checkedAt 2026-08-10 — future-date checks would misfire; centralize the reference date before ingestion            | `scripts/validators/transport-topology.ts` | 🅱️   |
| `transportOptions` still gates `getValidModes` and is a display fallback in DestinationDetails — new registries are authoritative only after both are removed/marked | architecture §2.6; gap analysis §5         | 🅱️   |
| Coordinate-only origin resolution relies on overlapping mainland boxes — add regression test (Hiroshima→mainland-honshu)                                             | baseline §1 Hiroshima                      | 🅱️   |

---

## 2. Priority-corridor audit (research priorities, not blanket coverage)

| corridor family           | status after this pass                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kanto ↔ Kansai            | Shinkansen Tokaido verified (times+fares, salvage + ledger); night/day coaches verified (JR Bus/Willer); air verified (HND/ITM/KIX–ITM? no — ITM is Kansai-local; HND↔ITM/KIX corridor N/A — Kanto–Kansai air = HND/ITM/KIX↔… see flight ledger); train conventional Kyoto–Osaka local verified |
| Kanto ↔ Tohoku            | Shinkansen Tohoku verified (Tokyo–Sendai/Shin-Aomori/Morioka; ¥11,430/17,910); day/night coach Tokyo–Sendai verified; air: SDJ missing → flight claim absent until SDJ added                                                                                                                    |
| Kanto ↔ Chubu             | Tokaido verified (Tokyo–Nagoya ¥11,300; 1h40); coaches verified (JR Bus night, Meitetsu day); air: NGO→CTS/OKA/FUK registered — **NGO↔HND/FUK corridors exist in reality but are unregistered** (Sendai-origin flight gap is the same class)                                                    |
| Kansai ↔ Chugoku          | Sanyo verified (Shin-Osaka–Hiroshima/Hakata times in salvage; fares JR West 2026-04-01 — verify); coaches Osaka↔Hiroshima verified (day+night); air: **ITM/KIX↔HIJ exists but is unregistered** — only ITM/KIX→CTS/OKA/ISG/KUM are in the registry                                              |
| Kansai ↔ Shikoku gateways | No Shinkansen (correct); coaches Osaka↔Takamatsu/Matsuyama verified (Seto Ohashi); air TAK/MYJ–ITM/KIX (verify); ferry out of scope but prevents false claims                                                                                                                                   |
| Chugoku ↔ Kyushu          | Sanyo+Kyushu shinkansen (Shin-Osaka–Hakata–Kagoshima; Hakata–Kagoshima 1h16–1h20 ¥11,950); coaches Osaka↔Fukuoka night-only (Willer); Hiroshima↔Matsuyama bus EXCLUDED (ferry)                                                                                                                  |
| Intra-region metro        | Tokyo–Yokohama/Kamakura/Enoshima/Hakone/Nikko/Takao verified with 2026 fares; Osaka–Kobe/Himeji/Nara/Wakayama verified; Fukuoka–Dazaifu verified; Nagoya–Ise/Toba/Takayama verified; Sapporo–Otaru/Noboribetsu/Hakodate verified                                                                |

**Explicitly not invented:** no blanket region-to-region durations; every row above has a ledger entry and checkedAt 2026-08-10.

---

## 3. Known-unresolved summary (must remain unknown until fixed)

1. Sapporo Shinkansen access (2031 terminus) — currently false-positive via prefecture pair.
2. Oita/Miyazaki/Nagasaki conventional corridors — Shinkansen-gateway + onward-leg model required; flattened claims prohibited.
3. Shikoku Shinkansen — does not exist; train claims via Seto-Ohashi limited express require service-class fare model.
4. Sado flight access — nonexistent; ferry-only.
5. Tottori/Shimane — no Shinkansen station; onward limited-express legs unverified (Inaba/Super Hakuto — not yet researched).
6. Nara/Wakayama — no Shinkansen station; Kintetsu/JR rapid corridors verified (rail ledger) but "Shinkansen to Nara" must never be claimed.
