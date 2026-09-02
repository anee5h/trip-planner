# KAI-151 Phase 2A Sakura Impact Check

- Base commit: `a56d7dd41b8773b4c8b59ac22b25e6f508809792`
- Fixed travel date: `2026-04-05`
- Mutated records: **14**
- Method: Run the shared getRecommendations over the exact base-main catalogue and the post-mutation catalogue; compare result counts, top-10 membership, ranks, and scores. This is a directional pilot measurement, not a causal production experiment.

## Decision

Seasonal scores materially changed for surfaced records and one fixed Fukuoka top-10 result changed, but Tokyo/Osaka top-10 membership did not. Proceed with review of user impact; do not automatically research all remaining 341 candidates.

## Results

### tokyo

- Recommendation count: 921 → 921
- Top-10 overlap: 10/10
- Entered: none
- Exited: none
- goryokaku: rank 396 → 57; score 52.64 → 70.64
- kakunodate-samurai-district-akita: rank 839 → 456; score 32 → 50
- kimii-dera-temple: rank 809 → 445; score 32.63333333333333 → 50.63333333333333
- kintai-bridge-yamaguchi: rank 811 → 446; score 32.6 → 50.6
- matsumae-castle: rank 842 → 457; score 32 → 50
- sengan-en-garden-kagoshima: rank 805 → 441; score 32.900000000000006 → 50.900000000000006
- serigaya-park: rank 348 → 46; score 54.89999999999999 → 72.89999999999999
- tsuyama-castle: rank 827 → 453; score 32.333333333333336 → 50.333333333333336

### osaka

- Recommendation count: 783 → 783
- Top-10 overlap: 10/10
- Entered: none
- Exited: none
- kakunodate-samurai-district-akita: rank 736 → 406; score 32 → 50
- kimii-dera-temple: rank 581 → 186; score 41.7 → 59.7
- kintai-bridge-yamaguchi: rank 571 → 179; score 42 → 60
- sengan-en-garden-kagoshima: rank 720 → 385; score 32.900000000000006 → 50.900000000000006
- serigaya-park: rank 395 → 45; score 50.239999999999995 → 68.24
- tsuyama-castle: rank 593 → 195; score 41.400000000000006 → 59.400000000000006

### fukuoka

- Recommendation count: 867 → 867
- Top-10 overlap: 9/10
- Entered: sengan-en-garden-kagoshima
- Exited: tokyo-skytree-sumida
- awa-shrine-tateyama: rank 816 → 562; score 20 → 38
- hitachi-kamine-park: rank 798 → 534; score 21.933333333333334 → 39.93333333333334
- kakunodate-samurai-district-akita: rank 680 → 301; score 32 → 50
- kimii-dera-temple: rank 648 → 285; score 32.63333333333333 → 50.63333333333333
- kintai-bridge-yamaguchi: rank 473 → 101; score 42 → 60
- nokonoshima-island-park: rank 557 → 137; score 38 → 56
- odawara-castle: rank 656 → 290; score 32.599999999999994 → 50.599999999999994
- okazaki-castle: rank 663 → 296; score 32.36 → 50.36
- sengan-en-garden-kagoshima: rank 164 → 4; score 54.900000000000006 → 72.9
- serigaya-park: rank 400 → 74; score 44.599999999999994 → 62.599999999999994
- shiroyama-park-tateyama: rank 856 → 564; score 20 → 38
- tsuyama-castle: rank 490 → 105; score 41.400000000000006 → 59.400000000000006
