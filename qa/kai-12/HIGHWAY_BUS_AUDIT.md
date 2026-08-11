# Meguruto — Highway/Intercity Bus Audit (KAI-12 Phase 8)

**Audit date:** 2026-08-10 · **Researcher:** v4-worker agent (DeepSeek V4 Flash Max), run id `f96b8513-38bb-4d1`, task "Highway bus audit" · **Full ledger:** `qa/kai-12/research/HIGHWAY_BUS_AUDIT_DRAFT.md` (27 verified corridors, 7 excluded, 5 airport-limousine rows, per-route official source URLs, checkedAt 2026-08-10).

Method: every corridor verified against **operator official pages and official reservation portals** (JR Bus group, Willer Travel, Nishitetsu, Meitetsu, Iyotetsu, Alpico, Chuo Bus, Donan Bus, Niigata Kotsu, Nihon Kotsu, Aizu Bus, Yamako, KATE, Tokyo Airport Transportation…). Google Maps / Rome2Rio never used as evidence. Wikipedia discovery-only.

---

## 1. Verified intercity coach corridors (27)

| corridor                    | operators                                 | service name                                              | duration (one-way)            | days                            | reservation           | fare (adult 1-way)                           | variability                  |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------- | ----------------------------- | ------------------------------- | --------------------- | -------------------------------------------- | ---------------------------- |
| Tokyo↔Kyoto/Osaka           | JR Bus Kanto + West JR Bus                | 青春エコドリーム/グランドリーム/ドリームルリエ            | 7.3–8.3 h                     | daily                           | all-seat reserved     | 3,300–19,000 by class                        | variable (date/seat/advance) |
| Tokyo↔Kyoto                 | Willer Express                            | WILLER EXPRESS 東京⇔京都                                  | day 7.2–7.8 h                 | daily                           | yes                   | from ~3,900                                  | dynamic                      |
| Tokyo↔Osaka                 | Willer Express                            | WILLER EXPRESS 東京⇔大阪                                  | 7–9 h                         | daily                           | yes                   | ~4,000 promo; ~7,500 typical                 | dynamic                      |
| Ikebukuro/Omiya↔Osaka/Kyoto | Kintetsu Bus                              | サテライト号 (night)                                      | 9.2–9.5 h                     | daily                           | yes                   | 6,700–13,000                                 | variable                     |
| Tokyo↔Nagoya                | JR Bus/Tokai Bus                          | ドリームなごや号 (night)                                  | ~7.3 h                        | daily                           | yes                   | 6,210–7,020                                  | variable                     |
| Tokyo↔Nagoya                | Meitetsu Bus                              | 名古屋⇔新宿 (day)                                         | 6.1–6.3 h                     | daily                           | yes                   | 5,200–8,000 by day band                      | date-band/web                |
| Tokyo↔Nagoya                | Willer Express                            | 東京⇔名古屋                                               | ~6 h                          | daily                           | yes                   | 3列 from 7,200                               | dynamic                      |
| Tokyo↔Hiroshima             | JR Bus Chugoku                            | グランドリームエクスプレス広島号 (night)                  | 10.7–11.2 h                   | daily                           | yes (1mo ahead)       | 7,400–19,000                                 | variable                     |
| Tokyo↔Sendai                | JR Bus Tohoku                             | 仙台・東京号 day / ドリーム仙台・東京号 night             | day 5.6 / night 6.0–6.1 h     | daily                           | yes                   | from 3,000                                   | variable                     |
| Tokyo↔Fukuoka               | Nishitetsu                                | はかた号 (night)                                          | 14.0–14.3 h                   | daily 1 RT                      | yes                   | Business 9,000–20,000; Premium 18,000–25,000 | dynamic                      |
| Osaka↔Hiroshima             | JR Bus Chugoku + West JR                  | 広島エクスプレス大阪号 (day) / 広島ドリーム大阪号 (night) | day 4.6–5.5 / night 6.8–8.3 h | daily                           | yes                   | day 3,500–8,500; night 4,500–10,000          | variable                     |
| Osaka↔Fukuoka               | Willer Express                            | 大阪⇔福岡 (**night only**)                                | 9.5–10.0 h                    | daily                           | yes                   | ~3,400–10,500                                | dynamic                      |
| Osaka↔Nagoya                | West JR/JR Tokai/Meihan Kintetsu          | 名神ハイウェイバス (day)                                  | 2.8–3.0 h                     | daily (some weekdays suspended) | yes                   | 3,100 (得割 1,600–2,800)                     | fixed + discounted           |
| Osaka↔Takamatsu             | JR Shikoku/Shikoku Kousoku/West JR/Hankyu | 高松エクスプレス大阪号/さぬきエクスプレス大阪号           | 3.5–3.8 h                     | daily                           | yes                   | 4,500 (早売 3,800–4,000)                     | fixed + early-discount       |
| Osaka↔Matsuyama             | JR Shikoku Bus                            | 松山エクスプレス号                                        | day 5.9–7.2 h                 | daily (reduced)                 | yes                   | 7,500 (早売5 6,000)                          | fixed + discounts            |
| Osaka↔Matsuyama             | Iyotetsu                                  | オレンジライナーえひめ                                    | 5.7 h                         | daily                           | yes                   | —                                            | —                            |
| Tokyo↔Matsuyama             | Iyotetsu                                  | オレンジライナーえひめ (night)                            | ~12.1 h                       | **specific dates only**         | yes                   | 11,000–18,000                                | variable bands               |
| Fukuoka↔Kagoshima           | Nishitetsu/JR Kyushu Bus                  | 桜島号 (day; night from 2026-09-01)                       | 4.2–4.4 h                     | daily 13 RT                     | yes                   | counter 7,000; web from 3,000                | dynamic vs fixed             |
| Fukuoka↔Nagasaki            | Nishitetsu (+ JR Kyushu Bus)              | 九州号                                                    | 2.1–2.5 h                     | daily frequent                  | **no (free seating)** | 2,900 (往復 5,400)                           | fixed                        |
| Fukuoka↔Kumamoto            | Nishitetsu/Kyushu Sanko                   | ひのくに号                                                | 2.0–2.3 h                     | daily 82–91 RT                  | **no**                | 2,500 (往復 4,700)                           | fixed                        |
| Sapporo↔Hakodate            | Chuo Bus/Hakodate Bus                     | 高速はこだて号                                            | 5.6–6.0 h                     | daily                           | yes                   | web 3,530–5,990; counter 5,990               | dynamic web vs fixed counter |
| Sapporo↔Asahikawa           | Chuo/JR Hokkaido/Dohoku                   | 高速あさひかわ号                                          | 2.1 (summer)–2.4 (winter) h   | daily                           | **no**                | 2,500 (往復 4,700)                           | fixed                        |
| Sapporo↔Noboribetsu         | Donan Bus                                 | 高速おんせん号                                            | ~1.8 h                        | daily                           | yes (fully reserved)  | 2,800–3,800                                  | variable                     |
| Sendai↔Yamagata             | Yamako/Miyagi Kotsu                       | 仙台⇔山形                                                 | 1.1 h                         | daily frequent                  | **no (IC ok)**        | 1,100                                        | fixed                        |
| Sendai↔Aizu-Wakamatsu       | Aizu Bus                                  | 仙台⇔会津若松                                             | ~2.6 h                        | weekday 2 RT / holiday 3 RT     | no (first-come)       | 3,300                                        | fixed                        |
| Tokyo↔Niigata               | Niigata Kotsu/Echigo Kotsu/Seibu          | 東京線 新潟⇔新宿・池袋                                    | day 5.3–5.8 / night 6.0–6.8 h | daily                           | yes                   | 3,200–7,900                                  | A–F date bands               |
| Tokyo↔Kanazawa              | West JR (+ JR Bus Kanto)                  | グランドリーム金沢号 (night)                              | ~10.5 h                       | daily                           | yes                   | 6,000–12,000                                 | variable                     |
| Osaka↔Kanazawa              | West JR + 北鉄                            | 北陸道青春昼特急大阪号 day / 百万石ドリーム大阪号 night   | day ~6.1 / night 7.2–7.4 h    | daily                           | yes                   | day 2,500–6,800; night 3,100–9,800           | variable                     |
| Tokyo↔Nagano                | Alpico/Keio/Nagaden                       | 長野⇔新宿・池袋                                           | day ~4.0 / night ~5.5 h       | daily                           | yes                   | from 3,500                                   | dynamic                      |
| Tokyo↔Matsumoto             | Alpico/Keio                               | 松本⇔新宿                                                 | 3.2–3.9 h                     | daily (some runs off)           | yes                   | web from 3,300; fixed 4,100–4,500            | dynamic vs band              |
| Tokyo↔Kofu                  | Fujikyu/Yamanashi Kotsu/Keio              | 中央高速バス 新宿⇔甲府                                    | 2.0–2.2 h                     | daily frequent                  | yes                   | 2,300–2,500                                  | fixed + web                  |
| Tokyo↔Kawaguchiko           | Fujikyu/Keio                              | 中央高速バス 新宿⇔河口湖                                  | ~1.8 h                        | daily frequent                  | yes                   | 2,200 (web 2,000)                            | fixed + web                  |
| Osaka↔Tottori               | Nihon Kotsu                               | 鳥取⇔大阪・神戸線                                         | 2.9–3.5 h                     | daily day & night               | yes                   | 4,200                                        | fixed + multi-ride           |
| Takamatsu↔Matsuyama         | JR Shikoku/Iyotetsu                       | 坊っちゃんエクスプレス                                    | 2.5–2.8 h                     | daily                           | yes                   | 4,400 (往復 8,400)                           | fixed + round-trip           |
| Kobe↔Takamatsu              | JR Shikoku/Shinki/Shikoku Kousoku/West JR | 高松エクスプレス神戸号/ハーバーライナー                   | 2.8–3.0 h                     | daily                           | yes                   | 4,300 (早割 3,600–3,800)                     | fixed + early-discount       |

## 2. Excluded corridors (with reasons — do not ship)

| corridor                                  | verdict      | reason                                                                        |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| Tokyo↔Takamatsu                           | **EXCLUDED** | ドリーム高松号 suspended since 2020-08; rail サンライズ瀬戸 only              |
| Hiroshima↔Matsuyama                       | **EXCLUDED** | no direct highway bus; ferry (80 min jet / 2h42m ferry) is the practical mode |
| Nagoya↔Ise                                | **EXCLUDED** | no scheduled express bus; Kintetsu rail rapid (~1.4 h) dominates              |
| Osaka↔Nara                                | **EXCLUDED** | no scheduled intercity coach; commuter rail only                              |
| Osaka↔Wakayama                            | **EXCLUDED** | 和歌山特急ニュースター号 suspended; only weekend USJ service remains          |
| Osaka↔Fukuoka (Nishitetsu ムーンライト号) | **EXCLUDED** | suspended 2017-03-31; Willer covers the corridor                              |
| Tokyo↔Osaka via Seibu                     | **EXCLUDED** | Seibu Bus operates no Tokyo–Kansai route                                      |

## 3. Airport limousine buses — never surface as intercity "Bus" (MODE_SEMANTICS §3)

| corridor     | operator                           | service             | duration  | fare               |
| ------------ | ---------------------------------- | ------------------- | --------- | ------------------ |
| Kyoto↔KIX    | KATE                               | 京都線 リムジンバス | 1.4–1.5 h | 2,800 (往復 5,100) |
| Tokyo↔Narita | Tokyo Airport Transp.              | 成田空港線          | 1.2–1.8 h | 3,100              |
| Tokyo↔Haneda | Tokyo Airport Transp./Tokyu/Keikyu | 羽田⇔新宿線         | 0.8–1.2 h | 1,400              |
| Kobe↔Itami   | Hankyu Kanko/Hanshin               | 伊丹⇔神戸三宮       | ~0.7 h    | 1,200              |
| Nara↔Itami   | Nara Kotsu/Hankyu Kanko            | 奈良・天理⇔伊丹     | ~1.1 h    | —                  |

**Rule:** these rows may support an airport-access leg, never a "destination reachable from origin by Bus" claim.

## 4. Cross-cutting findings (schema-facing)

1. **Pricing is overwhelmingly dynamic/date-band (22/27 corridors).** A fixed-fare bus registry would mislead. The schema needs `fareRange` + variability notes (ferry `fareBasis` model as reference); per FARE_POLICY §3 store fixed/range/variable or `null`.
2. **Reservation is per-route, not per-corridor:** most long-haul coaches are 全席指定 (all-seat reserved), but Fukuoka–Nagasaki/Kumamoto, Sapporo–Asahikawa, Sendai–Yamagata, Sendai–Aizu are free-seating walk-up. Record per route.
3. **Short-haul express** (Osaka–Kobe ¥1,000, Sendai–Yamagata ¥1,100) sits between commuter and intercity — recommend a `commuterExpress` classification so intercity "Bus" claims stay conservative.
4. **Osaka↔Fukuoka is night-only** — no day coach; rail/air only in daytime.
5. **Seto Ohashi corridors verified** (Osaka/Kobe→Takamatsu day coaches); night Tokyo→Takamatsu no longer exists.
6. Some fare tables are dated 2025-10/2026-04/2026-07 revisions — **re-verify before registry ingestion**; Willer figures from official search/timetable URLs (JS-rendered pages) are marked dynamic.
7. **Willer Express rows carry lower confidence** (JS-rendered pages; fares dynamic) — mark `confidence: medium` in the ledger.

## 5. Implementation-phase action list

1. New `bus-routes.json` registry: corridor rows only, with `operator`, `serviceName`, `fromTerminal`, `toTerminal`, `durationRange`, `operatingDays`, `reservationRequired`, `fareRange|null`, `fareVariability`, `operatingPeriods` (seasonal), `sourceUrl`, `checkedAt`.
2. Validators: provenance for every row; future dates banned; terminal-pair keys (not prefecture pairs); limousine/local rows prohibited from the intercity registry (separate `airport-access` section); excluded corridors must not reappear without a new source.
3. Runtime: `getGroundEstimate` bus branch reads the new registry; authorization additionally requires the corridor's terminals to match the origin/destination gateways (gateway model Phase B) — until then, bus stays `null` for pairs without a corridor (never a generic fallback).
4. Fare display: bus fare labels must state variability (e.g. "from ¥X, varies by date").
