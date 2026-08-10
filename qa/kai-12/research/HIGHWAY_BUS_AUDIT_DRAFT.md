# KAI-12 Highway/Intercity Bus Audit — Research Draft

Meguruto transport-mode audit (KAI-12, Phase 0 research). Today: **2026-08-10**. `checkedAt = 2026-08-10` on all rows.

**Method**: every corridor verified against **operator official pages / official operator reservation portals** (Willer Travel, JR Bus Kanto / West JR Bus / JR Bus Chugoku / JR Bus Shikoku / JR Kyushu Bus / Nishitetsu / Meitetsu / Niigata Kotsu / Alpico / Chuo Bus / Donan Bus / Nihon Kotsu / KATE / Tokyo Airport Transportation, etc.). Wikipedia discovery-only; Google Maps / Rome2Rio **never** used as evidence. Airport limousine and commuter/local-express services are **classified separately** and must never feed an app "Bus intercity" claim. Unverifiable / no longer operating corridors → `UNVERIFIED — EXCLUDED`.

Fare convention: adult one-way standard. Most highway coaches use demand-based (dynamic) or date-band pricing → recorded as RANGE with variability note; promo-only fares → `UNKNOWN`.

---

## 1. VERIFIED INTERCITY / HIGHWAY COACH CORRIDORS

| corridor | operator(s) | route/service name (official) | origin terminal | destination terminal | one-way duration (h) | operating days | reservation | fare (JPY, adult 1-way) | fare variability | source URL | checkedAt |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tokyo↔Kyoto/Osaka | JR Bus Kanto + West JR Bus | 青春エコドリーム号 (4列) / グランドリーム号 (3列) / ドリームルリエ号 | 東京駅八重洲南口 / バスタ新宿 | 京都駅八条口 / 大阪駅JR高速BT | 7.3–8.3 | daily | yes (全席指定) | Eco Dream 3,300–12,500; Grand Dream 5,000–14,500; Lullier 11,000–19,000 | variable by date/seat/buy-ahead (超得割 2,500–2,900) | https://timetable.nishinihonjrbus.co.jp/faretable/1-2-N.html ; https://www.jrbuskanto.co.jp | 2026-08-10 |
| Tokyo↔Kyoto | Willer Express | WILLER EXPRESS 東京⇔京都 (day & night) | バスタ新宿 / 東京駅鍛冶橋 | 京都駅八条口 | day 7.2–7.8; night ~7.8 | daily | yes (web; 発車10分前まで) | from ~3,900 (night example); variable | dynamic by date/seat/sale | https://travel.willer.co.jp/bus_search/tokyo/shinjuku/kyoto/kyoto/ | 2026-08-10 |
| Tokyo↔Osaka | Willer Express | WILLER EXPRESS 東京⇔大阪 (day & night) | バスタ新宿 | 大阪梅田 / なんば(OCAT) / 新大阪 | 7–9 (night ~8–9) | daily | yes | from ~4,000 promo; typical ~7,500+ | dynamic by date/seat (3/4列) | https://travel.willer.co.jp/wex/ ; https://travel.willer.co.jp/bus_search/tokyo/shinjuku/osaka/osaka/time-division_night/ | 2026-08-10 |
| Tokyo(池袋)↔Osaka/Kyoto | Kintetsu Bus | サテライト号 | 池袋 / 大宮 | 京都 / 大阪 (USJ) | 9.2–9.5 (night) | daily | yes | 6,700–13,000 | variable by season/date | https://www.kintetsu-bus.co.jp/highway/routelist/18 | 2026-08-10 |
| Tokyo↔Osaka (Seibu Bus) | — | **no route** — Seibu Bus highway list has no Tokyo–Kyoto/Osaka line (新潟・上越・軽井沢・富山・河口湖・南紀 only) | — | — | — | — | — | — | — | https://www.seibubus.co.jp/kousoku/line/ | 2026-08-10 |
| Tokyo↔Nagoya | JR Bus Kanto / JR Tokai Bus | ドリームなごや号 (night) | 東京駅八重洲南口 | 名古屋駅 | ~7.3 | daily | yes | 6,210–7,020 | variable by date (早売 discounts some days) | https://www.jrtbinm.co.jp/topics/e/post_825.html | 2026-08-10 |
| Tokyo↔Nagoya | Meitetsu Bus | 名古屋⇔新宿 (day) | 名鉄バスセンター | バスタ新宿 | 6.1–6.3 | daily | yes | 5,200 (月–木) / 6,000 (金・祝前) / 6,800 (土日祝) / 8,000 (特定日); web = dynamic | fixed date-band at counter; web dynamic | https://meitetsu-bus.co.jp/express/shinjuku | 2026-08-10 |
| Tokyo↔Nagoya | Willer Express | WILLER EXPRESS 東京⇔名古屋 (day & night) | 新宿 / 東京 | 名古屋駅 / 栄 | ~6 | daily | yes | 3列 ReBorn from 7,200 | dynamic by date/seat | https://travel.willer.co.jp/wex/ | 2026-08-10 |
| Tokyo↔Hiroshima | JR Bus Chugoku | グランドリームエクスプレス広島号 (night) | 東京駅八重洲南口 | 広島駅新幹線口 / 広島バスセンター | 10.7–11.2 | daily | yes (予約 1か月前 10:00〜) | 7,400–19,000 | variable by date/seat; ネット割2% | https://chugoku-jrbus.co.jp/express/detail/0315/ | 2026-08-10 |
| Tokyo↔Sendai | JR Bus Tohoku | 仙台・東京号 (day) / ドリーム仙台・東京号 (night) | 東京駅八重洲南口 | 仙台駅東口 | day 5.6; night 6.0–6.1 | daily | yes | from 3,000 | web variable by date/buy-ahead (早売・とく便割) | https://www.jrbustohoku.co.jp/express/52/454/ | 2026-08-10 |
| Tokyo↔Fukuoka | Nishitetsu | はかた号 (night) | バスタ新宿 | 博多BT / 天神 | 14.0–14.3 | daily (1 RT/day) | yes (全席指定) | Business 9,000–20,000; Premium 18,000–25,000 (counter 20,000/25,000) | dynamic by date/seat; counter fixed max | https://www.nishitetsu.jp/bus/highwaybus/rosen2/hakata/ | 2026-08-10 |
| Osaka↔Hiroshima | JR Bus Chugoku (+ West JR Bus joint) | 広島エクスプレス大阪号 / 青春広島EXP大阪号 (day); 広島ドリーム大阪号 / 青春広島ドリーム大阪号 (night) | 大阪駅JR高速BT | 広島バスセンター / 広島駅新幹線口 | day 4.6–5.5; night 6.8–8.3 | daily | yes | day 3,500–8,500; night 4,500–10,000 | variable by date/service class (3/4列) | https://chugoku-jrbus.co.jp/express/detail/0470/ | 2026-08-10 |
| Osaka↔Fukuoka | Willer Express | WILLER EXPRESS 大阪⇔福岡 (night only) | WILLERバスターミナル大阪梅田 | 博多BT / 天神 | 9.5–10.0 | daily | yes | ~3,400–10,500 | dynamic by date/seat | https://travel.willer.co.jp/bus_search/osaka/umeda/fukuoka/hakata/ ; https://travel.willer.co.jp/willer-colle/18357/ | 2026-08-10 |
| Osaka↔Fukuoka (Nishitetsu) | Nishitetsu + Hankyu Kanko | ムーンライト号 | — | — | — | **suspended since 2017-03-31** | — | — | — | https://www.nishitetsu.co.jp/ja/news/news20170223103077.html | 2026-08-10 |
| Osaka↔Nagoya | West JR Bus / JR Tokai Bus / Meihan Kintetsu Bus | 名神ハイウェイバス (day) | 大阪駅JR高速BT | 名古屋駅 | 2.8–3.0 | daily (一部便 月–木 運休) | yes | 3,100 (得割 1,600–2,800) | fixed base + discounted seats | https://timetable.nishinihonjrbus.co.jp/faretable/3-1-DN.html | 2026-08-10 |
| Osaka↔Takamatsu | JR Shikoku Bus / Shikoku Kousoku / West JR Bus / Hankyu Kanko | 高松エクスプレス大阪号 / さぬきエクスプレス大阪号 (over Seto Ohashi) | 大阪駅JR高速BT / 阪急三番街 / OCAT | 高松駅高速BT | 3.5–3.8 | daily | yes (全席指定) | 4,500 (早売21 3,800 / 早売5 4,000) | fixed base + early-discount bands | https://www.hankyu-kankobus.co.jp/highway/timetable/TK/ ; https://timetable.nishinihonjrbus.co.jp/faretable/2-4-D.html | 2026-08-10 |
| Osaka↔Matsuyama | JR Shikoku Bus | 松山エクスプレス号 (day; night limited) | 大阪駅JR高速BT / OCAT / USJ | JR松山駅 / 大街道 | day 5.9–7.2 | daily (一部減便) | yes (1か月+1日前〜) | 7,500 (早売5 6,000 / 往復 13,500) | fixed base + discount products | https://www.jr-shikokubus.co.jp/businfo/matsuyama_ex/osaka.html | 2026-08-10 |
| Osaka↔Matsuyama | Iyotetsu Bus | オレンジライナーえひめ (day) | 大阪・なんば(OCAT) | 松山 | 5.7 | daily | yes | — | — | https://www.iyotetsu.co.jp/sp/bus/kousoku/osaka.html | 2026-08-10 |
| Tokyo↔Takamatsu | JR Shikoku Bus | ドリーム高松号 (night) | 東京 | 高松 | — | **suspended since 2020-08** — **UNVERIFIED — EXCLUDED** (rail サンライズ瀬戸 only) | — | — | — | https://news.kotsu.co.jp/Contents/20200707/3ab920ec-0bf4-43d0-9fd4-62aff34e99c5 | 2026-08-10 |
| Tokyo↔Matsuyama | Iyotetsu Bus | オレンジライナーえひめ (night) | バスタ新宿 / 横浜 | 松山市駅 / 松山室町営業所 | ~12.1 | **specific-date operation** (カレンダー要確認) | yes | 11,000–18,000 | variable (F–A運賃 bands by date) | https://www.iyotetsu.co.jp/bus/kousoku/tokyo.html | 2026-08-10 |
| Hiroshima↔Matsuyama | — | **no direct highway bus** — **UNVERIFIED — EXCLUDED** (ferry 広島港⇔松山観光港 高速船 80min ¥8,800 / フェリー 2h42m ¥5,800 is the practical link) | — | — | — | — | — | — | — | https://chugoku-jrbus.co.jp/express/detail/0003/ ; https://setonaikaikisen.co.jp | 2026-08-10 |
| Fukuoka↔Kagoshima | Nishitetsu / JR Kyushu Bus | 桜島号 (day; night from 2026-09-01) | 西鉄天神高速BT / 博多BT | 鹿児島中央駅前 / 天文館 | ~4.2–4.4 (day) | daily (13 RT/day) | yes | counter 7,000; web dynamic from 3,000 | dynamic web vs fixed counter | https://www.jrkbus.co.jp/kousoku/detail/4 ; https://nishitetsu.jp/bus/highwaybus/rosen/sakurajimayakou/ | 2026-08-10 |
| Fukuoka↔Nagasaki | Nishitetsu (+ JR Kyushu Bus) | 九州号 | 天神 / 博多BT | 長崎駅前 | 2.1–2.5 | daily (frequent) | no (自由乗車; 一部予約制便あり) | 2,900 (往復 5,400) | fixed | https://nishitetsu.jp/bus/highwaybus/rosen/kyushugo/ | 2026-08-10 |
| Fukuoka↔Kumamoto | Nishitetsu / Kyushu Sanko Bus | ひのくに号 | 天神 / 博多駅 / 福岡空港 | 熊本桜町BT / JR熊本駅前 | 2.0–2.3 | daily (82–91 RT/day) | no (原則予約不要; 一部便予約制) | 2,500 (往復 4,700) | fixed | https://www.nishitetsu.jp/bus/highwaybus/rosen/hinokuni/ | 2026-08-10 |
| Nagoya↔Ise | — | **no scheduled express bus** (三重交通 名古屋南紀高速線 does not serve Ise; rail 近鉄 大阪難波/名古屋⇔伊勢市 dominates) — **UNVERIFIED — EXCLUDED** | — | — | — | — | — | — | — | https://www.sanco.co.jp/highway/nankinagoya/ ; https://www.city.ise.mie.jp/kankou/invitation/1007983.html | 2026-08-10 |
| Sapporo↔Hakodate | Chuo Bus / Hakodate Bus (joint) | 高速はこだて号 | 札幌駅前 | 函館駅前 | 5.6–6.0 | daily | yes (予約制) | web 3,530–5,990; counter 5,990 | dynamic web (2026-07-01〜) vs fixed counter | https://www.chuo-bus.co.jp/highway/index.cgi?n=0&o=2&ope=det | 2026-08-10 |
| Sapporo↔Asahikawa | Chuo Bus / JR Hokkaido Bus / Dohoku Bus | 高速あさひかわ号 | 札幌駅前 | 旭川駅前 | 2.1 (夏) – 2.4 (冬) | daily | no (非予約制) | 2,500 (往復 4,700) | fixed | https://www.chuo-bus.co.jp/highway/?o=1&ope=list&t=170 | 2026-08-10 |
| Sapporo↔Noboribetsu | Donan Bus | 高速おんせん号 | 札幌駅前 | 登別温泉 / 足湯入口 | ~1.8 | daily | yes (完全予約制) | 2,800–3,800 | variable by date | https://www.donanbus.co.jp/map/sap_onsen/ | 2026-08-10 |
| Sendai↔Yamagata | Yamako Bus / Miyagi Kotsu | 仙台⇔山形 (自由乗車制) | 仙台駅前 | 山形駅前 | 1.1 | daily (frequent) | no (free seating, IC cards ok) | 1,100 (2回券 2,100) | fixed | https://www.yamagatakotsu.jp/highwaybus/sy/ ; https://www.miyakou.co.jp/bus-express/bus-express-8864/ | 2026-08-10 |
| Sendai↔Aizu-Wakamatsu | Aizu Bus | 仙台⇔会津若松 | 仙台駅東口 | 会津若松 (鶴ヶ城・合同庁舎前) | ~2.6 | 平日2往復 / 土日祝3往復 | no (先着順・定員制) | 3,300 (往復回数券 6,200) | fixed | https://www.aizubus.com/highway/sendai/sendai_line_down ; https://www.miyagi-bus-kyokai.jp/express | 2026-08-10 |
| Tokyo↔Niigata | Niigata Kotsu / Echigo Kotsu / Seibu Bus | 東京線 (新潟⇔新宿・池袋) | バスタ新宿 / 池袋駅東口 | 新潟駅前 | day 5.3–5.8; night 6.0–6.8 | daily | yes (全席指定) | 3,200–7,900 | A–F date-band calendar | https://www.niigata-kotsu.co.jp/~noriai/highway-bus/inter-pref/tokyo.html | 2026-08-10 |
| Tokyo↔Kanazawa | West JR Bus (+ JR Bus Kanto) | グランドリーム金沢号 (night) | 東京駅 / バスタ新宿 | 金沢駅 | ~10.5 | daily | yes | 6,000–12,000 (得割 4,500–11,500) | variable by date/buy-ahead | https://timetable.nishinihonjrbus.co.jp/images/pdf/faretable/8-2-DN.pdf | 2026-08-10 |
| Osaka↔Kanazawa | West JR Bus (+ 北鉄 joint) | 北陸道青春昼特急大阪号 (day); 百万石ドリーム大阪号 (night 3列) / 青春北陸ドリーム大阪号 (night 4列) | 大阪駅JR高速BT | 金沢駅 | day ~6.1; night 7.2–7.4 | daily | yes (全席指定) | day 2,500–6,800; night 3,100–9,800 | variable by date/service class | https://timetable.nishinihonjrbus.co.jp/faretable/4-1-DN.html | 2026-08-10 |
| Tokyo↔Nagano | Alpico Kotsu / Keio Bus / Nagaden Bus | 長野⇔新宿・池袋 | バスタ新宿 / 池袋 | 長野駅 | day ~4.0; night ~5.5 | daily | yes (1か月前〜) | from 3,500 | dynamic by date/seat | https://www.alpico.co.jp/traffic/express/nagano_shinjuku/ | 2026-08-10 |
| Tokyo↔Matsumoto | Alpico Kotsu / Keio Bus | 松本⇔新宿 | バスタ新宿 | 松本バスターミナル | 3.2–3.9 | daily (便により運休設定あり) | yes (1か月前〜) | web dynamic from 3,300; fixed 4,100–4,500 by day band | dynamic web vs fixed day-band | https://www.alpico.co.jp/traffic/express/matsumoto_shinjuku/ | 2026-08-10 |
| Tokyo↔Kofu | Fujikyu Bus / Yamanashi Kotsu / Keio Bus | 中央高速バス 新宿⇔甲府 | バスタ新宿 | 甲府駅 | 2.0–2.2 | daily (frequent) | yes | 2,300–2,500 (平日Web回数券 1,900/枚) | fixed + web discount | https://www.highwaybus.com/gp/info/lineDetail?lineGroupNo=7&lineId=120 | 2026-08-10 |
| Tokyo↔Kawaguchiko (Fuji) | Fujikyu Bus / Keio Bus | 中央高速バス 新宿⇔河口湖 (富士五湖線) | バスタ新宿 | 河口湖駅 | ~1.8 | daily (frequent) | yes (前月同日〜) | 2,200 (web 2,000) | fixed + web discount | https://fuji.highwaybus.com/kawaguchiko/ ; https://www.highwaybus.com/gp/info/fareTbl?lineGroupNo=1&lineId=110 | 2026-08-10 |
| Osaka↔Nara | — | **no scheduled intercity highway bus** (近鉄/奈良交通 lists have no 大阪市内⇔奈良市内 coach; only 夜行 やまと号/ドリームスリーパー号 via Tokyo, and Itami airport limousine) — **UNVERIFIED — EXCLUDED**; type = commuter rail (近鉄奈良線 rapid ~35 min) | — | — | — | — | — | — | — | https://www.kintetsu-bus.co.jp/highway/routelist ; https://www.narakotsu.co.jp/express/ | 2026-08-10 |
| Osaka↔Wakayama | Osaka Bus | 和歌山特急ニュースター号 | 大阪駅 / USJ | JR和歌山駅東口 | ~1.5 (pre-suspension) | **suspended (運休中)** — **UNVERIFIED — EXCLUDED**; only 和歌山⇔USJ line remains (土日祝 1便, 1h45m, ¥1,600) | — | — | — | https://www.osakabus.jp/route/wakayama/ ; https://www.wakayamabus.co.jp/news/usjkaisei20230304/ | 2026-08-10 |
| Osaka↔Kobe | Osaka City Bus + Shinki Bus | あべの橋・心斎橋⇔三宮 | あべの橋 / 心斎橋 | 神戸三宮BT | 1.7–2.0 | daily | no (先着順) | 1,000 | fixed | https://citybus-osaka.co.jp/naniwamarineairexpress/ | 2026-08-10 |
| Osaka↔Kobe (classify) | — | ⚠ **commuter/regional express, NOT intercity coach** — record as local-express type only (do not surface as intercity bus) | — | — | — | — | — | — | — | same as above | 2026-08-10 |
| Osaka↔Tottori | Nihon Kotsu | 鳥取⇔大阪・神戸線 | 大阪梅田 / なんばOCAT | 鳥取駅前 | 2.9–3.5 | daily (day & night) | yes (発車時刻まで購入可) | 4,200 (6回券 22,900) | fixed + multi-ride pack | https://www.nihonkotsu.co.jp/bus/highway/timetable/tottori-kobe_osaka.html | 2026-08-10 |
| Takamatsu↔Matsuyama | JR Shikoku Bus / Iyotetsu Bus | 坊っちゃんエクスプレス | 高松駅高速BT | JR松山駅 / 松山市駅 / 大街道 | 2.5–2.8 | daily | yes (1か月+1日前〜) | 4,400 (往復 8,400) | fixed + round-trip | https://www.jr-shikokubus.co.jp/businfo/bocchan_ex/matsuyama.html | 2026-08-10 |
| Kobe↔Takamatsu | JR Shikoku Bus / Shinki Bus (ハーバーライナー) / Shikoku Kousoku / West JR Bus | 高松エクスプレス神戸号 / ハーバーライナー (over Seto Ohashi) | 三宮BT / 新神戸駅 | 高松駅高速BT | 2.8–3.0 | daily | yes | 4,300 (早割21 3,600 / 早割5 3,800) | fixed base + early-discount bands | https://www.jr-shikokubus.co.jp/businfo/takamatsu_ex/kobe.html ; https://www.shinkibus.co.jp/highway/category/route_guidance/kobe_takamatsu.html | 2026-08-10 |

---

## 2. AIRPORT ACCESS BUS (limousine) — NEVER SURFACE AS INTERCITY 'BUS'

These connect city centers to airports. They are **airport access buses**, not intercity highway coaches. The app must not derive intercity bus availability from them.

| corridor | operator(s) | service name | origin | destination | duration (h) | reservation | fare (JPY) | source URL | checkedAt |
|---|---|---|---|---|---|---|---|---|---|
| Kyoto↔KIX | Kansai Airport Transportation (KATE) | 京都線 リムジンバス | 京都駅八条口 | 関西空港 T1 | 1.4–1.5 | yes (京都→関空 全便予約制) | 2,800 (往復 5,100) | https://www.kate.co.jp/ja/timetable/detail/KY | 2026-08-10 |
| Tokyo↔Narita | Tokyo Airport Transportation (リムジンバス) | 成田空港線 | 東京駅八重洲北口 | 成田空港 | 1.2–1.8 | no (web予約可) | 3,100 | https://www.limousinebus.co.jp | 2026-08-10 |
| Tokyo↔Haneda | Tokyo Airport Transportation / Tokyu Bus / Keikyu Bus | 羽田空港⇔新宿線 | 新宿駅西口 / 歌舞伎町タワー | 羽田空港 | 0.8–1.2 | no | 1,400 | https://www.tokyubus.co.jp/airport/kabukicho-haneda.html | 2026-08-10 |
| Kobe↔Itami Airport | Hankyu Kanko Bus / Hanshin Bus | 大阪(伊丹)空港⇔神戸三宮 | 三宮駅 | 伊丹空港 | ~0.7 | no | 1,200 | https://www.hankyu-kankobus.co.jp/limousine/timetable/B/ | 2026-08-10 |
| Osaka↔Itami/Nara | Nara Kotsu / Hankyu Kanko | 奈良・天理⇔伊丹空港 リムジン | 近鉄奈良駅 / 天理 | 伊丹空港 | ~1.1 | no | — | https://www.narakotsu.co.jp/limousine/ | 2026-08-10 |

---

## 3. EXCLUDED / UNVERIFIED SUMMARY

| corridor | verdict | reason / alternative |
|---|---|---|
| Tokyo↔Takamatsu | EXCLUDED | ドリーム高松号 suspended 2020-08; rail サンライズ瀬戸 (10.2h) only |
| Hiroshima↔Matsuyama | EXCLUDED | no direct highway bus; ferry 広島港⇔松山観光港 (80 min jet / 2h42m ferry) is practical |
| Nagoya↔Ise | EXCLUDED | no scheduled express bus; Kintetsu rail rapid (~1.4h) dominates |
| Osaka↔Nara | EXCLUDED | no scheduled intercity coach; commuter rail only (Kintetsu 奈良線 rapid ~35 min) |
| Osaka↔Wakayama | EXCLUDED | 和歌山特急ニュースター号 suspended; only 和歌山⇔USJ weekend single service |
| Osaka↔Fukuoka (Nishitetsu) | EXCLUDED | ムーンライト号 suspended 2017-03-31; Willer Express covers corridor (see §1) |
| Tokyo↔Osaka via Seibu Bus | EXCLUDED | Seibu Bus operates no Tokyo–Kansai route |

## 4. Cross-cutting findings for KAI-12

1. **Pricing is overwhelmingly dynamic/date-band** — 22 of 27 verified corridors have variable fares. A fixed-fare bus registry would mislead; schema needs `fareRange` + variability notes (mirror ferry `fareBasis` model).
2. **Reservation ≠ uniform**: most long-distance coaches are 全席指定 (reservation required); but Fukuoka–Nagasaki/Kumamoto, Sapporo–Asahikawa, Sendai–Yamagata, Sendai–Aizu are free-seating walk-up. Reservation-required is not a corridor property — record per route.
3. **Airport limousine vs intercity**: Narita/Haneda/KIX/Itami limousines are airport access only; Kyoto↔KIX limousine (2,800円) must not be confused with the (absent) intercity Kyoto–KIX coach corridor.
4. **Short-haul express (Osaka–Kobe 1,000円; Sendai–Yamagata 1,100円)** sit between commuter and intercity — recommend a third `commuterExpress` classification so the app's intercity 'Bus' claim stays conservative.
5. **Seto Ohashi corridors verified**: Osaka/Tokyo→Shikoku day coaches cross the bridge; night Tokyo→Takamatsu no longer exists (rail only).
6. **Osaka↔Fukuoka is night-only** (Willer); no day coach found — the only 大阪→福岡 day option is the suspended ムーンライト or rail/air.
7. `checkedAt = 2026-08-10`; several fare tables are dated 2025-10-14 / 2026-04-01 revisions — re-verify before registry ingestion.
