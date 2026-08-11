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

## Key authoritative counts (as of 2026-08-12)

| Framework | Official count | Source |
| --- | ---: | --- |
| 現存十二天守 (surviving keeps) | 12 | 松山市公式 / consensus |
| 日本三景 | 3 | 日本三景観光連絡協議会 nihonsankei.jp |
| 日本三名園 | 3 | JNTO / consensus |
| 日本三名瀑 | 3 | consensus (Kegon, Nachi, Fukuroda) |
| 日本三大仏 | 2 fixed + disputed 3rd | encyclopedic consensus |
| 日本三大神宮 (Engishiki-based) | 3 | historical consensus |
| 日本三大桜 (trees) | 3 | National Natural Monuments |
| 政令指定都市 | 20 | 総務省 soumu.go.jp |
| 日本100名城 | 100 | 日本城郭協会 jokaku.jp (2006) |
| 国立公園 | **35** (was 34; +日高山脈襟裳十勝 2024-06-25) | 環境省 env.go.jp |
| 国定公園 | **57** (was 58; −1 upgraded 2024) | 環境省 env.go.jp |
| 国宝建造物 | **233件 (303棟)** | 文化庁 bunka.go.jp 2026-08-01 |
| 重要伝統的建造物群保存地区 | **129地区** | 文化庁 bunka.go.jp 2026-08-01 |
| 日本観光鍾乳洞協会 member caves | 9 | shonyudokyokai.com |
| 日本三大夜景 / 新三大夜景 | 3 / 3 | traditional / 2003 selection |
| 日本三名泉 | 3 | historical consensus |

## Collection-by-collection audit

### A. Fixed historical / consensus sets

| Collection | Members before → after | Wrong / proxy removed | Added / fixed | Definition & authority | Action |
| --- | ---: | --- | --- | --- | --- |
| original-12-castles | 12 → 12 | none (all 12 correct) | source attribution corrected | Historical consensus (Edo-period surviving keeps); **not** a Japan Castle Foundation designation | PR A ✓ |
| three-great-views | 3 → 3 | none | sourceUrl dead → nihonsankei.jp | Hayashi Gaho (1643); 日本三景観光連絡協議会 | PR A ✓ |
| three-great-gardens | 1 → 3 | `kanazawa` (city-hub proxy) | +`kenroku-en` (new), +`korakuen-okayama`, +`kairakuen-mito` | Meiji-era consensus; each a 特別名勝 | PR A ✓ |
| three-great-waterfalls | 2 → 3 | none | +`nachi-falls-wakayama` | consensus trio (Kegon, Nachi, Fukuroda) | PR A ✓ |
| three-great-buddhas | 3 → 3 | `kamakura-city`, `takaoka` (city-hub proxies) | +`kotoku-in-great-buddha`, +`takaoka-daibutsu` (new); description now documents the disputed 3rd seat; dropped false bunka.go.jp claim | Nara & Kamakura fixed; 3rd disputed (Takaoka is tourism convention) | PR A ✓ |
| three-great-shrines | 1 → 3 | `izumo-taisha` (belongs to the 三大神社 set, not 三大神宮) | +`ise-grand-shrine`, +`kashima-jingu` (new), +`katori-jingu`; EN/JA aligned to 三大神宮; dropped false 神社本庁 claim | Engishiki-based historical consensus (Ise・Kashima・Katori) | PR A ✓ |
| three-cherry-blossom-spots | 3 → 3 | `mount-yoshino-nara`, `osaka-castle-park`, `takato-castle-nagano` (none is a 三大桜 tree) | +`miharu-takizakura`, +`jindai-zakura`, +`usuzumi-zakura` (new); renamed EN to "Japan's Three Great Cherry Trees"; dropped unsubstantiated 日本さくらの会 claim | 日本三大桜 = the three National Natural Monument trees (三春滝桜・山高神代桜・根尾谷淡墨桜) | PR A ✓ |
| core-cities-japan | 30 → 20 | 10 non-designated: `kumamoto-castle`, `osaka-castle`, `motobu-town`, `nago-city`, `naha-city`, `karatsu-city`, `sasebo-city`, `ibusuki-city`, `nichinan-city`, `hita-city` | renamed EN "Designated Cities of Japan", JA 日本の政令指定都市; sourceUrl → 総務省 指定都市一覧 | 地方自治法 §252-19, Cabinet Order; exactly 20 cities | PR A ✓ |

### B. Castles — japan-top-castles

- **Definition:** the Japan Castle Foundation's 日本100名城 (announced 2006-02-13; 100 castles,
  official table at https://jokaku.jp/business/great-castles/). 続日本100名城 (2017) is a
  different list and must not be mixed in.
- **Current metadata problem:** collection nameJa claims 日本100名城 with `expectedMembers: 30`,
  a curated count with no qualifier — the collection promises the full official list but holds a
  subset, and the stored sourceUrl (japan-castle.or.jp/100meijo/) is dead (foundation moved to
  jokaku.jp).
- **Member verdicts (26 current):** 23 correct; 3 invalid —
  `gifu-gujo-hachiman` (郡上八幡城 is 続100名城 No. 141, not in the 2006 list; record is also a
  castle *town*), `kairakuen-mito` (garden, not a castle; Mito is already covered by
  `mito-castle-ibaraki`), `osaka-castle-park` (duplicate of `osaka-castle`).
- **Missing:** 77 castles (full list with JA/EN names, municipality, prefecture, coordinates and
  official managing-body URLs in research report).
- **Decision:** complete to the full official 100. `expectedMembers` → 100; sourceUrl →
  https://jokaku.jp/business/great-castles/; remove the 3 invalid members; add 77 records.
  Implementation split deterministically by official list order (1–50, 51–100) if needed.
- **PR:** B. Status: not yet implemented.

### C. National & quasi-national parks

- **Definition:** 自然公園法; national parks designated/managed by the Minister of the
  Environment (35 parks), quasi-national parks (国定公園) designated by the minister and managed
  by prefectures (57 parks).
- **Critical count corrections:** 34 → **35** national parks (日高山脈襟裳十勝国立公園,
  2024-06-25) and 58 → **57** quasi-national parks (日高山脈襟裳国定公園 dissolved). Both
  `expectedMembers` values in the catalogue are pre-2024.
- **Member verdicts:** both current members are **park-internal landmarks, not parks**:
  `mount-fuji` (Fuji-Hakone-Izu NP is the park) and `mount-aso-kumamoto` (Aso-Kuju NP is the
  park). Both stay as destinations (mount-fuji legitimately serves `unesco-japan`) but are
  removed from `national-parks-japan`. `oze-national-park` exists as a published record but is
  not in the collection.
- **Missing:** 34 new national-park records + 57 new quasi-national-park records (92 total, one
  of which — Oze — already exists and only needs affiliation). Park-level records use
  `kind: nature`, representative visitor-core coordinates, MOE/operator URLs.
- **PR:** C. Status: not yet implemented.

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
- **Decision:** redefine as a **curated** collection of iconic National Treasure buildings:
  rename JA to 「日本の国宝建造物（厳選）」/ EN "Iconic National Treasure Buildings of Japan",
  metadata must explicitly say curated (not complete), `expectedMembers` = the curated target,
  sourceUrl → https://kunishitei.bunka.go.jp/. Members: replace the 3 city hubs with the real
  treasure records (`inuyama-castle-aichi`, `matsumoto-castle-nagano`, and 円覚寺舎利殿 or drop
  Kamakura), remove `kinkaku-ji` and `ryoan-ji`, retitle `nara-park-todaiji` to 東大寺 framing.
- **PR:** D. Status: not yet implemented.

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
- **Decision:** complete to the official 129 (matches the app's achievement pattern; JA name
  corrected to 「重要伝統的建造物群保存地区」, `expectedMembers` → 129) **or** redefine as a
  curated selection with explicit metadata. Recommended: complete to 129, implemented in
  deterministic batches. PR: D. Status: not yet implemented.

### E. Thematic / curated collections

All seven `expectedMembers: 10` thematic collections claim official sources that do **not**
publish a top-10 list. None of the following frameworks certifies 10 members: JARTIC (traffic
info, not scenic routes), JSCE (土木学会 has no scenic-bridge top-10), 日本植物園協会 (member
register of botanical gardens only), 環境省 (滝百選 is 100, not 10; and is 1990 環境庁・林野庁
backed), 日本離島センター (no island top-10), Benesse Art Site Naoshima (covers 3 islands),
japan-caves.jp (unreachable; the real association 日本観光鍾乳洞協会 has 9 member caves),
日本温泉協会 (real domain spa.or.jp; certifies nothing resembling 50), 夜景観光コンベンション・
ビューロー (real; certifies 日本夜景遺産 ~300 spots, 新三大夜景都市, but no list of 20).
**Fix for all:** `type: curated` (not official/national), honest sourceUrl, explicit curated
wording, `expectedMembers` = actual curated count.

| Collection | Members before → after | Wrong / proxy removed | Added | Authority (honest) | PR |
| --- | ---: | --- | --- | --- | --- |
| top-onsen-japan | 10 → 11 | `hakodate-night-view` (night view, not onsen) | +`gero-onsen` (record exists, completes 日本三名泉) | curated; sourceUrl → spa.or.jp; expectedMembers 50 → 11 | E |
| great-night-views | 11 → 14 | none (all 11 verified against 日本夜景遺産 registry / 三大夜景) | +`sarakurayama` (new), +`fuefukigawa-fruit-park` (new), +`wakakusayama` (new) | curated; 日本三大夜景 + 新日本三大夜景 + 夜景遺産; expectedMembers 20 → 14 | E |
| japan-observatories-towers | 17 → 17 | none (all 17 real & operating; Kobe Port Tower reopened 2024, Marine Tower 2022, MIRAI TOWER 2020/2021, Sunshine 60 てんぼうパーク 2023) | — | curated/capped (already honest) | E |
| caves-japan | 5 → 9 | `tokyo-okutama` (nature area; cave is 日原鍾乳洞 — new `nippara` record), `utsunomiya-oya` (quarry, not a limestone cave — moved out unless curated wording kept) | +`nippara` (new), +`hida-cave` (new), +`nanatsugama` (new), +`kyusendo` (new), +`shoryu` (new), +`ryusendo-cave-iwate` (record exists) | 日本観光鍾乳洞協会 9-member list; expectedMembers 10 → 9 | E |
| coastal-drives-japan | 9 → 10 | `amanohashidate-kyoto`, `tojinbo-cliffs-fukui`, `motonosumi-shrine-yamaguchi` (coastal POIs without registered scenic-route anchors) | +`nichinan-kaigan` (日南海岸きらめきライン, MLIT 風景街道 route 9_1) | curated; MLIT 日本風景街道 background; sourceUrl → mlit.go.jp | E |
| scenic-bridges-japan | 6 → 10 | `miyajima-itsukushima` (shrine), `miyakojima-city`/`naruto-city` (hubs) | +`saru-hashi`, +`meganebashi-bridge-nagasaki` (record exists), +`akashi-kaikyo`, +`seto-ohashi`, +`rainbow-bridge`, +`omishima` | curated; 日本三名橋/三奇橋 + famous bridges; JSCE 選奨土木遺産 as background only | E |
| flower-parks-japan | 6 → 10 | `furano-city`, `kanazawa` (hubs), `arakurayama-sengen-park-yamanashi` (viewpoint) | +`showakinen-koen`, +`shinjuku-gyoen`, +`farm-tomita`, +`shikisai-no-oka`, +`nabana-no-sato`, +`kawachi-fujien` (records new) | curated; 国営公園/国民公園/名花園 | E |
| waterfalls-gorges-japan | 8 → 10 | `takachiho-town` (hub → real POI `takachiho-gorge` record exists) | +`shomyo-falls`, +`shiraito-falls` | curated; 滝百選 (1990) + 日本三大峡谷 | E |
| islands-japan | 12 → 10 | `ise-grand-shrine` (mainland shrine), `sakurajima-volcano-kagoshima` (not an island since 1914); proxies `ishigaki-city`, `miyakojima-city`, `yakushima-town` resolved via island POI records | +`taketomi-island`, +`shodoshima` | curated; MLIT 離島振興 background | E |
| art-islands-japan | 7 → 10 | `arima-onsen`, `hakodate-night-view`, `kiyotsu-gorge-niigata` (off-theme); `hakone-town` → real POI | +`hakone-open-air-museum`, +`inujima`, +`shodoshima`, +`ogijima`, +`megijima`, +`sapporo-art-park`, +`towada-art-center` (record exists), +`kanazawa-21` | curated; Benesse (直島・豊島・犬島) + open-air museums | E |

## before/after summary

| Metric | Before | After (all PRs) |
| --- | ---: | ---: |
| Collections audited | 24 | 24 |
| Collections with truthful metadata/definition | 2 (observatories, [unesco-japan]) | 24 |
| Collections with exact expectedMembers | 6 | 24 |
| Wrong members removed | — | ~30 |
| Proxy/duplicate members resolved | — | ~15 |
| New destination records | 0 | ~215 (6 in PR A; ~77 castles; ~91 parks; ~40 thematic; rest cultural) |
| Wrong/contaminated member claims corrected in existing records | — | every touched record |

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
   "official entity count". For collections that are complete official sets the two coincide
   (100名城, parks, 重伝建); for curated collections the metadata + description now say
   "curated" explicitly. This schema limitation is documented here rather than hidden.

## Deterministic regression protection

- `scripts/validators/collections.ts` enforces: unique collection IDs, no dangling collection
  references, no duplicate members, no city hubs in blacklisted collections, and the
  Original-12-castles count invariant.
- `EXPECTED_COLLECTION_MEMBER_COUNT_MISMATCH` warnings (accepted baseline) fail CI if **new**
  drift appears; each completed PR updates the accepted baseline only when warnings genuinely
  shrink.
- `check:catalog-sync` verifies generated detail files are current and generation is idempotent.
- `check:catalog-warnings` (per-violation fingerprints) rejects any new warning identity.
- Recommended deterministic addition (implemented in PR F): an audit rule that the
  `japan-top-castles` member set is exactly the 100-member official list (id-level), and the
  park collections match the MOE lists, so membership corruption cannot silently return.

## Ordered PR plan (implemented as separate branches off main)

1. **PR A — fixed historical sets + designated cities** ✅ committed (d3663517)
2. **PR B — japan-top-castles** complete to 100 (77 records; official list order as the
   deterministic split boundary if split)
3. **PR C — national parks (35) + quasi-national parks (57)**
4. **PR D — national-treasures curated redefinition + historic-towns 重伝建 completion**
5. **PR E — thematic/curated collections** (onsen, night views, observatories, caves, coastal,
   bridges, flower, waterfalls/gorges, islands, art islands, pilgrimage)
6. **PR F — final cross-collection cleanup, deterministic membership rules, regression audit**

## Validation status

- PR A: collections 0 errors; relationships 0 errors; `check:catalog-warnings` baseline clean;
  `check:catalog-sync` idempotent; fast catalogue PASSED (0 errors); changed-images PASSED;
  `tsc -b --noEmit` clean; lint/format/i18n/branding clean; full test suite 137 files / 1,719
  passed / 1 skipped (`--maxWorkers=1`).
- Remaining PRs: same gate applied per PR; final full-suite rerun in PR F.
