# Non-UNESCO Collection Integrity Audit

- **Audit date:** 2026-08-12 (all URLs verified live on this date unless noted)
- **Scope:** every collection in `src/shared/data/collections-index.json` **except `unesco-japan`**.
  **`unesco-japan` was explicitly excluded** — its membership, metadata, descriptions, sources,
  achievement logic and UNESCO-specific audit work are handled separately (KAI-53, PR #142). No
  file or record in this audit touches `unesco-japan`, and no `unesco-japan` member decision was
  made here.
- **Method:** each collection was defined from primary Japanese sources first (ministry / agency /
  designation body / official operator / municipal government), then every current Meguruto member
  was verified against that definition, then missing members were enumerated. Current catalogue
  data was never used as evidence of itself. Research was delegated to seven read-only researchers
  by family; this document is the integration of their evidence (research reports preserved in the
  session transcript, `agent://ResFixedSets`, `agent://ResCastles100`, `agent://ResParks`,
  `agent://ResCulture`, `agent://ResThematic1`, `agent://ResThematic2`, `agent://ResCoreCities`).

## Integrity scope: what this audit proves (and what it does not)

This audit, the collections validator (`scripts/validators/collections.ts`), and this document
establish **collection membership integrity** — a _structural_ property: which destinations
belong to which collections; whether declared member counts (`expectedMembers`) match catalogue
membership exactly; whether memberships are duplicate-free and hub/POI-scoped; and whether each
collection's definition (type, `authority`, source) honestly states whether it is an official
set, a historical consensus, or a Meguruto-curated selection.

They do **not** establish **destination-record integrity** — the _factual_ quality of the data
inside each destination record. The collections validator operates only on collection
references, IDs, counts, scoping rules and blacklists. Passing it proves nothing about:

- the factual truth of prose, descriptions, notes, or editorial claims in records;
- the correctness of budgets, travel durations, recommended visit hours, walking estimates, or
  other recommendation fields (the schema supports omitting these, with runtime fallbacks);
- whether current admission prices, opening hours, or service statuses are accurate on any date;
- whether external authoritative counts are correct (重伝建 register, 233 国宝建造物, the 100名城
  numbering). `expectedMembers` matching catalogue membership is an internal-consistency check —
  a wrong-but-internally-consistent value still passes;
- whether two records that appear to be duplicates are physically equivalent. The
  no-duplicate-members rules detect duplicate _memberships_, not duplicate _destinations_.

Factual record data is the scope of the **recommendation-data audit (KAI-84)** — budgets,
durations, prices, hours, prose, `transportOptions` realism, `ratingMetadata.confidence`, and
removal of stale register counts from collection copy. Its remediation priority is: real
verified value → transparent derived value → explicit unknown representation → field omission
where supported → safe neutral fallback only if the architecture requires it. Where this stack
touched record-level fields (nara-park-todaiji note, obi-castle coordinates, park municipalities,
hero images, template budget/walking/season removals), each change is called out explicitly in
the per-collection sections below: those are data corrections made during this audit, not
validator guarantees.

## Key authoritative counts (as of 2026-08-12)

| Framework                       |                                Official count | Source                                |
| ------------------------------- | --------------------------------------------: | ------------------------------------- |
| 現存十二天守 (surviving keeps)  |                                            12 | 松山市公式 / consensus                |
| 日本三景                        |                                             3 | 日本三景観光連絡協議会 nihonsankei.jp |
| 日本三名園                      |                                             3 | JNTO / consensus                      |
| 日本三名瀑                      |                                             3 | consensus (Kegon, Nachi, Fukuroda)    |
| 日本三大仏                      |                        2 fixed + disputed 3rd | encyclopedic consensus                |
| 日本三大神宮 (Engishiki-based)  |                                             3 | historical consensus                  |
| 日本三大桜 (trees)              |                                             3 | National Natural Monuments            |
| 政令指定都市                    |                                            20 | 総務省 soumu.go.jp                    |
| 日本100名城                     |                                           100 | 日本城郭協会 jokaku.jp (2006)         |
| 国立公園                        | **35** (was 34; +日高山脈襟裳十勝 2024-06-25) | 環境省 env.go.jp                      |
| 国定公園                        |   **58** (was 57; +御嶽山国定公園 2026-04-10) | 環境省 env.go.jp                      |
| 国宝建造物                      |                             **233件 (303棟)** | 文化庁 bunka.go.jp 2026-08-01         |
| 重要伝統的建造物群保存地区      |                                   **129地区** | 文化庁 bunka.go.jp 2026-08-01         |
| 日本観光鍾乳洞協会 member caves |                                             9 | shonyudokyokai.com                    |
| 日本三大夜景 / 新三大夜景       |                                         3 / 3 | traditional / 2003 selection          |
| 日本三名泉                      |                                             3 | historical consensus                  |

## Collection-by-collection audit

### A. Fixed historical / consensus sets

| Collection                 | Members before → after | Wrong / proxy removed                                                                                                                                                      | Added / fixed                                                                                                                                                   | Definition & authority                                                                           | Action |
| -------------------------- | ---------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| original-12-castles        |                12 → 12 | none (all 12 correct)                                                                                                                                                      | source attribution corrected                                                                                                                                    | Historical consensus (Edo-period surviving keeps); **not** a Japan Castle Foundation designation | PR A ✓ |
| three-great-views          |                  3 → 3 | none                                                                                                                                                                       | sourceUrl dead → nihonsankei.jp                                                                                                                                 | Hayashi Gaho (1643); 日本三景観光連絡協議会                                                      | PR A ✓ |
| three-great-gardens        |                  1 → 3 | `kanazawa` (city-hub proxy)                                                                                                                                                | +`kenroku-en` (new), +`korakuen-okayama`, +`kairakuen-mito`                                                                                                     | Meiji-era consensus; each a 特別名勝                                                             | PR A ✓ |
| three-great-waterfalls     |                  2 → 3 | none                                                                                                                                                                       | +`nachi-falls-wakayama`                                                                                                                                         | consensus trio (Kegon, Nachi, Fukuroda)                                                          | PR A ✓ |
| three-great-buddhas        |                  3 → 3 | `kamakura-city`, `takaoka` (city-hub proxies)                                                                                                                              | +`kotoku-in-great-buddha`, +`takaoka-daibutsu` (new); description now documents the disputed 3rd seat; dropped false bunka.go.jp claim                          | Nara & Kamakura fixed; 3rd disputed (Takaoka is tourism convention)                              | PR A ✓ |
| three-great-shrines        |                  1 → 3 | `izumo-taisha` (belongs to the 三大神社 set, not 三大神宮)                                                                                                                 | +`ise-grand-shrine`, +`kashima-jingu` (new), +`katori-jingu`; EN/JA aligned to 三大神宮; dropped false 神社本庁 claim                                           | Engishiki-based historical consensus (Ise・Kashima・Katori)                                      | PR A ✓ |
| three-cherry-blossom-spots |                  3 → 3 | `mount-yoshino-nara`, `osaka-castle-park`, `takato-castle-nagano` (none is a 三大桜 tree)                                                                                  | +`miharu-takizakura`, +`jindai-zakura`, +`usuzumi-zakura` (new); renamed EN to "Japan's Three Great Cherry Trees"; dropped unsubstantiated 日本さくらの会 claim | 日本三大桜 = the three National Natural Monument trees (三春滝桜・山高神代桜・根尾谷淡墨桜)      | PR A ✓ |
| core-cities-japan          |                30 → 20 | 10 non-designated: `kumamoto-castle`, `osaka-castle`, `motobu-town`, `nago-city`, `naha-city`, `karatsu-city`, `sasebo-city`, `ibusuki-city`, `nichinan-city`, `hita-city` | renamed EN "Designated Cities of Japan", JA 日本の政令指定都市; sourceUrl → 総務省 指定都市一覧                                                                 | 地方自治法 §252-19, Cabinet Order; exactly 20 cities                                             | PR A ✓ |

### B. Castles — japan-top-castles

- **Definition:** the Japan Castle Foundation's 日本100名城 (announced 2006-02-13; 100 castles,
  official table at https://jokaku.jp/business/great-castles/). 続日本100名城 (2017) is a
  different list and must not be mixed in.
- **Result (implemented in PR #146):** `japan-top-castles` now contains exactly the Japan Castle
  Foundation 2006 日本100名城 — 60 new bilingual castle records, 23 valid pre-existing members
  re-verified, 17 pre-existing records newly affiliated; the 3 invalid members
  (`gifu-gujo-hachiman`, `kairakuen-mito`, `osaka-castle-park`) removed; 3 duplicate destinations
  consolidated (`akita-senshu-park`→`kubota-castle`, `kajo-park`→`yamagata-castle`,
  `tokushima-central-park`→`tokushima-castle`). `expectedMembers` 30 → 100; sourceUrl →
  https://jokaku.jp/business/great-castles/.
- **Deterministic numbering:** every official sortOrder 1–100 is present exactly once; the
  validator pins 100 members + 100 unique positions (error severity). `obi-castle` replaced the
  `obi-castle-town` proxy at #96 with corrected Otemon-gate coordinates.
- **Recommendation-data pass (KAI-84 rubric):** template budget/walking/season/trip-hour fields
  removed from the 60 new records (944 fields); `ratingMetadata` (rubricVersion 2, confidence
  medium/low) added to every member; honest `recommendedVisitHours`; factual fixes (goryokaku
  magistrate-office fee, hizen-nagoya free museum, akashi-castle free turrets, kakegawa/maruoka
  category 国宝→重要文化財, sunpu coordinates).

### C. National & quasi-national parks

- **Definition:** 自然公園法; national parks designated/managed by the Minister of the
  Environment (**35** parks), quasi-national parks (国定公園) designated by the minister and
  managed by prefectures (**58** parks, incl. 御嶽山国定公園, designated 2026-04-10,
  env.go.jp press_03975).
- **Result (implemented in PR #148):** `national-parks-japan` 2 → **35** (34 new park-level
  records + existing `oze-national-park` affiliated, sortOrder 12); `quasi-national-parks-japan`
  0 → **58** (all new, incl. `ontakesan`). Landmark proxies `mount-fuji` and
  `mount-aso-kumamoto` removed from membership (records kept — mount-fuji serves
  `unesco-japan`). Region/zone corrections: ogasawara Okinawa→Kanto, hikone Chubu→Kansai,
  explicit island zones (iriomote-ishigaki→ishigaki, kerama-shoto/koshikijima/iki-tsushima/
  rishiri-rebun-sarobetsu→unknown), island bounds extended in TransportTopologyService,
  municipality fixes on 5 records.
- **Recommendation-data pass (KAI-84 rubric):** template budget/walking/season/trip-hour fields
  removed from the 91 new records; honest per-record `recommendedVisitHours`; real-mode
  `transportOptions` (ferry-only islands: ogasawara {ferry:35760,bus}, iki-tsushima {ferry:150},
  koshikijima {ferry:75}, amami-gunto {ferry:780,flight:120}, yakushima, rishiri {ferry:110},
  sado {ferry:3570,train}, noto-hanto {bus,car}, mikawa-wan {train,ferry});
  `ratingMetadata` confidence medium/low; Okinawa parks satisfy the published-Okinawa runtime
  contract.
- **KAI-84 review-pass corrections (2026-08-12, PR #148):**
  - **Yakushima** — park (designated 2012, 24,566 ha, covering part of the Yakushima and
    Kuchinoerabu islands) separated from the UNESCO World Heritage property (inscribed 1993,
    covering only part of Yakushima Island) in EN + JA description/highlights/notes; the old
    wording "the whole island is a World Heritage national park" removed.
  - **Ogasawara** — park (designated 1972, 6,629 ha) separated from the UNESCO World Heritage
    property "Ogasawara Islands" (inscribed 2011) in EN + JA; the old conflation "national park
    (1972) that is a UNESCO property" removed.
  - **Shiretoko** — full sanitation of the canonical record: categories
    `[World Heritage, Culture, Sightseeing]` → `[World Heritage, Nature, Sightseeing]` (Shiretoko
    is a **natural** WH property); highlights `UNESCO Heritage Monument / Historic Landmark /
Cultural Preservation Area` → drift ice / Five Lakes / brown bears & sea eagles / waterfalls;
    description no longer uses "cultural or natural value" boilerplate; removed invented
    `indoorPercent 35`, `walkingMin 120`, generic `transportOptions {train:45,bus:50,car:60}`,
    `travelEstimate {confidence:high}`, template `weatherDependence`/`walkingIntensity`/
    `businessHours`; `ratingMetadata.confidence` high → medium; reservation/parking rewritten
    honestly (guided Five Lakes access in bear season; Utoro/Rausu parking).
  - **Park-wide contamination scan (all 93 NP/QNP members):** 358 template fields
    (`walkingMin 150`, `indoorPercent`, `weatherDependence`, `walkingIntensity`) removed from
    88 non-Okinawa parks (5 published Okinawa parks keep the required crowd/season/bestMonths/
    walking*/indoorPercent contract); `oze-national-park` generic `transportOptions` +
    `travelEstimate` removed (no defensible train/bus basis). `akiyoshidai` keeps
    `indoorPercent 35` (deliberate — karst plateau + show caves).

### D. Cultural properties

**national-treasures**

- **Definition problem:** JA name 「日本の国宝建造物・史跡」 is a category error — 史跡
  (monuments) can never be 国宝; only 建造物 (buildings) and 美術工芸品 (fine arts) have a 国宝
  tier. Official counts (2026-08-01): 国宝建造物 233件 (303棟); 国宝 total 1,149件.
  `expectedMembers: 220` matches no current count (it approximates the ~2014 国宝建造物 count).
- **Member verdicts (14):** 9 correct; 5 wrong —
  `inuyama-city` (hub; the 国宝 is 犬山城天守 — `inuyama-castle-aichi` record exists),
  `kamakura-city` (hub; the genuine 国宝 is 円覚寺舎利殿 — no record),
  `kinkaku-ji` (**the 1955 reconstruction of Kinkaku-ji is NOT currently designated 国宝**;
  designation was rescinded after the 1950 fire and never re-granted — kunishitei WHS record
  wording, Kyoto City official 国宝 register omission; flagged for a final kunishitei
  confirmation), `matsumoto-city` (hub; the 国宝 is 松本城天守 — `matsumoto-castle-nagano` record
  exists), `ryoan-ji` (龍安寺方丈 is 重要文化財, not 国宝).
- **Final decision (implemented in PR #147):** the `national-treasures` collection is
  **removed** — not redefined as curated. A curated "iconic 国宝 buildings" collection was
  considered and rejected: the collection cannot honestly promise completeness, and the JA name
  conflated 史跡 (which has no 国宝 tier). The collection entry was deleted (25 → 24
  collections), all **14 member memberships dropped**, and **no destination records deleted** —
  former members (ginkaku-ji, hikone-castle-shiga, himeji-castle, horyuji-temple-nara,
  inuyama-city, izumo-taisha, kamakura-city, kinkaku-ji, matsue-castle, matsumoto-city,
  nara-park-todaiji, nijo-castle-kyoto, ninna-ji, ryoan-ji) remain regular destinations.
  The `nara-park-todaiji` notes contamination (copy-pasted "Narita City travel hub" text) was
  corrected in the same PR.

**historic-towns-japan**

- **Definition:** 重要伝統的建造物群保存地区 (重伝建) — municipal preservation districts
  **selected** by the Minister of Education (文化財保護法 §144). Official count: **129 districts
  (43 prefectures, 106 municipalities)** as of 2026-08-01 (not 126, not 131; 松江市美保関 is
  answered for selection and will become #130).
- **Member verdicts (12):** 8 genuine districts (Sawara, Kakunodate, Kawagoe, Kitano, Narai,
  Tsumago, Shirakawa, Takayama); 4 **wrong** (`arima-onsen`, `gifu-magome-juku` — Magome is
  preserved municipally but is NOT nationally selected, `kinosaki-onsen`, `nankinmachi-chinatown`);
  4 of the 8 genuine are **city-hub/town proxies** (kawagoe-city, kitano-ijinkan, shirakawa-village,
  takayama-city) that should be retitled to their official districts (川越市川越, 北野町山本通,
  白川村荻町, 高山市三町).
- **Final decision (implemented in PR #149):** the collection is an explicit **Meguruto-curated
  selection of 11** (`type: curated`, `metadata.authority: curated`, `expectedMembers: 11`) — the
  full register is not collection-worthy for a travel app. #149 owns the final curated semantics
  end-to-end: type, authority, expectedMembers and the durable product copy; #150 does **not**
  rewrite Historic Towns (a draft-era #150 variant that re-embedded "129 districts / 129地区" in
  product copy was removed during the final layering pass — dated register counts live only in
  this audit document, never in user-facing copy). 4 non-重伝建 members removed (`arima-onsen`,
  `gifu-magome-juku`, `kinosaki-onsen`, `nankinmachi-chinatown`); 3 genuine districts added
  (`ouchi-juku-fukushima` #9, `izushi-castle-town` #68, `ine-funaya-boathouses` #64); city-hub
  proxies replaced by district POIs (`kawagoe-city`→`kawagoe-kurazukuri`,
  `takayama-city`→`takayama-sanmachi`); legacy `kurazukuri-warehouse-district` consolidated into
  `kawagoe-kurazukuri`; product copy no longer embeds the mutable register count (the dated
  129-register figure is provenance-only, kept in this document). The stale register-derived
  `expectedMembers 126` was corrected to 11.

### E. Thematic / curated collections

All seven `expectedMembers: 10` thematic collections claim official sources that do **not**
publish a top-10 list. None of the following frameworks certifies 10 members: JARTIC (traffic
info, not scenic routes), JSCE (土木学会 has no scenic-bridge top-10), 日本植物園協会 (member
register of botanical gardens only), 環境省 (滝百選 is 100, not 10; and is 1990 環境庁・林野庁
backed), 日本離島センター (no island top-10), Benesse Art Site Naoshima (covers 3 islands),
japan-caves.jp (unreachable; the real association 日本観光鍾乳洞協会 has 9 member caves),
日本温泉協会 (real domain spa.or.jp; certifies nothing resembling 50), 夜景観光コンベンション・
ビューロー (real; certifies 日本夜景遺産 ~300 spots, 新三大夜景都市, but no list of 20).
**Fix:** use `curated` where no authoritative body defines the exact collection; retain
`official` only where an authoritative body defines the exact set. `caves-japan` is the
exception here: it maps to the Japan Touring Caves Association's exact nine-member list and
remains official. Every curated collection gets an honest sourceUrl, explicit curated wording,
and `expectedMembers` = the actual curated count.

| Collection                 | Members before → after | Wrong / proxy removed                                                                                                                                                                         | Added                                                                                                                                                                                                                 | Authority (honest)                                                                                                       | PR   |
| -------------------------- | ---------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| top-onsen-japan            |                10 → 10 | `hakodate-night-view` (night view, not onsen)                                                                                                                                                 | +`gero-onsen` (record exists, completes 日本三名泉); hakodate-night-view out                                                                                                                                          | curated; sourceUrl → spa.or.jp; expectedMembers 50 → 10                                                                  | #150 |
| great-night-views          |                11 → 14 | none (all 11 verified against 日本夜景遺産 registry / 三大夜景)                                                                                                                               | +`sarakurayama` (new), +`fuefukigawa-fruit-park` (new), +`wakakusayama` (new)                                                                                                                                         | curated; 日本三大夜景 + 新日本三大夜景 + 夜景遺産; expectedMembers 20 → 14                                               | #150 |
| japan-observatories-towers |                17 → 17 | none (all 17 real & operating; Kobe Port Tower reopened 2024, Marine Tower 2022, MIRAI TOWER 2020/2021, Sunshine 60 てんぼうパーク 2023)                                                      | —                                                                                                                                                                                                                     | curated/capped (already honest)                                                                                          | —    |
| caves-japan                |                  5 → 9 | `tokyo-okutama` (nature area; cave is 日原鍾乳洞 — new `nippara` record), `utsunomiya-oya` (quarry, not a limestone cave)                                                                     | +`nippara` (new), +`hida-cave` (new), +`nanatsugama` (new), +`kyusendo` (new), +`shoryu` (new), +`ryusendo-cave-iwate` (record exists)                                                                                | 日本観光鍾乳洞協会 9-member list (official); expectedMembers 10 → 9                                                      | #150 |
| coastal-drives-japan       |                 9 → 10 | `amanohashidate-kyoto`, `tojinbo-cliffs-fukui`, `motonosumi-shrine-yamaguchi` (coastal POIs without registered scenic-route anchors); `noto` → `noto-hanto` repoint                           | +`nichinan-kaigan` (日南海岸きらめきライン, MLIT 風景街道 route 9_1); description no longer claims all members are registered 日本風景街道                                                                            | curated; MLIT 日本風景街道 background; sourceUrl → mlit.go.jp                                                            | #150 |
| scenic-bridges-japan       |                 6 → 10 | `miyajima-itsukushima` (shrine), `miyakojima-city`/`naruto-city` (hubs)                                                                                                                       | +`saru-hashi`, +`meganebashi-bridge-nagasaki` (record exists), +`akashi-kaikyo`, +`seto-ohashi`, +`rainbow-bridge`, +`omishima`                                                                                       | curated; 日本三名橋/三奇橋 + famous bridges; JSCE 選奨土木遺産 as background only                                        | #150 |
| flower-parks-japan         |                 6 → 10 | `furano-city`, `kanazawa` (hubs), `arakurayama-sengen-park-yamanashi` (viewpoint), `osaka-castle` (not a flower park)                                                                         | +`shinjuku-gyo-en`, +`showa-kinen-park`, +`farm-tomita`, +`shikisai-no-oka`, +`nabana-no-sato`, +`jindai-botanical-gardens`; `kawachi-fujien` consolidated into existing `kawachi-wisteria-garden` (gains membership) | curated; 国営公園/国民公園/名花園; EN "state-run parks" 国営公園                                                         | #150 |
| waterfalls-gorges-japan    |                 8 → 10 | `takachiho-town` (hub → real POI `takachiho-gorge` record exists)                                                                                                                             | +`shomyo-falls`, +`shiraito-falls`                                                                                                                                                                                    | curated; 滝百選 (1990) + 日本三大峡谷                                                                                    | #150 |
| islands-japan              |                12 → 12 | `ise-grand-shrine` (mainland shrine), `sakurajima-volcano-kagoshima` (not an island since 1914); proxies `ishigaki-city`, `miyakojima-city`, `yakushima-town` resolved via island POI records | +`taketomi-island`, +`shodoshima`                                                                                                                                                                                     | curated; MLIT 離島振興 background                                                                                        | #150 |
| pilgrimage-routes-japan    |                  7 → 8 | `nokogiriyama` (not a pilgrimage route)                                                                                                                                                       | +`mount-fuji`, +`mount-yoshino`, +`shikoku-henro`, +`saigoku-33`                                                                                                                                                      | curated; 四国遍路・西国三十三所・熊野古道 (main-owned unesco-japan untouched)                                            | #150 |
| art-islands-japan          |                 7 → 10 | `arima-onsen`, `hakodate-night-view`, `kiyotsu-gorge-niigata` (off-theme); `hakone-town` → real POI; de-themed (no longer "cultural")                                                         | +`hakone-open-air-museum`, +`inujima`, +`shodoshima`, +`ogijima`, +`sapporo-art-park`, +`towada-art-center` (record exists), +`kanazawa-21`                                                                           | curated; Benesse (直島・豊島・犬島) + open-air museums; art-islands authority set to curated (generic support from #149) | #150 |

## before/after summary

| Metric                                                         |                            Before |      After (all PRs) |
| -------------------------------------------------------------- | --------------------------------: | -------------------: |
| Collections audited                                            |                                24 |                   24 |
| Collections with truthful metadata/definition                  | 2 (observatories, [unesco-japan]) |                   24 |
| Collections with exact expectedMembers                         |                                 6 |                   24 |
| Wrong members removed                                          |                                 — |                  ~30 |
| Proxy/duplicate members resolved                               |                                 — |                  ~15 |
| New destination records (gross)                                |                                 0 |                  188 |
| Destination deduplications/removals                            |                                 — |                    5 |
| Net destination increase                                       |                                 — |     +183 (800 → 983) |
| Wrong/contaminated member claims corrected in existing records |                                 — | every touched record |

Destination arithmetic (final stack): #145 +6; #146 +60 −3 dedup; #147 +0; #148 +91;
#149 +2 −1 dedup; #150 +29 −1 dedup; #151 +0. Gross new = 188; dedups/removals = 5;
net = +183 (800 → 983).

## Remaining uncertainties (marked for review, not guessed)

1. **Kinkaku-ji 国宝 status** — strong official evidence that the 1955 reconstruction has no
   current 国宝 designation; a direct kunishitei lookup (register_id=102, keyword 鹿苑寺) is
   recommended before finalizing removal (researcher already did the register-based check; the
   Kyoto City register and the 国宝一覧 both omit it).
2. **日本三大仏 3rd seat** — encyclopedically disputed; Takaoka kept as the tourism convention
   with the ambiguity documented in the collection description.
3. **三大神宮** — no authoritative designation exists; the Engishiki-based trio was chosen
   because it matches the collection's own JA name; alternative theories (日本書紀-based,
   Ise-Atsuta-Meiji) are documented.
4. **Quasi-national park EN names** — MOE publishes no English names for 国定公園; Hepburn
   romanizations used, per prefecture/municipal practice.
5. **Park coordinates** — MOE publishes no per-park coordinates; representative visitor-core
   points used, spot-verified against official visitor-center/office addresses where possible.
6. **重伝建 count** — 129 confirmed on both the 2024 list page and the 2026-08-01 counts page;
   the "131 in 2025" figure could not be verified anywhere; 松江市美保関 (答申 2026-05-22) will
   make #130 after 官報公示.
7. **Magome non-selection** — evidenced by absence from the official 129 list plus 中津川市
   municipal-preservation materials; no single official statement "馬籠は重伝建ではない".
8. **Thematic coordinates marked ~ in research** — to be confirmed against official sites
   during record creation.
9. **expectedMembers semantics** — the schema field is "Meguruto catalogue member count", not
   "official entity count". For complete authoritative sets the two can coincide directly,
   e.g.: 日本100名城, national parks, quasi-national parks, and the Japan Touring Caves
   Association's 9 caves. For curated collections, `expectedMembers` means the Meguruto
   catalogue count, not the size of the external framework — `historic-towns-japan` is the
   explicit example: curated 11 from the broader 重伝建 register (the register's 129 districts
   are not the collection's member count).

## Deterministic regression protection

- `scripts/validators/collections.ts` enforces: unique collection IDs, no dangling collection
  references, no duplicate members, no city hubs in blacklisted collections, and the
  Original-12-castles count invariant.
- `EXPECTED_COLLECTION_MEMBER_COUNT_MISMATCH` is now **error severity** and fails
  `validate-collections` / `validate:catalog-fast` immediately (promoted in PR #151;
  `ORIGINAL_12_CASTLES_COUNT_MISMATCH` is error severity too). It is not part of any accepted
  warning baseline.
- `check:catalog-warnings` continues to fingerprint and reject new warning identities for the
  remaining warning-class catalogue findings — a separate mechanism from the collections
  expected-member check; the two are not conflated.
- `check:catalog-sync` verifies generated detail files are current and generation is idempotent.
- `check:catalog-warnings` (per-violation fingerprints) rejects any new warning identity.
- **Deterministic 100名城 numbering (implemented in PR #146):** the validator pins exactly
  100 members and 100 unique official positions 1-100 (error severity).
- Recommended deterministic addition (still open, owner-review backlog): id-level pins for the
  `japan-top-castles` member set is exactly the 100-member official list (id-level), and the
  park collections match the MOE lists, so membership corruption cannot silently return.

## Ordered PR plan (implemented as the final stacked PR series)

1. **PR #145 (data/collections-prA-fixed-sets) — fixed historical/consensus sets + designated
   cities** ✅ — 6 new records (kenroku-en, kashima-jingu, takaoka-daibutsu, miharu-takizakura,
   jindai-zakura, usuzumi-zakura); membership/definition fixes; core-cities narrowed to 20;
   stacked-branch CI triggers; **new-record recommendation-data sanitation** (template
   budget/walking/season fields removed, `ratingMetadata` confidence low, honest
   `recommendedVisitHours`).
2. **PR #146 (data/collections-prB-castles) — japan-top-castles complete** ✅ — exactly 100
   日本100名城 members with official sortOrders 1–100 (error-severity numbering validator);
   60 new records; 3 invalid members + 3 duplicate destinations removed.
3. **PR #147 (data/collections-prC-treasures-removal) — national-treasures collection
   removed** ✅ — collection deleted (25 → 24); 14 memberships dropped; records retained;
   nara-park-todaiji notes decontaminated; 14 detail files re-synced.
4. **PR #148 (data/collections-prD-parks) — national/quasi-national parks 35/58** ✅ — 91 new
   records incl. Ontakesan; Ogasawara→Kanto; island zones/bounds; municipality fixes;
   recommendation-data pass; Yakushima/Ogasawara/Shiretoko UNESCO-vs-park separation; park-wide
   template-field scan (358 fields removed).
5. **PR #149 (data/collections-prE-historic-towns) — curated 重伝建 selection (11)** ✅ — 4
   non-designated removed, 3 genuine districts added; Kawagoe/Takayama district POIs replace
   hubs; `kurazukuri-warehouse-district` consolidated; durable product copy (no mutable register
   count); expectedMembers corrected 126 → 11; **minimal generic
   `CollectionMetadata.authority` `"curated"` support added here** (the `type` union already
   included `curated`).
6. **PR #150 (data/collections-prF-thematic) — thematic/curated collections** ✅ — official only
   where a body defines the exact list (caves = association's 9); everything else curated using
   the authority support from #149; 29 new records; duplicate garden records never created;
   `kawachi-fujien` → `kawachi-wisteria-garden`; factual fixes (akashi-kaikyo span/prices,
   inujima reservation, kiyotsu-gorge hero image, rainbow-bridge hours, arima-onsen notes).
7. **PR #151 (data/collections-prG-integration) — validator/integration/final audit** ✅ —
   expected-member drift + original-12 count promoted to error severity; Takamatsu-basin
   transport grounding (seto-ohashi/omishima/shikoku-henro); DayTripFeasibility evidence scope
   (41 same-zone / 40 public-ground); 13 pre-existing broken hero images replaced on
   changed-set records; .gitignore hygiene; this document reconciled to final repository
   reality (integrity-scope section above).

## Validation status (final head, PR #151)

- `validate-collections`: **0 errors / 0 warnings** (all 24 collections match expectedMembers,
  incl. the promoted error-severity drift rules).
- `validate:catalog-fast`: **0 errors**; `validate-relationships`: 0 errors;
  `validate:images:changed`: 0 errors; `check:catalog-warnings`: **334 = baseline**;
  `check:catalog-sync`: current + idempotent; `check:catalog-ci`: PASSED.
- `tsc -b --noEmit` clean; lint 0 errors; Prettier clean; i18n 549 keys; branding 357 files;
  build OK; `git diff --check` clean.
- Full test suite: **146 files / 1909 passed / 1 skipped** (`--maxWorkers=1`); Playwright E2E
  (PR gate, KAI-85): PASSED.
- Stack: main → #145 → #146 → #147 → #148 → #149 → #150 → #151, linear, each PR mergeable vs
  its parent and vs main; exact-head CI green on all 7 PRs (CI, Catalogue Integrity, Destination
  Checks, Meguruto Data Quality & CI Pipeline, PR Checks incl. E2E, PR Title).
