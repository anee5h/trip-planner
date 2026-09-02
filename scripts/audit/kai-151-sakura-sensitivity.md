# KAI-151 Sakura Recommendation-Sensitivity Audit

- Base catalogue commit: `a56d7dd41b8773b4c8b59ac22b25e6f508809792`
- Post-mutation catalogue snapshot: `d7613a7639c1cc8f11117a94ce4c26c1694910a7`
- Audit clock: `2026-09-02T12:00:00+09:00` (frozen for deterministic existing-engine scoring)
- Audit generated: `2026-09-02`
- Mutated destinations audited: **14**
- Primary scenarios: **168** (14 destinations × 4 origins × 3 date positions)
- Canonical seasonality data changed by this audit: **no**

## Decision gate

**A. MERGE PR #315 AS-IS**

The seasonal score changes are fully attributable to the reviewed season fields and remain proportionate or large-but-explainable after travel, cost, transport, duration, and other ranking components are inspected. No unknown-seasonality bias or conservative dominance anomaly was found.

This is a sensitivity audit only. It does not change canonical seasonality data, recommendation weights, transport, budget, routing, UI, or any deferred thematic cohort.

## Scope and engine contract

- The audit compares the exact base catalogue with the exact post-PR-315 catalogue using the existing `getRecommendations`, `calculateScore`, `evaluateSeasonalSuitability`, and canonical budget/transport services.
- Context: `vibe=any`, `tripDuration=any` (the original day-trip trigger), party size 2, budget ¥100,000, standard budget tier, no car, and all public modes.
- Origins: Tokyo, Osaka, Fukuoka, and Kagoshima-Chuo as a regional origin.
- Every mutated destination is tested in a documented in-season date, the month immediately before the verified window, and a clearly off-season date.
- Positive rank delta means promotion (`rankBefore - rankAfter`). Absolute rank delta is reported separately.

## Classification counts

| Classification                     | Primary scenario count |
| ---------------------------------- | ---------------------: |
| proportionate_expected_change      |                     48 |
| large_but_explainable_change       |                     66 |
| possible_seasonality_overweighting |                      0 |
| unknown_seasonality_bias           |                      0 |
| unrelated_ranking_effect           |                      0 |
| insufficient_evidence              |                     54 |

The scenario IDs and destination IDs for every classification are in the machine-readable artifact under `summary.classificationScenarios` and `summary.classificationDestinationIds`.

## Unknown-vs-structured behavior

Unknown seasonality is neutral: the scorer falls back to 5 and the date evaluator gives no season/best-month contribution. Summer/winter comfort or other non-seasonal evidence can still contribute independently.

- Missing season rating fallback: **5**
- Missing `bestMonths` bonus: **0**
- Missing season penalty: **0**
- Non-seasonal comfort/ferry evidence can still contribute independently: **true**
- Unknown-bias cases found: **0**

## Sengan-en investigation

### Original trigger

The existing Phase 2A impact artifact recorded Sengan-en in the Fukuoka spring scenario as **164 → 4**. The pinned rerun records **163 → 4** using the same scores and deterministic engine path; the one-rank baseline discrepancy is preserved as a reproducibility note, not hidden.

- Score: **54.9 → 72.9**
- Score delta: **18**
- Seasonality field delta: **18**
- Attribution residual: **0**
- Before seasonality: fallback rating 5, no `bestMonths`, condition source unknown
- After seasonality: Spring rating 10, `bestMonths=[2,3,4]`
- Selected-date season correction: **15**
- Best-month bonus: **3**
- Seasonality contribution: **0 → 18**
- Best mode: **shinkansen**
- Travel estimate: **{"mode":"shinkansen","timeRangeMinutes":[92,165],"source":"verified_ground_route","evidence":"estimated","corridorEvidence":"verified","fare":[11950,11950],"fareScope":null}**
- Displayed cost range: **[58800,68200]**, budget ¥100,000
- Travel-time contribution: **0 → 0** (zero because the original trigger has no duration constraint; the transport access component and estimate remain present)
- Budget contribution: **10 → 10**
- Dominance assessment: **No conservative material-disadvantage combination was found; transport, cost, and core score remain visible.**

The movement is caused by the seasonal field only: the final score increases by 18 points, consisting of +15 for the selected Spring rating and +3 for the verified April month. Travel mode, travel estimate, cost range, budget contribution, and non-seasonal score components do not change.

### Outside the verified period

The shoulder and off-season Sengan-en rows are included in the primary scenario table and JSON. They show the exact date-sensitive behavior rather than assuming that an April promotion persists unchanged:

- Shoulder: selected month immediately before the verified `[2,3,4]` window.
- Off-season: August, four months after the last verified month.

### Duration and budget stress checks

These supplemental checks are not included in the 168-case classification count:

| Origin    | Duration    |  Budget | Date       | Rank before → after | Score before → after  | Travel-time contribution before → after | Budget contribution before → after |
| --------- | ----------- | ------: | ---------- | ------------------- | --------------------- | --------------------------------------- | ---------------------------------- |
| fukuoka   | any         | ¥100000 | 2026-04-05 | 163 → 4             | 54.9 → 72.9           | 0 → 0                                   | 10 → 10                            |
| fukuoka   | shortOuting | ¥100000 | 2026-04-05 | — → —               | 32.9 → 50.9           | 0 → 0                                   | 0 → 0                              |
| fukuoka   | halfDay     | ¥100000 | 2026-04-05 | — → —               | 32.9 → 50.9           | 0 → 0                                   | 0 → 0                              |
| fukuoka   | fullDay     | ¥100000 | 2026-04-05 | — → —               | 39.745714 → 57.745714 | -15.154286 → -15.154286                 | 10 → 10                            |
| kagoshima | any         | ¥100000 | 2026-04-05 | 51 → 1              | 57.2 → 75.2           | 0 → 0                                   | 10 → 10                            |
| kagoshima | shortOuting | ¥100000 | 2026-04-05 | 2 → 1               | 46.773891 → 64.773891 | -10.426109 → -10.426109                 | 10 → 10                            |
| kagoshima | fullDay     | ¥100000 | 2026-04-05 | — → —               | 49.74532 → 67.74532   | -7.45468 → -7.45468                     | 10 → 10                            |
| fukuoka   | any         |  ¥30000 | 2026-04-05 | 350 → 36            | 42.9 → 60.9           | 0 → 0                                   | 0 → 0                              |

## Seasonality-dominance assessment

The audit uses a conservative, documented heuristic: a post-change top-ten result is flagged only when the seasonal field contributes at least 15 points, its fundamental score is at least 15 points below the post-change top-ten median, and it also has a materially long travel estimate, cost above the selected budget, or unknown transport evidence. Flagged cases are classified as `possible_seasonality_overweighting`; none are silently reclassified as data errors.

- Potential-overweighting cases: **0**
- Anomalies: **1**

- **prior_rank_reproduction_note**: The committed directional artifact recorded Sengan/Fukuoka in-season as 164 → 4; the pinned current-engine rerun is 163 → 4 with identical 54.9 → 72.9 scores. The rerun has a deterministic 54.900000… tie with Nagasaki ahead of Sengan.

## Per-destination conclusions

| Destination                       | Scenarios | Max absolute rank delta | Top-ten appearances after | Conclusion                   |
| --------------------------------- | --------: | ----------------------: | ------------------------: | ---------------------------- |
| awa-shrine-tateyama               |        12 |                     338 |                         0 | large_but_explainable_change |
| goryokaku                         |        12 |                     339 |                         0 | large_but_explainable_change |
| hitachi-kamine-park               |        12 |                     361 |                         0 | large_but_explainable_change |
| kakunodate-samurai-district-akita |        12 |                     494 |                         0 | large_but_explainable_change |
| kimii-dera-temple                 |        12 |                     472 |                         0 | large_but_explainable_change |
| kintai-bridge-yamaguchi           |        12 |                     396 |                         0 | large_but_explainable_change |
| matsumae-castle                   |        12 |                     385 |                         0 | large_but_explainable_change |
| nokonoshima-island-park           |        12 |                     419 |                         0 | large_but_explainable_change |
| odawara-castle                    |        12 |                     417 |                         0 | large_but_explainable_change |
| okazaki-castle                    |        12 |                     488 |                         0 | large_but_explainable_change |
| sengan-en-garden-kagoshima        |        12 |                     364 |                         3 | large_but_explainable_change |
| serigaya-park                     |        12 |                     416 |                         0 | large_but_explainable_change |
| shiroyama-park-tateyama           |        12 |                     380 |                         0 | large_but_explainable_change |
| tsuyama-castle                    |        12 |                     488 |                         0 | large_but_explainable_change |

## All primary scenarios

| Destination                       | Origin    | Position   | Date       | Rank before → after | Abs. delta | Score before → after  | Seasonality before → after | Travel-time before → after | Budget before → after | Classification                |
| --------------------------------- | --------- | ---------- | ---------- | ------------------- | ---------: | --------------------- | -------------------------- | -------------------------- | --------------------- | ----------------------------- |
| awa-shrine-tateyama               | tokyo     | in_season  | 2026-04-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| awa-shrine-tateyama               | tokyo     | shoulder   | 2026-03-15 | — → —               |          — | 20 → 35               | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| awa-shrine-tateyama               | tokyo     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| awa-shrine-tateyama               | osaka     | in_season  | 2026-04-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| awa-shrine-tateyama               | osaka     | shoulder   | 2026-03-15 | — → —               |          — | 20 → 35               | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| awa-shrine-tateyama               | osaka     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| awa-shrine-tateyama               | fukuoka   | in_season  | 2026-04-15 | 816 → 562           |        254 | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| awa-shrine-tateyama               | fukuoka   | shoulder   | 2026-03-15 | 816 → 602           |        214 | 20 → 35               | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| awa-shrine-tateyama               | fukuoka   | off_season | 2026-08-15 | 816 → 798           |         18 | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| awa-shrine-tateyama               | kagoshima | in_season  | 2026-04-15 | 768 → 430           |        338 | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| awa-shrine-tateyama               | kagoshima | shoulder   | 2026-03-15 | 768 → 489           |        279 | 20 → 35               | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| awa-shrine-tateyama               | kagoshima | off_season | 2026-08-15 | 768 → 748           |         20 | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| goryokaku                         | tokyo     | in_season  | 2026-04-15 | 396 → 57            |        339 | 52.64 → 70.64         | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| goryokaku                         | tokyo     | shoulder   | 2026-03-15 | 396 → 71            |        325 | 52.64 → 67.64         | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| goryokaku                         | tokyo     | off_season | 2026-09-15 | 394 → 394           |          0 | 52.64 → 52.64         | 0 → 0                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| goryokaku                         | osaka     | in_season  | 2026-04-15 | — → —               |          — | 40.64 → 58.64         | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | osaka     | shoulder   | 2026-03-15 | — → —               |          — | 40.64 → 55.64         | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | osaka     | off_season | 2026-09-15 | — → —               |          — | 40.64 → 40.64         | 0 → 0                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | fukuoka   | in_season  | 2026-04-15 | — → —               |          — | 40.64 → 58.64         | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | fukuoka   | shoulder   | 2026-03-15 | — → —               |          — | 40.64 → 55.64         | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | fukuoka   | off_season | 2026-09-15 | — → —               |          — | 40.64 → 40.64         | 0 → 0                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | kagoshima | in_season  | 2026-04-15 | — → —               |          — | 40.64 → 58.64         | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | kagoshima | shoulder   | 2026-03-15 | — → —               |          — | 40.64 → 55.64         | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| goryokaku                         | kagoshima | off_season | 2026-09-15 | — → —               |          — | 40.64 → 40.64         | 0 → 0                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | tokyo     | in_season  | 2026-04-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | tokyo     | shoulder   | 2026-03-15 | — → —               |          — | 20 → 35               | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | tokyo     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | osaka     | in_season  | 2026-04-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | osaka     | shoulder   | 2026-03-15 | — → —               |          — | 20 → 35               | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | osaka     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| hitachi-kamine-park               | fukuoka   | in_season  | 2026-04-15 | 798 → 534           |        264 | 21.933333 → 39.933333 | 0 → 18                     | 0 → 0                      | 1.933333 → 1.933333   | large_but_explainable_change  |
| hitachi-kamine-park               | fukuoka   | shoulder   | 2026-03-15 | 798 → 572           |        226 | 21.933333 → 36.933333 | 0 → 15                     | 0 → 0                      | 1.933333 → 1.933333   | large_but_explainable_change  |
| hitachi-kamine-park               | fukuoka   | off_season | 2026-08-15 | 797 → 797           |          0 | 21.933333 → 24.933333 | 0 → 3                      | 0 → 0                      | 1.933333 → 1.933333   | proportionate_expected_change |
| hitachi-kamine-park               | kagoshima | in_season  | 2026-04-15 | 749 → 388           |        361 | 21.933333 → 39.933333 | 0 → 18                     | 0 → 0                      | 1.933333 → 1.933333   | large_but_explainable_change  |
| hitachi-kamine-park               | kagoshima | shoulder   | 2026-03-15 | 749 → 451           |        298 | 21.933333 → 36.933333 | 0 → 15                     | 0 → 0                      | 1.933333 → 1.933333   | large_but_explainable_change  |
| hitachi-kamine-park               | kagoshima | off_season | 2026-08-15 | 748 → 745           |          3 | 21.933333 → 24.933333 | 0 → 3                      | 0 → 0                      | 1.933333 → 1.933333   | proportionate_expected_change |
| kakunodate-samurai-district-akita | tokyo     | in_season  | 2026-04-15 | 839 → 456           |        383 | 32 → 50               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | tokyo     | shoulder   | 2026-03-15 | 839 → 502           |        337 | 32 → 47               | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | tokyo     | off_season | 2026-09-15 | 839 → 839           |          0 | 32 → 32               | 0 → 0                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| kakunodate-samurai-district-akita | osaka     | in_season  | 2026-04-15 | 736 → 406           |        330 | 32 → 50               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | osaka     | shoulder   | 2026-03-15 | 737 → 448           |        289 | 32 → 47               | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | osaka     | off_season | 2026-09-15 | 737 → 737           |          0 | 32 → 32               | 0 → 0                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| kakunodate-samurai-district-akita | fukuoka   | in_season  | 2026-04-15 | 680 → 301           |        379 | 32 → 50               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | fukuoka   | shoulder   | 2026-03-15 | 679 → 347           |        332 | 32 → 47               | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | fukuoka   | off_season | 2026-09-15 | 681 → 681           |          0 | 32 → 32               | 0 → 0                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| kakunodate-samurai-district-akita | kagoshima | in_season  | 2026-04-15 | 621 → 127           |        494 | 32 → 50               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | kagoshima | shoulder   | 2026-03-15 | 620 → 164           |        456 | 32 → 47               | 0 → 15                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| kakunodate-samurai-district-akita | kagoshima | off_season | 2026-09-15 | 621 → 621           |          0 | 32 → 32               | 0 → 0                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| kimii-dera-temple                 | tokyo     | in_season  | 2026-03-15 | 809 → 444           |        365 | 32.633333 → 50.633333 | 0 → 18                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kimii-dera-temple                 | tokyo     | shoulder   | 2026-02-15 | 783 → 888           |        105 | 32.633333 → 29.633333 | 0 → -3                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kimii-dera-temple                 | tokyo     | off_season | 2026-08-15 | 803 → 737           |         66 | 32.633333 → 35.633333 | 0 → 3                      | 0 → 0                      | 0.933333 → 0.933333   | proportionate_expected_change |
| kimii-dera-temple                 | osaka     | in_season  | 2026-03-15 | 583 → 184           |        399 | 41.7 → 59.7           | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| kimii-dera-temple                 | osaka     | shoulder   | 2026-02-15 | 526 → 612           |         86 | 41.7 → 38.7           | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kimii-dera-temple                 | osaka     | off_season | 2026-08-15 | 544 → 465           |         79 | 41.7 → 44.7           | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kimii-dera-temple                 | fukuoka   | in_season  | 2026-03-15 | 647 → 280           |        367 | 32.633333 → 50.633333 | 0 → 18                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kimii-dera-temple                 | fukuoka   | shoulder   | 2026-02-15 | 623 → 748           |        125 | 32.633333 → 29.633333 | 0 → -3                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kimii-dera-temple                 | fukuoka   | off_season | 2026-08-15 | 649 → 580           |         69 | 32.633333 → 35.633333 | 0 → 3                      | 0 → 0                      | 0.933333 → 0.933333   | proportionate_expected_change |
| kimii-dera-temple                 | kagoshima | in_season  | 2026-03-15 | 580 → 108           |        472 | 32.633333 → 50.633333 | 0 → 18                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kimii-dera-temple                 | kagoshima | shoulder   | 2026-02-15 | 544 → 678           |        134 | 32.633333 → 29.633333 | 0 → -3                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kimii-dera-temple                 | kagoshima | off_season | 2026-08-15 | 573 → 442           |        131 | 32.633333 → 35.633333 | 0 → 3                      | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| kintai-bridge-yamaguchi           | tokyo     | in_season  | 2026-03-15 | 811 → 445           |        366 | 32.6 → 50.6           | 0 → 18                     | 0 → 0                      | 0.6 → 0.6             | large_but_explainable_change  |
| kintai-bridge-yamaguchi           | tokyo     | shoulder   | 2026-02-15 | 785 → 889           |        104 | 32.6 → 29.6           | 0 → -3                     | 0 → 0                      | 0.6 → 0.6             | large_but_explainable_change  |
| kintai-bridge-yamaguchi           | tokyo     | off_season | 2026-08-15 | 805 → 738           |         67 | 32.6 → 35.6           | 0 → 3                      | 0 → 0                      | 0.6 → 0.6             | proportionate_expected_change |
| kintai-bridge-yamaguchi           | osaka     | in_season  | 2026-03-15 | 573 → 177           |        396 | 42 → 60               | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| kintai-bridge-yamaguchi           | osaka     | shoulder   | 2026-02-15 | 516 → 605           |         89 | 42 → 39               | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kintai-bridge-yamaguchi           | osaka     | off_season | 2026-08-15 | 535 → 461           |         74 | 42 → 45               | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kintai-bridge-yamaguchi           | fukuoka   | in_season  | 2026-03-15 | 473 → 102           |        371 | 42 → 60               | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| kintai-bridge-yamaguchi           | fukuoka   | shoulder   | 2026-02-15 | 417 → 500           |         83 | 42 → 39               | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kintai-bridge-yamaguchi           | fukuoka   | off_season | 2026-08-15 | 439 → 372           |         67 | 42 → 45               | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kintai-bridge-yamaguchi           | kagoshima | in_season  | 2026-03-15 | 301 → 15            |        286 | 42 → 60               | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| kintai-bridge-yamaguchi           | kagoshima | shoulder   | 2026-02-15 | 221 → 311           |         90 | 42 → 39               | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| kintai-bridge-yamaguchi           | kagoshima | off_season | 2026-08-15 | 233 → 174           |         59 | 42 → 45               | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| matsumae-castle                   | tokyo     | in_season  | 2026-04-15 | 842 → 457           |        385 | 32 → 50               | 0 → 18                     | 0 → 0                      | 0.6 → 0.6             | large_but_explainable_change  |
| matsumae-castle                   | tokyo     | shoulder   | 2026-03-15 | 842 → 505           |        337 | 32 → 47               | 0 → 15                     | 0 → 0                      | 0.6 → 0.6             | large_but_explainable_change  |
| matsumae-castle                   | tokyo     | off_season | 2026-09-15 | 842 → 842           |          0 | 32 → 32               | 0 → 0                      | 0 → 0                      | 0.6 → 0.6             | proportionate_expected_change |
| matsumae-castle                   | osaka     | in_season  | 2026-04-15 | — → —               |          — | 31.4 → 49.4           | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | osaka     | shoulder   | 2026-03-15 | — → —               |          — | 31.4 → 46.4           | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | osaka     | off_season | 2026-09-15 | — → —               |          — | 31.4 → 31.4           | 0 → 0                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | fukuoka   | in_season  | 2026-04-15 | — → —               |          — | 31.4 → 49.4           | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | fukuoka   | shoulder   | 2026-03-15 | — → —               |          — | 31.4 → 46.4           | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | fukuoka   | off_season | 2026-09-15 | — → —               |          — | 31.4 → 31.4           | 0 → 0                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | kagoshima | in_season  | 2026-04-15 | — → —               |          — | 31.4 → 49.4           | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | kagoshima | shoulder   | 2026-03-15 | — → —               |          — | 31.4 → 46.4           | 0 → 15                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| matsumae-castle                   | kagoshima | off_season | 2026-09-15 | — → —               |          — | 31.4 → 31.4           | 0 → 0                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | tokyo     | in_season  | 2026-03-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | tokyo     | shoulder   | 2026-02-15 | — → —               |          — | 20 → 17               | 0 → -3                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | tokyo     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | osaka     | in_season  | 2026-03-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | osaka     | shoulder   | 2026-02-15 | — → —               |          — | 20 → 17               | 0 → -3                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | osaka     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| nokonoshima-island-park           | fukuoka   | in_season  | 2026-03-15 | 556 → 137           |        419 | 38 → 56               | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| nokonoshima-island-park           | fukuoka   | shoulder   | 2026-02-15 | 525 → 568           |         43 | 38 → 35               | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| nokonoshima-island-park           | fukuoka   | off_season | 2026-08-15 | 550 → 470           |         80 | 38 → 41               | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| nokonoshima-island-park           | kagoshima | in_season  | 2026-03-15 | 423 → 64            |        359 | 38 → 56               | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| nokonoshima-island-park           | kagoshima | shoulder   | 2026-02-15 | 350 → 430           |         80 | 38 → 35               | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| nokonoshima-island-park           | kagoshima | off_season | 2026-08-15 | 382 → 269           |        113 | 38 → 41               | 0 → 3                      | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| odawara-castle                    | tokyo     | in_season  | 2026-02-15 | — → —               |          — | 32.6 → 44.6           | 0 → 12                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| odawara-castle                    | tokyo     | shoulder   | 2026-01-15 | — → —               |          — | 32.6 → 41.6           | 0 → 9                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| odawara-castle                    | tokyo     | off_season | 2026-08-15 | — → —               |          — | 32.6 → 35.6           | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| odawara-castle                    | osaka     | in_season  | 2026-02-15 | — → —               |          — | 32.6 → 44.6           | 0 → 12                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| odawara-castle                    | osaka     | shoulder   | 2026-01-15 | — → —               |          — | 32.6 → 41.6           | 0 → 9                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| odawara-castle                    | osaka     | off_season | 2026-08-15 | — → —               |          — | 32.6 → 35.6           | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| odawara-castle                    | fukuoka   | in_season  | 2026-02-15 | 631 → 343           |        288 | 32.6 → 44.6           | 0 → 12                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| odawara-castle                    | fukuoka   | shoulder   | 2026-01-15 | 631 → 423           |        208 | 32.6 → 41.6           | 0 → 9                      | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| odawara-castle                    | fukuoka   | off_season | 2026-08-15 | 657 → 582           |         75 | 32.6 → 35.6           | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| odawara-castle                    | kagoshima | in_season  | 2026-02-15 | 557 → 140           |        417 | 32.6 → 44.6           | 0 → 12                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| odawara-castle                    | kagoshima | shoulder   | 2026-01-15 | 557 → 232           |        325 | 32.6 → 41.6           | 0 → 9                      | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| odawara-castle                    | kagoshima | off_season | 2026-08-15 | 585 → 445           |        140 | 32.6 → 35.6           | 0 → 3                      | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| okazaki-castle                    | tokyo     | in_season  | 2026-03-15 | — → —               |          — | 32 → 50               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| okazaki-castle                    | tokyo     | shoulder   | 2026-02-15 | — → —               |          — | 32 → 29               | 0 → -3                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| okazaki-castle                    | tokyo     | off_season | 2026-08-15 | — → —               |          — | 32 → 35               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| okazaki-castle                    | osaka     | in_season  | 2026-03-15 | — → —               |          — | 32 → 50               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| okazaki-castle                    | osaka     | shoulder   | 2026-02-15 | — → —               |          — | 32 → 29               | 0 → -3                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| okazaki-castle                    | osaka     | off_season | 2026-08-15 | — → —               |          — | 32 → 35               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| okazaki-castle                    | fukuoka   | in_season  | 2026-03-15 | 662 → 289           |        373 | 32.36 → 50.36         | 0 → 18                     | 0 → 0                      | 0.36 → 0.36           | large_but_explainable_change  |
| okazaki-castle                    | fukuoka   | shoulder   | 2026-02-15 | 639 → 756           |        117 | 32.36 → 29.36         | 0 → -3                     | 0 → 0                      | 0.36 → 0.36           | large_but_explainable_change  |
| okazaki-castle                    | fukuoka   | off_season | 2026-08-15 | 664 → 583           |         81 | 32.36 → 35.36         | 0 → 3                      | 0 → 0                      | 0.36 → 0.36           | proportionate_expected_change |
| okazaki-castle                    | kagoshima | in_season  | 2026-03-15 | 601 → 113           |        488 | 32.36 → 50.36         | 0 → 18                     | 0 → 0                      | 0.36 → 0.36           | large_but_explainable_change  |
| okazaki-castle                    | kagoshima | shoulder   | 2026-02-15 | 567 → 688           |        121 | 32.36 → 29.36         | 0 → -3                     | 0 → 0                      | 0.36 → 0.36           | large_but_explainable_change  |
| okazaki-castle                    | kagoshima | off_season | 2026-08-15 | 595 → 449           |        146 | 32.36 → 35.36         | 0 → 3                      | 0 → 0                      | 0.36 → 0.36           | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | tokyo     | in_season  | 2026-04-05 | 805 → 441           |        364 | 32.9 → 50.9           | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | tokyo     | shoulder   | 2026-01-15 | 776 → 566           |        210 | 32.9 → 41.9           | 0 → 9                      | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | tokyo     | off_season | 2026-08-15 | 798 → 734           |         64 | 32.9 → 35.9           | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| sengan-en-garden-kagoshima        | osaka     | in_season  | 2026-04-05 | 721 → 385           |        336 | 32.9 → 50.9           | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | osaka     | shoulder   | 2026-01-15 | 700 → 520           |        180 | 32.9 → 41.9           | 0 → 9                      | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | osaka     | off_season | 2026-08-15 | 718 → 672           |         46 | 32.9 → 35.9           | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| sengan-en-garden-kagoshima        | fukuoka   | in_season  | 2026-04-05 | 163 → 4             |        159 | 54.9 → 72.9           | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | fukuoka   | shoulder   | 2026-01-15 | 124 → 16            |        108 | 54.9 → 63.9           | 0 → 9                      | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | fukuoka   | off_season | 2026-08-15 | 134 → 82            |         52 | 54.9 → 57.9           | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| sengan-en-garden-kagoshima        | kagoshima | in_season  | 2026-04-05 | 51 → 1              |         50 | 57.2 → 75.2           | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| sengan-en-garden-kagoshima        | kagoshima | shoulder   | 2026-01-15 | 36 → 3              |         33 | 57.2 → 66.2           | 0 → 9                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| sengan-en-garden-kagoshima        | kagoshima | off_season | 2026-08-15 | 33 → 27             |          6 | 57.2 → 60.2           | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| serigaya-park                     | tokyo     | in_season  | 2026-03-15 | 347 → 45            |        302 | 54.9 → 72.9           | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| serigaya-park                     | tokyo     | shoulder   | 2026-02-15 | 300 → 379           |         79 | 54.9 → 51.9           | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| serigaya-park                     | tokyo     | off_season | 2026-08-15 | 319 → 233           |         86 | 54.9 → 57.9           | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| serigaya-park                     | osaka     | in_season  | 2026-03-15 | 389 → 44            |        345 | 50.24 → 68.24         | 0 → 18                     | 0 → 0                      | 5.64 → 5.64           | large_but_explainable_change  |
| serigaya-park                     | osaka     | shoulder   | 2026-02-15 | 353 → 405           |         52 | 50.24 → 47.24         | 0 → -3                     | 0 → 0                      | 5.64 → 5.64           | proportionate_expected_change |
| serigaya-park                     | osaka     | off_season | 2026-08-15 | 374 → 305           |         69 | 50.24 → 53.24         | 0 → 3                      | 0 → 0                      | 5.64 → 5.64           | proportionate_expected_change |
| serigaya-park                     | fukuoka   | in_season  | 2026-03-15 | 400 → 75            |        325 | 44.6 → 62.6           | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| serigaya-park                     | fukuoka   | shoulder   | 2026-02-15 | 343 → 425           |         82 | 44.6 → 41.6           | 0 → -3                     | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| serigaya-park                     | fukuoka   | off_season | 2026-08-15 | 382 → 315           |         67 | 44.6 → 47.6           | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| serigaya-park                     | kagoshima | in_season  | 2026-03-15 | 513 → 97            |        416 | 33.533333 → 51.533333 | 0 → 18                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| serigaya-park                     | kagoshima | shoulder   | 2026-02-15 | 470 → 642           |        172 | 33.533333 → 30.533333 | 0 → -3                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| serigaya-park                     | kagoshima | off_season | 2026-08-15 | 504 → 423           |         81 | 33.533333 → 36.533333 | 0 → 3                      | 0 → 0                      | 0.933333 → 0.933333   | proportionate_expected_change |
| shiroyama-park-tateyama           | tokyo     | in_season  | 2026-03-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| shiroyama-park-tateyama           | tokyo     | shoulder   | 2026-02-15 | — → —               |          — | 20 → 17               | 0 → -3                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| shiroyama-park-tateyama           | tokyo     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| shiroyama-park-tateyama           | osaka     | in_season  | 2026-03-15 | — → —               |          — | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| shiroyama-park-tateyama           | osaka     | shoulder   | 2026-02-15 | — → —               |          — | 20 → 17               | 0 → -3                     | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| shiroyama-park-tateyama           | osaka     | off_season | 2026-08-15 | — → —               |          — | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | insufficient_evidence         |
| shiroyama-park-tateyama           | fukuoka   | in_season  | 2026-03-15 | 856 → 561           |        295 | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| shiroyama-park-tateyama           | fukuoka   | shoulder   | 2026-02-15 | 854 → 865           |         11 | 20 → 17               | 0 → -3                     | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| shiroyama-park-tateyama           | fukuoka   | off_season | 2026-08-15 | 856 → 799           |         57 | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| shiroyama-park-tateyama           | kagoshima | in_season  | 2026-03-15 | 810 → 430           |        380 | 20 → 38               | 0 → 18                     | 0 → 0                      | 0 → 0                 | large_but_explainable_change  |
| shiroyama-park-tateyama           | kagoshima | shoulder   | 2026-02-15 | 808 → 822           |         14 | 20 → 17               | 0 → -3                     | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| shiroyama-park-tateyama           | kagoshima | off_season | 2026-08-15 | 810 → 749           |         61 | 20 → 23               | 0 → 3                      | 0 → 0                      | 0 → 0                 | proportionate_expected_change |
| tsuyama-castle                    | tokyo     | in_season  | 2026-03-15 | 827 → 452           |        375 | 32.333333 → 50.333333 | 0 → 18                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| tsuyama-castle                    | tokyo     | shoulder   | 2026-02-15 | 801 → 892           |         91 | 32.333333 → 29.333333 | 0 → -3                     | 0 → 0                      | 0.933333 → 0.933333   | proportionate_expected_change |
| tsuyama-castle                    | tokyo     | off_season | 2026-08-15 | 822 → 740           |         82 | 32.333333 → 35.333333 | 0 → 3                      | 0 → 0                      | 0.933333 → 0.933333   | proportionate_expected_change |
| tsuyama-castle                    | osaka     | in_season  | 2026-03-15 | 595 → 195           |        400 | 41.4 → 59.4           | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| tsuyama-castle                    | osaka     | shoulder   | 2026-02-15 | 540 → 618           |         78 | 41.4 → 38.4           | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| tsuyama-castle                    | osaka     | off_season | 2026-08-15 | 559 → 471           |         88 | 41.4 → 44.4           | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| tsuyama-castle                    | fukuoka   | in_season  | 2026-03-15 | 491 → 106           |        385 | 41.4 → 59.4           | 0 → 18                     | 0 → 0                      | 10 → 10               | large_but_explainable_change  |
| tsuyama-castle                    | fukuoka   | shoulder   | 2026-02-15 | 432 → 513           |         81 | 41.4 → 38.4           | 0 → -3                     | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| tsuyama-castle                    | fukuoka   | off_season | 2026-08-15 | 459 → 388           |         71 | 41.4 → 44.4           | 0 → 3                      | 0 → 0                      | 10 → 10               | proportionate_expected_change |
| tsuyama-castle                    | kagoshima | in_season  | 2026-03-15 | 603 → 115           |        488 | 32.333333 → 50.333333 | 0 → 18                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| tsuyama-castle                    | kagoshima | shoulder   | 2026-02-15 | 569 → 689           |        120 | 32.333333 → 29.333333 | 0 → -3                     | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |
| tsuyama-castle                    | kagoshima | off_season | 2026-08-15 | 597 → 450           |        147 | 32.333333 → 35.333333 | 0 → 3                      | 0 → 0                      | 0.933333 → 0.933333   | large_but_explainable_change  |

## Reproducibility

- Canonical snapshot hashes, mutation-scope checks, fixed context, and all scenario outputs are in `scripts/audit/kai-151-sakura-sensitivity.json`.
- The generator is read-only with respect to catalogue data.
- `npm run check:kai-151-sensitivity` compares both committed artifacts byte-for-byte with a fresh generation.
- No autumn, winter, alpine, beach, no-signal, provenance-only, Budget v2, local-transport, routing, UI, or unrelated recommendation work was started.
