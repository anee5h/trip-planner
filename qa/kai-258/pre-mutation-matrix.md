# KAI-258 pre-mutation evidence, identity, and relationship matrix

**Captured:** 2026-08-31  
**Canonical baseline:** `85ef67400d3952c57f772b7bfcf3701e91452451` (`origin/main`)  
**Canonical input:** `src/shared/data/destinations-index.json` (1,057 records)

## Method

Before changing destination data, the canonical index was searched across IDs, EN/JA names, aliases, tags, descriptions, localized content, and relationship fields. The duplicate sweep also normalized candidate names and aliases against the full catalogue. Existing broad park, town, and regional records are not treated as equivalent POIs merely because they mention a candidate in prose.

`npx tsx --tsconfig tsconfig.app.json scripts/audit-kai-257-top-sights-integrity.ts --json` reported **zero active relationship defects** at this baseline. The KAI-257 review ledger contains only pre-existing ambiguous standalone records (`chubu-sangaku` under Matsumoto and `matsushiro-castle` under Nagano City); neither is changed by this stack.

## Baseline depth

| Prefecture | Records | Hub / POI / standalone | Existing named hub child counts                                     |
| ---------- | ------: | ---------------------- | ------------------------------------------------------------------- |
| Nagano     |      20 | 4 / 1 / 15             | Nagano City 0; Karuizawa Town 0; Hakuba Village 0; Matsumoto City 2 |
| Gunma      |      10 | 2 / 0 / 8              | Kusatsu Town 1; Minakami Town 0                                     |
| Combined   |      30 | 6 / 1 / 23             | see per-PR reports                                                  |

`npm run audit:destination-depth` independently classified Nagano as 20 records / 10 municipalities and Gunma as 10 records / 7 municipalities. Its generic numeric score is advisory only: it still identified Nagano City, Karuizawa Town, Hakuba Village, and Minakami Town as zero-child shell hubs, and Kusatsu Town as a one-child near-shell hub.

## Nagano P0: evidence-backed implementation disposition (PR 1)

All P0 records below lack a canonical equivalent. An **ADD** means a first-class POI/hub is warranted, not that a new shell is being used to inflate a count.

| Candidate and canonical identity                                              | Alias / current-catalogue evidence                                         | Disposition | Relationship decision                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| Zenko-ji Temple / 善光寺                                                      | Mentioned only in `nagano-city` legacy description; no POI or alias record | ADD         | `poi` child of `nagano-city` (`Nagano:nagano`)                                                           |
| Jigokudani Monkey Park / 地獄谷野猿公苑                                       | Mentioned only by broad `joshinetsu-kogen` national-park record            | ADD         | Independent `standalone` in `Nagano:yamanouchi`; the national park is not a substitute                   |
| Togakushi Shrine / 戸隠神社                                                   | No equivalent record                                                       | ADD         | `poi` child of `nagano-city` (`Nagano:nagano`)                                                           |
| Kumoba Pond / 雲場池                                                          | No equivalent record                                                       | ADD         | `poi` child of `karuizawa-town` (`Nagano:karuizawa`)                                                     |
| Kyu-Karuizawa Ginza / 旧軽井沢銀座                                            | Mentioned only in `karuizawa-town` description                             | ADD         | `poi` child of `karuizawa-town` (`Nagano:karuizawa`)                                                     |
| Harunire Terrace / ハルニレテラス                                             | No equivalent record                                                       | ADD         | `poi` child of `karuizawa-town` (`Nagano:karuizawa`)                                                     |
| Happo Pond / 八方池                                                           | No equivalent record                                                       | ADD         | `poi` child of `hakuba-village` (`Nagano:hakuba`)                                                        |
| Hakuba Iwatake Mountain Resort (Mountain Harbor) / 白馬岩岳マウンテンリゾート | No equivalent record                                                       | ADD         | `poi` child of `hakuba-village` (`Nagano:hakuba`)                                                        |
| Tsugaike Nature Park / 栂池自然園                                             | No equivalent record                                                       | ADD         | `standalone` in `Nagano:otari`; it is not physically in Hakuba Village                                   |
| Daio Wasabi Farm / 大王わさび農場                                             | No equivalent record                                                       | ADD         | `standalone` in `Nagano:azumino`; no existing municipal hub is fabricated                                |
| Senjojiki Cirque / 千畳敷カール                                               | Mentioned only in `chuo-alps` quasi-national-park record                   | ADD         | `standalone` in `Nagano:komagane`; the broad park does not replace the independently discoverable cirque |
| Suwa Taisha (Four Shrines) / 諏訪大社                                         | Mentioned only in broad `nagano-suwa` record                               | ADD         | Multi-site `standalone`; no single municipality or parent is guessed for the four-shrine pilgrimage      |
| Obuse Town / 小布施町                                                         | No equivalent record                                                       | ADD         | New `hub` in `Nagano:obuse`; its P1 POIs are intentionally evaluated in PR 3                             |

### Nagano P0 primary evidence

| Candidate                      | Current authoritative evidence used for identity/status                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Zenko-ji Temple                | [Zenkoji official site](https://www.zenkoji.jp/)                                                                                           |
| Jigokudani Monkey Park         | [Jigokudani Yaen-koen official site](https://en.jigokudani-yaenkoen.co.jp/)                                                                |
| Togakushi Shrine               | [Togakushi Shrine official site](https://www.togakushi-jinja.jp/)                                                                          |
| Kumoba Pond                    | [Karuizawa Tourist Association listing](https://karuizawa-kankokyokai.jp/spot/23234/)                                                      |
| Kyu-Karuizawa Ginza            | [Karuizawa Tourist Association search listing](https://karuizawa-kankokyokai.jp/?s=%E6%97%A7%E8%BB%BD%E4%BA%95%E6%B2%A2%E9%8A%80%E5%BA%A7) |
| Harunire Terrace               | [Karuizawa Hoshino Area official page](https://www.hoshino-area.jp/harunireterrace/)                                                       |
| Happo Pond                     | [Happo-one official hiking guide](https://www.happo-one.jp/en/trekking/)                                                                   |
| Hakuba Iwatake Mountain Resort | [operator official site](https://iwatake-mountain-resort.com/)                                                                             |
| Tsugaike Nature Park           | [Hakuba Tsugaike Mountain Resort official site](https://www.tsugaike.gr.jp/)                                                               |
| Daio Wasabi Farm               | [Daio Wasabi Farm official site](https://www.daiowasabi.co.jp/)                                                                            |
| Senjojiki Cirque               | [Central Alps Komagatake Ropeway official site](https://www.chuo-alps.com/en/)                                                             |
| Suwa Taisha                    | [Suwa Taisha official site](https://suwataisha.or.jp/)                                                                                     |
| Obuse Town                     | [Obuse Town official tourism portal](https://www.town.obuse.nagano.jp/sightseeing/)                                                        |

No coordinates, local transport costs/times, admission values, opening-status claims, or seasonality vectors are introduced unless a later record field has its own cited authoritative evidence. Canonical image files are selected independently from Wikimedia Commons with explicit page URL, attribution, and license metadata; an image is not used as geographic evidence.

### Nagano P0 hub coverage planned from the baseline

| Hub            | Before | PR 1 planned valid child POIs                      | After if all source/validation gates pass |
| -------------- | -----: | -------------------------------------------------- | ----------------------------------------: |
| Nagano City    |      0 | Zenko-ji; Togakushi Shrine                         |                                         2 |
| Karuizawa Town |      0 | Kumoba Pond; Kyu-Karuizawa Ginza; Harunire Terrace |                                         3 |
| Hakuba Village |      0 | Happo Pond; Hakuba Iwatake Mountain Resort         |                                         2 |
| Obuse Town     |    new | P1 candidates deliberately reserved for PR 3       |                                 0 in PR 1 |

## Gunma P0: current identity matrix (PR 2 research gate)

KAI-177 was read before this matrix. Every candidate below has no canonical equivalent; the listed mention is not a duplicate. Final ADD/ENRICH/DEFER decisions, source citations, and KAI-177 overlap accounting belong to PR 2 before any Gunma mutation.

| Candidate                                     | Current equivalent or description-only mention               | Pre-mutation state |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------ |
| Kusatsu Yubatake / 湯畑                       | Description-only in `gunma-kusatsu-onsen` and `kusatsu-town` | no equivalent POI  |
| Sainokawara Park / 西の河原公園               | Description-only in `gunma-kusatsu-onsen` and `kusatsu-town` | no equivalent POI  |
| Mt. Tanigawa / Ropeway / 谷川岳               | Description-only in `minakami-town`                          | no equivalent POI  |
| Takaragawa Onsen / 宝川温泉                   | none                                                         | no equivalent POI  |
| Lake Haruna / 榛名湖                          | none                                                         | no equivalent POI  |
| Haruna Shrine / 榛名神社                      | none                                                         | no equivalent POI  |
| Lake Okushima / 奥四万湖                      | description-only in `gunma-shima-onsen`                      | no equivalent POI  |
| Fukiware Falls / 吹割の滝                     | none                                                         | no equivalent POI  |
| Usui 3rd Bridge (Megane-bashi) / 碓氷第三橋梁 | none                                                         | no equivalent POI  |
| Shorinzan Darumaji Temple / 少林山達磨寺      | none                                                         | no equivalent POI  |
| Onioshidashi Park / 鬼押出し園                | none                                                         | no equivalent POI  |

### KAI-177 reconciliation before PR 2

Compatible KAI-177 scope to satisfy in PR 2: Tanigawadake, Haruna Shrine, Lake Haruna, Fukiware Falls, Takasaki Daruma-ji, and the Annaka/Usui outing. KAI-177's Maebashi anchors and Kiryu textile-quarter work are not silently added to PR 2; they must either be covered by a later named KAI-258 candidate or be explicitly recorded as out of this stack's scope. Byakue Kannon is a KAI-177-compatible P1 candidate reserved for PR 4.

## Nagano P1: current identity matrix (PR 3 evidence gate)

| Candidate                           | Current equivalent or description-only mention             | Initial disposition                                               |
| ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Former Mikasa Hotel                 | none                                                       | DEFER to PR 3 evidence review                                     |
| Kagami Pond                         | none                                                       | DEFER to PR 3 evidence review                                     |
| Shibu Onsen                         | none                                                       | DEFER to PR 3 evidence review                                     |
| Shiga Kogen                         | description-only in broad `joshinetsu-kogen` national park | DEFER to PR 3 evidence review                                     |
| Nakamachi / Nawate Streets          | none                                                       | DEFER to PR 3 evidence review; avoid adjacent-shell duplication   |
| Utsukushigahara                     | none                                                       | DEFER to PR 3 evidence review                                     |
| Anrakuji Temple                     | none                                                       | DEFER to PR 3 evidence review                                     |
| Kitamuki Kannon                     | description-only in `nagano-bessho-onsen`                  | DEFER to PR 3 evidence review                                     |
| Yanagimachi Street                  | none                                                       | DEFER to PR 3 evidence review                                     |
| Kirigamine Highlands                | none                                                       | DEFER to PR 3 evidence review                                     |
| Yashimagahara Wetland               | none                                                       | DEFER to PR 3 evidence review; assess as part of Kirigamine first |
| Lake Shirakaba                      | none                                                       | DEFER to PR 3 evidence review                                     |
| Star Village Achi                   | none                                                       | DEFER to PR 3 evidence review                                     |
| Hirugami Onsen                      | none                                                       | DEFER to PR 3 evidence review                                     |
| Hokusai Museum                      | none                                                       | DEFER to PR 3 evidence review                                     |
| Gansho-in Temple                    | none                                                       | DEFER to PR 3 evidence review                                     |
| Nezame-no-Toko                      | none                                                       | DEFER to PR 3 evidence review                                     |
| Akasawa Natural Recreational Forest | none                                                       | DEFER to PR 3 evidence review                                     |
| Kiso-Fukushima                      | none                                                       | DEFER to PR 3 evidence review                                     |
| Nozawa Onsen                        | none                                                       | DEFER to PR 3 evidence review                                     |

## Gunma P1: current identity matrix (PR 4 evidence gate)

| Candidate                       | Current equivalent or description-only mention                           | Initial disposition                                                  |
| ------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Netsunoyu                       | description-only in `gunma-kusatsu-onsen`                                | DEFER to PR 4 evidence review; assess as part of Kusatsu Onsen first |
| Doai Station                    | none                                                                     | DEFER to PR 4 evidence review                                        |
| Ikaho Stone Steps               | none                                                                     | DEFER to PR 4 evidence review                                        |
| Kajika Bridge                   | description-only in `gunma-ikaho-onsen`                                  | DEFER to PR 4 evidence review; assess as part of Ikaho first         |
| Lake Shima                      | none                                                                     | DEFER to PR 4 evidence review                                        |
| Byakue Dai-Kannon               | none                                                                     | DEFER to PR 4 evidence review                                        |
| Mt. Myogi                       | none                                                                     | DEFER to PR 4 evidence review                                        |
| Myogi Shrine                    | description-only in broad `myogi-arafune-saku-kogen` quasi-national park | DEFER to PR 4 evidence review                                        |
| Usui Pass Railway Heritage Park | none                                                                     | DEFER to PR 4 evidence review                                        |
| Oigami Onsen                    | none                                                                     | DEFER to PR 4 evidence review                                        |
| Manza Onsen                     | none                                                                     | DEFER to PR 4 evidence review                                        |
| Mt. Akagi                       | none                                                                     | DEFER to PR 4 evidence review                                        |
| Lake Onuma                      | none                                                                     | DEFER to PR 4 evidence review; assess as part of Akagi first         |
| Akagi Shrine                    | none                                                                     | DEFER to PR 4 evidence review                                        |
| Watarase Keikoku Railway        | none                                                                     | DEFER to PR 4 evidence review                                        |

## Pre-mutation integrity decision

No destination data has been changed while preparing this matrix. PR 1 may proceed only with the 13 Nagano P0 **ADD** records and the listed same-municipality parent relationships; it must not turn broad parks into false parents, guess a parent for Suwa Taisha, or add a Tsugaike-to-Hakuba containment edge that conflicts with the municipalities.
