# KAI-57 Existing Tohoku Catalogue Audit

Date: 2026-08-11
Branch: `data/kai-57-tohoku-expansion`
Base: `6636adb6` (origin/main, after #129)

## Scope

Every pre-existing Tohoku record (prefectures: Aomori, Iwate, Miyagi, Akita,
Yamagata, Fukushima) in `src/shared/data/destinations-index.json`, audited —
not just records this expansion will touch. 48 records total.

## Method

1. Enumerated all records with `prefecture ∈ {Aomori, Iwate, Miyagi, Akita,
   Yamagata, Fukushima}` from the catalogue index (48 records).
2. Structural audit: role, kind, municipalityId, parent/gateway/featured/nearby/
   related relationships, collections, transportOptions, provenance
   (`editorial.sources` / `checkedAt`), image metadata, coordinates,
   recommendedVisitHours — per record.
3. Ran the fast validation profile (`validate-all --profile fast`) and extracted
   every Tohoku-targeted finding (baseline: 0 errors / 445 warnings repo-wide).
4. Deep factual verification of each record against authoritative sources is
   running in parallel (one scout per prefecture) and is merged into this
   document. Cells marked `[pending]` await scout evidence.

## Summary

| Measure | Count |
|---|---|
| Total Tohoku records | 48 |
| Hubs | 11 |
| POIs (role=poi) | 10 |
| Standalone | 19 |
| Roleless (legacy) | 8 |
| status=beta | 33 |
| status=verified | 15 |
| Records with NO provenance (no sources / no checkedAt) | 41 |
| Records with no openingHours or openingHoursMetadata | 48 |
| Records with no imageMetadata | 34 |
| Municipality containment errors (known or suspected) | 15 |
| Coordinate errors (believed off-target) | 3–4 |
| Kind/semantic errors | 3–4 |

## Audit table

Columns: id | prefecture | municipality (claimed) | kind | parent | gateway |
status | factual issues | relationship issues | source issues | image issues |
transport issues | action

| id | pref | municipality | kind | parent | gateway | status | factual issues | relationship issues | source issues | image issues | transport issues | action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| abukuma-cave-fukushima | Fukushima | — | — | — | aizuwakamatsu-city | correct | Cave is in Tamura city (田村市), near Koriyama — NOT Aizu region. `[pending]` | Gateway to Aizuwakamatsu is wrong region; correct gateway is koriyama-city (same prefecture). municipalityId missing. | No sources/checkedAt | No imageMetadata | train:180 plausible; no fares | Fix gateway → koriyama-city; add muni Fukushima:tamura; add provenance |
| aizuwakamatsu-city | Fukushima | Fukushima:aizuwakamatsu | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions (120/120/120/150) | Add provenance; review transport template |
| akita-city | Akita | Akita:akita | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| akiu-onsen-miyagi | Miyagi | Miyagi:sendai | — | sendai-city | — | clean | Akiu Onsen is in Taihaku-ku, Sendai — containment correct. | OK | No sources/checkedAt | No imageMetadata | bus:60/train:80 plausible | Keep; optionally add provenance |
| aoba-castle-museum | Miyagi | Miyagi:sendai | museum | sendai-city | — | verify | JA highlights mismatch (validator EXPANDED_POI_LOCALIZED_CATEGORY_MISMATCH). `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 4.0 | train:28 local — plausible | Fix JA highlights |
| aomori-city | Aomori | Aomori:aomori | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| dakigaeri-valley-akita | Akita | Akita:akita | — | akita-city | — | correct | Believed in Senboku city (near Kakunodate), NOT Akita city. `[pending]` | Possible CROSS_MUNICIPALITY_PARENT (Akita:akita vs semboku hub) | No sources/checkedAt | No imageMetadata | shinkansen:170 / car:30 | Verify municipality; fix parent if wrong |
| dewa-sanzan-yamagata | Yamagata | Yamagata:yamagata | — | yamagata-city | — | correct | Dewa Sanzan (Haguro/Gassan/Yudono) is in Tsuruoka city / Shonai — NOT Yamagata city; multi-municipality pilgrimage. `[pending]` | standalone with wrong parent (containment false) | No sources/checkedAt | No imageMetadata | train:180 only | Remove parent; standalone + gateway (yamagata-city); add muni/UNESCO-adjacent care |
| fukushima-city | Fukushima | Fukushima:fukushima | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| geibikei-gorge-iwate | Iwate | — | — | — | morioka-city | verify | In Ichinoseki city (一関市); municipalityId missing. `[pending]` | Gateway morioka-city forced by same-prefecture rule; Geibikei is ~110 km from Morioka and closer to Sendai — note for KAI-66 | No sources/checkedAt | No imageMetadata | train:120/car:110 plausible from Morioka | Add muni Iwate:ichinoseki; keep gateway (only legal same-pref hub) |
| ginzan-onsen-yamagata | Yamagata | — | — | — | yamagata-city | verify | In Obanazawa city (尾花沢市); municipalityId missing. `[pending]` | Gateway yamagata-city plausible (~40 km) | No sources/checkedAt | No imageMetadata | train:180 | Add muni Yamagata:obanazawa |
| goshikinuma-ponds-fukushima | Fukushima | Fukushima:aizuwakamatsu | — | aizuwakamatsu-city | — | correct | In Kitashiobara village (北塩原村, Urabandai) — NOT Aizuwakamatsu city. `[pending]` | CROSS_MUNICIPALITY_PARENT (claims aizuwakamatsu muni) | No sources/checkedAt | No imageMetadata | shinkansen:90/bus:40 | Fix muni → Fukushima:kitashiobara; standalone + gateway aizuwakamatsu-city |
| hachinohe-city | Aomori | Aomori:hachinohe | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| hiraizumi-chusonji-iwate | Iwate | — | — | — | morioka-city | verify | In Hiraizumi town (西磐井郡平泉町); municipalityId missing. UNESCO 2011 — correct. `[pending]` | Gateway morioka-city forced; Hiraizumi accessed via Ichinoseki (closer to Sendai) — note for KAI-66. Collection pilgrimage-routes-japan questionable (Pure Land site, not a pilgrimage route) | No sources/checkedAt | Commons CC-BY-SA / PD | train:45/bus:50/car:60 | Add muni Iwate:hiraizumi; review pilgrimage collection; verify gateway |
| hirosaki-castle | Aomori | Aomori:hirosaki | — | hirosaki-city | — | clean | Hirosaki Castle in Hirosaki city — correct. One of the 12 original surviving castles — correct. `[pending]` | OK | No sources/checkedAt | No imageMetadata | shinkansen:230 etc. origin semantics unclear | Keep; optionally add provenance |
| hirosaki-city | Aomori | Aomori:hirosaki | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| jodogahama-beach-iwate | Iwate | — | — | — | morioka-city | correct | In Miyako city (宮古市). Coordinates (39.369, 141.9672) believed ~21 km south of the beach (~39.558, 141.978). `[pending]` | municipalityId missing; gateway morioka-city forced | No sources/checkedAt | No imageMetadata | train:160/car:180 plausible from Morioka | Fix coords; add muni Iwate:miyako |
| jozenji-dori | Miyagi | Miyagi:sendai | temple | sendai-city | — | correct | kind=temple is WRONG — Jozenji-dori is Sendai's zelkova-lined boulevard (定禅寺通), a street. Validator: FREE_FORM_PLACE_HAS_TICKET_BUDGET + EXPANDED_POI_RAIN_CONTRADICTION. `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 4.0 | train:26 local | Fix kind (street), ticket budget, rain fields |
| kakunodate-samurai-district-akita | Akita | Akita:semboku | — | semboku-city | — | clean | Kakunodate in Senboku city — correct. `[pending]` | OK | No sources/checkedAt | No imageMetadata | train:180 | Keep; optionally add provenance |
| koriyama-city | Fukushima | Fukushima:koriyama | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| lake-tazawa-akita | Akita | — | — | — | akita-city | correct | Lake Tazawa is entirely in Senboku city — gateway to Akita city is wrong hub choice. `[pending]` | Should be parent semboku-city (same-municipality hub exists) or at minimum gateway semboku-city | No sources/checkedAt | No imageMetadata | shinkansen:170/bus:20 | Fix relationship → semboku-city; add muni Akita:semboku |
| lake-towada-aomori | Aomori | Aomori:aomori | — | aomori-city | — | correct | Lake Towada is in Towada city (Aomori side) / Kazuno city (Akita) — NOT Aomori city; multi-municipality. `[pending]` | CROSS_MUNICIPALITY_PARENT (claims aomori muni) | No sources/checkedAt | No imageMetadata | bus:180/car:160 | Fix muni (Aomori:towada or unset for multi-muni); remove parent; gateway or standalone |
| matsushima-bay | Miyagi | Miyagi:sendai | — | sendai-city | — | correct | Matsushima Bay is in Matsushima town (宮城郡松島町) — NOT Sendai city. Nihon Sankei member — correct. `[pending]` | CROSS_MUNICIPALITY_PARENT (claims Miyagi:sendai muni) | No sources/checkedAt | No imageMetadata | train:240 (origin unclear) | Fix muni → Miyagi:matsushima; needs Matsushima cluster hub (Phase 3) or gateway semantics |
| morioka-city | Iwate | Iwate:morioka | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| mount-bandai-fukushima | Fukushima | Fukushima:aizuwakamatsu | — | aizuwakamatsu-city | — | correct | Mt Bandai is in Kitashiobara village / Inawashiro town — NOT Aizuwakamatsu city. `[pending]` | CROSS_MUNICIPALITY_PARENT (claims aizuwakamatsu muni) | No sources/checkedAt | No imageMetadata | shinkansen:90/car:50 | Fix muni; standalone + gateway aizuwakamatsu-city (natural access) |
| mount-zao-yamagata | Yamagata | Yamagata:yamagata | — | yamagata-city | — | correct | Mt Zao straddles Yamagata (Zao town, Kaminoyama) and Miyagi (Kawasaki); summit ropeway in Zao town — NOT Yamagata city. `[pending]` | standalone with parent in wrong muni | No sources/checkedAt | No imageMetadata | shinkansen:80/bus:50 | Fix muni (Yamagata:zao) / role; document cross-prefecture nature |
| nebuta-museum-wa-rasse-aomori | Aomori | Aomori:aomori | — | aomori-city | — | correct | Coordinates (40.5448, 140.7297) believed ~31 km off — Wa Rasse is in Aomori city (~40.8269, 140.7444). kind missing (museum). `[pending]` | OK | No sources/checkedAt | No imageMetadata | shinkansen:180/train:200 | Fix coords; add kind |
| nyuto-onsen-akita | Akita | Akita:semboku | onsen | semboku-city | — | clean | Nyuto Onsen in Senboku city — correct. `[pending]` | OK | No sources/checkedAt | No imageMetadata | shinkansen:170/bus:50 | Keep |
| oirase-gorge-aomori | Aomori | — | — | — | aomori-city | correct | Oirase stream in Towada city — municipalityId missing. `[pending]` | Gateway choice: hachinohe-city hub is closer than aomori-city; verify best access hub | No sources/checkedAt | No imageMetadata | train:180 | Add muni Aomori:towada; verify gateway |
| okama-crater-yamagata | Yamagata | Yamagata:yamagata | — | yamagata-city | — | correct | Okama crater sits on the Yamagata–Miyagi border (~38.1227, 140.4354) — NOT Yamagata city. `[pending]` | Same issue as mount-zao | No sources/checkedAt | No imageMetadata | shinkansen:80/car:60 | Fix muni; align with mount-zao treatment |
| osaki-hachimangu | Miyagi | Miyagi:sendai | shrine | sendai-city | — | clean | Osaki Hachiman Shrine in Sendai — correct. `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 3.0 | train:26 local | Keep |
| ouchi-juku-fukushima | Fukushima | Fukushima:shimogo | — | — | aizuwakamatsu-city | clean | Ouchi-juku in Shimogo town (Minamiaizu) — muni correct; gateway plausible. `[pending]` | OK | No sources/checkedAt | No imageMetadata | shinkansen:80 | Keep; optionally add provenance |
| rakuten-mobile-park-miyagi | Miyagi | Miyagi:sendai | park | sendai-city | — | verify | Baseball stadium — kind=park misleading (no stadium kind exists). Validator: ticket-budget + rain contradiction. `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 4.0 | train:25 local | Fix kind/category semantics + warnings |
| ryusendo-cave-iwate | Iwate | Iwate:morioka | — | morioka-city | — | correct | In Iwaizumi town (下閉伊郡岩泉町), ~90 km NE of Morioka. Coordinates (39.7389, 141.7972) believed ~20 km off true cave (~39.9389, 141.9520). `[pending]` | CROSS_MUNICIPALITY_PARENT (claims Iwate:morioka) | No sources/checkedAt | No imageMetadata | train:160/car:170 | Fix muni → Iwate:iwaizumi; standalone + gateway morioka-city; fix coords |
| sannai-maruyama-jomon-aomori | Aomori | Aomori:aomori | — | aomori-city | — | clean | Jomon site in Aomori city — correct. UNESCO (Jomon Prehistoric Sites, 2021) — correct. `[pending]` | OK | No sources/checkedAt | Commons CC-BY-SA / PD | train:45/bus:50/car:60 | Keep; optionally add provenance |
| semboku-city | Akita | Akita:semboku | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| sendai-asaichi-morning-market | Miyagi | Miyagi:sendai | market | sendai-city | — | verify | JA highlights mismatch; FREE_FORM_PLACE_HAS_TICKET_BUDGET (market with ticket allowance). `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 4.0 | train:32 local | Fix content/warnings |
| sendai-castle-ruins-miyagi | Miyagi | Miyagi:sendai | — | sendai-city | — | verify | Coordinates (38.2525, 140.8626) ~0.7 km east of Aoba Castle ruins (~38.2522, 140.856) — verify target. `[pending]` | OK | No sources/checkedAt | No imageMetadata | shinkansen:90/train:90 | Verify/fix coords; add provenance |
| sendai-city | Miyagi | Miyagi:sendai | — | hub | — | verify | kind missing (should be city). Core Designated City — correct. `[pending]` | OK | No sources/checkedAt | Commons CC-BY-SA / PD | train:30 local | Add kind=city |
| sendai-city-museum | Miyagi | Miyagi:sendai | museum | sendai-city | — | clean | OK `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 4.0 | train:32 local | Keep |
| sendai-mediatheque | Miyagi | Miyagi:sendai | museum | sendai-city | — | verify | kind/category mismatch + rain contradiction (validator). `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY 2.0 | train:32 local | Fix category/rain warnings |
| sendai-umino-mori-aquarium | Miyagi | Miyagi:sendai | aquarium | sendai-city | — | verify | kind/category mismatch + JA highlights (validator). `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY-SA 4.0 | train:29 local | Fix category/JA content |
| shirakami-sanchi-aomori | Aomori | Aomori:hirosaki | — | hirosaki-city | — | correct | Multi-municipality World Heritage (Ajigasawa/Fukaura/Nishimeya Aomori + Fujisato Akita) — NOT contained in Hirosaki city. UNESCO — correct. `[pending]` | standalone with parent in wrong muni | No sources/checkedAt | Commons CC-BY-SA / PD | train:45/bus:50/car:60 | Remove parent; standalone + gateway hirosaki-city; fix muni |
| tsuruga-castle-fukushima | Fukushima | Fukushima:aizuwakamatsu | — | aizuwakamatsu-city | — | clean | Tsuruga Castle in Aizuwakamatsu — correct. `[pending]` | OK | No sources/checkedAt | No imageMetadata | shinkansen:80/train:30 | Keep; optionally add provenance |
| yamadera-yamagata | Yamagata | Yamagata:yamagata | — | yamagata-city | — | clean | Yamadera (Risshaku-ji) within Yamagata city — containment correct. `[pending]` | OK (role standalone + parent is odd but legal) | No sources/checkedAt | No imageMetadata | shinkansen:80/train:40 | Keep; optionally normalize role |
| yamagata-city | Yamagata | Yamagata:yamagata | city | hub | — | verify | Hub; no content provenance. | OK | No sources/checkedAt | No imageMetadata | Template transportOptions | Add provenance; review transport template |
| zao-fox-village-miyagi | Miyagi | Miyagi:shiroishi | — | — | sendai-city | verify | Zao Fox Village in Shiroishi city — muni correct. `[pending]` | Gateway sendai-city ~1.5 h — plausibility check | No sources/checkedAt | No imageMetadata | shinkansen:40/car:60 | Verify gateway; optionally add provenance |
| zuihoden | Miyagi | Miyagi:sendai | museum | sendai-city | — | verify | kind/category mismatch (validator). `[pending]` | OK | 2 sources, checkedAt 2026-07-29 | Commons CC BY 2.5 | train:29 local | Fix category warning |

## Systemic findings

1. **Containment errors (15):** legacy records claim municipalityIds of major
   cities to satisfy the parent validator while physically lying in other
   municipalities (matsushima-bay, ryusendo-cave, lake-tazawa, lake-towada,
   goshikinuma, mount-bandai, dewa-sanzan, mount-zao/okama, shirakami-sanchi,
   nebuta-museum coords, dakigaeri `[pending]`). All must be corrected with
   authoritative addresses; several become gateway-accessed standalones.
2. **No provenance (41/48):** no `editorial.sources`, no `checkedAt`. Every
   corrected or retained record needs a source ledger row.
3. **No operational data (48/48):** no openingHours, no openingHoursMetadata,
   no admission/reservation claims anywhere in Tohoku. Phases 7/13 will add
   defensible values for new records; legacy records keep "no claims" unless
   corrected.
4. **Template transportOptions on all 11 hubs** (train/car/shinkansen/bus =
   120/120/120/150 min) and several POIs (shinkansen 80–90 for far Fukushima
   sites look like Koriyama-arrival times, i.e. incoherent origin semantics).
   Transport semantics are a KAI-66/12 concern; KAI-57 only fixes clearly false
   claims with evidence and otherwise documents the gap.
5. **Generic kind/role gaps:** sendai-city lacks kind; nebuta-museum lacks
   kind; jozenji-dori has wrong kind (temple); rakuten-mobile-park kind=park
   for a stadium.
6. **Coordinate errors (3–4):** ryusendo-cave (~20 km), jodogahama (~21 km),
   nebuta-museum-wa-rasse (~31 km), sendai-castle-ruins (~0.7 km) — all to be
   verified against official addresses.

## Merge status

Scout deep-fact verification (one per prefecture) in progress; cells marked
`[pending]` will be resolved with source URLs in the final version of this
document before Phase 3 starts.
