# KAI-61 Explore Recommended QA

Deterministic local catalogue output from the KAI-61 branch. All cases use `none` car mode, all public modes, party size 2, the Explorer's standard budget (40,000 JPY), and the listed origin coordinates.

Travel efficiency: `-24 × (0.6 × travelShare + 0.4 × min(roundTripTravel / selectedEnvelope, 1))`. It uses travel burden only (not visit-duration utilization), is bounded and smooth, and is applied per usable transport mode after the shared feasibility gate. Envelopes: Short 4h, Half-day 7.5h, Full-day/Any 14h. The cap stays below the existing +25 explicit-interest boost.

## Formula calibration samples

The cap is 24 points: it is large enough to separate a near route from a day-trip edge case, but remains below the existing +25 explicit-interest boost. The two inputs are travel-only: share of the resulting outing spent travelling and round-trip travel against the selected envelope.

| origin              | duration | destination     | selected mode | evidence  | one-way midpoint | travel hours | travel share | envelope share | catalogue | mode budget | mode transport | efficiency | final |
| ------------------- | -------- | --------------- | ------------- | --------- | ---------------: | -----------: | -----------: | -------------: | --------: | ----------: | -------------: | ---------: | ----: |
| Nakayama / Yokohama | any      | Odawara City    | shinkansen    | estimated |     36–46m (41m) |          2.5 |         0.22 |           0.18 |      56.0 |         0.0 |           12.0 |       -4.9 |  63.1 |
| Nakayama / Yokohama | any      | Takachiho Gorge | flight        | verified  |  277–317m (297m) |          9.9 |         0.81 |           0.71 |      59.0 |       -68.3 |            0.0 |      -18.5 | -27.8 |
| Fukuoka             | fullDay  | Fukuoka City    | shinkansen    | estimated |     23–29m (26m) |          2.0 |         0.18 |           0.14 |      56.0 |         0.0 |           12.0 |       -3.9 |  64.1 |
| Fukuoka             | fullDay  | Beppu City      | train         | verified  |  115–160m (138m) |          4.6 |         0.34 |           0.33 |      56.0 |         3.7 |            4.5 |       -8.0 |  56.2 |
| Tokyo               | fullDay  | Enoshima        | train         | verified  |     50–90m (70m) |          2.3 |         0.23 |           0.17 |      60.2 |         5.8 |           11.0 |       -4.9 |  72.2 |

## Transport coverage notes

- Nakayama / Yokohama → Abeno Harukas has authorized train/shinkansen selections but no origin-aware evidence in the current registry. It is therefore excluded from personalized Day Trip results; the catalogue-only Any view remains unchanged.
- Nakayama / Yokohama → Takachiho has a verified flight path (277–317 minutes one way; 12.2h conservative total outing for Day Trip Any). Its -18.5 efficiency contribution plus mode budget keeps it out of the generic top ten; no route is fabricated.
- Fukuoka Full-day → Osaka City and Kyoto City have no usable origin-aware evidence for the selected matrix modes, so they are excluded as unknown rather than ranked from legacy transportOptions. This is a transport-coverage gap, not a scoring override.

## Nakayama / Yokohama

### Any trip + Recommended

#### Before

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Abeno Harukas 300 (Osaka Skyline) | shinkansen    | unknown         |                        — |              2–4h |            — |           60.8 |         0.0 |           12.0 |               0.0 |       12.0 |              72.8 |
|    2 | Okama Crater Lake                 | shinkansen    | unknown         |                        — |              1–3h |            — |           60.2 |         0.0 |           12.0 |               0.0 |       12.0 |              72.2 |
|    3 | Lake Tazawa                       | shinkansen    | unknown         |                        — |              3–5h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    4 | Takachiho Gorge                   | shinkansen    | unknown         |                        — |            1.5–3h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    5 | Mount Bandai                      | shinkansen    | unknown         |                        — |              5–7h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    6 | Aomori Nebuta Museum WA RASSE     | shinkansen    | unknown         |                        — |              1–3h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    7 | Goshikinuma Ponds                 | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|    8 | Mount Zao                         | shinkansen    | unknown         |                        — |              4–6h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|    9 | Yamadera (Risshakuji Temple)      | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|   10 | Nagoya Castle (Golden Shachihoko) | shinkansen    | unknown         |                        — |              2–4h |            — |           57.5 |         0.0 |           12.0 |               0.0 |       12.0 |              69.5 |

#### After

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Abeno Harukas 300 (Osaka Skyline) | shinkansen    | unknown         |                        — |              2–4h |            — |           60.8 |         0.0 |           12.0 |               0.0 |       12.0 |              72.8 |
|    2 | Okama Crater Lake                 | shinkansen    | unknown         |                        — |              1–3h |            — |           60.2 |         0.0 |           12.0 |               0.0 |       12.0 |              72.2 |
|    3 | Lake Tazawa                       | shinkansen    | unknown         |                        — |              3–5h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    4 | Takachiho Gorge                   | shinkansen    | unknown         |                        — |            1.5–3h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    5 | Mount Bandai                      | shinkansen    | unknown         |                        — |              5–7h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    6 | Aomori Nebuta Museum WA RASSE     | shinkansen    | unknown         |                        — |              1–3h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    7 | Goshikinuma Ponds                 | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|    8 | Mount Zao                         | shinkansen    | unknown         |                        — |              4–6h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|    9 | Yamadera (Risshakuji Temple)      | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|   10 | Nagoya Castle (Golden Shachihoko) | shinkansen    | unknown         |                        — |              2–4h |            — |           57.5 |         0.0 |           12.0 |               0.0 |       12.0 |              69.5 |

### Day trip + Any

#### Before

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Abeno Harukas 300 (Osaka Skyline) | shinkansen    | unknown         |                        — |              2–4h |            — |           60.8 |         0.0 |           12.0 |               0.0 |       12.0 |              72.8 |
|    2 | Okama Crater Lake                 | shinkansen    | unknown         |                        — |              1–3h |            — |           60.2 |         0.0 |           12.0 |               0.0 |       12.0 |              72.2 |
|    3 | Lake Tazawa                       | shinkansen    | unknown         |                        — |              3–5h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    4 | Takachiho Gorge                   | shinkansen    | unknown         |                        — |            1.5–3h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    5 | Mount Bandai                      | shinkansen    | unknown         |                        — |              5–7h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    6 | Aomori Nebuta Museum WA RASSE     | shinkansen    | unknown         |                        — |              1–3h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    7 | Goshikinuma Ponds                 | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|    8 | Mount Zao                         | shinkansen    | unknown         |                        — |              4–6h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|    9 | Yamadera (Risshakuji Temple)      | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|   10 | Nagoya Castle (Golden Shachihoko) | shinkansen    | unknown         |                        — |              2–4h |            — |           57.5 |         0.0 |           12.0 |               0.0 |       12.0 |              69.5 |

#### After

| rank | destination         | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Odawara City        | shinkansen    | estimated       |             36–46m (41m) |             6–12h |        11.5h |           56.0 |         0.0 |           12.0 |              -4.9 |        7.1 |              63.1 |
|    2 | Atami City          | shinkansen    | estimated       |             41–53m (47m) |             6–12h |        11.8h |           56.0 |         0.0 |           12.0 |              -5.3 |        6.7 |              62.7 |
|    3 | Utsunomiya City     | shinkansen    | estimated       |             59–75m (67m) |             6–12h |        12.5h |           56.0 |         0.0 |           12.0 |              -6.4 |        5.6 |              61.6 |
|    4 | Tokyo Station       | shinkansen    | estimated       |             31–39m (35m) |             4–10h |         9.3h |           54.2 |         0.0 |           12.0 |              -5.1 |        6.9 |              61.1 |
|    5 | Hakone Town         | bus           | estimated       |             72–92m (82m) |             8–14h |        15.1h |           57.2 |         0.0 |           10.0 |              -6.7 |        3.3 |              60.5 |
|    6 | Yokohama City       | shinkansen    | estimated       |             26–33m (30m) |             8–14h |        13.1h |           50.0 |         0.0 |           12.0 |              -3.7 |        8.3 |              58.3 |
|    7 | Harry Potter Studio | train         | estimated       |             33–43m (38m) |              7–9h |        10.4h |           62.0 |         0.0 |            0.0 |              -5.0 |       -5.0 |              57.0 |
|    8 | Enoshima            | train         | estimated       |             32–40m (36m) |              7–9h |        10.3h |           60.2 |         0.0 |            0.0 |              -4.9 |       -4.9 |              55.3 |
|    9 | Ghibli Museum       | train         | estimated       |             28–36m (32m) |              5–7h |         8.2h |           59.0 |         0.0 |            0.0 |              -5.4 |       -5.4 |              53.6 |
|   10 | Yokohama Zoorasia   | bus           | estimated       |             21–26m (24m) |              4–6h |         6.9h |           48.8 |         0.0 |           10.0 |              -5.2 |        4.8 |              53.6 |

#### Abeno Harukas breakdown

Before rank: **1** · after rank: **not eligible** · authorized selected modes: train, shinkansen. After eligibility is governed by the shared Day Trip gate; unknown personalized travel is not selectable.

| state  | selected mode | evidence | one-way range (midpoint) | visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final |
| ------ | ------------- | -------- | -----------------------: | ----: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----: |
| before | shinkansen    | unknown  |                        — |  2–4h |            — |           60.8 |         0.0 |           12.0 |               0.0 |       12.0 |  72.8 |
| after  | —             | unknown  |                        — |  2–4h |            — |           60.8 |         0.0 |            0.0 |                 — |        0.0 |  60.8 |

### Day trip + Short

#### Before

| rank | destination                  | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Ikuta Ryokuchi               | train         | estimated       |             22–28m (25m) |              1–3h |         3.9h |           46.7 |         0.0 |            0.0 |               0.0 |        0.0 |              46.7 |
|    2 | Omiya Bonsai Village         | train         | estimated       |             47–60m (54m) |              1–3h |         5.0h |           45.2 |         0.0 |            0.0 |               0.0 |        0.0 |              45.2 |
|    3 | Yanaka                       | train         | estimated       |             36–46m (41m) |              1–3h |         4.5h |           44.6 |         0.0 |            0.0 |               0.0 |        0.0 |              44.6 |
|    4 | Golden Gai                   | train         | estimated       |             32–40m (36m) |              1–3h |         4.3h |           43.7 |         0.0 |            0.0 |               0.0 |        0.0 |              43.7 |
|    5 | Sunshine City                | train         | estimated       |             34–44m (39m) |              1–3h |         4.5h |           42.5 |         0.0 |            0.0 |               0.0 |        0.0 |              42.5 |
|    6 | Kotoku-in Great Buddha       | train         | estimated       |             30–38m (34m) |              1–3h |         4.3h |           42.2 |         0.0 |            0.0 |               0.0 |        0.0 |              42.2 |
|    7 | Kagurazaka                   | train         | estimated       |             32–41m (37m) |              1–3h |         4.4h |           41.6 |         0.0 |            0.0 |               0.0 |        0.0 |              41.6 |
|    8 | Seiko Museum Ginza           | train         | estimated       |             32–41m (37m) |              1–3h |         4.4h |           41.3 |         0.0 |            0.0 |               0.0 |        0.0 |              41.3 |
|    9 | Shibuya Crossing and Hachiko | train         | estimated       |             29–37m (33m) |              1–3h |         4.2h |           41.3 |         0.0 |            0.0 |               0.0 |        0.0 |              41.3 |
|   10 | Tsurugaoka Hachimangu        | train         | estimated       |             29–37m (33m) |              1–3h |         4.2h |           41.3 |         0.0 |            0.0 |               0.0 |        0.0 |              41.3 |

#### After

| rank | destination            | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Ikuta Ryokuchi         | train         | estimated       |             22–28m (25m) |              1–3h |         3.9h |           46.7 |         0.0 |            0.0 |             -11.7 |      -11.7 |              35.0 |
|    2 | Yanaka                 | train         | estimated       |             36–46m (41m) |              1–3h |         4.5h |           44.6 |         0.0 |            0.0 |             -14.1 |      -14.1 |              30.5 |
|    3 | Golden Gai             | train         | estimated       |             32–40m (36m) |              1–3h |         4.3h |           43.7 |         0.0 |            0.0 |             -13.4 |      -13.4 |              30.3 |
|    4 | Serigaya Park          | train         | estimated       |             20–25m (23m) |              1–3h |         3.8h |           40.7 |         0.0 |            0.0 |             -11.3 |      -11.3 |              29.4 |
|    5 | Omiya Bonsai Village   | train         | estimated       |             47–60m (54m) |              1–3h |         5.0h |           45.2 |         0.0 |            0.0 |             -15.8 |      -15.8 |              29.4 |
|    6 | Buaiso                 | train         | estimated       |             20–25m (23m) |              1–3h |         3.8h |           40.4 |         0.0 |            0.0 |             -11.3 |      -11.3 |              29.1 |
|    7 | Kotoku-in Great Buddha | train         | estimated       |             30–38m (34m) |              1–3h |         4.3h |           42.2 |         0.0 |            0.0 |             -13.1 |      -13.1 |              29.1 |
|    8 | Fudaten Shrine         | train         | estimated       |             24–31m (28m) |              1–3h |         4.0h |           41.0 |         0.0 |            0.0 |             -12.1 |      -12.1 |              28.9 |
|    9 | Nozuta Park            | train         | estimated       |             23–29m (26m) |              1–3h |         4.0h |           40.7 |         0.0 |            0.0 |             -11.9 |      -11.9 |              28.8 |
|   10 | Sunshine City          | train         | estimated       |             34–44m (39m) |              1–3h |         4.5h |           42.5 |         0.0 |            0.0 |             -13.9 |      -13.9 |              28.6 |

### Day trip + Half-day

#### Before

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Shibuya Sky (Rooftop Observatory)                    | train         | estimated       |             29–37m (33m) |              2–4h |         5.2h |           60.8 |         0.0 |            0.0 |               0.0 |        0.0 |              60.8 |
|    2 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | estimated       |             31–39m (35m) |              2–4h |         5.3h |           60.2 |         0.0 |            0.0 |               0.0 |        0.0 |              60.2 |
|    3 | Tokyo Skytree                                        | train         | estimated       |             37–47m (42m) |              3–5h |         6.6h |           59.6 |         0.0 |            0.0 |               0.0 |        0.0 |              59.6 |
|    4 | Yokohama Landmark Tower (Sky Garden)                 | train         | estimated       |             22–28m (25m) |              2–4h |         4.9h |           59.6 |         0.0 |            0.0 |               0.0 |        0.0 |              59.6 |
|    5 | Tokyo Metropolitan Government Building Observatories | train         | estimated       |             31–39m (35m) |              2–4h |         5.3h |           59.0 |         0.0 |            0.0 |               0.0 |        0.0 |              59.0 |
|    6 | teamLab Borderless                                   | train         | estimated       |             31–39m (35m) |              3–5h |         6.3h |           58.4 |         0.0 |            0.0 |               0.0 |        0.0 |              58.4 |
|    7 | Joypolis Odaiba                                      | train         | estimated       |             32–40m (36m) |              2–3h |         4.8h |           57.2 |         0.0 |            0.0 |               0.0 |        0.0 |              57.2 |
|    8 | Sunshine 60 Observatory (Tenbou Park)                | train         | estimated       |             34–44m (39m) |              2–4h |         5.5h |           57.2 |         0.0 |            0.0 |               0.0 |        0.0 |              57.2 |
|    9 | teamLab Planets                                      | train         | estimated       |             33–43m (38m) |              3–5h |         6.4h |           57.2 |         0.0 |            0.0 |               0.0 |        0.0 |              57.2 |
|   10 | Edo Castle Ruins (Imperial Palace)                   | train         | estimated       |             33–43m (38m) |              3–5h |         6.4h |           56.6 |         0.0 |            0.0 |               0.0 |        0.0 |              56.6 |

#### After

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Shibuya Sky (Rooftop Observatory)                    | train         | estimated       |             29–37m (33m) |              2–4h |         5.2h |           60.8 |         0.0 |            0.0 |              -9.0 |       -9.0 |              51.8 |
|    2 | Yokohama Landmark Tower (Sky Garden)                 | train         | estimated       |             22–28m (25m) |              2–4h |         4.9h |           59.6 |         0.0 |            0.0 |              -8.1 |       -8.1 |              51.5 |
|    3 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | estimated       |             31–39m (35m) |              2–4h |         5.3h |           60.2 |         0.0 |            0.0 |              -9.2 |       -9.2 |              51.0 |
|    4 | Tokyo Skytree                                        | train         | estimated       |             37–47m (42m) |              3–5h |         6.6h |           59.6 |         0.0 |            0.0 |              -8.9 |       -8.9 |              50.7 |
|    5 | teamLab Borderless                                   | train         | estimated       |             31–39m (35m) |              3–5h |         6.3h |           58.4 |         0.0 |            0.0 |              -8.2 |       -8.2 |              50.2 |
|    6 | Tokyo Metropolitan Government Building Observatories | train         | estimated       |             31–39m (35m) |              2–4h |         5.3h |           59.0 |         0.0 |            0.0 |              -9.2 |       -9.2 |              49.8 |
|    7 | teamLab Planets                                      | train         | estimated       |             33–43m (38m) |              3–5h |         6.4h |           57.2 |         0.0 |            0.0 |              -8.6 |       -8.6 |              48.6 |
|    8 | Edo Castle Ruins (Imperial Palace)                   | train         | estimated       |             33–43m (38m) |              3–5h |         6.4h |           56.6 |         0.0 |            0.0 |              -8.6 |       -8.6 |              48.0 |
|    9 | Sunshine 60 Observatory (Tenbou Park)                | train         | estimated       |             34–44m (39m) |              2–4h |         5.5h |           57.2 |         0.0 |            0.0 |              -9.7 |       -9.7 |              47.5 |
|   10 | Joypolis Odaiba                                      | train         | estimated       |             32–40m (36m) |              2–3h |         4.8h |           57.2 |         0.0 |            0.0 |              -9.9 |       -9.9 |              47.3 |

### Day trip + Full-day

#### Before

| rank | destination         | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Atami City          | shinkansen    | estimated       |             41–53m (47m) |             6–12h |        11.8h |           56.0 |         0.0 |           12.0 |               0.0 |       12.0 |              68.0 |
|    2 | Odawara City        | shinkansen    | estimated       |             36–46m (41m) |             6–12h |        11.5h |           56.0 |         0.0 |           12.0 |               0.0 |       12.0 |              68.0 |
|    3 | Utsunomiya City     | shinkansen    | estimated       |             59–75m (67m) |             6–12h |        12.5h |           56.0 |         0.0 |           12.0 |               0.0 |       12.0 |              68.0 |
|    4 | Hakone Town         | bus           | estimated       |             72–92m (82m) |             8–14h |        15.1h |           57.2 |         0.0 |           10.0 |               0.0 |       10.0 |              67.2 |
|    5 | Tokyo Station       | shinkansen    | estimated       |             31–39m (35m) |             4–10h |         9.3h |           54.2 |         0.0 |           12.0 |               0.0 |       12.0 |              66.2 |
|    6 | Harry Potter Studio | train         | estimated       |             33–43m (38m) |              7–9h |        10.4h |           62.0 |         0.0 |            0.0 |               0.0 |        0.0 |              62.0 |
|    7 | Yokohama City       | shinkansen    | estimated       |             26–33m (30m) |             8–14h |        13.1h |           50.0 |         0.0 |           12.0 |               0.0 |       12.0 |              62.0 |
|    8 | Enoshima            | train         | estimated       |             32–40m (36m) |              7–9h |        10.3h |           60.2 |         0.0 |            0.0 |               0.0 |        0.0 |              60.2 |
|    9 | Ghibli Museum       | train         | estimated       |             28–36m (32m) |              5–7h |         8.2h |           59.0 |         0.0 |            0.0 |               0.0 |        0.0 |              59.0 |
|   10 | Yokohama Zoorasia   | bus           | estimated       |             21–26m (24m) |              4–6h |         6.9h |           48.8 |         0.0 |           10.0 |               0.0 |       10.0 |              58.8 |

#### After

| rank | destination         | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Odawara City        | shinkansen    | estimated       |             36–46m (41m) |             6–12h |        11.5h |           56.0 |         0.0 |           12.0 |              -4.9 |        7.1 |              63.1 |
|    2 | Atami City          | shinkansen    | estimated       |             41–53m (47m) |             6–12h |        11.8h |           56.0 |         0.0 |           12.0 |              -5.3 |        6.7 |              62.7 |
|    3 | Utsunomiya City     | shinkansen    | estimated       |             59–75m (67m) |             6–12h |        12.5h |           56.0 |         0.0 |           12.0 |              -6.4 |        5.6 |              61.6 |
|    4 | Tokyo Station       | shinkansen    | estimated       |             31–39m (35m) |             4–10h |         9.3h |           54.2 |         0.0 |           12.0 |              -5.1 |        6.9 |              61.1 |
|    5 | Hakone Town         | bus           | estimated       |             72–92m (82m) |             8–14h |        15.1h |           57.2 |         0.0 |           10.0 |              -6.7 |        3.3 |              60.5 |
|    6 | Yokohama City       | shinkansen    | estimated       |             26–33m (30m) |             8–14h |        13.1h |           50.0 |         0.0 |           12.0 |              -3.7 |        8.3 |              58.3 |
|    7 | Harry Potter Studio | train         | estimated       |             33–43m (38m) |              7–9h |        10.4h |           62.0 |         0.0 |            0.0 |              -5.0 |       -5.0 |              57.0 |
|    8 | Enoshima            | train         | estimated       |             32–40m (36m) |              7–9h |        10.3h |           60.2 |         0.0 |            0.0 |              -4.9 |       -4.9 |              55.3 |
|    9 | Ghibli Museum       | train         | estimated       |             28–36m (32m) |              5–7h |         8.2h |           59.0 |         0.0 |            0.0 |              -5.4 |       -5.4 |              53.6 |
|   10 | Yokohama Zoorasia   | bus           | estimated       |             21–26m (24m) |              4–6h |         6.9h |           48.8 |         0.0 |           10.0 |              -5.2 |        4.8 |              53.6 |

## Tokyo

### Any trip + Recommended

#### Before

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           60.2 |        10.0 |           15.0 |               0.0 |       25.0 |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | train         | verified        |             15–30m (23m) |              2–4h |         3.8h |           60.8 |         9.9 |           14.5 |               0.0 |       24.4 |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           59.0 |        10.0 |           15.0 |               0.0 |       25.0 |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | train         | verified        |             10–30m (20m) |              2–4h |         3.7h |           57.2 |        10.0 |           15.0 |               0.0 |       25.0 |              82.2 |
|    5 | teamLab Borderless                                   | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           58.4 |         7.8 |           15.0 |               0.0 |       22.8 |              81.2 |
|    6 | Tokyo Tower                                          | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           56.0 |        10.0 |           15.0 |               0.0 |       25.0 |              81.0 |
|    7 | Shibuya City                                         | train         | verified        |             15–30m (23m) |             5–11h |         8.8h |           57.8 |         7.6 |           14.5 |               0.0 |       22.1 |              79.9 |
|    8 | Chuo City                                            | train         | verified        |              5–15m (10m) |             6–12h |         9.3h |           56.0 |         6.9 |           15.5 |               0.0 |       22.4 |              78.4 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | train         | verified        |             50–90m (70m) |              2–4h |         5.3h |           59.6 |         7.5 |           11.0 |               0.0 |       18.5 |              78.1 |
|   10 | Minato City                                          | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |

#### After

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           60.2 |        10.0 |           15.0 |               0.0 |       25.0 |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | train         | verified        |             15–30m (23m) |              2–4h |         3.8h |           60.8 |         9.9 |           14.5 |               0.0 |       24.4 |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           59.0 |        10.0 |           15.0 |               0.0 |       25.0 |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | train         | verified        |             10–30m (20m) |              2–4h |         3.7h |           57.2 |        10.0 |           15.0 |               0.0 |       25.0 |              82.2 |
|    5 | teamLab Borderless                                   | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           58.4 |         7.8 |           15.0 |               0.0 |       22.8 |              81.2 |
|    6 | Tokyo Tower                                          | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           56.0 |        10.0 |           15.0 |               0.0 |       25.0 |              81.0 |
|    7 | Shibuya City                                         | train         | verified        |             15–30m (23m) |             5–11h |         8.8h |           57.8 |         7.6 |           14.5 |               0.0 |       22.1 |              79.9 |
|    8 | Chuo City                                            | train         | verified        |              5–15m (10m) |             6–12h |         9.3h |           56.0 |         6.9 |           15.5 |               0.0 |       22.4 |              78.4 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | train         | verified        |             50–90m (70m) |              2–4h |         5.3h |           59.6 |         7.5 |           11.0 |               0.0 |       18.5 |              78.1 |
|   10 | Minato City                                          | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |

### Day trip + Any

#### Before

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           60.2 |        10.0 |           15.0 |               0.0 |       25.0 |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | train         | verified        |             15–30m (23m) |              2–4h |         3.8h |           60.8 |         9.9 |           14.5 |               0.0 |       24.4 |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           59.0 |        10.0 |           15.0 |               0.0 |       25.0 |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | train         | verified        |             10–30m (20m) |              2–4h |         3.7h |           57.2 |        10.0 |           15.0 |               0.0 |       25.0 |              82.2 |
|    5 | teamLab Borderless                                   | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           58.4 |         7.8 |           15.0 |               0.0 |       22.8 |              81.2 |
|    6 | Tokyo Tower                                          | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           56.0 |        10.0 |           15.0 |               0.0 |       25.0 |              81.0 |
|    7 | Shibuya City                                         | train         | verified        |             15–30m (23m) |             5–11h |         8.8h |           57.8 |         7.6 |           14.5 |               0.0 |       22.1 |              79.9 |
|    8 | Chuo City                                            | train         | verified        |              5–15m (10m) |             6–12h |         9.3h |           56.0 |         6.9 |           15.5 |               0.0 |       22.4 |              78.4 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | train         | verified        |             50–90m (70m) |              2–4h |         5.3h |           59.6 |         7.5 |           11.0 |               0.0 |       18.5 |              78.1 |
|   10 | Minato City                                          | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |

#### After

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           60.2 |        10.0 |           15.0 |              -2.8 |       22.2 |              82.4 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | train         | verified        |             15–30m (23m) |              2–4h |         3.8h |           60.8 |         9.9 |           14.5 |              -3.5 |       20.9 |              81.7 |
|    3 | Tokyo Metropolitan Government Building Observatories | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           59.0 |        10.0 |           15.0 |              -2.8 |       22.2 |              81.2 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | train         | verified        |             10–30m (20m) |              2–4h |         3.7h |           57.2 |        10.0 |           15.0 |              -3.1 |       21.9 |              79.1 |
|    5 | teamLab Borderless                                   | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           58.4 |         7.8 |           15.0 |              -2.3 |       20.5 |              78.9 |
|    6 | Tokyo Tower                                          | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           56.0 |        10.0 |           15.0 |              -2.8 |       22.2 |              78.2 |
|    7 | Shibuya City                                         | train         | verified        |             15–30m (23m) |             5–11h |         8.8h |           57.8 |         7.6 |           14.5 |              -1.8 |       20.3 |              78.1 |
|    8 | Chuo City                                            | train         | verified        |              5–15m (10m) |             6–12h |         9.3h |           56.0 |         6.9 |           15.5 |              -0.7 |       21.7 |              77.7 |
|    9 | Minato City                                          | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |              -1.3 |       20.5 |              76.5 |
|   10 | Shinjuku City                                        | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |              -1.3 |       20.5 |              76.5 |

### Day trip + Short

#### Before

| rank | destination                  | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Yanaka                       | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           44.6 |        10.0 |           15.0 |               0.0 |       25.0 |              69.6 |
|    2 | Golden Gai                   | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           43.7 |        10.0 |           15.0 |               0.0 |       25.0 |              68.7 |
|    3 | Ikuta Ryokuchi               | train         | verified        |             50–90m (70m) |              1–3h |         4.3h |           46.7 |        10.0 |           11.0 |               0.0 |       21.0 |              67.7 |
|    4 | Sunshine City                | train         | verified        |             10–30m (20m) |              1–3h |         2.7h |           42.5 |        10.0 |           15.0 |               0.0 |       25.0 |              67.5 |
|    5 | Seiko Museum Ginza           | train         | verified        |              5–15m (10m) |              1–3h |         2.3h |           41.3 |        10.0 |           15.5 |               0.0 |       25.5 |              66.8 |
|    6 | Kagurazaka                   | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           41.6 |        10.0 |           15.0 |               0.0 |       25.0 |              66.6 |
|    7 | Omiya Bonsai Village         | train         | verified        |            45–110m (78m) |              1–3h |         4.6h |           45.2 |         9.8 |           11.5 |               0.0 |       21.3 |              66.5 |
|    8 | Boso-no-Mura                 | train         | verified        |            60–120m (90m) |              1–3h |         5.0h |           48.8 |         7.3 |           10.0 |               0.0 |       17.3 |              66.1 |
|    9 | Shibuya Crossing and Hachiko | train         | verified        |             15–30m (23m) |              1–3h |         2.8h |           41.3 |        10.0 |           14.5 |               0.0 |       24.5 |              65.8 |
|   10 | Omoide Yokocho               | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           40.7 |        10.0 |           15.0 |               0.0 |       25.0 |              65.7 |

#### After

| rank | destination           | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Yanaka                | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           44.6 |        10.0 |           15.0 |              -4.8 |       20.2 |              64.8 |
|    2 | Seiko Museum Ginza    | train         | verified        |              5–15m (10m) |              1–3h |         2.3h |           41.3 |        10.0 |           15.5 |              -2.9 |       22.6 |              63.9 |
|    3 | Golden Gai            | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           43.7 |        10.0 |           15.0 |              -4.8 |       20.2 |              63.9 |
|    4 | Sunshine City         | train         | verified        |             10–30m (20m) |              1–3h |         2.7h |           42.5 |        10.0 |           15.0 |              -5.2 |       19.8 |              62.3 |
|    5 | Hamarikyu Gardens     | train         | verified        |              5–15m (10m) |              1–3h |         2.3h |           39.5 |        10.0 |           15.5 |              -2.9 |       22.6 |              62.1 |
|    6 | Kagurazaka            | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           41.6 |        10.0 |           15.0 |              -4.8 |       20.2 |              61.8 |
|    7 | Omoide Yokocho        | train         | verified        |             10–25m (18m) |              1–3h |         2.6h |           40.7 |        10.0 |           15.0 |              -4.8 |       20.2 |              60.9 |
|    8 | Sugamo Jizo-dori      | train         | verified        |             10–30m (20m) |              1–3h |         2.7h |           40.7 |        10.0 |           15.0 |              -5.2 |       19.8 |              60.5 |
|    9 | Kabukiza Theatre      | train         | verified        |              5–15m (10m) |              1–3h |         2.3h |           37.7 |        10.0 |           15.5 |              -2.9 |       22.6 |              60.3 |
|   10 | Tokiwaso Manga Museum | train         | verified        |             10–30m (20m) |              1–3h |         2.7h |           40.4 |        10.0 |           15.0 |              -5.2 |       19.8 |              60.2 |

### Day trip + Half-day

#### Before

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           60.2 |        10.0 |           15.0 |               0.0 |       25.0 |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | train         | verified        |             15–30m (23m) |              2–4h |         3.8h |           60.8 |         9.9 |           14.5 |               0.0 |       24.4 |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           59.0 |        10.0 |           15.0 |               0.0 |       25.0 |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | train         | verified        |             10–30m (20m) |              2–4h |         3.7h |           57.2 |        10.0 |           15.0 |               0.0 |       25.0 |              82.2 |
|    5 | teamLab Borderless                                   | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           58.4 |         7.8 |           15.0 |               0.0 |       22.8 |              81.2 |
|    6 | Tokyo Tower                                          | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           56.0 |        10.0 |           15.0 |               0.0 |       25.0 |              81.0 |
|    7 | Yokohama Landmark Tower (Sky Garden)                 | train         | verified        |             50–90m (70m) |              2–4h |         5.3h |           59.6 |         7.5 |           11.0 |               0.0 |       18.5 |              78.1 |
|    8 | Takanawa Gateway                                     | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           49.4 |        10.0 |           15.0 |               0.0 |       25.0 |              74.4 |
|    9 | Kirin Beer Yokohama Factory                          | train         | verified        |             50–90m (70m) |          1.5–3.5h |         4.8h |           52.4 |        10.0 |           11.0 |               0.0 |       21.0 |              73.4 |
|   10 | Ueno Zoo                                             | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           48.2 |        10.0 |           15.0 |               0.0 |       25.0 |              73.2 |

#### After

| rank | destination                                          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           60.2 |        10.0 |           15.0 |              -3.2 |       21.8 |              82.0 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | train         | verified        |             15–30m (23m) |              2–4h |         3.8h |           60.8 |         9.9 |           14.5 |              -3.9 |       20.5 |              81.3 |
|    3 | Tokyo Metropolitan Government Building Observatories | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           59.0 |        10.0 |           15.0 |              -3.2 |       21.8 |              80.8 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | train         | verified        |             10–30m (20m) |              2–4h |         3.7h |           57.2 |        10.0 |           15.0 |              -3.5 |       21.5 |              78.7 |
|    5 | teamLab Borderless                                   | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           58.4 |         7.8 |           15.0 |              -2.6 |       20.2 |              78.6 |
|    6 | Tokyo Tower                                          | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           56.0 |        10.0 |           15.0 |              -3.2 |       21.8 |              77.8 |
|    7 | Takanawa Gateway                                     | train         | verified        |             10–25m (18m) |              2–4h |         3.6h |           49.4 |        10.0 |           15.0 |              -3.2 |       21.8 |              71.2 |
|    8 | Ueno Zoo                                             | train         | verified        |             10–25m (18m) |              3–5h |         4.6h |           48.2 |        10.0 |           15.0 |              -2.6 |       22.4 |              70.6 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | train         | verified        |             50–90m (70m) |              2–4h |         5.3h |           59.6 |         7.5 |           11.0 |              -9.3 |        9.2 |              68.8 |
|   10 | Ueno Park                                            | train         | verified        |             10–25m (18m) |            1.5–4h |         3.3h |           42.5 |        10.0 |           15.0 |              -3.3 |       21.7 |              64.2 |

### Day trip + Full-day

#### Before

| rank | destination          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | -------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Shibuya City         | train         | verified        |             15–30m (23m) |             5–11h |         8.8h |           57.8 |         7.6 |           14.5 |               0.0 |       22.1 |              79.9 |
|    2 | Chuo City            | train         | verified        |              5–15m (10m) |             6–12h |         9.3h |           56.0 |         6.9 |           15.5 |               0.0 |       22.4 |              78.4 |
|    3 | Minato City          | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |
|    4 | Shinjuku City        | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |
|    5 | Taito City           | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |
|    6 | Toshima City         | train         | verified        |             10–30m (20m) |             6–12h |         9.7h |           56.0 |         6.8 |           15.0 |               0.0 |       21.8 |              77.8 |
|    7 | Enoshima             | train         | verified        |             50–90m (70m) |              7–9h |        10.3h |           60.2 |         5.8 |           11.0 |               0.0 |       16.8 |              77.0 |
|    8 | Ginza                | train         | verified        |              5–15m (10m) |              5–7h |         6.3h |           53.0 |         7.9 |           15.5 |               0.0 |       23.4 |              76.4 |
|    9 | Omiya Railway Museum | train         | verified        |            45–110m (78m) |              7–9h |        10.6h |           57.8 |         5.5 |           11.5 |               0.0 |       17.0 |              74.8 |
|   10 | Ikebukuro (Toshima)  | train         | verified        |             10–30m (20m) |              7–9h |         8.7h |           53.0 |         5.9 |           15.0 |               0.0 |       20.9 |              73.9 |

#### After

| rank | destination         | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Shibuya City        | train         | verified        |             15–30m (23m) |             5–11h |         8.8h |           57.8 |         7.6 |           14.5 |              -1.8 |       20.3 |              78.1 |
|    2 | Chuo City           | train         | verified        |              5–15m (10m) |             6–12h |         9.3h |           56.0 |         6.9 |           15.5 |              -0.7 |       21.7 |              77.7 |
|    3 | Minato City         | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |              -1.3 |       20.5 |              76.5 |
|    4 | Shinjuku City       | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |              -1.3 |       20.5 |              76.5 |
|    5 | Taito City          | train         | verified        |             10–25m (18m) |             6–12h |         9.6h |           56.0 |         6.8 |           15.0 |              -1.3 |       20.5 |              76.5 |
|    6 | Toshima City        | train         | verified        |             10–30m (20m) |             6–12h |         9.7h |           56.0 |         6.8 |           15.0 |              -1.5 |       20.3 |              76.3 |
|    7 | Ginza               | train         | verified        |              5–15m (10m) |              5–7h |         6.3h |           53.0 |         7.9 |           15.5 |              -1.0 |       22.4 |              75.4 |
|    8 | Ikebukuro (Toshima) | train         | verified        |             10–30m (20m) |              7–9h |         8.7h |           53.0 |         5.9 |           15.0 |              -1.6 |       19.4 |              72.4 |
|    9 | Enoshima            | train         | verified        |             50–90m (70m) |              7–9h |        10.3h |           60.2 |         5.8 |           11.0 |              -4.9 |       12.0 |              72.2 |
|   10 | Akasaka (Minato)    | train         | verified        |             10–25m (18m) |              4–6h |         5.6h |           50.0 |         8.0 |           15.0 |              -2.0 |       21.0 |              71.0 |

## Osaka

### Any trip + Recommended

#### Before

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | train         | verified        |             15–45m (30m) |              3–5h |         5.0h |           57.8 |         8.6 |           14.5 |               0.0 |       23.1 |              80.9 |
|    2 | Hikone City                       | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    3 | Otsu City                         | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    4 | Himeji City                       | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    5 | Kobe City                         | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    6 | Sakai City                        | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    7 | Miyazu City                       | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    8 | Uji City                          | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    9 | Ikaruga Town                      | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |
|   10 | Nara City                         | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |

#### After

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | train         | verified        |             15–45m (30m) |              3–5h |         5.0h |           57.8 |         8.6 |           14.5 |               0.0 |       23.1 |              80.9 |
|    2 | Hikone City                       | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    3 | Otsu City                         | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    4 | Himeji City                       | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    5 | Kobe City                         | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    6 | Sakai City                        | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    7 | Miyazu City                       | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    8 | Uji City                          | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    9 | Ikaruga Town                      | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |
|   10 | Nara City                         | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |

### Day trip + Any

#### Before

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | train         | verified        |             15–45m (30m) |              3–5h |         5.0h |           57.8 |         8.6 |           14.5 |               0.0 |       23.1 |              80.9 |
|    2 | Hikone City                       | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    3 | Otsu City                         | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    4 | Himeji City                       | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    5 | Kobe City                         | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    6 | Sakai City                        | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    7 | Miyazu City                       | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    8 | Uji City                          | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    9 | Ikaruga Town                      | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |
|   10 | Nara City                         | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |

#### After

| rank | destination                       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | train         | verified        |             15–45m (30m) |              3–5h |         5.0h |           57.8 |         8.6 |           14.5 |              -3.6 |       19.5 |              77.3 |
|    2 | Hikone City                       | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |              -2.1 |       19.2 |              75.2 |
|    3 | Otsu City                         | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |              -2.1 |       19.2 |              75.2 |
|    4 | Himeji City                       | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |              -2.3 |       18.4 |              74.4 |
|    5 | Kobe City                         | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |              -2.3 |       18.4 |              74.4 |
|    6 | Sakai City                        | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |              -2.3 |       18.4 |              74.4 |
|    7 | Miyazu City                       | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |              -2.6 |       17.2 |              73.2 |
|    8 | Uji City                          | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |              -2.6 |       17.2 |              73.2 |
|    9 | Ikaruga Town                      | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |              -3.0 |       16.5 |              72.5 |
|   10 | Nara City                         | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |              -3.0 |       16.5 |              72.5 |

### Day trip + Short

#### Before

| rank | destination          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | -------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Kinkaku-ji           | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           46.1 |        10.0 |           13.2 |               0.0 |       23.2 |              69.3 |
|    2 | Nanzen-ji            | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           44.0 |        10.0 |           13.2 |               0.0 |       23.2 |              67.2 |
|    3 | Kobe Port Tower      | train         | verified        |             20–45m (33m) |              1–3h |         3.1h |           41.6 |        10.0 |           14.0 |               0.0 |       24.0 |              65.6 |
|    4 | Fushimi Inari Taisha | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           41.6 |        10.0 |           13.2 |               0.0 |       23.2 |              64.8 |
|    5 | Yasaka Shrine        | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           41.6 |        10.0 |           13.2 |               0.0 |       23.2 |              64.8 |
|    6 | Ginkaku-ji           | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           41.0 |        10.0 |           13.2 |               0.0 |       23.2 |              64.2 |
|    7 | Nishiki Market       | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           40.1 |        10.0 |           13.2 |               0.0 |       23.2 |              63.3 |
|    8 | Philosopher's Walk   | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           39.5 |        10.0 |           13.2 |               0.0 |       23.2 |              62.7 |
|    9 | Kitano Ijinkan       | train         | verified        |             20–45m (33m) |              1–3h |         3.1h |           38.3 |        10.0 |           14.0 |               0.0 |       24.0 |              62.3 |
|   10 | Kennin-ji            | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           38.6 |        10.0 |           13.2 |               0.0 |       23.2 |              61.8 |

#### After

| rank | destination          | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | -------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Kinkaku-ji           | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           46.1 |        10.0 |           13.2 |              -8.5 |       14.7 |              60.8 |
|    2 | Nanzen-ji            | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           44.0 |        10.0 |           13.2 |              -8.5 |       14.7 |              58.7 |
|    3 | Kobe Port Tower      | train         | verified        |             20–45m (33m) |              1–3h |         3.1h |           41.6 |        10.0 |           14.0 |              -7.7 |       16.3 |              57.9 |
|    4 | Fushimi Inari Taisha | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           41.6 |        10.0 |           13.2 |              -8.5 |       14.7 |              56.3 |
|    5 | Yasaka Shrine        | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           41.6 |        10.0 |           13.2 |              -8.5 |       14.7 |              56.3 |
|    6 | Ginkaku-ji           | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           41.0 |        10.0 |           13.2 |              -8.5 |       14.7 |              55.7 |
|    7 | Nishiki Market       | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           40.1 |        10.0 |           13.2 |              -8.5 |       14.7 |              54.8 |
|    8 | Kitano Ijinkan       | train         | verified        |             20–45m (33m) |              1–3h |         3.1h |           38.3 |        10.0 |           14.0 |              -7.7 |       16.3 |              54.6 |
|    9 | Philosopher's Walk   | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           39.5 |        10.0 |           13.2 |              -8.5 |       14.7 |              54.2 |
|   10 | Kennin-ji            | train         | verified        |             28–45m (37m) |              1–3h |         3.2h |           38.6 |        10.0 |           13.2 |              -8.5 |       14.7 |              53.3 |

### Day trip + Half-day

#### Before

| rank | destination                                 | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone Castle (National Treasure)           | train         | verified        |             15–45m (30m) |              3–5h |         5.0h |           57.8 |         8.6 |           14.5 |               0.0 |       23.1 |              80.9 |
|    2 | Takeda Castle Ruins                         | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           53.0 |         8.3 |           14.0 |               0.0 |       22.3 |              75.3 |
|    3 | Abeno Harukas 300 (Osaka Skyline)           | shinkansen    | estimated       |             24–31m (28m) |              2–4h |         5.0h |           60.8 |         0.0 |           12.0 |               0.0 |       12.0 |              72.8 |
|    4 | Nagoya Castle (Golden Shachihoko)           | shinkansen    | verified        |             35–75m (55m) |              2–4h |         4.8h |           57.5 |         3.1 |           12.0 |               0.0 |       15.1 |              72.6 |
|    5 | Nunobiki Herb Gardens                       | train         | verified        |             20–45m (33m) |            1.5–4h |         3.8h |           46.4 |        10.0 |           14.0 |               0.0 |       24.0 |              70.4 |
|    6 | Mount Maya Kikuseidai (Kobe)                | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           45.8 |         8.5 |           14.0 |               0.0 |       22.5 |              68.3 |
|    7 | Historic Kyoto (Kiyomizu-dera & Kinkaku-ji) | train         | verified        |             28–45m (37m) |              3–5h |         5.2h |           47.0 |         8.0 |           13.2 |               0.0 |       21.2 |              68.2 |
|    8 | Himeji Castle (White Heron Castle)          | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           45.8 |         8.3 |           14.0 |               0.0 |       22.3 |              68.1 |
|    9 | Meriken Park                                | train         | verified        |             20–45m (33m) |            1.5–4h |         3.8h |           43.7 |        10.0 |           14.0 |               0.0 |       24.0 |              67.7 |
|   10 | Historic Nara (Todai-ji Great Buddha)       | train         | verified        |             30–55m (43m) |              3–5h |         5.4h |           45.8 |         8.4 |           13.0 |               0.0 |       21.4 |              67.2 |

#### After

| rank | destination                                 | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone Castle (National Treasure)           | train         | verified        |             15–45m (30m) |              3–5h |         5.0h |           57.8 |         8.6 |           14.5 |              -4.2 |       18.9 |              76.7 |
|    2 | Takeda Castle Ruins                         | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           53.0 |         8.3 |           14.0 |              -4.5 |       17.8 |              70.8 |
|    3 | Nunobiki Herb Gardens                       | train         | verified        |             20–45m (33m) |            1.5–4h |         3.8h |           46.4 |        10.0 |           14.0 |              -5.5 |       18.5 |              64.9 |
|    4 | Nagoya Castle (Golden Shachihoko)           | shinkansen    | verified        |             35–75m (55m) |              2–4h |         4.8h |           57.5 |         3.1 |           12.0 |              -7.8 |        7.3 |              64.8 |
|    5 | Abeno Harukas 300 (Osaka Skyline)           | shinkansen    | estimated       |             24–31m (28m) |              2–4h |         5.0h |           60.8 |         0.0 |           12.0 |              -8.4 |        3.6 |              64.4 |
|    6 | Mount Maya Kikuseidai (Kobe)                | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           45.8 |         8.5 |           14.0 |              -4.5 |       18.0 |              63.8 |
|    7 | Himeji Castle (White Heron Castle)          | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           45.8 |         8.3 |           14.0 |              -4.5 |       17.8 |              63.6 |
|    8 | Historic Kyoto (Kiyomizu-dera & Kinkaku-ji) | train         | verified        |             28–45m (37m) |              3–5h |         5.2h |           47.0 |         8.0 |           13.2 |              -5.0 |       16.2 |              63.2 |
|    9 | Kinosaki Onsen                              | train         | verified        |             20–45m (33m) |              3–5h |         5.1h |           45.8 |         7.0 |           14.0 |              -4.5 |       16.5 |              62.3 |
|   10 | Meriken Park                                | train         | verified        |             20–45m (33m) |            1.5–4h |         3.8h |           43.7 |        10.0 |           14.0 |              -5.5 |       18.5 |              62.2 |

### Day trip + Full-day

#### Before

| rank | destination  | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------ | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone City  | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    2 | Otsu City    | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |               0.0 |       21.3 |              77.3 |
|    3 | Himeji City  | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    4 | Kobe City    | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    5 | Sakai City   | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |               0.0 |       20.7 |              76.7 |
|    6 | Miyazu City  | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    7 | Uji City     | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |               0.0 |       19.8 |              75.8 |
|    8 | Ikaruga Town | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |
|    9 | Nara City    | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |               0.0 |       19.5 |              75.5 |
|   10 | Kyoto City   | train         | verified        |             28–45m (37m) |             8–14h |        12.2h |           55.4 |         5.9 |           13.2 |               0.0 |       19.1 |              74.5 |

#### After

| rank | destination  | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------ | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Hikone City  | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |              -2.1 |       19.2 |              75.2 |
|    2 | Otsu City    | train         | verified        |             15–45m (30m) |             6–12h |        10.0h |           56.0 |         6.8 |           14.5 |              -2.1 |       19.2 |              75.2 |
|    3 | Himeji City  | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |              -2.3 |       18.4 |              74.4 |
|    4 | Kobe City    | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |              -2.3 |       18.4 |              74.4 |
|    5 | Sakai City   | train         | verified        |             20–45m (33m) |             6–12h |        10.1h |           56.0 |         6.7 |           14.0 |              -2.3 |       18.4 |              74.4 |
|    6 | Miyazu City  | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |              -2.6 |       17.2 |              73.2 |
|    7 | Uji City     | train         | verified        |             28–45m (37m) |             6–12h |        10.2h |           56.0 |         6.6 |           13.2 |              -2.6 |       17.2 |              73.2 |
|    8 | Ikaruga Town | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |              -3.0 |       16.5 |              72.5 |
|    9 | Nara City    | train         | verified        |             30–55m (43m) |             6–12h |        10.4h |           56.0 |         6.5 |           13.0 |              -3.0 |       16.5 |              72.5 |
|   10 | Kyoto City   | train         | verified        |             28–45m (37m) |             8–14h |        12.2h |           55.4 |         5.9 |           13.2 |              -2.3 |       16.8 |              72.2 |

## Fukuoka

### Any trip + Recommended

#### Before

| rank | destination                   | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ----------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Daikanbo Viewpoint            | shinkansen    | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    2 | Kusasenri Grassland           | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    3 | Okama Crater Lake             | shinkansen    | unknown         |                        — |              1–3h |            — |           60.2 |         0.0 |           12.0 |               0.0 |       12.0 |              72.2 |
|    4 | Nakadake Crater               | shinkansen    | verified        |             35–60m (48m) |              1–3h |         3.6h |           54.8 |         4.5 |           12.0 |               0.0 |       16.5 |              71.3 |
|    5 | Lake Tazawa                   | shinkansen    | unknown         |                        — |              3–5h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    6 | Takachiho Gorge               | shinkansen    | unknown         |                        — |            1.5–3h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    7 | Mount Bandai                  | shinkansen    | unknown         |                        — |              5–7h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    8 | Aomori Nebuta Museum WA RASSE | shinkansen    | unknown         |                        — |              1–3h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    9 | Goshikinuma Ponds             | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|   10 | Mount Zao                     | shinkansen    | unknown         |                        — |              4–6h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |

#### After

| rank | destination                   | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ----------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Daikanbo Viewpoint            | shinkansen    | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    2 | Kusasenri Grassland           | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    3 | Okama Crater Lake             | shinkansen    | unknown         |                        — |              1–3h |            — |           60.2 |         0.0 |           12.0 |               0.0 |       12.0 |              72.2 |
|    4 | Nakadake Crater               | shinkansen    | verified        |             35–60m (48m) |              1–3h |         3.6h |           54.8 |         4.5 |           12.0 |               0.0 |       16.5 |              71.3 |
|    5 | Lake Tazawa                   | shinkansen    | unknown         |                        — |              3–5h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    6 | Takachiho Gorge               | shinkansen    | unknown         |                        — |            1.5–3h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    7 | Mount Bandai                  | shinkansen    | unknown         |                        — |              5–7h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    8 | Aomori Nebuta Museum WA RASSE | shinkansen    | unknown         |                        — |              1–3h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    9 | Goshikinuma Ponds             | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|   10 | Mount Zao                     | shinkansen    | unknown         |                        — |              4–6h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |

### Day trip + Any

#### Before

| rank | destination                   | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ----------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Daikanbo Viewpoint            | shinkansen    | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    2 | Kusasenri Grassland           | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    3 | Okama Crater Lake             | shinkansen    | unknown         |                        — |              1–3h |            — |           60.2 |         0.0 |           12.0 |               0.0 |       12.0 |              72.2 |
|    4 | Nakadake Crater               | shinkansen    | verified        |             35–60m (48m) |              1–3h |         3.6h |           54.8 |         4.5 |           12.0 |               0.0 |       16.5 |              71.3 |
|    5 | Lake Tazawa                   | shinkansen    | unknown         |                        — |              3–5h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    6 | Takachiho Gorge               | shinkansen    | unknown         |                        — |            1.5–3h |            — |           59.0 |         0.0 |           12.0 |               0.0 |       12.0 |              71.0 |
|    7 | Mount Bandai                  | shinkansen    | unknown         |                        — |              5–7h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    8 | Aomori Nebuta Museum WA RASSE | shinkansen    | unknown         |                        — |              1–3h |            — |           58.4 |         0.0 |           12.0 |               0.0 |       12.0 |              70.4 |
|    9 | Goshikinuma Ponds             | shinkansen    | unknown         |                        — |              2–4h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |
|   10 | Mount Zao                     | shinkansen    | unknown         |                        — |              4–6h |            — |           57.8 |         0.0 |           12.0 |               0.0 |       12.0 |              69.8 |

#### After

| rank | destination                     | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Kusasenri Grassland             | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           56.0 |         4.6 |           12.0 |              -8.0 |        8.6 |              64.6 |
|    2 | Fukuoka City                    | shinkansen    | estimated       |             23–29m (26m) |             6–12h |        11.0h |           56.0 |         0.0 |           12.0 |              -3.9 |        8.1 |              64.1 |
|    3 | Nakadake Crater                 | shinkansen    | verified        |             35–60m (48m) |              1–3h |         3.6h |           54.8 |         4.5 |           12.0 |              -7.5 |        9.0 |              63.8 |
|    4 | Daikanbo Viewpoint              | shinkansen    | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           56.0 |         4.6 |           12.0 |             -10.0 |        6.6 |              62.6 |
|    5 | Suizenji Jojuen Garden          | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           53.0 |         4.4 |           12.0 |              -8.0 |        8.4 |              61.4 |
|    6 | Kumamoto Prefectural Art Museum | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           50.0 |         4.5 |           12.0 |              -8.0 |        8.5 |              58.5 |
|    7 | Yufuin Onsen District           | shinkansen    | estimated       |             51–66m (59m) |              2–6h |         7.2h |           54.8 |         0.0 |           12.0 |              -8.6 |        3.4 |              58.2 |
|    8 | Dazaifu Tenmangu Shrine         | shinkansen    | estimated       |             27–35m (31m) |              1–3h |         4.2h |           54.8 |         0.0 |           12.0 |              -9.0 |        3.0 |              57.8 |
|    9 | Kyushu National Museum          | shinkansen    | estimated       |             27–35m (31m) |              2–4h |         5.2h |           53.0 |         0.0 |           12.0 |              -7.5 |        4.5 |              57.5 |
|   10 | Fukuoka City Museum             | shinkansen    | estimated       |             24–31m (28m) |            1.5–3h |         4.3h |           53.0 |         0.0 |           12.0 |              -8.2 |        3.8 |              56.8 |

### Day trip + Short

#### Before

| rank | destination                     | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Daikanbo Viewpoint              | shinkansen    | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    2 | Kusasenri Grassland             | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           56.0 |         4.6 |           12.0 |               0.0 |       16.6 |              72.6 |
|    3 | Nakadake Crater                 | shinkansen    | verified        |             35–60m (48m) |              1–3h |         3.6h |           54.8 |         4.5 |           12.0 |               0.0 |       16.5 |              71.3 |
|    4 | Suizenji Jojuen Garden          | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           53.0 |         4.4 |           12.0 |               0.0 |       16.4 |              69.4 |
|    5 | Dazaifu Tenmangu Shrine         | shinkansen    | estimated       |             27–35m (31m) |              1–3h |         4.2h |           54.8 |         0.0 |           12.0 |               0.0 |       12.0 |              66.8 |
|    6 | Kumamoto Prefectural Art Museum | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           50.0 |         4.5 |           12.0 |               0.0 |       16.5 |              66.5 |
|    7 | Aso Volcano Museum              | shinkansen    | verified        |             35–60m (48m) |              1–2h |         3.1h |           48.8 |         4.4 |           12.0 |               0.0 |       16.4 |              65.2 |
|    8 | Fukuoka City Museum             | shinkansen    | estimated       |             24–31m (28m) |            1.5–3h |         4.3h |           53.0 |         0.0 |           12.0 |               0.0 |       12.0 |              65.0 |
|    9 | Komyozenji Temple               | shinkansen    | estimated       |             27–35m (31m) |          0.5–1.5h |         3.2h |           50.0 |         0.0 |           12.0 |               0.0 |       12.0 |              62.0 |
|   10 | Kawachi Wisteria Garden         | shinkansen    | estimated       |             38–48m (43m) |            1–2.5h |         4.3h |           48.8 |         0.0 |           12.0 |               0.0 |       12.0 |              60.8 |

#### After

| rank | destination                     | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Kusasenri Grassland             | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           56.0 |         4.6 |           12.0 |             -10.7 |        5.8 |              61.8 |
|    2 | Nakadake Crater                 | shinkansen    | verified        |             35–60m (48m) |              1–3h |         3.6h |           54.8 |         4.5 |           12.0 |             -10.2 |        6.3 |              61.1 |
|    3 | Daikanbo Viewpoint              | shinkansen    | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           56.0 |         4.6 |           12.0 |             -12.7 |        3.9 |              59.9 |
|    4 | Suizenji Jojuen Garden          | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           53.0 |         4.4 |           12.0 |             -10.7 |        5.7 |              58.7 |
|    5 | Kumamoto Prefectural Art Museum | shinkansen    | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           50.0 |         4.5 |           12.0 |             -10.7 |        5.7 |              55.7 |
|    6 | Dazaifu Tenmangu Shrine         | shinkansen    | estimated       |             27–35m (31m) |              1–3h |         4.2h |           54.8 |         0.0 |           12.0 |             -12.7 |       -0.7 |              54.1 |
|    7 | Aso Volcano Museum              | shinkansen    | verified        |             35–60m (48m) |              1–2h |         3.1h |           48.8 |         4.4 |           12.0 |             -11.3 |        5.1 |              53.9 |
|    8 | Fukuoka City Museum             | shinkansen    | estimated       |             24–31m (28m) |            1.5–3h |         4.3h |           53.0 |         0.0 |           12.0 |             -11.7 |        0.3 |              53.3 |
|    9 | Komyozenji Temple               | shinkansen    | estimated       |             27–35m (31m) |          0.5–1.5h |         3.2h |           50.0 |         0.0 |           12.0 |             -15.1 |       -3.1 |              46.9 |
|   10 | Kawachi Wisteria Garden         | shinkansen    | estimated       |             38–48m (43m) |            1–2.5h |         4.3h |           48.8 |         0.0 |           12.0 |             -14.8 |       -2.8 |              46.0 |

### Day trip + Half-day

#### Before

| rank | destination                              | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Yufuin Onsen District                    | shinkansen    | estimated       |             51–66m (59m) |              2–6h |         7.2h |           54.8 |         0.0 |           12.0 |               0.0 |       12.0 |              66.8 |
|    2 | Kyushu National Museum                   | shinkansen    | estimated       |             27–35m (31m) |              2–4h |         5.2h |           53.0 |         0.0 |           12.0 |               0.0 |       12.0 |              65.0 |
|    3 | Mojiko Retro District                    | shinkansen    | estimated       |             42–54m (48m) |            1.5–4h |         5.5h |           51.8 |         0.0 |           12.0 |               0.0 |       12.0 |              63.8 |
|    4 | Hakata Station & AMU Plaza               | shinkansen    | estimated       |             23–30m (27m) |              1–4h |         4.5h |           50.0 |         0.0 |           12.0 |               0.0 |       12.0 |              62.0 |
|    5 | Fukuoka PayPay Dome & BOSS E-ZO          | shinkansen    | estimated       |             23–30m (27m) |            1.5–4h |         4.8h |           48.8 |         0.0 |           12.0 |               0.0 |       12.0 |              60.8 |
|    6 | Mameda Historic District                 | train         | verified        |          115–160m (138m) |              2–4h |         7.6h |           50.0 |         6.2 |            4.5 |               0.0 |       10.7 |              60.7 |
|    7 | Fukuoka Art Museum                       | shinkansen    | estimated       |             23–30m (27m) |              2–4h |         5.0h |           45.5 |         0.0 |           12.0 |               0.0 |       12.0 |              57.5 |
|    8 | Nagasaki Peace Park & Atomic Bomb Museum | train         | estimated       |           88–113m (101m) |              2–4h |         7.8h |           54.8 |         0.0 |            0.0 |               0.0 |        0.0 |              54.8 |
|    9 | Kumamoto Castle                          | bus           | estimated       |          117–150m (134m) |              3–5h |        10.0h |           44.6 |         0.0 |           10.0 |               0.0 |       10.0 |              54.6 |
|   10 | Itsukushima Shrine (Miyajima Island)     | shinkansen    | verified        |             60–95m (78m) |              3–5h |         6.6h |           47.0 |        -4.5 |           12.0 |               0.0 |        7.5 |              54.5 |

#### After

| rank | destination                              | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ---------------------------------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Yufuin Onsen District                    | shinkansen    | estimated       |             51–66m (59m) |              2–6h |         7.2h |           54.8 |         0.0 |           12.0 |             -10.5 |        1.5 |              56.3 |
|    2 | Kyushu National Museum                   | shinkansen    | estimated       |             27–35m (31m) |              2–4h |         5.2h |           53.0 |         0.0 |           12.0 |              -8.8 |        3.2 |              56.2 |
|    3 | Hakata Station & AMU Plaza               | shinkansen    | estimated       |             23–30m (27m) |              1–4h |         4.5h |           50.0 |         0.0 |           12.0 |              -9.0 |        3.0 |              53.0 |
|    4 | Mojiko Retro District                    | shinkansen    | estimated       |             42–54m (48m) |            1.5–4h |         5.5h |           51.8 |         0.0 |           12.0 |             -10.8 |        1.2 |              53.0 |
|    5 | Fukuoka PayPay Dome & BOSS E-ZO          | shinkansen    | estimated       |             23–30m (27m) |            1.5–4h |         4.8h |           48.8 |         0.0 |           12.0 |              -8.6 |        3.4 |              52.2 |
|    6 | Fukuoka Art Museum                       | shinkansen    | estimated       |             23–30m (27m) |              2–4h |         5.0h |           45.5 |         0.0 |           12.0 |              -8.3 |        3.7 |              49.2 |
|    7 | Mameda Historic District                 | train         | verified        |          115–160m (138m) |              2–4h |         7.6h |           50.0 |         6.2 |            4.5 |             -14.6 |       -3.9 |              46.1 |
|    8 | Itsukushima Shrine (Miyajima Island)     | shinkansen    | verified        |             60–95m (78m) |              3–5h |         6.6h |           47.0 |        -4.5 |           12.0 |              -9.0 |       -1.5 |              45.5 |
|    9 | Nagasaki Peace Park & Atomic Bomb Museum | train         | estimated       |           88–113m (101m) |              2–4h |         7.8h |           54.8 |         0.0 |            0.0 |             -14.9 |      -14.9 |              39.9 |
|   10 | Ohori Park                               | shinkansen    | estimated       |             23–30m (27m) |            1.5–4h |         4.8h |           34.7 |         0.0 |           12.0 |              -8.6 |        3.4 |              38.1 |

### Day trip + Full-day

#### Before

| rank | destination       | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | ----------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Fukuoka City      | shinkansen    | estimated       |             23–29m (26m) |             6–12h |        11.0h |           56.0 |         0.0 |           12.0 |               0.0 |       12.0 |              68.0 |
|    2 | Osaka City        | bus           | unknown         |                        — |             6–12h |            — |           57.2 |         0.0 |           10.0 |               0.0 |       10.0 |              67.2 |
|    3 | Tokyo Station     | shinkansen    | unknown         |                        — |             4–10h |            — |           54.2 |         0.0 |           12.0 |               0.0 |       12.0 |              66.2 |
|    4 | Huis Ten Bosch    | bus           | estimated       |          104–133m (119m) |              4–8h |        11.4h |           56.0 |         0.0 |           10.0 |               0.0 |       10.0 |              66.0 |
|    5 | Kyoto City        | bus           | unknown         |                        — |             8–14h |            — |           55.4 |         0.0 |           10.0 |               0.0 |       10.0 |              65.4 |
|    6 | Beppu City        | train         | verified        |          115–160m (138m) |             6–12h |        13.6h |           56.0 |         3.7 |            4.5 |               0.0 |        8.2 |              64.2 |
|    7 | Hita City         | train         | verified        |          115–160m (138m) |             6–12h |        13.6h |           56.0 |         3.7 |            4.5 |               0.0 |        8.2 |              64.2 |
|    8 | Yufu City         | train         | verified        |          115–160m (138m) |             6–12h |        13.6h |           56.0 |         3.7 |            4.5 |               0.0 |        8.2 |              64.2 |
|    9 | Yokohama Zoorasia | bus           | unknown         |                        — |              4–6h |            — |           48.8 |         0.0 |           10.0 |               0.0 |       10.0 |              58.8 |
|   10 | Shibuya City      | train         | unknown         |                        — |             5–11h |            — |           57.8 |         0.0 |            0.0 |               0.0 |        0.0 |              57.8 |

#### After

| rank | destination     | selected mode | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | mode budget | mode transport | travel efficiency | mode total | final Recommended |
| ---: | --------------- | ------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------: | -------------: | ----------------: | ---------: | ----------------: |
|    1 | Fukuoka City    | shinkansen    | estimated       |             23–29m (26m) |             6–12h |        11.0h |           56.0 |         0.0 |           12.0 |              -3.9 |        8.1 |              64.1 |
|    2 | Beppu City      | train         | verified        |          115–160m (138m) |             6–12h |        13.6h |           56.0 |         3.7 |            4.5 |              -8.0 |        0.2 |              56.2 |
|    3 | Hita City       | train         | verified        |          115–160m (138m) |             6–12h |        13.6h |           56.0 |         3.7 |            4.5 |              -8.0 |        0.2 |              56.2 |
|    4 | Yufu City       | train         | verified        |          115–160m (138m) |             6–12h |        13.6h |           56.0 |         3.7 |            4.5 |              -8.0 |        0.2 |              56.2 |
|    5 | Huis Ten Bosch  | bus           | estimated       |          104–133m (119m) |              4–8h |        11.4h |           56.0 |         0.0 |           10.0 |             -10.6 |       -0.6 |              55.4 |
|    6 | Dazaifu City    | train         | estimated       |             23–30m (27m) |             6–12h |        11.0h |           56.0 |         0.0 |            0.0 |              -4.0 |       -4.0 |              52.0 |
|    7 | Hiroshima City  | shinkansen    | verified        |             60–95m (78m) |             6–12h |        11.6h |           56.0 |       -11.7 |           12.0 |              -5.0 |       -4.7 |              51.3 |
|    8 | Karatsu City    | train         | estimated       |             44–56m (50m) |             6–12h |        11.9h |           56.0 |         0.0 |            0.0 |              -5.4 |       -5.4 |              50.6 |
|    9 | Kitakyushu City | train         | estimated       |             53–68m (61m) |             6–12h |        12.3h |           56.0 |         0.0 |            0.0 |              -6.1 |       -6.1 |              49.9 |
|   10 | Sasebo City     | train         | estimated       |             70–90m (80m) |             6–12h |        13.0h |           56.0 |         0.0 |            0.0 |              -7.2 |       -7.2 |              48.8 |

## Nearest-only over-correction check

- Nakayama / Yokohama · Day trip + Any: 37 distance inversions in the top 10 (not nearest-only).
- Nakayama / Yokohama · Day trip + Short: 23 distance inversions in the top 10 (not nearest-only).
- Nakayama / Yokohama · Day trip + Half-day: 12 distance inversions in the top 10 (not nearest-only).
- Nakayama / Yokohama · Day trip + Full-day: 37 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Any: 31 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Short: 15 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Half-day: 25 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Full-day: 17 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Any: 32 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Short: 23 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Half-day: 25 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Full-day: 29 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Any: 30 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Short: 34 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Half-day: 21 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Full-day: 22 distance inversions in the top 10 (not nearest-only).
