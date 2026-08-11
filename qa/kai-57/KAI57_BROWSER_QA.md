# KAI-57 Browser QA

Date: 2026-08-11
Method: live dev server (`vite --port 5199` with `VITE_EDITORIAL_REVIEW_MODE=true`
so Japanese discovery is ungated per the repository's editorial-review route),
driven by real Chromium. Locale switched through the app's own language control
(the user flow), not by reading source strings.

## Rendered pages

All 21 pages rendered in BOTH locales (EN + JA), desktop (1440×900), with the
canonical name verified in each:

| Page                          | EN H1                                         | JA H1                        |
| ----------------------------- | --------------------------------------------- | ---------------------------- |
| matsushima-town               | Matsushima Town                               | 松島町                       |
| sendai-city                   | Sendai City                                   | 仙台市                       |
| aomori-city                   | Aomori City                                   | 青森市                       |
| hirosaki-city                 | Hirosaki City                                 | 弘前市                       |
| morioka-city                  | Morioka City                                  | 盛岡市                       |
| yamagata-city                 | Yamagata City                                 | 山形市                       |
| aizuwakamatsu-city            | Aizuwakamatsu City                            | 会津若松市                   |
| fukushima-city                | Fukushima City                                | 福島市                       |
| akita-city                    | Akita City                                    | 秋田市                       |
| zuigan-ji                     | Zuigan-ji                                     | 瑞巌寺                       |
| ryusendo-cave-iwate           | Ryusendo Cave                                 | 龍泉洞                       |
| sazae-do                      | Sazae-do                                      | さざえ堂                     |
| towada-art-center             | Towada Art Center                             | 十和田市現代美術館           |
| oga-namahage-kan              | Namahage Museum (Oga Shinzan Folklore Museum) | なまはげ館（男鹿真山伝承館） |
| yamadera-yamagata             | Yamadera (Risshakuji Temple)                  | 山寺（立石寺）               |
| goshikinuma-ponds-fukushima   | Goshikinuma Ponds                             | 五色沼                       |
| sendai-yagiyama-zoo           | Sendai Yagiyama Zoological Park               | 八木山動物公園フジサキの杜   |
| motsu-ji                      | Motsu-ji                                      | 毛越寺                       |
| aomori-museum-of-art          | Aomori Museum of Art                          | 青森県立美術館               |
| koiwai-farm                   | Koiwai Farm                                   | 小岩井農場                   |
| tatehana-wharf-morning-market | Tatehana Wharf Morning Market                 | 館鼻岸壁朝市                 |

Mobile (390×844): matsushima-town, sendai-city, zuigan-ji, saze-do — EN + JA,
all rendered without overflow errors.

Screenshots: `qa/kai-57/screenshots/` (representative set) and
`/tmp/kai57-qa/` (full desktop set).

## Luna vision QA

Three blind review rounds (vision model, no prior context of expected content):

1. **Initial round** — found real data defect: **English `notes` leaked into
   Japanese pages for hubs** (matsushima-town + the 11 corrected city hubs fell
   back to EN notes on JA pages). Also flagged the sendai-city hero as a dark
   gradient.
2. **Verification of hero** — direct inspection of the sendai hero source
   (`SendaiCity Skylines from Mukaiyama2018.jpg`): bright daytime skyline, loads
   (HTTP 200). The dark look in the screenshot is the text-legibility overlay;
   not a data defect.
3. **Re-render after fix** — `notesJa` + `content.ja.notes` added to all 12
   hubs; the EN notes leak is gone. Remaining findings are **app-level systemic
   gaps, not KAI-57 data** (verified against a non-Tohoku control page,
   osaka-city JA):
   - Hardcoded English string in `DestinationDetails.tsx` ("Travel estimates
     for this region are still being refined…") renders in English on every JA
     page of a beta/refining record — app i18n gap, affects all regions.
   - English tags/badges (`#Miyagi`, "Cities", "Hub") render untranslated on JA
     pages — app-wide, identical on osaka-city.
   - `bestSeason` ("Spring & Autumn") is a single freeform field with no JA
     variant — schema limitation, app-wide.
   - `8–14 時間` spacing before the Japanese unit — app formatting.
   - Evaluation card repeats the overview description — app pattern.

## Verdict

PASS for the KAI-57 data surface: every page renders in both locales with the
correct canonical EN/JA name; no image-subject mismatches; no overflow or
blank content; the one data-level localization defect Luna found (hub notes)
was fixed and re-verified. The remaining findings are app-level i18n gaps to be
tracked separately (recommended: a UI-localization ticket covering the
hardcoded travel-estimates string, JA tag/badge localization, and localized
bestSeason).
