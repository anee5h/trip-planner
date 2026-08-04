# Destinations Filter Exclusion Diagnosis

**Branch:** `docs/diagnose-destinations-filter-exclusions`
**Date:** 2026-08-04

---

## Summary

When the Destinations page loads with saved user preferences active (the
typical state), the transport-mode eligibility filter reduces the visible
catalogue from **627 → 589**, excluding exactly **38 destinations**.

Every excluded destination shares a single root cause: **`transportOptions`
is entirely absent from its index record.** Because the filter requires at
least one reachable mode from the user's allowed set
(`["train", "shinkansen", "bus", "flight"]`), destinations with no transport
data produce zero valid modes and are silently dropped.

All 38 belong to the **Kansai region** and are **hub-expansion sub-destinations**
added in the v1.9.2 major-city expansion. None carry transport data because
that data was never populated for child/gateway records during the expansion.

---

## Counts Confirmed

| Metric | Count |
|--------|-------|
| Total destinations in index | 627 |
| Unfiltered (bare defaults, no user prefs) | 627 |
| Filtered (prefs: train / shinkansen / bus / flight) | 589 |
| Excluded difference | **38** |
| Unique excluded IDs | **38** |

---

## Filter Pipeline Involved

| File | Symbol | Role |
|------|--------|------|
| `src/features/destinations/Destinations.tsx` lines 482–502 | filter block | Activates transport eligibility test when `hasRestrictedTransportSelection` is true |
| `src/features/destinations/destinationSearchParams.ts` lines 38–48 | `hasRestrictedTransportSelection()` | Returns `true` when `publicModes` differs from default (`[]`) |
| `src/features/destinations/destinationSearchParams.ts` lines 9–33 | `DEFAULT_DESTINATION_EXPLORER_STATE` | Default `publicModes: []` (bare app load with no auth) |
| `src/features/destinations/Destinations.tsx` lines 131–154 | `useEffect` (auth prefs) | Applies `publicModes: ["train","shinkansen","bus","flight"]` from saved preferences |
| `src/shared/services/recommendation/RecommendationScorer.ts` lines 72–138 | `getValidModes()` | Returns `[]` when no transport option matches the allowed modes |
| `src/shared/services/recommendation/TripDurationService.ts` lines 159–166 | `matchesTripDurationEstimate()` | Also returns false when `modes.length === 0` (null estimate) |

### How the filter activates

```
Bare defaults (no auth):    carMode="none", publicModes=[]
  -> hasRestrictedTransportSelection = FALSE  (publicModes.length 0 === default 0)
  -> transport block SKIPPED
  -> 627 destinations shown

User prefs loaded (typical): carMode="none", publicModes=["train","shinkansen","bus","flight"]
  -> hasRestrictedTransportSelection = TRUE   (publicModes.length 4 != default 0)
  -> transport block ACTIVE: getValidModes() called per destination
  -> destinations with no transportOptions return []
  -> 589 destinations shown  (38 dropped)
```

---

## The 38 Excluded Destinations

| # | ID | English name | Japanese name | Prefecture / Hub | Primary rejection reason | Relevant data value |
|---|----|-------------|--------------|-----------------|------------------------|---------------------|
| 1 | `cupnoodles-museum-osaka-ikeda` | CupNoodles Museum Osaka Ikeda | カップヌードルミュージアム 大阪池田 | Osaka / gateway: sakai-city | missing transport data | `transportOptions: undefined` |
| 2 | `byodoin-temple` | Byodoin Temple | 平等院 | Kyoto / parent: uji-city | missing transport data | `transportOptions: undefined` |
| 3 | `uji-tea-culture-center` | Uji Tea Culture Center & Ujigami Shrine | 宇治茶文化館・宇治上神社 | Kyoto / parent: uji-city | missing transport data | `transportOptions: undefined` |
| 4 | `mimuroto-ji-temple` | Mimuroto-ji Hydrangea Temple | 三室戸寺 | Kyoto / parent: uji-city | missing transport data | `transportOptions: undefined` |
| 5 | `ine-funaya-boathouses` | Ine Funaya Boathouses | 伊根の舟屋 | Kyoto / parent: miyazu-city | missing transport data | `transportOptions: undefined` |
| 6 | `kasamatsu-park-view` | Kasamatsu Park Lookout | 傘松公園 | Kyoto / parent: miyazu-city | missing transport data | `transportOptions: undefined` |
| 7 | `koko-en-garden` | Koko-en Garden | 好古園 | Hyogo / parent: himeji-city | missing transport data | `transportOptions: undefined` |
| 8 | `engyo-ji-mount-shosha` | Engyo-ji Temple Mount Shosha | 書寫山圓教寺 | Hyogo / parent: himeji-city | missing transport data | `transportOptions: undefined` |
| 9 | `izushi-castle-town` | Izushi Historic Castle Town | 出石城下町 | Hyogo / parent: toyooka-city | missing transport data | `transportOptions: undefined` |
| 10 | `genbudo-cave-park` | Genbudo Basalt Cave Park | 玄武洞公園 | Hyogo / parent: toyooka-city | missing transport data | `transportOptions: undefined` |
| 11 | `ritsuunkyo-viewpoint` | Ritsuunkyo Sea of Clouds Viewpoint | 立雲峡 | Hyogo / parent: asago-city | missing transport data | `transportOptions: undefined` |
| 12 | `ikuno-silver-mine` | Ikuno Historic Silver Mine | 生野銀山 | Hyogo / parent: asago-city | missing transport data | `transportOptions: undefined` |
| 13 | `hokki-ji-pagoda` | Hokki-ji Three-Story Pagoda | 法起寺 | Nara / parent: ikaruga-town | missing transport data | `transportOptions: undefined` |
| 14 | `chogosonshi-ji-temple` | Chogosonshi-ji Tiger Temple | 朝護孫子寺 | Nara / gateway: ikaruga-town | missing transport data | `transportOptions: undefined` |
| 15 | `enryaku-ji-mount-hiei` | Enryaku-ji Mount Hiei Monastery | 比叡山延暦寺 | Shiga / parent: otsu-city | missing transport data | `transportOptions: undefined` |
| 16 | `ukimido-mangetsu-ji` | Ukimido Mangetsu-ji Floating Temple | 浮御堂（満月寺） | Shiga / parent: otsu-city | missing transport data | `transportOptions: undefined` |
| 17 | `genkyuen-garden` | Genkyuen Feudal Garden | 玄宮園 | Shiga / parent: hikone-city | missing transport data | `transportOptions: undefined` |
| 18 | `miho-museum-koka` | Miho Museum Koka | MIHO MUSEUM | Shiga / gateway: hikone-city | missing transport data | `transportOptions: undefined` |
| 19 | `okage-yokocho-oharai-machi` | Okage Yokocho & Oharai-machi | おかげ横丁・おはらい町 | Mie / parent: ise-city | missing transport data | `transportOptions: undefined` |
| 20 | `kishi-station-tama-cat` | Kishi Station Tama Cat Conductor | 貴志駅・たま駅長 | Wakayama / parent: wakayama-city | missing transport data | `transportOptions: undefined` |
| 21 | `okunoin-cemetery-koyasan` | Okunoin Sacred Forest Cemetery | 高野山 奥之院 | Wakayama / parent: koya-town | missing transport data | `transportOptions: undefined` |
| 22 | `senjojiki-sandanbeki-cliffs` | Senjojiki & Sandanbeki Rock Cliffs | 千畳敷・三段壁洞窟 | Wakayama / parent: shirahama-town | missing transport data | `transportOptions: undefined` |
| 23 | `sakai-city-museum` | Sakai City Museum & Daisen Kofun View | 堺市博物館・大仙陵古墳 | Osaka / parent: sakai-city | missing transport data | `transportOptions: undefined` |
| 24 | `lake-biwa-shiga` | Lake Biwa Scenic Cruise & Coast | 琵琶湖クルーズ・湖畔 | Shiga / parent: otsu-city | missing transport data | `transportOptions: undefined` |
| 25 | `meoto-iwa-wedded-rocks` | Meoto Iwa Wedded Rocks | 夫婦岩 | Mie / parent: ise-city | missing transport data | `transportOptions: undefined` |
| 26 | `wakayama-castle` | Wakayama Castle | 和歌山城 | Wakayama / parent: wakayama-city | missing transport data | `transportOptions: undefined` |
| 27 | `kataonami-beach-wakanoura` | Kataonami Beach & Wakanoura Bay | 片男波海水浴場・和歌の浦 | Wakayama / parent: wakayama-city | missing transport data | `transportOptions: undefined` |
| 28 | `danjo-garan-koyasan` | Danjo Garan Sacred Temple Complex | 高野山 壇上伽藍 | Wakayama / parent: koya-town | missing transport data | `transportOptions: undefined` |
| 29 | `shirahama-beach-adventure-world` | Shirahama White Beach & Coastal Resort | 白良浜・白浜温泉リゾート | Wakayama / parent: shirahama-town | missing transport data | `transportOptions: undefined` |
| 30 | `toshodai-ji-temple` | Toshodai-ji Temple | 唐招提寺 | Nara / parent: nara-city | missing transport data | `transportOptions: undefined` |
| 31 | `yakushi-ji-temple` | Yakushi-ji Temple | 薬師寺 | Nara / parent: nara-city | missing transport data | `transportOptions: undefined` |
| 32 | `naramachi-historic-district` | Naramachi Historic Lattice District | ならまち（奈良町） | Nara / parent: nara-city | missing transport data | `transportOptions: undefined` |
| 33 | `shirahige-shrine-lake-biwa` | Shirahige Shrine Floating Torii | 白髭神社・湖中大鳥居 | Shiga / parent: otsu-city | missing transport data | `transportOptions: undefined` |
| 34 | `omi-hachiman-canal` | Omi-Hachiman Merchant Canal | 近江八幡・八幡堀 | Shiga / parent: otsu-city | missing transport data | `transportOptions: undefined` |
| 35 | `hiei-zan-driveway-observatory` | Mount Hiei Driveway & Yumemi Observatory | 比叡山ドライブウェイ・夢見が丘 | Shiga / parent: otsu-city | missing transport data | `transportOptions: undefined` |
| 36 | `kimii-dera-temple` | Kimii-dera Temple | 紀三井寺 | Wakayama / parent: wakayama-city | missing transport data | `transportOptions: undefined` |
| 37 | `kuroshio-market-marina-city` | Kuroshio Market Wakayama Marina City | 黒潮市場・和歌山マリーナシティ | Wakayama / parent: wakayama-city | missing transport data | `transportOptions: undefined` |
| 38 | `tomogashima-islands` | Tomogashima Islands (Laputa Island) | 友ヶ島（ラピュタの島） | Wakayama / parent: wakayama-city | missing transport data | `transportOptions: undefined` |

---

## Counts Grouped by Rejection Reason

| Rejection reason | Count | Notes |
|-----------------|-------|-------|
| **missing transport data** (`transportOptions: undefined`) | **38** | All 38. Filter: `getValidModes()` returns `[]` |
| budget mismatch | 0 | — |
| transport-mode mismatch (wrong modes present) | 0 | — |
| rental-car requirement | 0 | — |
| travel-time limit | 0 | — |
| walking intensity | 0 | — |
| vibe / weather / season | 0 | — |

No destination has a secondary rejection cause. Every exclusion flows from a
single missing field.

---

## Breakdown by Prefecture / Hub

| Prefecture | Count | Hubs |
|-----------|-------|------|
| Wakayama | **10** | wakayama-city (6), koya-town (2), shirahama-town (2) |
| Shiga | 8 | otsu-city (6), hikone-city (2) |
| Hyogo | **6** | himeji-city (2), toyooka-city (2), asago-city (2) |
| Kyoto | 5 | uji-city (3), miyazu-city (2) |
| Nara | **5** | nara-city (3), ikaruga-town (2) |
| Osaka | 2 | sakai-city (2) |
| Mie | 2 | ise-city (2) |
| **Total** | **38** | |

---

## Diagnostic Configuration

The filtering was reproduced with this exact state:

```
carMode:     "none"
publicModes: ["train", "shinkansen", "bus", "flight"]
tripDuration: "any"
budgetTier:  "standard"
```

This matches the saved-preferences state the app applies after auth loads
(see `Destinations.tsx` lines 131–154). It does **not** include rental car.
If the UI screenshot used to manually verify this showed five transport
controls selected — including a rental-car toggle — that selection was not
part of the reproduced diagnostic configuration. The root cause is identical
in both cases: destinations without `transportOptions` are dropped as soon as
any transport selection is active.

---

## Root Cause

This is a **data bug**, not intentional filtering behavior.

All 38 are hub-expansion child destinations added in the v1.9.2 major-city
catalogue expansion. The expansion pipeline created `destinations-index.json`
records with coordinates, ratings, categories and editorial metadata, but did
**not populate `transportOptions`**.

Because the app's transport filter falls back gracefully when `publicModes=[]`
(bare defaults, no auth), these records appear in the unfiltered catalogue.
But the moment any transport mode is selected — which happens automatically
when user preferences are loaded — `getValidModes()` returns `[]` for each of
them, and they are silently excluded.

The 627 unfiltered count is therefore misleading: 38 records are structurally
incomplete and cannot be reached by any transport mode filter.

### Secondary data anomaly: CupNoodles Museum gateway assignment

`cupnoodles-museum-osaka-ikeda` has `gatewayHubId: "sakai-city"` in both the
index and its detail record. The museum is located in **Ikeda**, Osaka — not
in Sakai. This gateway assignment is likely a copy-paste error from the
expansion run. It does not change the transport diagnosis (the record has no
`transportOptions` regardless), but the relationship metadata should be
corrected as part of the data repair. This is flagged here for the follow-up
branch.

---

## Conclusion

**Data bug, not a logic bug.** The filtering logic in `Destinations.tsx`,
`RecommendationScorer.ts`, and `destinationSearchParams.ts` is working
exactly as designed. The `hasRestrictedTransportSelection` gate, `getValidModes`,
and `matchesTripDurationEstimate` all behave correctly.

The 38 excluded destinations are legitimate Kansai attractions whose
`transportOptions` field was never populated during the v1.9.2 hub-expansion
pipeline. This causes them to be silently invisible to any logged-in user
with saved transport preferences.

**Recommended follow-up:** open a `data/kansai-expansion-transport-data` branch
to back-fill `transportOptions` for all 38 records using each destination's
parent/gateway hub travel time as the baseline. That branch should also correct
the `gatewayHubId` for `cupnoodles-museum-osaka-ikeda` from `sakai-city` to the
appropriate Ikeda-area hub.

---

## Working Tree Confirmation

The diagnostic script (`scripts/diagnose-excluded-destinations.mjs`) was
written, executed, and **deleted** before committing. The working tree is
clean on this branch.

```
$ git status
On branch docs/diagnose-destinations-filter-exclusions
nothing to commit, working tree clean
```
