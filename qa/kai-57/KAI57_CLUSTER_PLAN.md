# KAI-57 Tohoku Cluster Plan

Date: 2026-08-11
Branch: `data/kai-57-tohoku-expansion`

## Principles

- A cluster must support an actual trip, not a list of unrelated attractions.
- Prefer a useful mixture: signature landmark, history/culture, museum,
  garden/park, food/market district where catalog-worthy, scenic/nature,
  neighborhood/walking destination, distinctive regional experience.
- Do not mechanically add one of each category.
- Candidates marked `[C]` are proposed; each passes the Phase 4 selection gate
  (significance, distinctiveness, source quality, EN/JA availability, image
  licensing, visit-duration confidence, no duplication) before implementation.
- Final target: ~40–45 strong additions, or a justified lower count.

## Existing Tohoku state at a glance (from KAI57_EXISTING_DATA_AUDIT.md)

- 11 hubs, 10 POIs, 19 standalones, 8 roleless legacy records.
- Three hubs have ZERO children/POIs: **hachinohe-city**, **morioka-city**
  (all its children are gateway standalones in other municipalities),
  **koriyama-city**, **akita-city**, **fukushima-city** (no POIs).
- Matsushima has **no hub** and its only record (matsushima-bay) is
  mis-parented to Sendai.
- 15 containment errors to correct in Phase 2 (see audit).

## Clusters

### 1. Sendai (Miyagi) — strong base, minor depth

| current hubs        | sendai-city                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| current strong POIs | osaki-hachimangu, zuihoden, aoba-castle-museum, sendai-city-museum, sendai-mediatheque, sendai-umino-mori-aquarium, sendai-asaichi |
| weak/filler         | jozenji-dori (wrong kind — fix), rakuten-mobile-park (kind semantics — fix), sendai-castle-ruins (verify coords)                   |
| missing categories  | zoo/family, shopping district, park/garden                                                                                         |
| proposed additions  | `[C]` sendai-yagiyama-zoo (zoo/family), `[C]` sendai-ichibancho (shopping arcade district)                                         |
| target depth        | hub + 10–12 POIs                                                                                                                   |

### 2. Matsushima (Miyagi) — new hub cluster, currently broken

| current hubs        | none (matsushima-bay mis-parented to sendai-city — Phase 2 fix)                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| current strong POIs | matsushima-bay (Nihon Sankei — fix muni to Miyagi:matsushima)                                                                                                                                                                                                 |
| weak/filler         | —                                                                                                                                                                                                                                                             |
| missing categories  | everything (history/culture, temple, garden, island walk, viewpoint)                                                                                                                                                                                          |
| proposed additions  | `[C]` NEW HUB matsushima-town; `[C]` zuigan-ji (National Treasure temple), `[C]` godaido (iconic view hall), `[C]` kanrantei (tea house garden), `[C]` fukuurajima (island + red bridge), `[C]` oshima (island walk/cruise), `[C]` entsuin (temple/mausoleum) |
| target depth        | 1 new hub + 5–6 POIs                                                                                                                                                                                                                                          |

### 3. Aomori city (Aomori) — hub exists, missing art/nature

| current hubs        | aomori-city                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| current strong POIs | sannai-maruyama-jomon (UNESCO), nebuta-museum-wa-rasse (fix coords + kind)                                                           |
| weak/filler         | —                                                                                                                                    |
| missing categories  | museum/art, scenic/nature, onsen                                                                                                     |
| proposed additions  | `[C]` aomori-museum-of-art (Munakata collection), `[C]` mount-hakkoda-ropeway (nature/scenic), `[C]` asamushi-onsen (regional onsen) |
| target depth        | hub + 5–6 POIs                                                                                                                       |

### 4. Hachinohe (Aomori) — orphaned hub, needs a real cluster

| current hubs        | hachinohe-city                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| current strong POIs | none                                                                                                           |
| weak/filler         | —                                                                                                              |
| missing categories  | all (nature, food district, history)                                                                           |
| proposed additions  | `[C]` kabushima-shrine (black-tailed gulls — distinctive), `[C]` tatehana-wharf-morning-market (food district) |
| target depth        | hub + 2–3 POIs                                                                                                 |

### 5. Towada / Oirase (Aomori) — fix containment, add art anchor

| current hubs        | none (lake-towada, oirase-gorge are mis-parented/muni-less standalones — Phase 2 fix) |
| ------------------- | ------------------------------------------------------------------------------------- |
| current strong POIs | oirase-gorge, lake-towada (fix muni/gateway)                                          |
| weak/filler         | —                                                                                     |
| missing categories  | museum/art                                                                            |
| proposed additions  | `[C]` towada-art-center (contemporary art — major anchor, gateway hachinohe-city)     |
| target depth        | 2 fixed standalones + 1–2 additions                                                   |

### 6. Hirosaki (Aomori) — hub exists, thin below castle

| current hubs        | hirosaki-city                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| current strong POIs | hirosaki-castle (12 surviving castles)                                                                                                     |
| weak/filler         | —                                                                                                                                          |
| missing categories  | museum, garden, regional experience                                                                                                        |
| proposed additions  | `[C]` hirosaki-neputa-mura (Neputa festival museum), `[C]` fujita-memorial-garden (Japanese garden), `[C]` saisho-in (Tsugaru clan temple) |
| target depth        | hub + 4 POIs                                                                                                                               |

### 7. Morioka (Iwate) — hub with no city POIs

| current hubs        | morioka-city                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| current strong POIs | none in-city (children: ryusendo, geibikei, jodogahama, hiraizumi are gateway standalones — Phase 2 fixes)                                                                                                                                 |
| weak/filler         | —                                                                                                                                                                                                                                          |
| missing categories  | all (history/culture, landmark, craft, nature)                                                                                                                                                                                             |
| proposed additions  | `[C]` iwate-park-morioka-castle-ruins (history), `[C]` bank-of-iwate-red-brick (Meiji landmark — distinctive), `[C]` morioka-handiworks-square (craft/regional), `[C]` koiwai-farm (Shizukuishi dairy farm — nature/food, gateway morioka) |
| target depth        | hub + 4 POIs                                                                                                                                                                                                                               |

### 8. Hiraizumi (Iwate) — deepen UNESCO cluster

| current hubs        | none (hiraizumi-chusonji gateway standalone — Phase 2 muni fix)                                     |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| current strong POIs | hiraizumi-chusonji (UNESCO)                                                                         |
| weak/filler         | pilgrimage-routes collection (review)                                                               |
| missing categories  | garden (Pure Land), distinctive temple                                                              |
| proposed additions  | `[C]` motsu-ji (UNESCO Pure Land garden — major), `[C]` takkoku-no-iwa (cliff temple — distinctive) |
| target depth        | 3 records                                                                                           |

### 9. Yamagata / Yamadera (Yamagata) — hub exists, city POIs missing

| current hubs        | yamagata-city                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| current strong POIs | yamadera, ginzan-onsen (fix muni), dewa-sanzan (fix containment), mount-zao/okama (fix muni)                                                                                        |
| weak/filler         | —                                                                                                                                                                                   |
| missing categories  | history/culture, landmark, onsen town (Kaminoyama)                                                                                                                                  |
| proposed additions  | `[C]` yamagata-bunshokan (Taisho-era prefectural building — distinctive), `[C]` kajo-park (Yamagata castle ruins), `[C]` kaminoyama-castle-town (onsen town, gateway yamagata-city) |
| target depth        | hub + 6–7 records                                                                                                                                                                   |

### 10. Aizu-Wakamatsu (Fukushima) — hub exists, samurai culture missing

| current hubs        | aizuwakamatsu-city                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| current strong POIs | tsuruga-castle, ouchi-juku (gateway), goshikinuma (fix muni → Kitashiobara), mount-bandai (fix muni)                                                                                                                                |
| weak/filler         | —                                                                                                                                                                                                                                   |
| missing categories  | samurai history, distinctive regional experience, onsen                                                                                                                                                                             |
| proposed additions  | `[C]` aizu-bukeyashiki (samurai residence), `[C]` nisshinkan (samurai school museum), `[C]` sazae-do (Buddhist pavilion — distinctive), `[C]` kitakata-kura-district (storehouse town + ramen — distinctive, gateway aizuwakamatsu) |
| target depth        | hub + 6–7 records                                                                                                                                                                                                                   |

### 11. Fukushima city (Fukushima) — hub with no POIs

| current hubs        | fukushima-city                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| current strong POIs | none                                                                                                 |
| missing categories  | onsen, museum                                                                                        |
| proposed additions  | `[C]` iizaka-onsen (regional onsen district), `[C]` fukushima-prefectural-museum-of-art (art museum) |
| target depth        | hub + 2 POIs                                                                                         |

### 12. Koriyama (Fukushima) — hub + corrected gateway child

| current hubs        | koriyama-city                                                         |
| ------------------- | --------------------------------------------------------------------- |
| current strong POIs | none (abukuma-cave re-gated here in Phase 2)                          |
| proposed additions  | none in Phase 4 unless a strong, non-filler candidate clears the gate |
| target depth        | hub + 1 gateway child (abukuma-cave)                                  |

### 13. Akita city / Senboku (Akita) — fix lake-tazawa, deepen Akita

| current hubs        | akita-city, semboku-city                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| current strong POIs | kakunodate, nyuto-onsen (correct); lake-tazawa (Phase 2 re-parent to semboku-city); dakigaeri-valley (verify muni)                                                   |
| missing categories  | regional experience (Namahage), city park/history                                                                                                                    |
| proposed additions  | `[C]` oga-namahage-kan (Namahage museum, Oga city — distinctive regional, gateway akita-city), `[C]` akita-senshu-park (Kubota castle ruins + museum, in akita-city) |
| target depth        | 2 hubs + 7–8 records                                                                                                                                                 |

### 14. Zao (Yamagata/Miyagi border) — fix, no filler additions

| current            | mount-zao, okama-crater (fix muni), zao-fox-village (verify gateway)     |
| ------------------ | ------------------------------------------------------------------------ |
| proposed additions | none (ropeway would duplicate okama access; documented as transport gap) |
| target depth       | 3 fixed records                                                          |

## Target counts (before Phase 4 rejection)

| Cluster        | New hubs | New POIs  |
| -------------- | -------- | --------- |
| Sendai         | 0        | 2         |
| Matsushima     | 1        | 5–6       |
| Aomori         | 0        | 3         |
| Hachinohe      | 0        | 2         |
| Towada/Oirase  | 0        | 1–2       |
| Hirosaki       | 0        | 3         |
| Morioka        | 0        | 4         |
| Hiraizumi      | 0        | 2         |
| Yamagata       | 0        | 3         |
| Aizu           | 0        | 4         |
| Fukushima city | 0        | 2         |
| Koriyama       | 0        | 0         |
| Akita          | 0        | 2–3       |
| **Total**      | **1**    | **33–38** |

Combined with Phase 2 legacy corrections (15 records) this lands at roughly
40–45 new records total or a documented evidence-based lower count; Phase 4
rejection is expected to trim weak candidates.

## Phase 4 outcome (2026-08-11)

All proposed candidates were researched by parallel cluster scouts against
official operator/municipal/national sources; every ACCEPT is evidenced in
`KAI57_SOURCE_LEDGER.md`. Final pool:

- **Matsushima (1 hub + 8 POIs, DONE):** matsushima-town (hub), zuigan-ji,
  godaido, kanrantei, fukuurajima, oshima, entsuin, matsushima-bay-cruise,
  saigyo-modoshi-no-matsu.
- **Sendai (3):** sendai-yagiyama-zoo, sendai-ichibancho, sendai-daikannon.
- **Aomori city (3):** aomori-museum-of-art, mount-hakkoda-ropeway,
  asamushi-onsen.
- **Hachinohe (2):** kabushima-shrine, tatehana-wharf-morning-market.
- **Towada (1):** towada-art-center (closure 2027-04→2028-03 encoded).
- **Hirosaki (3):** hirosaki-neputa-mura, fujita-memorial-garden, saisho-in.
- **Morioka (4):** iwate-park-morioka-castle-ruins, bank-of-iwate-red-brick,
  morioka-handiworks-square, koiwai-farm.
- **Hiraizumi (2):** motsu-ji, takkoku-no-iwa.
- **Yamagata (3):** yamagata-bunshokan, kajo-park, kaminoyama-castle-town.
- **Aizu (4):** aizu-bukeyashiki, nisshinkan, sazae-do, kitakata-kura-district.
- **Fukushima city (2):** iizaka-onsen, fukushima-prefectural-museum-of-art.
- **Akita (3):** oga-namahage-kan, akita-senshu-park, akita-museum-of-art.

Total: **1 hub + 38 POIs = 39 new records** — a documented evidence-based
count at the lower edge of the 40–45 target; quality gate rejected weak
candidates rather than padding (see below).

### Rejected / not added

- sokanzan, shin-tomiyama (Matsushima viewpoints — filler; Saigyo park covers
  the slot); tenrinin (blog-tier); Kyohei Fujita Glass Museum (out of cluster
  scope); UNESCO claim for Matsushima (not on any WH list — verified);
  nishi-park, Yagiyama Beny Land (Sendai filler); duplicate Date Masamune
  statue / Aobayama viewpoint (already in sendai-castle-ruins record);
  Koriyama in-city POIs (no strong non-filler candidate cleared the gate).

## Batch order (Phase 15)

1. Sendai → 2. Matsushima → 3. Aomori (incl. Hachinohe, Towada) →
2. Hirosaki → 5. Morioka (incl. Hiraizumi) → 6. Yamagata/Yamadera →
3. Aizu/Fukushima → 8. Akita. Each batch: sync, validate:catalog-fast,
   inspect diff, relationships, duplicate IDs, source/generated sync.
