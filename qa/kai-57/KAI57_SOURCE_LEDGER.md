# KAI-57 Source Ledger

Date: 2026-08-11
Branch: `data/kai-57-tohoku-expansion`

Every corrected existing record and every new record must have a row.
`checkedAt` is the actual verification date (2026-08-11) — never predated or
future-dated. Implementation file: `scripts/kai-57-tohoku-expansion.ts`
(deterministic; second run produces zero diff) → `scripts/sync-destination-details.ts`.

## Corrections to existing records

| id | new/existing | claim changed | source | source type | checkedAt | implementation | verification notes |
|---|---|---|---|---|---|---|---|
| abukuma-cave-fukushima | existing | gateway aizuwakamatsu-city → koriyama-city; muni Fukushima:tamura; station Kammata | abukumado.com | official | 2026-08-11 | script patch | cave in Tamura City, central Fukushima; NOT Aizu region |
| aizuwakamatsu-city | existing | nameJa → 会津若松市; officialWebsite; provenance | city.aizuwakamatsu.fukushima.jp | government | 2026-08-11 | script patch | official city name |
| fukushima-city | existing | nameJa → 福島市; officialWebsite; provenance | city.fukushima.fukushima.jp | government | 2026-08-11 | script patch | official city name |
| koriyama-city | existing | nameJa → 郡山市; officialWebsite; provenance | city.koriyama.lg.jp | government | 2026-08-11 | script patch | official city name |
| goshikinuma-ponds-fukushima | existing | muni Fukushima:kitashiobara; gateway aizuwakamatsu-city; drop false nearby (abukuma ~90 km); honest hours | urabandai-inf.com | tourism_board | 2026-08-11 | script patch | ponds in Kitashiobara Village, not Aizuwakamatsu |
| mount-bandai-fukushima | existing | muni Fukushima:inawashiro; gateway aizuwakamatsu-city; trailhead Happodai; honest hours | bandaisan.or.jp; JMA Bandai | tourism_board / government | 2026-08-11 | script patch | summit in Inawashiro/Bandai/Kitashiobara, not Aizuwakamatsu |
| tsuruga-castle-fukushima | existing | coords → keep (37.4876,139.9298); hours 08:30–17:00 (last entry 16:30) | tsurugajo.com | official | 2026-08-11 | script patch | record was ~590 m north of keep; hours verified |
| ouchi-juku-fukushima | existing | coords nudged (37.2319,139.8497) | kunishitei.bunka.go.jp/heritage/detail/103/4 | government | 2026-08-11 | script patch | Agency for Cultural Affairs district pin |
| aomori-city | existing | nameJa → 青森市; real notes; officialWebsite; provenance | city.aomori.aomori.jp | government | 2026-08-11 | script patch | official city name |
| hirosaki-city | existing | nameJa → 弘前市; real notes; officialWebsite; provenance | city.hirosaki.aomori.jp | government | 2026-08-11 | script patch | official city name |
| hachinohe-city | existing | real notes; officialWebsite; provenance | city.hachinohe.aomori.jp | government | 2026-08-11 | script patch | boilerplate notes removed |
| hirosaki-castle | existing | keep-closure note (seismic repair since Nov 2025); provenance | aomori-tourism.com/spot/detail_205.html | tourism_board | 2026-08-11 | script patch | operational fact; keep interior closed |
| lake-towada-aomori | existing | multi-municipality: muni/parent removed; gateway hachinohe-city; Oirase outflow fix | towadako.or.jp | tourism_board | 2026-08-11 | script patch | lake in Towada City + Kosaka Town, not Aomori City |
| nebuta-museum-wa-rasse-aomori | existing | coords → (40.8296,140.7358); kind museum; seasonal hours | city.aomori.aomori.jp; nebuta.jp/warasse | government / official | 2026-08-11 | script patch | coords were ~31 km south |
| oirase-gorge-aomori | existing | muni Aomori:towada; gateway hachinohe-city | kunishitei.bunka.go.jp/heritage/detail/401/3081 | government | 2026-08-11 | script patch | gorge wholly in Towada City |
| sannai-maruyama-jomon-aomori | existing | renamed to the site (三内丸山遺跡); real description/hours | sannaimaruyama.pref.aomori.jp | official | 2026-08-11 | script patch | was the 17-site serial property name |
| shirakami-sanchi-aomori | existing | multi-municipality: muni/parent removed; gateway hirosaki-city | rinya.maff.go.jp (Forestry Agency) | government | 2026-08-11 | script patch | WH spans Ajigasawa/Fukaura/Nishimeya + Fujisato |
| akita-city | existing | real notes; officialWebsite; provenance | city.akita.lg.jp | government | 2026-08-11 | script patch | boilerplate notes removed |
| semboku-city | existing | nameJa → 仙北市; officialWebsite; provenance | city.semboku.akita.jp | government | 2026-08-11 | script patch | official city name (仙北 was the old county) |
| dakigaeri-valley-akita | existing | re-parent akita-city → semboku-city; muni Akita:semboku; officialWebsite domain fix; Kaiko Falls highlight; honest hours | city.semboku.akita.jp/sightseeing/spot/05_dakigaeri.html | government | 2026-08-11 | script patch | valley in Senboku City, not Akita City |
| lake-tazawa-akita | existing | gateway akita-city → parent semboku-city; muni Akita:semboku; honest hours | city.semboku.akita.jp/sightseeing/spot/04_tazawako.html | government | 2026-08-11 | script patch | lake entirely in Senboku City |
| kakunodate-samurai-district-akita | existing | officialWebsite fixed; honest hours | city.semboku.akita.jp/sightseeing/spot/07_buke.html | government | 2026-08-11 | script patch | domain was misspelled senboku |
| nyuto-onsen-akita | existing | honest per-inn hours | city.semboku.akita.jp/sightseeing/spot/02.html | government | 2026-08-11 | script patch | day-use hours vary by inn |
| yamagata-city | existing | real notes; officialWebsite; provenance | city.yamagata-yamagata.lg.jp | government | 2026-08-11 | script patch | boilerplate notes removed |
| dewa-sanzan-yamagata | existing | multi-municipality: muni/parent removed; gateway yamagata-city | dewasanzan.jp | official | 2026-08-11 | script patch | Haguro/Gassan in Tsuruoka, Yudono on border |
| ginzan-onsen-yamagata | existing | muni Yamagata:obanazawa added | ginzanonsen.jp | official | 2026-08-11 | script patch | onsen town in Obanazawa City |
| yamadera-yamagata | existing | admission fee ¥300 → ¥500 | yamaderakankou.com / rissyakuji.jp | official | 2026-08-11 | script patch | official Risshakuji fee |
| okama-crater-yamagata | existing | border-location caveat documented | zaoropeway.co.jp; VISIT YAMAGATA | tourism_board | 2026-08-11 | script patch | crater on Yamagata–Miyagi border (undetermined) |
| morioka-city | existing | real notes; officialWebsite; provenance | city.morioka.iwate.jp | government | 2026-08-11 | script patch | boilerplate notes removed |
| geibikei-gorge-iwate | existing | muni Iwate:ichinoseki; fare ¥2,000; seasonal hours; cliff ~100 m | geibikei.co.jp | official | 2026-08-11 | script patch | boat fare changed 2026-04-01 |
| hiraizumi-chusonji-iwate | existing | muni Iwate:hiraizumi; full official name; hours; pilgrimage collection dropped | chusonji.or.jp; online.bunka.go.jp | official / government | 2026-08-11 | script patch | name was truncated; not a pilgrimage route |
| jodogahama-beach-iwate | existing | coords → (39.6523,141.9790); muni Iwate:miyako; Sanriku Fukko NP; fixed website | city.miyako.iwate.jp | government | 2026-08-11 | script patch | coords were ~31 km south; park renamed 2013 |
| ryusendo-cave-iwate | existing | muni Iwate:iwaizumi; illegal parent dropped → gateway morioka-city; coords → (39.8601,141.7971); verified hours/length/access | iwate-ryusendo.jp | official | 2026-08-11 | script patch | cave in Iwaizumi Town; Yamada Line service suspended |
| sendai-city | existing | kind city; real notes; officialWebsite; provenance; unfeatured matsushima-bay | city.sendai.jp | government | 2026-08-11 | script patch | cross-municipality featured removed |
| matsushima-bay | existing | muni Miyagi:matsushima; parent matsushima-town; notes corruption removed (Matsuyama/Ehime); website fixed | town.miyagi-matsushima.lg.jp | government | 2026-08-11 | script patch | bay in Matsushima Town, not Sendai |
| jozenji-dori | existing | kind street (was temple); nameJa 定禅寺通; no ticket allowance; rain fields; categories Culture; budget rebalanced | sentabi.jp (Sendai tourism) | tourism_board | 2026-08-11 | script patch | boulevard, not a temple; JA content was 仙台市 |
| sendai-asaichi-morning-market | existing | nameJa 仙台朝市 (was 仙台駅); coords; real EN/JA; no ticket allowance; categories Food+Market | sendaiasaichi.com | official | 2026-08-11 | script patch | station template contamination incl. JA content |
| rakuten-mobile-park-miyagi | existing | nameJa 楽天モバイルパーク宮城; categories Sports+Nature; rain rating; game-day hours | rakuteneagles.jp/stadium | official | 2026-08-11 | script patch | schema has no stadium kind (documented) |
| akiu-onsen-miyagi | existing | emperor Shomu → Kinmei; honest district hours | akiuonsensyokoukai.com | tourism_board | 2026-08-11 | script patch | legend names the Kinmei era |
| sendai-castle-ruins-miyagi | existing | kind castle; coords → Aoba Castle (38.2522,140.8560); destruction history corrected; honest hours | city.sendai.jp | government | 2026-08-11 | script patch | 1793 earthquake claim was wrong |
| sendai-mediatheque | existing | categories +Museum; verified hours 09:00–22:00 (4th Tue); rain fields; real content | smt.jp | official | 2026-08-11 | script patch | Toyo Ito building, not a template museum |
| sendai-umino-mori-aquarium | existing | category Aquarium (was Museum); real content | uminomori.jp/umino | official | 2026-08-11 | script patch | template contamination |
| zuihoden | existing | categories +Museum; verified hours 09:00–16:30; real content | zuihoden.com | official | 2026-08-11 | script patch | template content replaced |
| aoba-castle-museum | existing | real content; hours metadata | honmarukaikan.com/tenji | official | 2026-08-11 | script patch | template content replaced |
| sendai-city-museum | existing | verified hours 09:00–16:45 (last entry 16:15) | city.sendai.jp/museum | government | 2026-08-11 | script patch | official museum page |

## New records

Rows are appended per cluster batch as records land. Matsushima batch complete.

| id | new/existing | claim changed | source | source type | checkedAt | implementation | verification notes |
|---|---|---|---|---|---|---|---|
| matsushima-town | new hub | — (new town hub, Miyagi:matsushima) | town.miyagi-matsushima.lg.jp; matsumshima-kanko.com | government / tourism_board | 2026-08-11 | script addition | gateway town of Nihon Sankei; town-hall coords |
| zuigan-ji | new | — (National Treasure temple) | zuiganji.or.jp | official | 2026-08-11 | script addition | NT Hondo 1953; ¥1,000; seasonal close times |
| godaido | new | — (islet hall, ICP) | matsumshima-kanko.com | tourism_board | 2026-08-11 | script addition | free; daylight hours |
| kanrantei | new | — (tea pavilion + museum) | town.miyagi-matsushima.lg.jp/page/1140.html | government | 2026-08-11 | script addition | ¥300; 8:30–17:00/16:30 |
| fukuurajima | new | — (island, bridge toll) | town.miyagi-matsushima.lg.jp/page/1578.html | government | 2026-08-11 | script addition | ¥300 bridge; mainland-honshu zone |
| oshima | new | — (sacred island) | matsumshima-kanko.com | tourism_board | 2026-08-11 | script addition | free; mainland-honshu zone |
| entsuin | new | — (mausoleum temple) | entuuin.or.jp | official | 2026-08-11 | script addition | ¥500; 9:00–16:00/15:30 |
| matsushima-bay-cruise | new | — (bay cruise) | matsumshima.or.jp/timesheet | official | 2026-08-11 | script addition | ¥1,500; 50 min; hourly |
| saigyo-modoshi-no-matsu | new | — (viewpoint park) | matsumshima-kanko.com | tourism_board | 2026-08-11 | script addition | free; winter road closure |
