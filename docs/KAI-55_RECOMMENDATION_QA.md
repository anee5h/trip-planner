# KAI-55 Recommendation Engine QA Audit

Date: 2026-08-09

Branch: fix/kai-55-total-outing-semantics

Base: latest main after merged PR #121 at 530476b1

Scope: deterministic KAI-55 audit plus F15 UI semantics for evidence-aware
day-trip feasibility. Transport, budgets, ranking, and weekend/2D1N semantics
remain unchanged.

Reproduction command:

    node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/qa/kai-55-recommendation-audit.ts

Targeted reproduction is available with KAI55_SCENARIO, for example:

    KAI55_SCENARIO=C04 node_modules/.bin/tsx --tsconfig tsconfig.app.json scripts/qa/kai-55-recommendation-audit.ts

## 2026-08-09 rerun

The complete 42-scenario audit was rerun after PR #121. It produced:

- 30 PASS
- 12 REVIEW (manual ranking/product judgment)
- 0 FAIL

The new day-trip checks passed:

- Nakayama Short outing: 91 results, including bounded estimated local/ground
  travel; no unknown or infeasible result entered the primary rail.
- Shin-Yokohama Short outing: non-empty bounded local/ground results.
- Chiba Short/Half: populated and free of Aomori, Yamagata, Akita, and Kyoto
  leakage.
- Sapporo/Hokkaido and Fukuoka/Kyushu Short outing: non-empty same-zone local
  ground rails using bounded estimated evidence.
- Takamatsu/Shikoku Half-day: non-empty same-zone local-ground results use
  bounded estimated evidence; cross-zone coordinate estimation stays blocked.
- Island topology: no estimated duration and no train/car feasibility for
  island candidates.
- Estimated travel: no transport fare or complete budget range was derived
  from it.
- F15: the Home and Explore day-trip selectors describe total available outing
  time, including travel, visit time, and buffers; `recommendedVisitHours`
  remains the on-site visit duration.
- Home/shared evidence: verified, estimated, and unknown states agree across
  the pipeline/card contract; estimated cards are marked with `~`.

Takamatsu catalogue coverage note: Takamatsu has 9 nearby same-zone catalogue
entries. All have usable estimated local-ground evidence, but none currently
classify as Short outing because their published `recommendedVisitHours`
midpoints are at least 2.5 hours. Therefore, zero Takamatsu Short outing
results are currently a catalogue-content gap, not a transport or
recommendation defect. The end-to-end regression uses the catalogue-supported
Half-day band, with a separate lower-level assertion covering all 9 nearby
entries.

The sections below are the historical pre-fix baseline and are retained for
traceability.

## Historical baseline (superseded)

## Pipeline Semantics

- Home recommendation state is assembled by useTripRecommendations and passed to RecommendationService.getRecommendations, which delegates to RecommendationPipeline.runRecommendationPipeline.
- Home uses the pipeline for eligibility, score, reasons, weekend metadata, and the canonical transport estimate. The Home card then calls getFastestPreferredTransport and, when that is unavailable, getSafeDisplayEstimate for a presentation-only fallback.
- Destinations has a separate explorer filter path. Its duration filter uses the same matchesVisitDuration visit-band rule, while its recommended sort calls scoreForCatalog. Numeric maxBudget is carried in context but the visible budget tier filter uses tier thresholds.
- Hard pipeline gates are visited-ID exclusion, selected transport eligibility, date-aware ferry coverage, day-trip visit-band matching, weekend travel/capacity policy, and complete verified budget estimates that exceed the selected budget.
- Day-trip duration is currently an on-site visit-time gate. It does not compare the selected short/half/full option with the origin-aware round-trip total returned by estimateTripDuration.
- Origin-aware ground durations come only from the verified ground-route registry and confident origin municipality resolution. Bus and car have no canonical origin-aware duration. Flight and ferry use their respective route registries.
- If transport fare is unknown but visit duration is known, budget scoring skips affordability bonuses and penalties, the result remains eligible under the neutral unknown-cost policy, and the result is marked transport-unknown. The internal on-site range is not a full-trip cost.
- Weekend mode skips the visit band, requires an eligible travel fit and at least 480 published activity minutes, then consolidates to structured area results. Child POIs are suppressed when classified as POIs.
- Recommendation reasons are generated from score inputs and localized at render time. The executed cases did not emit an internal weather token or an affordability reason for unknown fares.
- Nakayama and Shin-Yokohama resolve to mainland-honshu but their municipality resolution is unknown under the confidence guard. The current ground-route registry has no Kanagawa corridor, so many origin-aware durations remain unknown.

## QA Matrix

Unless stated otherwise, date is none, trip mode is day_trip, budget is JPY40000 standard, transport is train/shinkansen/bus/flight/ferry, interest is any, visited is none, and there are no additional filters.

| ID | Inputs | Expected | Actual top 5 | Result | Notes / subsystem |
| --- | --- | --- | --- | --- | --- |
| F01 | Nakayama; day_trip; date none; duration shortOuting; JPY40000 standard; public all; interest any; visited none; other none | Every result matches the published short-outing visit band. | okama-crater-yamagata (shinkansen; time unknown; cost unknown; generalHighlyRated)<br>nebuta-museum-wa-rasse-aomori (shinkansen; unknown; unknown; generalHighlyRated)<br>sendai-castle-ruins-miyagi (shinkansen; unknown; unknown; generalHighlyRated)<br>kinkaku-ji (shinkansen; unknown; unknown; generalHighlyRated, editorialReviewPending)<br>zao-fox-village-miyagi (shinkansen; unknown; unknown; generalHighlyRated) | PASS (none) | 177 results; all pass getVisitBand. Filter / visit duration. |
| F02 | Nakayama; day_trip; date none; duration halfDay; JPY40000 standard; public all; interest any; visited none; other none | Every result matches the published half-day visit band. | abeno-harukas-300-osaka (shinkansen; unknown; unknown; generalHighlyRated)<br>lake-tazawa-akita (shinkansen; unknown; unknown; generalHighlyRated)<br>yamadera-yamagata (shinkansen; unknown; unknown; generalHighlyRated)<br>nagoya-castle-aichi (shinkansen; unknown; unknown; generalHighlyRated)<br>toki-messe-tower-niigata (shinkansen; unknown; unknown; generalHighlyRated) | PASS (none) | 143 results; the filter is correct under current pure visit-time semantics. The distant top results are relevant to F14/TR03 because Kanagawa travel is unknown. Filter / visit duration. |
| F03 | Nakayama; day_trip; date none; duration fullDay; JPY40000 standard; public all; interest any; visited none; other none | Every result matches the published full-day visit band. | mount-bandai-fukushima (shinkansen; unknown; unknown; generalHighlyRated)<br>osaka-city (shinkansen; unknown; unknown; generalHighlyRated)<br>atami-city (shinkansen; unknown; unknown; generalHighlyRated)<br>gunma-kusatsu-onsen (shinkansen; unknown; unknown; generalHighlyRated)<br>nyuto-onsen-akita (shinkansen; unknown; unknown; generalHighlyRated) | PASS (none) | 198 results; all pass getVisitBand. Filter / visit duration. |
| F04 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited yokohama-city and tokyo-tower-tokyo; other none | Visited IDs never appear. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | PASS (none) | 517 results; both visited IDs excluded. Visited state. |
| F05 | Tokyo; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other origin changed from Nakayama | Origin change should alter eligibility and ranking. | roppongi-hills-tokyo-city-view (train 10-25m; JPY8281-11011 verified; budgetGreatValue, transportFastTrain)<br>shibuya-city (train 15-30m; JPY13725-20655 verified; budgetGreatValue, transportFastTrain)<br>chuo-city (train 5-15m; JPY15076-23476 verified; budgetGreatValue, transportFastTrain)<br>tokyo-metropolitan-government-building-shinjuku (train 10-25m; JPY5598-8328 verified; budgetGreatValue, transportFastTrain)<br>enoshima-island (train 50-90m; JPY18279-26679 verified; budgetGreatValue, transportFastTrain) | REVIEW (none) | Top 10 differs from Nakayama. Direction is plausible; manual relevance review remains. Origin / ranking. |
| F06 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other baseline for F05 | Baseline output for origin comparison. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | REVIEW (none) | 518 results; origin municipality is unknown and top durations are unknown. Origin / ranking. |
| F07 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest nature; visited none; other none | Nature destinations should be promoted and mismatches penalized. | shirakawa-village (bus; unknown; unknown; interestNature)<br>gifu-castle-gifu (train; unknown; unknown; interestNature)<br>toyama-alpine (shinkansen; unknown; unknown; interestNature)<br>mount-fuji (bus; unknown; unknown; interestNature)<br>fujiyoshida-city (shinkansen; unknown; unknown; interestNature) | REVIEW (none) | 518 results; top five are nature or mountain-oriented. Ranking / personalization. |
| F08 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest history; visited none; other none | History, shrine, temple, or historic destinations should be promoted. | nagoya-castle-aichi; gunma-kusatsu-onsen; tokyo-station-chiyoda; kanazawa-castle-ishikawa; maruoka-castle-fukui | REVIEW (none) | 518 results; mostly plausible historic/cultural matches, but Kusatsu requires editorial judgment. Ranking / personalization. |
| F09 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest art; visited none; other none | Museum and art destinations should be promoted. | roppongi-hills-tokyo-city-view; ghibli-museum; omiya-railway; teamlab-planets; ginza-urban | REVIEW (none) | 518 results; top results have art/museum or cultural signals. Ranking / personalization. |
| F10 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest food; visited none; other none | Food preference should change ordering without being a text-only admission rule. | osaka-city; nagoya-city; atami-city; kyoto-city; tokyo-station-chiyoda | REVIEW (none) | 518 results; major food destinations lead. Ranking / personalization. |
| F11 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest sea; visited none; other none | Coast, sea, or beach destinations should be promoted. | boso-peninsula; enoshima-island; shirahama-beach-adventure-world; odaiba-minato; kataonami-beach-wakanoura | REVIEW (none) | 518 results; top results have coast/sea/beach signals. Ranking / personalization. |
| F12 | Tokyo; day_trip; date none; duration any; JPY40000 standard; public all; interest themepark; visited none; other none | Theme-park destinations should be promoted and mismatches penalized. | ikebukuro-toshima (train 10-30m; JPY18713-25643 verified; budgetGreatValue, transportFastTrain, interestThemepark)<br>yamanashi-fujiyoshida (train 130-180m; JPY25704-34104 verified; interestThemepark)<br>harry-potter-studio (train; unknown; unknown; interestThemepark)<br>teamlab-planets (train; unknown; unknown; interestThemepark)<br>lake-sagami (train 50-90m; JPY16275-24675 verified; interestThemepark) | REVIEW (none) | 410 results; top five contain relevant theme-park signals, but some are area hubs rather than named parks. Ranking / personalization. |
| F13 | Tokyo; day_trip; date none; duration shortOuting; JPY40000 standard; public all; interest any; visited none; other total-feasibility probe with 4h ceiling | Known candidates should not require more than four hours total. | yanaka; golden-gai; seiko-museum-ginza; meiji-jingu; narita-airport-observation-decks | PASS (none) | 138 results; no known minimum total exceeded 4h. Filter / day-trip feasibility. |
| F14 | Tokyo; day_trip; date none; duration halfDay; JPY40000 standard; public all; interest any; visited none; other total-feasibility probe with 7.5h ceiling | Known candidates should not exceed the visible half-day envelope. | roppongi-hills-tokyo-city-view; shibuya-sky-shibuya; tokyo-metropolitan-government-building-shinjuku; sunshine-60-observatory-ikebukuro; kirin-beer-yokohama-factory | FAIL (P1) | 110 results. Five known candidates exceed 7.5h at minimum: matsumoto-castle-nagano 8.0h+, mito-castle-ibaraki 7.7h+, arakurayama-sengen-park-yamanashi 8.2h+, takato-castle-nagano 9.0h+, kairakuen-mito 7.7h+. Filter / day-trip feasibility. |
| F15 | Tokyo; day_trip; date none; duration halfDay; JPY40000 standard; public all; interest any; visited none; other compare visit midpoint to visible 4-7.5h label | Half-day filter should align with the visible time-at-destination range. | roppongi-hills-tokyo-city-view; shibuya-sky-shibuya; tokyo-metropolitan-government-building-shinjuku; sunshine-60-observatory-ikebukuro; kirin-beer-yokohama-factory | FAIL (P2) | 72 results are admitted with visit midpoints outside 4-7.5h; examples are 3.0h, 3.0h, 3.0h, 3.0h, and 2.5h. Filter / UI semantics. |
| T01 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other none | Every returned candidate uses a selected public mode. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | PASS (none) | 518 results; selected modes remain within the public set. Transport eligibility. |
| T02 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public train only; interest any; visited none; other no car | No shinkansen, ferry, flight, bus, or car-only result should return. | nagano-kamikochi; harry-potter-studio; abeno-harukas-300-osaka; nikko-toshogu-shrine-tochigi; enoshima-island | PASS (none) | 634 results; every valid mode and best mode is train. Transport eligibility. |
| T03 | Tokyo; day_trip; date none; duration any; JPY150000 luxury; flight only; interest any; visited none; other none | Only verified flight-access destinations should return. | yonaha-maehama-beach-miyako (flight 321-357m; JPY149205-203805 verified); takamatsu-city (flight 223-249m; JPY103541-158141 verified); takachiho-gorge (flight 272-310m; JPY113822-168422 verified); churaumi-aquarium-motobu (flight 334-380m; JPY138373-192973 verified); kabira-bay-ishigaki (flight 341-377m; JPY159344-213944 verified) | PASS (none) | 168 results; budget was made nonrestrictive so this exercised flight topology. Transport eligibility. |
| T04 | Tokyo; day_trip; 2026-08-15; duration any; JPY40000 standard; ferry only; interest any; visited none; other ferry temporal date | Only verified passenger-ferry routes with a feasible same-day return should return. | No results | PASS (none) | Zero is expected for the Tokyo ferry registry under day-trip return-date eligibility; T08 covers a positive ferry case. Transport topology / ferry. |
| T05 | Nakayama; day_trip; date none; duration any; JPY40000 standard; personal car only; interest any; visited none; other public modes empty | Only authorized road-access destinations should return; public modes must not substitute. | nagano-kamikochi; jodogahama-beach-iwate; utsunomiya-oya; hikone-castle-shiga; boso-peninsula | PASS (none) | 194 results; all returned best modes are my_car. Transport eligibility. |
| T06 | Tokyo; day_trip; 2026-08-15; duration any; JPY40000 standard; public all; interest any; visited none; other explicit travel date | Island destinations should use verified ferry or flight access, never fabricated rail. | roppongi-hills-tokyo-city-view; shibuya-sky-shibuya; tokyo-metropolitan-government-building-shinjuku; chuo-city; sunshine-60-observatory-ikebukuro | PASS (none) | 408 results; no inspected island candidate exposed rail, bus, or car topology. Transport topology / islands. |
| T07 | Omiya; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other suburban registry coverage | Known corridors should be canonical; unsupported corridors should stay unknown. | shibuya-sky-shibuya (train 45-110m; JPY16639-23569 verified); tokyo-skytree-sumida (train 45-110m; JPY17465-24395 verified); ghibli-museum (train 45-110m; JPY16808-23738 verified); edo-castle-tokyo (train 45-110m; JPY13467-20397 verified); teamlab-borderless-azabudai (train 45-110m; JPY23104-30034 verified) | PASS (none) | 518 results; Saitama-to-Tokyo has a verified corridor. Two lower-ranked results retain transport-unknown on-site budget ranges without affordability reasons. Travel-time fallback / budget unknown. |
| T08 | Wakayama; day_trip; 2026-08-15; duration any; JPY40000 standard; ferry only; interest any; visited none; other ferry temporal date | A verified passenger ferry remains eligible without rail substitution. | naoshima-art-island-kagawa (ferry 154-191m; JPY27959-36359 verified); teshima-island-kagawa (ferry 148-210m; JPY29547-37947 verified); tomogashima-islands (ferry 80-95m; JPY19879-26809 verified) | PASS (none) | Three positive ferry results; no public-mode substitution. Transport topology / ferry. |
| TR01 | Nakayama; day_trip; date none; duration any; JPY40000 standard; train/shinkansen only; interest any; visited none; other compare pipeline estimate and derived duration | Pipeline estimate and derived duration should agree where a verified route exists. | abeno-harukas-300-osaka; okama-crater-yamagata; takachiho-gorge; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi | PASS (none) | 643 results; canonical duration and derived duration agree for inspected results; unavailable modes remain unknown. Travel time. |
| TR02 | Nakayama; day_trip; date none; duration any; JPY40000 standard; personal car only; interest any; visited none; other compare car duration | No verified car duration should be invented from distance or catalogue minutes. | nagano-kamikochi; jodogahama-beach-iwate; utsunomiya-oya; hikone-castle-shiga; boso-peninsula | PASS (none) | 194 results; car durations stay unknown. Travel-time fallback. |
| TR03 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other compare Home card with pipeline/details | Missing canonical duration should remain unknown on Home rather than become a distance-derived personalized claim. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | FAIL (P2) | Pipeline/detail canonical value is unknown, but Home fallback returns Abeno shinkansen 136-174m, Okama 113-144m, Nebuta 194-247m, Nagoya 95-122m, and Atami 41-53m. Travel time / cross-surface consistency. |
| TR04 | Shin-Yokohama; day_trip; date none; duration any; JPY40000 standard; train/shinkansen only; interest any; visited none; other suburban major-station coverage | Use canonical durations where evidence exists and leave unsupported corridors unknown. | abeno-harukas-300-osaka; okama-crater-yamagata; takachiho-gorge; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi | PASS (none) | 643 results; origin municipality is unknown and unsupported corridors remain unknown rather than fabricated. Origin / travel-time coverage. |
| B01 | Nakayama; day_trip; date none; duration any; JPY20000 economy; public all; interest any; visited none; other strict economy gate | Known complete verified estimates above the budget should be excluded. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | PASS (none) | No returned result had a complete verified estimate above JPY20000. Budget filtering. |
| B02 | Yokohama; day_trip; date none; duration any; JPY10000 economy; train only; interest any; visited none; other strict low-budget adversarial case | Known expensive train trips should be excluded; unknown fares remain explicitly unknown. | nagano-kamikochi; abeno-harukas-300-osaka; nikko-toshogu-shrine-tochigi; enoshima-island; jodogahama-beach-iwate | PASS (none) | No returned result had a complete verified estimate above JPY10000. No affordability reason was emitted for unknown costs. Budget filtering. |
| B03 | Fukuoka; day_trip; date none; duration any; JPY20000 economy; flight only; interest any; visited none; other unknown-fare flight routes | Unknown flight fare must not become a verified zero or falsely cheap recommendation. | kabira-bay-ishigaki (flight 252-287m; JPY6090-10080 transport-unknown); shiratani-unsuikyo-ravine (flight 206-236m; JPY5565-9555 transport-unknown); yonehara-beach-coral-ishigaki (flight 250-285m; JPY4830-8820 transport-unknown); tamatorizaki-viewpoint-ishigaki (flight 252-287m; JPY4830-8820 transport-unknown); jomon-sugi-yakushima (flight 208-238m; JPY5145-9135 transport-unknown) | PASS (none) | Eight results retained an explicitly transport-unknown on-site range and emitted no budgetWithin/budgetGreatValue reason. This is expected unknown-cost behavior, not a budget defect. Budget / unknown fare. |
| B04 | Tokyo; day_trip; date none; duration any; JPY150000 luxury; public all; interest any; visited none; other flexible budget | Luxury mode should retain authorized options without a lower-tier budget gate. | shibuya-sky-shibuya; teamlab-borderless-azabudai; okama-crater-yamagata; chuo-city; enoshima-island | REVIEW (none) | 686 results; no obvious luxury exclusion observed. Budget filtering. |
| W01 | Nakayama; weekend_2d1n; 2026-08-15; duration any; JPY100000 comfortable; public all; interest any; visited none; accommodation JPY25000 | Weekend output should contain feasible trip areas. | No results | REVIEW (none) | Conservative policy rejects unknown travel, leaving no Nakayama weekend candidates. This is a data/coverage observation, not evidence of an impossible recommendation. Weekend feasibility / origin coverage. |
| W02 | Tokyo; weekend_2d1n; 2026-08-15; duration any; JPY100000 comfortable; public all; interest any; visited none; accommodation JPY25000 | Results should be coherent trip areas with enough activity and eligible travel. | takayama-city (shinkansen 105-180m; JPY72095-97820 verified); nagano-kamikochi (train 150-210m; JPY39039-64764 verified); nagoya-city (shinkansen 100-185m; JPY72185-97910 verified); osaka-city (shinkansen 150-270m; JPY63151-88876 verified); nikko-city (train 100-160m; JPY35362-61087 verified) | PASS (none) | 93 results; all satisfy travel, capacity, and structured area policy. Weekend feasibility. |
| E01 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other reason check | Fast-train explanation should report the actual train estimate. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | PASS (none) | No fast-train reason was emitted where the train estimate was unavailable; no mismatch found. Explanation consistency. |
| E02 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest any; visited none; other inspect top 10 diversity | Top results should not contain direct parent/child duplicates. | abeno-harukas-300-osaka; okama-crater-yamagata; nebuta-museum-wa-rasse-aomori; nagoya-castle-aichi; atami-city | PASS (none) | No direct parent/child duplicate in top 10; broader same-region diversity remains a manual review item. Ranking / diversity. |
| R01 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest nature; visited none; other compare with R02 history | Changing one meaningful preference should change ranking plausibly. | shirakawa-village; gifu-castle-gifu; toyama-alpine; mount-fuji; fujiyoshida-city | REVIEW (none) | Top 10 differs from history; direction is plausible and needs product judgment rather than an automated assertion. Ranking / personalization. |
| R02 | Nakayama; day_trip; date none; duration any; JPY40000 standard; public all; interest history; visited none; other baseline for R01 | Baseline for the preference-change test. | nagoya-castle-aichi; gunma-kusatsu-onsen; tokyo-station-chiyoda; kanazawa-castle-ishikawa; maruoka-castle-fukui | REVIEW (none) | 518 results; history reasons are emitted for leading matches. Ranking / personalization. |

## Summary

- Total scenarios: 37
- PASS: 22
- FAIL: 3
- REVIEW: 12
- Confirmed P1 findings: 1
- Confirmed P2 findings: 2
- Confirmed P3 findings: 0
- Confirmed P4 findings: 0

Recurring patterns:

1. Day-trip filtering is hard on visit band but not on the derived origin-aware total. Five known Tokyo-origin half-day candidates require more than 7.5h at minimum.
2. The Home duration controls display 4h, 4-7.5h, and 7.5-14h labels, while getVisitBand admits 2.5-5h as halfDay and 5h-plus as fullDay. 72 half-day results did not fit the visible 4-7.5h range.
3. Kanagawa origins resolve to mainland-honshu but not a confident municipality. With no Kanagawa ground corridors, the pipeline correctly keeps duration unknown, while Home still renders a distance-derived estimate.
4. Unknown flight fares are retained with transport-unknown state and no affordability reason. This passed the adversarial budget test.
5. Island topology, train-only, ferry-only positive routing, visited exclusion, weekend capacity, and no fabricated car durations passed.

## Confirmed Defects

### D1 - Day-trip filter does not enforce total feasibility

Classification: FILTER BUG with travel-time impact

Severity: P1 / Beta blocker

Reproduction:

1. Set origin to Tokyo Station.
2. Set trip type to day trip and duration to half day.
3. Set budget to JPY40000 standard and enable all public transport.
4. Run the recommendation pipeline.

Expected: no destination whose verified minimum total is above 7.5h should survive a half-day hard constraint.

Actual: matsumoto-castle-nagano, mito-castle-ibaraki, arakurayama-sengen-park-yamanashi, takato-castle-nagano, and kairakuen-mito survive. Their minimum derived totals are 8.0h, 7.7h, 8.2h, 9.0h, and 7.7h respectively. The Nakayama half-day output also puts Abeno Harukas and Lake Tazawa in the top five while origin-aware travel is unknown.

Affected surfaces: Home recommendations, Destinations duration-filtered views, and any roulette path using the same pipeline.

Likely root cause: RecommendationPipeline uses matchesVisitDuration instead of estimateTripDuration for day-trip filtering. The current behavior was intentionally introduced to separate time at destination from total trip length, but the visible duration controls and beta expectation still imply feasibility.

Likely files/functions: src/shared/services/recommendation/RecommendationPipeline.ts runRecommendationPipeline; src/shared/services/recommendation/TripDurationService.ts estimateTripDuration; src/features/home/components/HomePlanner.tsx duration labels.

Recommended follow-up scope: decide and document whether Home controls represent visit time or total trip time. If the beta contract is a feasible day trip, apply a mode-specific total-time hard gate when a verified origin duration exists, define unknown-duration behavior, and add Tokyo/Nakayama/Shin-Yokohama regression tests. Do not use deprecated totalTripHours.

### D2 - Visible duration labels do not match filter bands

Classification: FILTER BUG / UI-EXPLANATION BUG

Severity: P2 / High

Reproduction:

1. Set origin to Tokyo Station.
2. Select day trip and Half day.
3. Compare returned recommendedVisitHours midpoints with the visible 4-7.5h label.

Expected: half-day results should fit 4-7.5h at the destination if that label is authoritative.

Actual: 72 returned results are classified halfDay by getVisitBand but have midpoints from 2.5h to below 4h. Roppongi Hills, Shibuya Sky, Tokyo Metropolitan Government Building, and Sunshine 60 each show a 3.0h midpoint in the half-day result set.

Affected surfaces: Home duration selector, Home recommendations, Destinations duration filter, and destination card duration labels.

Likely root cause: getVisitBand uses thresholds of 2.5h and 5h, while HomePlanner displays under 4h, 4-7.5h, and 7.5-14h. The underlying separation of visit time from total time is defensible, but the user-visible ranges are not aligned.

Likely files/functions: src/shared/services/recommendation/TripDurationService.ts getVisitBand; src/features/home/components/HomePlanner.tsx DURATION_LABELS; src/features/destinations/Destinations.tsx matchesVisitDuration filter.

Recommended follow-up scope: align the visible labels and canonical visit-band thresholds, or change the filter band implementation. Add boundary tests at 2.5h, 4h, 5h, and 7.5h.

### D3 - Home shows a distance-derived fallback that other surfaces treat as unknown

Classification: TRAVEL-TIME BUG / UI-EXPLANATION BUG

Severity: P2 / High

Reproduction:

1. Set origin to Nakayama Station.
2. Enable all public transport and leave other filters neutral.
3. Inspect Abeno Harukas in the pipeline/detail data and Home card path.

Expected: when the canonical origin-aware registry has no duration, every surface should show unknown or clearly identify a non-personalized fallback.

Actual: the pipeline transportEstimate is unknown for Abeno, while Home getSafeDisplayEstimate returns a distance-derived shinkansen estimate of 136-174m. Destination details only show verified origin-aware durations and therefore do not show the same value.

Affected surfaces: Home recommendation cards versus destination details and recommendation diagnostics.

Likely root cause: HomeMatchCard calls getSafeDisplayEstimate after canonical transport lookup fails. That estimator uses coordinate distance and generic transport speeds for a presentation fallback. The pipeline and details correctly avoid using that fallback for ranking or budgeting, but the card still presents it as travel time.

Likely files/functions: src/features/home/components/HomeMatchCard.tsx; src/features/home/services/LocalDiscoveryDisplayEstimator.ts getSafeDisplayEstimate; src/features/destinations/DestinationDetails.tsx groundMinutesFor; src/shared/services/transport/OriginAwareTransportService.ts.

Recommended follow-up scope: make Home and details share the same unknown state, or label the fallback as non-personalized display-only and exclude it from any recommendation explanation. Add cross-surface tests for Nakayama, Shin-Yokohama, and an origin with verified Tokyo corridors.

## Expected / Not Bugs

- F01-F03 pass under the current implementation contract: day-trip filters use canonical on-site visit bands and do not use deprecated totalTripHours.
- T02 and T05 confirm transport selections are hard eligibility constraints.
- T04 returns no Tokyo ferry-only day trips because the configured routes do not provide a verified same-day outbound and return pair. T08 confirms positive ferry routing from Wakayama.
- T06 confirms island destinations do not inherit mainland rail, bus, or car topology.
- B01 and B02 have no complete verified budget violations. B03 keeps unknown flight fares explicitly transport-unknown and does not emit budgetWithin or budgetGreatValue. No budget filtering/scoring defect was confirmed.
- TR01, TR02, and TR04 confirm canonical travel estimates are not fabricated for unsupported modes or corridors. The unknown Kanagawa origin coverage is a registry/confidence observation, not a false-duration defect.
- W02 passes weekend travel, activity capacity, and area consolidation. W01 produces no result because the conservative policy refuses unknown travel; this needs origin-data coverage review but is not a false recommendation.
- E01 emits no fast-train reason when the canonical train estimate is unavailable. E02 has no direct parent/child duplicate in the top 10.

## Proposed Follow-up Linear Tickets

These are drafts for review. They are not production changes and were not created as separate implementation PRs in KAI-55.

### Ticket A - P1 FILTER: enforce feasible day-trip totals

Problem: day-trip duration filtering currently gates on visit band only, allowing known origin-aware totals above the selected half-day envelope.

Evidence: KAI-55 F14; five Tokyo-origin candidates exceed 7.5h at minimum. KAI-55 F02 also reproduces distant top results from Nakayama when the origin registry is unknown.

Scope: decide total-time versus visit-time product semantics; implement the chosen hard/unknown policy consistently in Home and Destinations; preserve weekend policy; add boundary and origin regression tests; do not read totalTripHours.

### Ticket B - P2 TRAVEL: align Home fallback with canonical travel truth

Problem: Home renders coordinate-derived travel times when the pipeline and destination details correctly have no verified origin-aware duration.

Evidence: KAI-55 TR03; Nakayama to Abeno displays 136-174m on Home fallback while canonical duration is unknown.

Scope: remove the personalized-looking fallback or label it explicitly as non-personalized; ensure recommendation reasons, cards, details, filters, and roulette use the same canonical unknown/known state; add cross-surface tests.

### Budget follow-up

No budget ticket is proposed from this audit. B03 passed: unknown flight fare remains flagged transport-unknown, is not used for affordability scoring, and does not generate an affordability explanation. A future budget ticket should only be opened if a UI consumer starts presenting the internal on-site range as a full-trip total.

## Beta Verdict

FAIL - BETA BLOCKED

The engine has strong conservative behavior for transport topology, unknown fares, visited exclusion, weekend area capacity, and unsupported travel modes. However, one P1 core-filter defect remains: a selected half-day day trip can retain known candidates whose minimum derived total exceeds the visible 7.5h envelope. Two P2 issues further reduce trust: the visible duration ranges do not match filter bands, and Home travel-time presentation can disagree with canonical details. KAI-55 should remain open until the filter semantics and cross-surface travel truth are resolved in separate reviewed follow-up changes.
