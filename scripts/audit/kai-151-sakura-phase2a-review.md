# KAI-151 Phase 2A — Sakura thematic seasonality pilot

Base commit: `a56d7dd41b8773b4c8b59ac22b25e6f508809792`
Checked: 2026-09-02

## Classification summary

- Candidate count: **29**
- Verified seasonal window: **11**
- Verified year-round destination with seasonal peak: **6**
- Insufficient evidence: **11**
- Conflicting/ambiguous: **1**
- Proposed canonical mutations: **14**

## Scope and evidence contract

341 cohort = state unknown + no season/bestMonths + at least one audit likelyProfile; sakura pilot = exact intersection whose likelyProfiles includes sakura. The signal is only a research lead.
Mutate only 14 non-hub records with authoritative month-level evidence; preserve hubs, broad/ambiguous evidence, lexical false positives, and all other cohorts.

The thematic sakura signal is a research lead only. It is not itself evidence. Evidence is admitted only from the destination operator, municipality/prefecture, official tourism body, or national government. Hubs are not assigned a fabricated single experience vector.

## Per-record review

### `arakurayama-sengen-park-yamanashi` — Arakurayama Sengen Park & Chureito Pagoda

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: tags, description
- Classification: **`verified_year_round_with_seasonal_peak`**
- Decision: 24-hour access and spring cherry scenery are official, but no month window; retain unknown numeric fields.
- Evidence authority: Fujiyoshida Tourism Promotion Service, official Fujiyoshida City tourism guide
  - URLs: <https://www.fujiyoshida.net/spot/index.php?p=12>
  - Observation: The page says the view is especially notable during the spring cherry-blossom season, while the landscape changes through spring, summer, autumn, and winter. Opening hours are listed as 24 hours.
- Proposed: `bestSeason='Spring'`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `awa-shrine-tateyama` — Awa Shrine

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: tags, highlights
- Classification: **`verified_seasonal_window`**
- Decision: Official page explicitly says approach trees are in full bloom in early April.
- Evidence authority: Tateyama City Tourist Information Office
  - URLs: <https://tateyamacity.com/en/shrines-temples/awa-shrine/>
  - Observation: “If you have a chance, come visit in early April, when cherry trees along the approach are in full bloom.” The same page lists regular shrine hours of 8:30am–5pm; it does not explicitly state year-round opening.
- Proposed: `bestSeason='Spring'`, `bestMonths=[4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `goryokaku` — Goryokaku (Star Fort)

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: highlights
- Classification: **`verified_year_round_with_seasonal_peak`**
- Decision: Official Hakodate sources document year-round access and late-April-to-mid-May cherry viewing.
- Evidence authority: Hakodate official tourism site, Hakobura
  - URLs: <https://www.hakobura.jp/spots/355>, <https://www.hakobura.jp/features/188>
  - Observation: The official spot page lists park use times for both 4–10月 and 11–3月, supporting continuous year-round park access. It says the fort turns cherry-pink around the May Golden Week period. The official cherry feature states: “五稜郭公園のお花見は、例年4月下旬から5月中旬まで。”
- Proposed: `bestSeason='Spring'`, `bestMonths=[4, 5]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `hirosaki-city` — Hirosaki City

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: tags, description
- Classification: **`verified_seasonal_window`**
- Decision: Official tourism association gives April 10-May 5, but this is a city hub and remains vectorless.
- Evidence authority: Hirosaki Tourism and Convention Association, official tourism body
  - URLs: <https://hirosaki-kanko.or.jp/edit.html?id=cat02_spring_sakura>
  - Observation: The official page states that Hirosaki Park has about 2,600 cherry trees and gives the 2026 Hirosaki Cherry Blossom Festival period as 2026-04-10 through 2026-05-05. The page identifies the venue as Hirosaki Park in Hirosaki City.
- Proposed: `bestSeason='Spring'`, `bestMonths=[4, 5]`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `hitachi-kamine-park` — Hitachi Kamine Park

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: none recorded
- Classification: **`verified_seasonal_window`**
- Decision: Official Ibaraki tourism states about 1,000 trees bloom from early April onwards.
- Evidence authority: Ibaraki official tourism guide
  - URLs: <https://visit.ibarakiguide.jp/en/sightseeing/22371/>
  - Observation: Around 1000 cherry trees bloom in the park from early April onwards.
- Proposed: `bestSeason='Spring'`, `bestMonths=[4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `ichijodani-castle` — Ichijodani Castle (Asakura site)

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: name, description, highlights
- Classification: **`insufficient_evidence`**
- Decision: Official pages show spring/cherry scenery but no defensible month window.
- Evidence authority: Fukui City Cultural Heritage website
  - URLs: <http://fukuisan.jp/tw/asakura/scenery/index.html>
  - Observation: The official seasonal-scenery page has separate Spring, Summer, Autumn, and Winter sections; the spring image labels include Ichijodani scenery and cherry blossoms. No bloom month or peak window is stated.
- Evidence authority: Fukui Prefectural Tourism Federation, official Fukui tourism site
  - URLs: <https://www.fuku-e.com/spot/detail_1002.html>
  - Observation: The official attraction page includes image labels for spring/cherry scenery and states that the archaeological site itself is open for free viewing. No concrete cherry-blossom period is given.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `kagoshima-castle` — Kagoshima Castle

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: highlights
- Classification: **`insufficient_evidence`**
- Decision: Official spring material confirms cherry blossoms but gives no month window.
- Evidence authority: Kagoshima City official tourism information site, Kagoshima Yokanavi
  - URLs: <https://www.kagoshima-yokanavi.jp/article/harunohana2025>, <https://www.kagoshima-yokanavi.jp/spot/20047>
  - Observation: The official spring-flowers feature has a section titled “Pink cherry blossoms and Kagoshima Castle’s Goromon gate” and says visitors can encounter beautiful cherry blossoms at the gate. The castle spot page lists daily illumination from sunset to 22:00, but neither page gives a cherry-blossom month or bounded peak window.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `kagoshima-city` — Kagoshima City

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description
- Classification: **`insufficient_evidence`**
- Decision: Component attractions have different windows; no single hub vector is justified.
- Evidence authority: Kagoshima City official tourism information site, Kagoshima Yokanavi
  - URLs: <https://www.kagoshima-yokanavi.jp/article/harunohana2025>
  - Observation: The city-wide spring feature says cherry blossoms can be enjoyed in Kagoshima City. Its component attractions have different windows: Sengan-en has successive cherry varieties from early February through early April; Yoshino Park has Kawazu cherry blossoms from mid- to late February and Somei Yoshino from mid-March through early April. The Kagoshima Castle section gives no month.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `kakunodate-samurai-district-akita` — Kakunodate Samurai District

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: none recorded
- Classification: **`verified_seasonal_window`**
- Decision: Semboku City states mid-April to early May for Kakunodate weeping cherry blossoms.
- Evidence authority: Semboku City official tourism information / municipal government
  - URLs: <https://www.city.semboku.akita.jp/sightseeing/spot/season>, <https://www.city.semboku.akita.jp/sightseeing/spot/07_buke.html>
  - Observation: Semboku City's seasonal recommendations place Kakunodate weeping cherry blossoms from mid-April to early May. The district page separately documents seasonal opening periods for individual samurai residences; it does not establish year-round access for every facility.
  - Observation: 角館のシダレザクラ（4月中旬～5月上旬）
- Proposed: `bestSeason='Spring'`, `bestMonths=[4, 5]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `kimii-dera-temple` — Kimii-dera Temple

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: none recorded
- Classification: **`verified_seasonal_window`**
- Decision: Temple pages document early blooming plus March-April observations.
- Evidence authority: Kimii-dera Temple official operator
  - URLs: <https://www.kimiidera.com/tree/>, <https://www.kimiidera.com/sakura/?y=2026>, <https://www.kimiidera.com/worship/>
  - Observation: The temple states it has about 500 cherry trees and is famous for early-blooming cherry blossoms. Its 2026 official updates record mountain cherry blooming on March 15, the Somei-Yoshino sample tree opening on March 24, full bloom on April 2, and late double-cherry viewing on April 12. Regular worship/reception hours are documented as 08:00–17:00, but no explicit year-round opening claim was used.
  - Observation: 早咲き桜の名所；3月も半ばとなると…
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `kintai-bridge-yamaguchi` — Kintaikyo Wooden Arch Bridge

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: tags
- Classification: **`verified_year_round_with_seasonal_peak`**
- Decision: Official bridge material documents 24-hour crossing, spring scenery, and March/April full-bloom observations.
- Evidence authority: Iwakuni City official Kintaikyo website
  - URLs: <https://kintaikyo.iwakuni-city.net/summary.html>, <https://kintaikyo.iwakuni-city.net/news/?p=1298>, <https://kintaikyo.iwakuni-city.net/news/?p=1887>
  - Observation: The official summary describes cherry blossoms in spring as the bridge's most beautiful season and states the bridge can be crossed 24 hours. Official bloom reports recorded full bloom on March 29, 2013, and April 3, 2014, establishing a March–April seasonal peak while distinguishing it from year-round bridge access.
  - Observation: 春は桜…春は一年で最も美しい季節です；24時間入橋は可能
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `kirishima-kinkowan` — Kirishima-Kinkowan National Park

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`insufficient_evidence`**
- Decision: Sakurajima place-name signal only; official park pages provide no sakura timing.
- Evidence authority: Japan Ministry of the Environment official national park site
  - URLs: <https://www.env.go.jp/park/kirishima/index.html>, <https://www.env.go.jp/nature/nationalparks/list/kirishima-kinkowan/>
  - Observation: The official overview identifies the park's Kirishima volcanic massif, Kinko Bay, and Sakurajima and describes visitor areas and activities. The retrieved official pages do not provide a cherry-blossom bloom window, sakura-specific event period, or month-level seasonal peak. The park name/volcanic Sakurajima reference was not treated as sakura-season evidence.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `kita-city` — Kita City

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`insufficient_evidence`**
- Decision: Evidence concerns component Asukayama Park, not a city-hub window.
- Evidence authority: Kita City official tourism site / Kita City Regional Promotion Department
  - URLs: <https://kanko.city.kita.lg.jp/spot/445-2/>, <https://kanko.city.kita.lg.jp/spot_purpose/sakura>
  - Observation: The official evidence establishes a spring cherry peak for Asukayama Park, a component attraction of the Kita City ward aggregate, including mid-April viewing of later-blooming double cherries. It does not establish a defensible single seasonal window or vector for the entire hub; the hub season-model guard therefore remains in force.
  - Observation: 現在も桜の名所として、毎年春には多くの人が訪れます。…4月中旬には「御衣黄」「福禄寿」などの八重桜も楽しめます。
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `matsumae-castle` — Matsumae Castle

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`verified_seasonal_window`**
- Decision: Matsumae Town gives late-April-to-mid-May and staggered varieties.
- Evidence authority: Matsumae Town official website
  - URLs: <https://www.town.matsumae.hokkaido.jp/iju_teiju/detail/00000599.html>
  - Observation: Matsumae Town states that the cherry festival is held in Matsumae Park surrounding Matsumae Castle from late April to mid-May. The same page documents 250 varieties and more than 10,000 trees, with early-, mid-, and late-blooming varieties extending flowering for more than one month. No year-round castle-access claim was used.
  - Observation: 4月下旬～5月中旬にかけ、松前城周辺に広がる松前公園で開催される「さくらまつり」
- Proposed: `bestSeason='Spring'`, `bestMonths=[4, 5]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `meguro-city` — Meguro City

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`insufficient_evidence`**
- Decision: Municipal pages confirm cherry-lined walks but no month window for the ward hub.
- Evidence authority: Meguro City official ward website
  - URLs: <https://www.city.meguro.tokyo.jp/kouhou/bunkasports/areanavi/kawa/index.html>, <https://www.city.meguro.tokyo.jp/kouhou/bunkasports/areanavi/touyoko-line/index.html>
  - Observation: Meguro City identifies cherry-tree-lined walks along the Meguro River and says many flower-viewing visitors arrive during cherry season. The official pages provide no concrete month-level window, and the evidence concerns component river walks rather than the entire Meguro ward hub; no hub vector is proposed.
  - Observation: 桜の季節には、多くの花見客が訪れる；桜並木が続きます。
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `nago-city` — Nago City

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description
- Classification: **`verified_seasonal_window`**
- Decision: Official sources give a late-January festival and late-January-to-mid-February peak; city hub remains vectorless.
- Evidence authority: Nago City Government
  - URLs: <https://www.city.nago.okinawa.jp/about/2018072400152/>
  - Observation: The official annual calendar lists under 1月: 下旬 名護さくら祭り (Nago Cherry Blossom Festival).
- Proposed: `bestSeason='Winter'`, `bestMonths=[1]`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `nokonoshima-island-park` — Nokonoshima Island Park

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`verified_seasonal_window`**
- Decision: Operator record states end of March to early April for named cherry varieties.
- Evidence authority: Nokonoshima Island Park official operator
  - URLs: <https://nokonoshima.com/en/flowers/sakura>, <https://nokonoshima.com/flowers/sakura>
  - Observation: The official flower record identifies Somei Yoshino and Oshima cherry and states End of Mar - Early Apr / 3月末～4月初旬.
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `odawara-castle` — Odawara Castle

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description
- Classification: **`verified_seasonal_window`**
- Decision: Official flower calendar documents cherry varieties from February through April.
- Evidence authority: Odawara Castle Park official site
  - URLs: <https://odawaracastle.com/castlepark/>
  - Observation: The official annual flower calendar lists 桜 as 2～4月, including 河津桜 2月上旬～3月上旬, ソメイヨシノ 3月下旬〜4月中旬, 大島桜 4月上旬, and 枝垂れ桜 3月下旬～4月上旬.
- Proposed: `bestSeason='Spring & Winter'`, `bestMonths=[2, 3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 8}`
- Mutation applied/allowed: **True**

### `okazaki-castle` — Okazaki Castle

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`verified_seasonal_window`**
- Decision: Official tourism authority gives March 25-April 5 and about 800 Somei Yoshino trees.
- Evidence authority: Okazaki City Tourism Association, official Okazaki tourism site
  - URLs: <https://okazaki-kanko.jp/okazaki-park/program/670>, <https://okazaki-kanko.jp/feature/sakuramaturi/top>
  - Observation: The official 2026 listing gives the 桜まつり period as 2026年3月25日（水）～4月5日（日） and describes approximately 800 Somei Yoshino cherry trees around Okazaki Castle Park.
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `sakurai-futamigaura-itoshima` — Sakurai Futamigaura

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: name, nameJa
- Classification: **`insufficient_evidence`**
- Decision: Official page gives June-solstice sunset/beach evidence, not cherry timing; lexical Sakurai match rejected.
- Evidence authority: Fukuoka Prefecture Tourism Association, official Visit Fukuoka site
  - URLs: <https://www.crossroadfukuoka.jp/spot/12456>
  - Observation: The official destination page states that around the summer solstice the sunset falls between Couples Rock: 6月の夏至の頃に夫婦岩の間に沈む夕日は神秘的. It also specifies 夏至の夕陽：2026年6月21日（日）前後.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `sakurajima-volcano-kagoshima` — Sakurajima Stratovolcano

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: name, nameJa, highlights
- Classification: **`insufficient_evidence`**
- Decision: Sakurajima place-name signal; official volcano pages provide no cherry timing.
- Evidence authority: Kagoshima City official tourism site
  - URLs: <https://www.kagoshima-yokanavi.jp/spot/10092>
  - Observation: The official page reports that all tourism facilities are operating normally and describes the current volcanic alert/access restrictions; it provides no cherry-blossom or destination seasonal-peak window.
- Evidence authority: Official Sakurajima tourism portal
  - URLs: <https://www.sakurajima.gr.jp/>
  - Observation: The official portal characterizes Sakurajima as an active volcano tourism destination and provides access/activity information, but no concrete seasonal attraction window for the volcano itself.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `sengan-en-garden-kagoshima` — Sengan-en Garden

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: highlights
- Classification: **`verified_year_round_with_seasonal_peak`**
- Decision: Official calendar gives February-early-April sequence and operator states year-round opening.
- Evidence authority: Sengan-en official site, Shimadzu Limited
  - URLs: <https://www.senganen.jp/calendar/>
  - Observation: The official seasonal calendar states: 2月上旬～4月上旬にかけて、カンヒザクラ・ガンタンザクラなど、約150本の桜が次々と咲き誇り、仙巌園が春一色に染まります。
- Evidence authority: Sengan-en official site, Shimadzu Limited
  - URLs: <https://www.senganen.jp/>
  - Observation: The official site lists opening hours as 開園時間 9:00〜17:00 年中無休.
- Proposed: `bestSeason='Spring & Winter'`, `bestMonths=[2, 3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 8}`
- Mutation applied/allowed: **True**

### `serigaya-park` — Serigaya Park

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description
- Classification: **`verified_year_round_with_seasonal_peak`**
- Decision: Machida City and tourism association document year-round opening and March-April observations.
- Evidence authority: Machida City; Machida City Tourism Guide
  - URLs: <https://www.city.machida.tokyo.jp/bunka/park/shisetu/serigaya/park02.html>, <https://machida-guide.or.jp/%E5%B8%82%E5%86%85%E3%81%AE%E3%81%95%E3%81%8F%E3%82%89%E9%96%8B%E8%8A%B1%E7%8A%B6%E6%B3%81%E3%80%80%E8%8A%B9%E3%83%B6%E8%B0%B7%E5%85%AC%E5%9C%92%EF%BC%882026-3-25%EF%BC%89/>, <https://machida-guide.or.jp/%E5%B8%82%E5%86%85%E3%81%AE%E3%81%95%E3%81%8F%E3%82%89%E9%96%8B%E8%8A%B1%E7%8A%B6%E6%B3%81%E3%80%80%E8%8A%B9%E3%83%B6%E8%B0%B7%E5%85%AC%E5%9C%92%EF%BC%882026-4-5%EF%BC%89/>
  - Observation: Machida City page updated 2026-09-01 states the park is open every day year-round (年中無休).
  - Observation: Machida Tourism Guide report dated 2026-03-25: Somei Yoshino at the south-gate cherry tunnel was three-to-five-tenths in bloom; other park areas ranged from three-tenths to nearly seven-tenths.
  - Observation: Machida Tourism Guide report dated 2026-04-06 for the 2026-04-05 observation: south-gate cherries were beginning to fall but were still beautifully in bloom.
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `shiroyama-park-tateyama` — Shiroyama Park (Tateyama)

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: highlights
- Classification: **`verified_year_round_with_seasonal_peak`**
- Decision: Tateyama sources document daily/24-hour access and March-April viewing.
- Evidence authority: Tateyama City Tourist Information Office; Tateyama City Tourism Association
  - URLs: <https://tateyamacity.com/en/attractions/>, <https://tateyamacity.com/en/attractions/shiroyama-park/>, <https://tateyamacity.com/events-haru>, <https://tateyamacity.com/archives/33209>
  - Observation: Official Tateyama attractions page: 'In the early April, the park is bustled with locals and tourists for cherry blossom viewing.'
  - Observation: Official Shiroyama Park page states 'Hours 24 hours' and 'Closed open daily.'
  - Observation: Official spring-events page records '3月～4月 城山公園 桜見頃' (Shiroyama Park cherry blossoms at their best, March-April).
  - Observation: Official 2026 report dated 2026-03-20 states that the cherry-blossom opening declaration was made on March 19.
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `tama-forest-science-garden` — Tama Forest Science Garden

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: none recorded
- Classification: **`conflicting_ambiguous`**
- Decision: Official Japanese and English pages give different cherry start ranges; do not guess.
- Evidence authority: Forestry and Forest Products Research Institute, Tama Forest Science Garden
  - URLs: <https://www.ffpri.go.jp/tmk/cherry/cherry.html>, <https://www.ffpri.go.jp/tmk/en/visit/pasport-ticket.html>, <https://www.ffpri.go.jp/tmk/visit/passport.html>, <https://www.ffpri.go.jp/tmk/cherry/bloom/bloom_main.html>, <https://www.ffpri.go.jp/tmk/en/visit/about-admissions.html>
  - Observation: Japanese official cherry page published 2026-04-01: varieties peak sequentially from late February through late April (2月下旬から4月下旬にかけて順次見頃).
  - Observation: English official passport page states cherry trees blossom successively from the second half of March through the end of April.
  - Observation: Japanese official passport page states successive blooming from the latter half of March through the end of April (3月後半から4月末).
  - Observation: Official admissions page states the garden is open every day in March and April but closes every Monday during much of the rest of the year and during December 26-January 6.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `tokorozawa-city` — Tokorozawa City

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description, highlights
- Classification: **`insufficient_evidence`**
- Decision: Official municipal site gives no city-wide cherry window; hub remains unresolved.
- Evidence authority: Tokorozawa City official site
  - URLs: <https://www.city.tokorozawa.saitama.jp/>
  - Observation: The official municipal landing page was checked for a city-wide cherry timing statement; none was admitted.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `tsuyama-castle` — Tsuyama Castle

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: highlights
- Classification: **`verified_seasonal_window`**
- Decision: Official flowering page gives late March to early April for Tsuyama Castle.
- Evidence authority: Tsuyama Tourism Association official site
  - URLs: <https://www.tsuyamakan.jp/floweringinformation>
  - Observation: The official flowering page lists Tsuyama Castle/Kakuzan Park with the usual viewing period late March to early April (例年の見頃：3月下旬〜4月上旬).
- Proposed: `bestSeason='Spring'`, `bestMonths=[3, 4]`, `seasonVector={'spring': 10, 'summer': 6, 'autumn': 5, 'winter': 4}`
- Mutation applied/allowed: **True**

### `yoshino-kumano` — Yoshino-Kumano National Park

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: none recorded
- Classification: **`insufficient_evidence`**
- Decision: Broad national-park profile gives no unified month window.
- Evidence authority: Japan Ministry of the Environment
  - URLs: <https://www.env.go.jp/park/yoshino/index.html>, <https://www.env.go.jp/park/yoshino/point/index.html>
  - Observation: The official park profile describes a very broad national park spanning mountain, river, and coastal regions across Mie, Nara, and Wakayama.
  - Observation: The official page calls Yoshinoyama's cherry forest famous as '花の吉野' but provides no concrete cherry-blossom month window.
  - Observation: No unified year-round operating statement or destination-wide seasonal window was verified for the full national-park record.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**

### `yoyogi-park` — Yoyogi Park

- Current: `bestSeason=None`, `bestMonths=None`, `season=None`, `seasonMetadata.method='unknown'`
- Audit signal fields: description
- Classification: **`insufficient_evidence`**
- Decision: Official operator confirms cherry season but supplies no month window.
- Evidence authority: Tokyo Metropolitan Park Association
  - URLs: <https://www.tokyo-park.or.jp/park/yoyogi/index.html>, <https://www.tokyo-park.or.jp/park/yoyogi/news/2026/park_info_67.html>
  - Observation: The official operator's 2026 notice is specifically addressed to hanami/cherry-blossom visitors, but no concrete blossom window was verified in the retrieved page content.
  - Observation: The official Yoyogi Park main page was located but returned an empty response during direct retrieval; no authoritative month-specific seasonal statement was admitted.
- Proposed: `bestSeason=None`, `bestMonths=None`, `seasonVector=None`
- Mutation applied/allowed: **False**
