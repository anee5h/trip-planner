# KAI-12 Shinkansen Audit — Research Draft

Meguruto transport-mode audit (KAI-12, Phase 0 research). Today: **2026-08-10**. `checkedAt = 2026-08-10` on all rows.

**Method**: every corridor verified against **operator-official pages only** — JR Central (jr-central.co.jp / travel.jr-central.co.jp / global.jr-central.co.jp), JR West (westjr.co.jp / jr-odekake.net), JR East (jreast.co.jp / eki-net.com / timetables.jreast.co.jp), JR Kyushu (jrkyushu.co.jp), JR Hokkaido (jrhokkaido.co.jp). Wikipedia / blogs / aggregators (ekitan, Yahoo Transit, Jorudan) are **cross-reference only, never evidence** — those rows cite the operator page instead. Where a fare could not be confirmed against a live official page in this run, the row says `UNVERIFIED` and names the page that would carry it. **No fares invented.**

**Fare-revision basis (current at checkedAt)**:
- JR Central (Tokaido): fares unchanged since 2023-10-01 revision; JR Tokai Tours pages (2026-07) still show current figures.
- JR East (Tohoku/Hokkaido/Joetsu/Hokuriku/Akita/Yamagata): revised **2026-03-14** (base fares + limited-express charges); eki-net PDFs cited below are the post-revision e-ticket price tables.
- JR West (Sanyo): Sanyo fares per JR West press release effective **2023-10-01**; 2026-08 "きっぷのルール" ebook raw-table parsing proved unreliable (column misreads, see UNVERIFIED section) and was **not** used for fares.
- JR Kyushu (Kyushu/Nishi-Kyushu): revised **2025-04-01** (buy date).

**Fare conventions**: ordinary-class, adult, one-way. "reserved" = reserved seat (指定席), "non-reserved" = non-reserved seat (自由席). Where only one basis is verified, only that basis is stated.

---

## 1. VERIFIED CORRIDOR LEDGER

| corridor | operator(s) | line | service patterns that stop | typical fastest time range (min) | time source URL | fare: ordinary reserved and/or non-reserved one-way adult (JPY), basis | fare source URL | directionality/through-service notes | checkedAt |
|---|---|---|---|---|---|---|---|---|---|
| Tokyo–Shin-Osaka | JR Central (+JR West for through services) | Tokaido Shinkansen | Nozomi (fastest), Hikari, Kodama | 141–150 (Nozomi fastest 2h21; Hikari ~3h, Kodama ~4h) | https://global.jr-central.co.jp/en/info/timetable/index.html | non-reserved ¥13,870; Nozomi reserved ¥14,720; Hikari/Kodama reserved ¥14,400 | https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf ; https://travel.jr-central.co.jp | Through Nozomi/Hikari continue onto Sanyo past Shin-Osaka (operator boundary Tokaido/Sanyo at Shin-Osaka); Nozomi/Mizuho reserved surcharge differs from Hikari/Kodama | 2026-08-10 |
| Tokyo–Nagoya | JR Central | Tokaido Shinkansen | Nozomi, Hikari, Kodama | ~100 (Nozomi ~1h40); Hikari ~2h; Kodama ~2h40 | https://global.jr-central.co.jp/en/info/timetable/index.html | Nozomi reserved ¥11,300; Hikari/Kodama reserved ¥11,090; non-reserved ¥10,560 (derived: reserved regular-season fee − ¥530 per JR Central rule 31 — **derived, not directly published**) | https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf ; https://railway.jr-central.co.jp/ticket-rule/rule31.html | — | 2026-08-10 |
| Tokyo–Shizuoka | JR Central | Tokaido Shinkansen | **Nozomi skips Shizuoka**; Hikari and Kodama stop | ~60–75 (Hikari/Kodama) | https://global.jr-central.co.jp/en/info/timetable/index.html | non-reserved ¥5,940 (Kodama, rule 31); reserved ¥6,470 | https://railway.jr-central.co.jp/ticket-rule/rule31.html | Nozomi skip is the key service-pattern fact; Shizuoka served by Hikari/Kodama | 2026-08-10 |
| Nagoya–Shin-Osaka | JR Central | Tokaido Shinkansen | Nozomi, Hikari, Kodama | ~50–60 (Nozomi fastest) | https://global.jr-central.co.jp/en/info/timetable/index.html | Nozomi reserved ¥6,480; Hikari/Kodama reserved & non-reserved **UNVERIFIED** | https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf (would carry) | — | 2026-08-10 |
| Tokyo–Kyoto | JR Central | Tokaido Shinkansen | Nozomi, Hikari, Kodama | ~135 (Nozomi ~2h15; Kyoto Stn is ON the Tokaido — direct, no Shin-Osaka transfer) | https://global.jr-central.co.jp/en/info/timetable/index.html | Nozomi reserved ¥14,170 (= fare ¥8,360 + reserved fee ¥5,810); non-reserved ¥13,320 | https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf ; https://jr-central.co.jp/news/release/_pdf/000039699.pdf | Direct Nozomi; note ¥12,430 seen online is **EX早特21 discounted product**, NOT the ordinary fare | 2026-08-10 |
| Tokyo–Gifu-Hashima | JR Central | Tokaido Shinkansen | **Nozomi skips**; Kodama (and some Hikari) stop | **UNVERIFIED** (~100–120 expected by pattern; not confirmed against official timetable in this run) | https://global.jr-central.co.jp/en/info/timetable/index.html | **UNVERIFIED** (Gifu-Hashima is the Tokaido station for Gifu; fare table https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf would carry it) | https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf | Gifu-Hashima = Tokaido gateway for Gifu Prefecture | 2026-08-10 |
| Tokyo–Maibara | JR Central | Tokaido Shinkansen | **Kodama only** (Maibara is a Kodama stop; Nozomi/Hikari pass) | **UNVERIFIED** (~150–180 expected by pattern) | https://global.jr-central.co.jp/en/info/timetable/index.html | **UNVERIFIED** (Maibara = Shiga gateway; fare table above would carry it) | https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf | Kodama-only service is the key pattern fact | 2026-08-10 |
| Shin-Osaka–Hiroshima | JR West | Sanyo Shinkansen | Nozomi (fastest), Sakura, Kodama | ~80–86 (Nozomi fastest ~1h20–1h26) | https://timetable.jr-odekake.net/station-timetable/2815002001 ; https://www.jr-odekake.net/railroad/service/barrierfree/pdf/wheelchair_space_shinkansen_260314.pdf | **UNVERIFIED** — conflicting cached figures (¥11,970 from dead JR Central nozomi.pdf; ebook readings inconsistent); the JR West 2026-08 "きっぷのルール" ebook fare table would settle it | https://www.jr-odekake.net/ticket/guide/ebook/ | Tokaido/Sanyo boundary at Shin-Osaka; Sanyo fares are JR West | 2026-08-10 |
| Shin-Osaka–Okayama | JR West | Sanyo Shinkansen | Nozomi, Sakura, Kodama | ~44 (Nozomi; e.g. Nozomi 101 Shin-Osaka 7:11→Okayama 7:55) | https://timetable.jr-odekake.net/station-timetable/2815002001 | **UNVERIFIED** | https://www.jr-odekake.net/ticket/guide/ebook/ (would carry) | Okayama = gateway for Tottori/Shimane/Shikoku | 2026-08-10 |
| Shin-Osaka–Hakata | JR West | Sanyo Shinkansen | Nozomi (fastest ~2h21–2h22), Mizuho (~2h20–2h21), Sakura (~2h38), Kodama (~4h) | 140–142 (Nozomi/Mizuho); Sakura ~158; Kodama ~240 | https://timetable.jr-odekake.net/station-timetable/2815002001 ; https://www.westjr.co.jp/press/article/items/230530_00_press_pricereview.pdf | Nozomi/Mizuho reserved ¥16,020; Hikari/Sakura/Kodama reserved ¥15,520; non-reserved ¥15,020 (2023-10-01 revision, current) | https://www.westjr.co.jp/press/article/items/230530_00_press_pricereview.pdf | Mizuho = Sanyo+Kyushu through service (JR West+JR Kyushu); Sanyo/Kyushu boundary at Hakata | 2026-08-10 |
| Hiroshima–Hakata | JR West | Sanyo Shinkansen | Nozomi, Sakura, Kodama | ~60 (Nozomi ~1h; not directly confirmed this run) | https://timetable.jr-odekake.net/station-timetable/2815002001 | **UNVERIFIED** | https://www.jr-odekake.net/ticket/guide/ebook/ (would carry) | — | 2026-08-10 |
| Shin-Osaka–Kagoshima-Chuo | JR West + JR Kyushu | Sanyo + Kyushu Shinkansen (through) | Mizuho (fastest, through), Sakura, Kodama/Tsubame with transfer at Hakata | 222–226 (Mizuho fastest 3h42) | https://www.jrkyushu.co.jp/trains/sp/800/ (Mizuho fastest); salvage-confirmed 3h42–3h45 | Mizuho/Nozomi reserved ¥23,050 (2023-10-01 JR West revision; Sanyo portion + Kyushu) | https://www.westjr.co.jp/press/article/items/230530_00_press_pricereview.pdf | Mizuho crosses Sanyo/Kyushu operator boundary at Hakata without transfer | 2026-08-10 |
| Tokyo–Sendai | JR East | Tohoku Shinkansen | Hayabusa (fastest), Hayate, Yamabiko, Nasuno (all stop) | 89–92 (Hayabusa fastest 1h29) | https://timetables.jreast.co.jp/ ; https://www.jreast.co.jp/press/2020/sendai/20201218_s01.pdf | reserved: Hayabusa ¥11,430, Hayate/Yamabiko ¥11,110; non-reserved ¥10,780 (2026-03-14 revision) | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf ; https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayate_normal.pdf | Hayabusa/Komachi all-reserved; Yamabiko/Nasuno/Hayate carry non-reserved cars | 2026-08-10 |
| Tokyo–Shin-Aomori | JR East | Tohoku Shinkansen | Hayabusa (fastest), Hayate, Yamabiko (terminus Shin-Aomori) | 179–187 (Hayabusa fastest 2h59; typical ~3h07) | https://timetables.jreast.co.jp/ ; https://media.jreast.co.jp/articles/6353 (JRE official media) | reserved: Hayabusa ¥17,910, Hayate/Yamabiko ¥17,390 (2026-03-14) | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf ; https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayate_normal.pdf | Operator boundary Tohoku/Hokkaido at Shin-Aomori; Hayabusa continues as JR Hokkaido service | 2026-08-10 |
| Tokyo–Shin-Hakodate-Hokuto | JR East + JR Hokkaido | Tohoku + Hokkaido Shinkansen | Hayabusa, Hayate | 237–242 (Hayabusa ~3h57–4h02 incl. Shin-Aomori–Shin-Hakodate-Hokuto ~55–62 min) | https://timetables.jreast.co.jp/ ; https://www.jrhokkaido.co.jp/CM/Info/notice_en/pdf/shinkansen_202603.pdf | reserved: Hayabusa ¥24,000, Hayate ¥23,480 (2026-03-14; JR Hokkaido page ¥23,760 is pre-revision — **stale, not used**) | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf | **Terminus is Shin-Hakodate-Hokuto — Sapporo is NOT reachable by shinkansen until the extension opens (~FY2030/31)**; state explicitly in app | 2026-08-10 |
| Tokyo–Morioka | JR East | Tohoku Shinkansen | Hayabusa (fastest), Hayate, Yamabiko; Komachi (couples to/from Tokyo, splits at Morioka) | ~135–139 (Hayabusa ~2h15–2h19) | https://timetables.jreast.co.jp/ ; https://www.jreast.co.jp/press/2025/20251212_ho02.pdf | reserved ¥15,250 (2026-03-14) | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf | Akita mini-shinkansen (Komachi) branches off at Morioka | 2026-08-10 |
| Sendai–Shin-Aomori | JR East | Tohoku Shinkansen | Hayabusa, Hayate, Yamabiko | 93–100 (Hayabusa ~1h33–1h40) | https://timetables.jreast.co.jp/ | reserved: Hayabusa ¥11,440, Hayate/Yamabiko ¥11,370 (2026-03-14) | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf ; https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayate_normal.pdf | — | 2026-08-10 |
| Tokyo–Akita | JR East | Akita Shinkansen (Komachi; mini-shinkansen via Tohoku) | Komachi only (all-reserved; couples with Hayabusa Tokyo–Morioka) | 228–233 (Komachi ~3h48–3h53) | https://timetables.jreast.co.jp/2608/train/110/111122.html | reserved ¥18,260 (2026-03-14 e-ticket regular) | https://www.eki-net.com/top/e-ticket/waribiki.html ; https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf | Komachi branches off Tohoku line at Morioka; all-reserved | 2026-08-10 |
| Tokyo–Yamagata | JR East | Yamagata Shinkansen (Tsubasa; mini-shinkansen via Tohoku) | Tsubasa only (all-reserved) | 158–164 (fastest 2h38–2h44) | https://timetables.jreast.co.jp/2608/train/095/097981.html ; https://www.jreast.co.jp/press/2025/20251212_ho02.pdf | reserved ¥11,470 (e-ticket regular: fare ¥6,270 + fee ¥5,200; 2026-03-14) | https://www.eki-net.com/top/e-ticket/pdf/pr_yamagata_normal.pdf | Tsubasa branches off Tohoku line at Fukushima | 2026-08-10 |
| Tokyo–Fukushima | JR East | Tohoku Shinkansen | **Hayabusa skips Fukushima**; Yamabiko and Tsubasa stop | ~95 (Yamabiko/Tsubasa ~1h35) | https://timetable.jr-odekake.net/train-timetable/162871 (JR West portal timetable of JRE train) | **UNVERIFIED** | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayate_normal.pdf (would carry; Hayate/Yamabiko table) | Yamabiko stops where Hayabusa passes | 2026-08-10 |
| Tokyo–Ichinoseki | JR East | Tohoku Shinkansen | Hayabusa (some), Hayate, Yamabiko | ~130 (Hayabusa ~2h10 for stopping trains; many Hayabusa pass) | https://timetable.jr-odekake.net/train-timetable/249451 | reserved ¥13,610 (2026-03-14) | https://www.eki-net.com/top/e-ticket/pdf/pr_tohoku_hokkaido_hayabusa_normal.pdf | Service-pattern note: not all Hayabusa stop | 2026-08-10 |
| Tokyo–Niigata | JR East | Joetsu Shinkansen | Toki (fastest), Tanigawa | 97–110 (Toki ~1h37–1h45) | https://timetables.jreast.co.jp/2608/timetable-v/004d2p.html | reserved ¥10,780; non-reserved ¥10,560 (2026-03-14) | https://www.eki-net.com/top/e-ticket/pdf/pr_joetsu_normal.pdf | Toki/Tanigawa have non-reserved cars | 2026-08-10 |
| Tokyo–Nagano | JR East (+JR West beyond) | Hokuriku Shinkansen | Asama (terminates Nagano), Hakutaka, Kagayaki (through) | 77–91 (fastest ~1h20–1h30) | https://timetables.jreast.co.jp/2608/timetable-v/004d2p.html | reserved ¥8,250; non-reserved ¥7,920 (2026-03-14) | https://www.eki-net.com/top/e-ticket/waribiki.html (salvage-confirmed regular fares, checked 2026-08-10; exact 2026-03-14 price-table PDF URL not preserved — see UNVERIFIED section, item 8) | Asama = JR East local service; Hakutaka/Kagayaki continue toward JR West territory | 2026-08-10 |
| Tokyo–Toyama | JR East + JR West | Hokuriku Shinkansen | Kagayaki (fastest, all-reserved), Hakutaka | ~125–130 (Kagayaki ~2h05–2h10) | https://timetables.jreast.co.jp/2608/timetable-v/004d2p.html | reserved ¥12,980 (2026-03-14) | https://www.eki-net.com/top/e-ticket/waribiki.html (salvage-confirmed regular fares, checked 2026-08-10; exact 2026-03-14 price-table PDF URL not preserved — see UNVERIFIED section, item 8) | Kagayaki crosses JR East/JR West boundary (Itoigawa); Hokuriku through-services | 2026-08-10 |
| Tokyo–Kanazawa | JR East + JR West | Hokuriku Shinkansen | Kagayaki (fastest, all-reserved), Hakutaka | 144–147 (Kagayaki fastest 2h24–2h27) | https://timetables.jreast.co.jp/2608/timetable-v/004d2p.html | Kagayaki reserved ¥14,400 (2026-03-14) | https://www.eki-net.com/top/e-ticket/waribiki.html (salvage-confirmed regular fares, checked 2026-08-10; exact 2026-03-14 price-table PDF URL not preserved — see UNVERIFIED section, item 8) | Kagayaki all-reserved; crosses operator boundary | 2026-08-10 |
| Tokyo–Shin-Tsuruga | JR East + JR West | Hokuriku Shinkansen | Kagayaki (fastest), Hakutaka, Tsurugi (Kanazawa–Tsuruga local) | ~188 (Tokyo–Tsuruga fastest 3h08; extension opened 2024-03-16) | https://www.westjr.co.jp/company/ir/pdf/20240430_01.pdf ; https://www.westjr.co.jp/railroad/project/project1/ | reserved ¥16,380 (2026-03-14 eki-net) | https://www.eki-net.com/top/e-ticket/waribiki.html (salvage-confirmed regular fares, checked 2026-08-10; exact 2026-03-14 price-table PDF URL not preserved — see UNVERIFIED section, item 8) | **Shin-Tsuruga is the current Hokuriku terminus since 2024-03-16** (Kanazawa–Tsuruga 125 km, JR West-operated); no further extension open as of checkedAt | 2026-08-10 |
| Nagano–Kanazawa | JR East + JR West | Hokuriku Shinkansen | Kagayaki, Hakutaka (Asama terminates Nagano) | ~65 (Kagayaki 500: Kanazawa 06:02→Nagano 07:08) | https://timetables.jreast.co.jp/ | **UNVERIFIED** | https://www.eki-net.com/top/e-ticket/ (Hokuriku regular price PDF would carry) | Operator boundary at Itoigawa (JR East west to Itoigawa; JR West Itoigawa–Tsuruga) | 2026-08-10 |
| Hakata–Kagoshima-Chuo | JR Kyushu | Kyushu Shinkansen | Mizuho (fastest; non-reserved cars 1–3), Sakura, Tsubame | 76–80 (Mizuho fastest 1h16) | https://www.jrkyushu.co.jp/trains/sp/800/ | reserved ¥11,950 (base ¥6,270 + reserved fee ¥5,680; 2025-04-01 revision); non-reserved basis **UNVERIFIED** | https://www.jrkyushu.co.jp/railway/kaitei/pdf/20241129_fare_revision.pdf ; https://www.jrkyushu.co.jp/railway/kaitei/index.html | Mizuho/Sakura carry non-reserved cars 1–3 (8-car sets, per-train variation) but non-reserved fare not confirmed this run; since 2025-03-15 Nozomi non-reserved cars are 1–2 outside peak | 2026-08-10 |
| Hakata–Kumamoto | JR Kyushu | Kyushu Shinkansen | Mizuho, Sakura, Tsubame | ~33 | https://www.jrkyushu.co.jp/trains/sp/800/ (salvage-confirmed 33 min) | reserved ¥5,840 (base ¥3,300 + reserved fee ¥2,540; 2025-04-01) | https://www.jrkyushu.co.jp/railway/kaitei/pdf/20241129_fare_revision.pdf | — | 2026-08-10 |
| Hakata–Nagasaki | JR Kyushu | Nishi-Kyushu Shinkansen (Kamome) + limited express Relay Kamome | Kamome (Takeo-Onsen–Nagasaki, shinkansen) + **Relay Kamome** (Hakata–Takeo-Onsen, conventional limited express); transfer at Takeo-Onsen | ~80 (shortest 1h20 incl. transfer; same-platform face-to-face connection) | https://www.jrkyushu.co.jp/railway/netyoyaku/route/nagasaki/ | reserved ¥6,490 (base ¥3,300 + fee ¥3,190; 2025-04-01; through ticket issued as one fare) | https://www.jrkyushu.co.jp/railway/kaitei/pdf/20241129_fare_revision.pdf | **Relay operation current as of checkedAt**: Kamome+Relay Kamome transfer at Takeo-Onsen, no ticket-gate exit; Nishi-Kyushu line opened 2022-09-23 | 2026-08-10 |
| Hakata–Shin-Tosu | JR Kyushu | Kyushu Shinkansen | Tsubame (all stop), Sakura, Mizuho | **UNVERIFIED** (~15 min expected; not confirmed this run) | https://www.jrkyushu.co.jp/trains/sp/800/ | **UNVERIFIED** | https://www.jrkyushu.co.jp/railway/kaitei/pdf/20241129_fare_revision.pdf (would carry) | Shin-Tosu is the nearest shinkansen station for Saga City (Saga city itself is NOT on the Nishi-Kyushu line) | 2026-08-10 |

---

## 2. GATEWAY STATIONS (city → shinkansen station)

| city / region | gateway shinkansen station | notes |
|---|---|---|
| Tokyo | Tokyo | also Shinagawa/Ueno |
| Osaka | Shin-Osaka | — |
| Kyoto | Kyoto | on Tokaido line directly |
| Nagoya | Nagoya | — |
| Hiroshima | Hiroshima | — |
| Fukuoka | Hakata | — |
| Sendai | Sendai | — |
| Sapporo | **none** (nearest Shin-Hakodate-Hokuto) | Hokkaido extension ~FY2030/31; state "no shinkansen" |
| Niigata | Niigata | — |
| Nagano | Nagano | — |
| Toyama | Toyama | — |
| Kanazawa | Kanazawa | — |
| Okayama | Okayama | — |
| Kagoshima | Kagoshima-Chuo | — |
| Kumamoto | Kumamoto | — |
| Yamaguchi | Shin-Yamaguchi | — |
| Aomori | Shin-Aomori | — |
| Akita | Akita | mini-shinkansen (Komachi) |
| Yamagata | Yamagata | mini-shinkansen (Tsubasa) |
| Fukushima | Fukushima | Yamabiko/Tsubasa; Hayabusa passes |
| Shizuoka | Shizuoka | Nozomi skips |
| Gifu | Gifu-Hashima | Kodama/Hikari |
| Mie | **none** (nearest Nagoya) | — |
| Nara | **none** (nearest Kyoto) | — |
| Hyogo/Kobe | Shin-Kobe | — |
| Shiga | Maibara | Kodama only |
| Wakayama | **none** (nearest Shin-Osaka) | — |
| Tottori | **none** (nearest Okayama) | — |
| Shimane | **none** (nearest Okayama) | — |
| Shikoku (Ehime/Kagawa/Tokushima/Kochi) | **none** (nearest Okayama/Takamatsu via ferry/bus) | — |
| Miyazaki | **none** (nearest Kagoshima-Chuo/Kokura) | — |
| Oita | **none** (nearest Kokura/Hakata) | — |
| Saga (city) | Shin-Tosu (~15 km away) | Saga city not on Nishi-Kyushu line; Takeo-Onsen/Ureshino are on it |
| Nagasaki | Nagasaki | via Kamome + Relay Kamome |

---

## 3. CURRENT-STATUS / SEASONALITY NOTES

- **Hokkaido Shinkansen**: terminus remains Shin-Hakodate-Hokuto; Sapporo extension under construction, not open (target ~FY2030/31). Any app claim of "Tokyo→Sapporo by shinkansen" is **false** as of checkedAt.
- **Hokuriku Shinkansen**: Kanazawa–Tsuruga extension **opened 2024-03-16** (JR West-operated; Tokyo–Tsuruga fastest 3h08). Shin-Tsuruga is the current terminus — not Kanazawa.
- **Nishi-Kyushu**: opened 2022-09-23 Takeo-Onsen–Nagasaki; Hakata–Nagasaki requires the Relay Kamome conventional transfer at Takeo-Onsen (same-platform, one through ticket). Current as of checkedAt.
- **Fare-revision windows**: JR East 2026-03-14; JR Kyushu 2025-04-01; JR Central/JR West 2023-10-01 (no later revision affecting these corridors confirmed as of checkedAt).

---

## 4. UNVERIFIED — EXCLUDED (could not be sourced officially in this run)

| item | why excluded | page that would carry it |
|---|---|---|
| Shin-Osaka–Hiroshima ordinary fare (Nozomi/Hikari/Kodama reserved & non-reserved) | conflicting cached figures (¥11,970 from dead `global.jr-central.co.jp/en/info/fare/_pdf/nozomi.pdf`; ¥16,510/¥15,930/¥15,400 vs ¥11,640 from 2026-08 ebook parses — all unreliable) | JR West 2026-08 きっぷのルール ebook fare table (https://www.jr-odekake.net/ticket/guide/ebook/) or e5489 |
| Shin-Osaka–Okayama fare | not in salvage; no official page confirmed this run | same ebook table |
| Hiroshima–Hakata exact fastest time + fare | not in salvage; not confirmed this run | JR West Sanyo timetable + ebook table |
| Tokyo–Gifu-Hashima time & fare | not in salvage; Nozomi-skip pattern confirmed but numbers not | JR Central fare table (https://global.jr-central.co.jp/en/info/fare/_pdf/fare.pdf) + timetable |
| Tokyo–Maibara time & fare | Kodama-only pattern confirmed; numbers not | same as above |
| Tokyo–Fukushima fare | not in salvage | eki-net Hayate/Yamabiko price PDF |
| Nagano–Kanazawa fare | not in salvage | eki-net Hokuriku regular price PDF (https://www.eki-net.com/top/e-ticket/) |
| Tokyo–Nagano / Tokyo–Toyama / Tokyo–Kanazawa / Tokyo–Shin-Tsuruga regular-fare price-table URL | figures (¥8,250/¥7,920, ¥12,980, ¥14,400, ¥16,380) are salvage-confirmed eki-net/JR East regular fares checked 2026-08-10, but the exact 2026-03-14 price-table PDF URLs were not preserved (only the discounted tokudane normal_hokuriku.pdf was); fares kept, source-URL caveat recorded | https://www.eki-net.com/top/e-ticket/waribiki.html |
| Hakata–Shin-Tosu time & fare | not in salvage | JR Kyushu fare-revision PDF + timetable |
| Hakata–Kagoshima-Chuo / Hakata–Nagasaki **non-reserved** fares | non-reserved fare amounts not confirmed; Sakura/Tsubame/Kamome carry non-reserved cars (1–3 on 8-car sets) but the non-reserved amount is not published in the pages verified — reserved figures are never presented as the only seat product | JR Kyushu fare guide (https://www.jrkyushu.co.jp/railway/kaitei/index.html) |
| JR West 2026-08 ebook raw fare-table values (e.g. Shin-Osaka–Hakata ¥20,850, ¥16,350, ¥15,020 variants) | internally inconsistent AI/OCR parses; column-misread risk (¥14,080 is Tokyo–Hakata base, not Shin-Osaka–Hakata) — **rejected as evidence** | — |
| Sanyo fares via `smart-ex.jp` PDFs | URLs returned 404 in salvage run | — |

All excluded items are **absence of verified data**, never negative claims about service existence.
