# KAI-61 Explore Recommended QA

Deterministic local catalogue output from the KAI-61 branch. All cases use `none` car mode, all public modes, party size 2, the Explorer's standard budget (40,000 JPY), and the listed origin coordinates.

Travel efficiency: `-18 × (0.55 × travelShare + 0.45 × min(totalOuting / 14h, 1))²`. It is smooth, capped at -18, and is applied only to verified or bounded-estimated Day Trip evidence after the shared feasibility gate.

## Nakayama / Yokohama

### Any trip + Recommended

#### Before

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Abeno Harukas 300 (Osaka Skyline) | unknown         |                        — |              2–4h |            — |           72.8 |                 — |              72.8 |
|    2 | Okama Crater Lake                 | unknown         |                        — |              1–3h |            — |           72.2 |                 — |              72.2 |
|    3 | Lake Tazawa                       | unknown         |                        — |              3–5h |            — |           71.0 |                 — |              71.0 |
|    4 | Takachiho Gorge                   | verified        |          277–317m (297m) |            1.5–3h |        12.2h |           71.0 |                 — |              71.0 |
|    5 | Mount Bandai                      | unknown         |                        — |              5–7h |            — |           70.4 |                 — |              70.4 |
|    6 | Aomori Nebuta Museum WA RASSE     | unknown         |                        — |              1–3h |            — |           70.4 |                 — |              70.4 |
|    7 | Goshikinuma Ponds                 | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|    8 | Mount Zao                         | unknown         |                        — |              4–6h |            — |           69.8 |                 — |              69.8 |
|    9 | Yamadera (Risshakuji Temple)      | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|   10 | Nagoya Castle (Golden Shachihoko) | unknown         |                        — |              2–4h |            — |           69.5 |                 — |              69.5 |

#### After

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Abeno Harukas 300 (Osaka Skyline) | unknown         |                        — |              2–4h |            — |           72.8 |                 — |              72.8 |
|    2 | Okama Crater Lake                 | unknown         |                        — |              1–3h |            — |           72.2 |                 — |              72.2 |
|    3 | Lake Tazawa                       | unknown         |                        — |              3–5h |            — |           71.0 |                 — |              71.0 |
|    4 | Takachiho Gorge                   | verified        |          277–317m (297m) |            1.5–3h |        12.2h |           71.0 |                 — |              71.0 |
|    5 | Mount Bandai                      | unknown         |                        — |              5–7h |            — |           70.4 |                 — |              70.4 |
|    6 | Aomori Nebuta Museum WA RASSE     | unknown         |                        — |              1–3h |            — |           70.4 |                 — |              70.4 |
|    7 | Goshikinuma Ponds                 | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|    8 | Mount Zao                         | unknown         |                        — |              4–6h |            — |           69.8 |                 — |              69.8 |
|    9 | Yamadera (Risshakuji Temple)      | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|   10 | Nagoya Castle (Golden Shachihoko) | unknown         |                        — |              2–4h |            — |           69.5 |                 — |              69.5 |

### Day trip + Any

#### Before

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Abeno Harukas 300 (Osaka Skyline) | unknown         |                        — |              2–4h |            — |           72.8 |                 — |              72.8 |
|    2 | Okama Crater Lake                 | unknown         |                        — |              1–3h |            — |           72.2 |                 — |              72.2 |
|    3 | Lake Tazawa                       | unknown         |                        — |              3–5h |            — |           71.0 |                 — |              71.0 |
|    4 | Takachiho Gorge                   | verified        |          277–317m (297m) |            1.5–3h |        12.2h |           71.0 |                 — |              71.0 |
|    5 | Mount Bandai                      | unknown         |                        — |              5–7h |            — |           70.4 |                 — |              70.4 |
|    6 | Aomori Nebuta Museum WA RASSE     | unknown         |                        — |              1–3h |            — |           70.4 |                 — |              70.4 |
|    7 | Goshikinuma Ponds                 | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|    8 | Mount Zao                         | unknown         |                        — |              4–6h |            — |           69.8 |                 — |              69.8 |
|    9 | Yamadera (Risshakuji Temple)      | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|   10 | Nagoya Castle (Golden Shachihoko) | unknown         |                        — |              2–4h |            — |           69.5 |                 — |              69.5 |

#### After

| rank | destination                                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Odawara City                                      | estimated       |             36–46m (41m) |             6–12h |        11.5h |           68.0 |              -4.3 |              63.7 |
|    2 | Atami City                                        | estimated       |             41–53m (47m) |             6–12h |        11.8h |           68.0 |              -4.6 |              63.4 |
|    3 | Tokyo Station                                     | estimated       |             31–39m (35m) |             4–10h |         9.3h |           66.2 |              -3.4 |              62.8 |
|    4 | Utsunomiya City                                   | estimated       |             59–75m (67m) |             6–12h |        12.5h |           68.0 |              -5.6 |              62.4 |
|    5 | Hakone Town                                       | estimated       |             50–63m (57m) |             8–14h |        14.1h |           67.2 |              -5.9 |              61.3 |
|    6 | Takachiho Gorge                                   | verified        |          277–317m (297m) |            1.5–3h |        12.2h |           71.0 |             -12.7 |              58.3 |
|    7 | Harry Potter Studio                               | estimated       |             33–43m (38m) |              7–9h |        10.4h |           62.0 |              -3.9 |              58.1 |
|    8 | Shibuya Sky (Rooftop Observatory)                 | estimated       |             29–37m (33m) |              2–4h |         5.2h |           60.8 |              -2.9 |              57.9 |
|    9 | Yokohama City                                     | estimated       |             22–28m (25m) |             8–14h |        12.9h |           62.0 |              -4.5 |              57.5 |
|   10 | Roppongi Hills Observation Deck (Tokyo City View) | estimated       |             31–39m (35m) |              2–4h |         5.3h |           60.2 |              -3.0 |              57.2 |

#### Abeno Harukas breakdown

Before rank: **1** · after rank: **not eligible** · modes: train, shinkansen · evidence: **unknown**

| base/catalogue | existing transport | travel efficiency | final score |
| -------------: | -----------------: | ----------------: | ----------: |
|           72.8 |               12.0 |                 — |        72.8 |

### Day trip + Short

#### Before

| rank | destination                  | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Ikuta Ryokuchi               | estimated       |             22–28m (25m) |              1–3h |         3.9h |           46.7 |                 — |              46.7 |
|    2 | Omiya Bonsai Village         | estimated       |             47–60m (54m) |              1–3h |         5.0h |           45.2 |                 — |              45.2 |
|    3 | Yanaka                       | estimated       |             36–46m (41m) |              1–3h |         4.5h |           44.6 |                 — |              44.6 |
|    4 | Golden Gai                   | estimated       |             32–40m (36m) |              1–3h |         4.3h |           43.7 |                 — |              43.7 |
|    5 | Sunshine City                | estimated       |             34–44m (39m) |              1–3h |         4.5h |           42.5 |                 — |              42.5 |
|    6 | Kotoku-in Great Buddha       | estimated       |             30–38m (34m) |              1–3h |         4.3h |           42.2 |                 — |              42.2 |
|    7 | Kagurazaka                   | estimated       |             32–41m (37m) |              1–3h |         4.4h |           41.6 |                 — |              41.6 |
|    8 | Seiko Museum Ginza           | estimated       |             32–41m (37m) |              1–3h |         4.4h |           41.3 |                 — |              41.3 |
|    9 | Shibuya Crossing and Hachiko | estimated       |             29–37m (33m) |              1–3h |         4.2h |           41.3 |                 — |              41.3 |
|   10 | Tsurugaoka Hachimangu        | estimated       |             29–37m (33m) |              1–3h |         4.2h |           41.3 |                 — |              41.3 |

#### After

| rank | destination                  | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Ikuta Ryokuchi               | estimated       |             22–28m (25m) |              1–3h |         3.9h |           46.7 |              -2.8 |              43.9 |
|    2 | Yanaka                       | estimated       |             36–46m (41m) |              1–3h |         4.5h |           44.6 |              -3.7 |              40.9 |
|    3 | Omiya Bonsai Village         | estimated       |             47–60m (54m) |              1–3h |         5.0h |           45.2 |              -4.3 |              40.9 |
|    4 | Golden Gai                   | estimated       |             32–40m (36m) |              1–3h |         4.3h |           43.7 |              -3.4 |              40.3 |
|    5 | Sunshine City                | estimated       |             34–44m (39m) |              1–3h |         4.5h |           42.5 |              -3.6 |              38.9 |
|    6 | Kotoku-in Great Buddha       | estimated       |             30–38m (34m) |              1–3h |         4.3h |           42.2 |              -3.3 |              38.9 |
|    7 | Kagurazaka                   | estimated       |             32–41m (37m) |              1–3h |         4.4h |           41.6 |              -3.5 |              38.1 |
|    8 | Shibuya Crossing and Hachiko | estimated       |             29–37m (33m) |              1–3h |         4.2h |           41.3 |              -3.3 |              38.0 |
|    9 | Tsurugaoka Hachimangu        | estimated       |             29–37m (33m) |              1–3h |         4.2h |           41.3 |              -3.3 |              38.0 |
|   10 | Fudaten Shrine               | estimated       |             24–31m (28m) |              1–3h |         4.0h |           41.0 |              -3.0 |              38.0 |

### Day trip + Half-day

#### Before

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Shibuya Sky (Rooftop Observatory)                    | estimated       |             29–37m (33m) |              2–4h |         5.2h |           60.8 |                 — |              60.8 |
|    2 | Roppongi Hills Observation Deck (Tokyo City View)    | estimated       |             31–39m (35m) |              2–4h |         5.3h |           60.2 |                 — |              60.2 |
|    3 | Tokyo Skytree                                        | estimated       |             37–47m (42m) |              3–5h |         6.6h |           59.6 |                 — |              59.6 |
|    4 | Yokohama Landmark Tower (Sky Garden)                 | estimated       |             22–28m (25m) |              2–4h |         4.9h |           59.6 |                 — |              59.6 |
|    5 | Tokyo Metropolitan Government Building Observatories | estimated       |             31–39m (35m) |              2–4h |         5.3h |           59.0 |                 — |              59.0 |
|    6 | teamLab Borderless                                   | estimated       |             31–39m (35m) |              3–5h |         6.3h |           58.4 |                 — |              58.4 |
|    7 | Joypolis Odaiba                                      | estimated       |             32–40m (36m) |              2–3h |         4.8h |           57.2 |                 — |              57.2 |
|    8 | Sunshine 60 Observatory (Tenbou Park)                | estimated       |             34–44m (39m) |              2–4h |         5.5h |           57.2 |                 — |              57.2 |
|    9 | teamLab Planets                                      | estimated       |             33–43m (38m) |              3–5h |         6.4h |           57.2 |                 — |              57.2 |
|   10 | Edo Castle Ruins (Imperial Palace)                   | estimated       |             33–43m (38m) |              3–5h |         6.4h |           56.6 |                 — |              56.6 |

#### After

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Shibuya Sky (Rooftop Observatory)                    | estimated       |             29–37m (33m) |              2–4h |         5.2h |           60.8 |              -2.9 |              57.9 |
|    2 | Roppongi Hills Observation Deck (Tokyo City View)    | estimated       |             31–39m (35m) |              2–4h |         5.3h |           60.2 |              -3.0 |              57.2 |
|    3 | Yokohama Landmark Tower (Sky Garden)                 | estimated       |             22–28m (25m) |              2–4h |         4.9h |           59.6 |              -2.5 |              57.1 |
|    4 | Tokyo Skytree                                        | estimated       |             37–47m (42m) |              3–5h |         6.6h |           59.6 |              -3.3 |              56.3 |
|    5 | Tokyo Metropolitan Government Building Observatories | estimated       |             31–39m (35m) |              2–4h |         5.3h |           59.0 |              -3.0 |              56.0 |
|    6 | teamLab Borderless                                   | estimated       |             31–39m (35m) |              3–5h |         6.3h |           58.4 |              -2.9 |              55.5 |
|    7 | teamLab Planets                                      | estimated       |             33–43m (38m) |              3–5h |         6.4h |           57.2 |              -3.1 |              54.1 |
|    8 | Joypolis Odaiba                                      | estimated       |             32–40m (36m) |              2–3h |         4.8h |           57.2 |              -3.2 |              54.0 |
|    9 | Sunshine 60 Observatory (Tenbou Park)                | estimated       |             34–44m (39m) |              2–4h |         5.5h |           57.2 |              -3.2 |              54.0 |
|   10 | Edo Castle Ruins (Imperial Palace)                   | estimated       |             33–43m (38m) |              3–5h |         6.4h |           56.6 |              -3.1 |              53.5 |

### Day trip + Full-day

#### Before

| rank | destination         | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Atami City          | estimated       |             41–53m (47m) |             6–12h |        11.8h |           68.0 |                 — |              68.0 |
|    2 | Odawara City        | estimated       |             36–46m (41m) |             6–12h |        11.5h |           68.0 |                 — |              68.0 |
|    3 | Utsunomiya City     | estimated       |             59–75m (67m) |             6–12h |        12.5h |           68.0 |                 — |              68.0 |
|    4 | Hakone Town         | estimated       |             50–63m (57m) |             8–14h |        14.1h |           67.2 |                 — |              67.2 |
|    5 | Tokyo Station       | estimated       |             31–39m (35m) |             4–10h |         9.3h |           66.2 |                 — |              66.2 |
|    6 | Harry Potter Studio | estimated       |             33–43m (38m) |              7–9h |        10.4h |           62.0 |                 — |              62.0 |
|    7 | Yokohama City       | estimated       |             22–28m (25m) |             8–14h |        12.9h |           62.0 |                 — |              62.0 |
|    8 | Enoshima            | estimated       |             32–40m (36m) |              7–9h |        10.3h |           60.2 |                 — |              60.2 |
|    9 | Ghibli Museum       | estimated       |             28–36m (32m) |              5–7h |         8.2h |           59.0 |                 — |              59.0 |
|   10 | Yokohama Zoorasia   | estimated       |             15–20m (18m) |              4–6h |         6.7h |           58.8 |                 — |              58.8 |

#### After

| rank | destination         | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Odawara City        | estimated       |             36–46m (41m) |             6–12h |        11.5h |           68.0 |              -4.3 |              63.7 |
|    2 | Atami City          | estimated       |             41–53m (47m) |             6–12h |        11.8h |           68.0 |              -4.6 |              63.4 |
|    3 | Tokyo Station       | estimated       |             31–39m (35m) |             4–10h |         9.3h |           66.2 |              -3.4 |              62.8 |
|    4 | Utsunomiya City     | estimated       |             59–75m (67m) |             6–12h |        12.5h |           68.0 |              -5.6 |              62.4 |
|    5 | Hakone Town         | estimated       |             50–63m (57m) |             8–14h |        14.1h |           67.2 |              -5.9 |              61.3 |
|    6 | Harry Potter Studio | estimated       |             33–43m (38m) |              7–9h |        10.4h |           62.0 |              -3.9 |              58.1 |
|    7 | Yokohama City       | estimated       |             22–28m (25m) |             8–14h |        12.9h |           62.0 |              -4.5 |              57.5 |
|    8 | Yokohama Zoorasia   | estimated       |             15–20m (18m) |              4–6h |         6.7h |           58.8 |              -2.2 |              56.6 |
|    9 | Enoshima            | estimated       |             32–40m (36m) |              7–9h |        10.3h |           60.2 |              -3.7 |              56.5 |
|   10 | Ghibli Museum       | estimated       |             28–36m (32m) |              5–7h |         8.2h |           59.0 |              -3.0 |              56.0 |

## Nearest-only over-correction check

- Nakayama / Yokohama · Day trip + Any: 32 distance inversions in the top 10 (not nearest-only).
- Nakayama / Yokohama · Day trip + Short: 32 distance inversions in the top 10 (not nearest-only).
- Nakayama / Yokohama · Day trip + Half-day: 11 distance inversions in the top 10 (not nearest-only).
- Nakayama / Yokohama · Day trip + Full-day: 35 distance inversions in the top 10 (not nearest-only).

## Tokyo

### Any trip + Recommended

#### Before

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | verified        |             10–25m (18m) |              2–4h |         3.6h |           85.2 |                 — |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | verified        |             15–30m (23m) |              2–4h |         3.8h |           85.2 |                 — |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | verified        |             10–25m (18m) |              2–4h |         3.6h |           84.0 |                 — |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | verified        |             10–30m (20m) |              2–4h |         3.7h |           82.2 |                 — |              82.2 |
|    5 | teamLab Borderless                                   | verified        |             10–25m (18m) |              3–5h |         4.6h |           81.2 |                 — |              81.2 |
|    6 | Tokyo Tower                                          | verified        |             10–25m (18m) |              2–4h |         3.6h |           81.0 |                 — |              81.0 |
|    7 | Shibuya City                                         | verified        |             15–30m (23m) |             5–11h |         8.8h |           79.9 |                 — |              79.9 |
|    8 | Chuo City                                            | verified        |              5–15m (10m) |             6–12h |         9.3h |           78.4 |                 — |              78.4 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | verified        |             50–90m (70m) |              2–4h |         5.3h |           78.1 |                 — |              78.1 |
|   10 | Minato City                                          | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |                 — |              77.8 |

#### After

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | verified        |             10–25m (18m) |              2–4h |         3.6h |           85.2 |                 — |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | verified        |             15–30m (23m) |              2–4h |         3.8h |           85.2 |                 — |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | verified        |             10–25m (18m) |              2–4h |         3.6h |           84.0 |                 — |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | verified        |             10–30m (20m) |              2–4h |         3.7h |           82.2 |                 — |              82.2 |
|    5 | teamLab Borderless                                   | verified        |             10–25m (18m) |              3–5h |         4.6h |           81.2 |                 — |              81.2 |
|    6 | Tokyo Tower                                          | verified        |             10–25m (18m) |              2–4h |         3.6h |           81.0 |                 — |              81.0 |
|    7 | Shibuya City                                         | verified        |             15–30m (23m) |             5–11h |         8.8h |           79.9 |                 — |              79.9 |
|    8 | Chuo City                                            | verified        |              5–15m (10m) |             6–12h |         9.3h |           78.4 |                 — |              78.4 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | verified        |             50–90m (70m) |              2–4h |         5.3h |           78.1 |                 — |              78.1 |
|   10 | Minato City                                          | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |                 — |              77.8 |

### Day trip + Any

#### Before

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | verified        |             10–25m (18m) |              2–4h |         3.6h |           85.2 |                 — |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | verified        |             15–30m (23m) |              2–4h |         3.8h |           85.2 |                 — |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | verified        |             10–25m (18m) |              2–4h |         3.6h |           84.0 |                 — |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | verified        |             10–30m (20m) |              2–4h |         3.7h |           82.2 |                 — |              82.2 |
|    5 | teamLab Borderless                                   | verified        |             10–25m (18m) |              3–5h |         4.6h |           81.2 |                 — |              81.2 |
|    6 | Tokyo Tower                                          | verified        |             10–25m (18m) |              2–4h |         3.6h |           81.0 |                 — |              81.0 |
|    7 | Shibuya City                                         | verified        |             15–30m (23m) |             5–11h |         8.8h |           79.9 |                 — |              79.9 |
|    8 | Chuo City                                            | verified        |              5–15m (10m) |             6–12h |         9.3h |           78.4 |                 — |              78.4 |
|    9 | Yokohama Landmark Tower (Sky Garden)                 | verified        |             50–90m (70m) |              2–4h |         5.3h |           78.1 |                 — |              78.1 |
|   10 | Minato City                                          | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |                 — |              77.8 |

#### After

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | verified        |             10–25m (18m) |              2–4h |         3.6h |           85.2 |              -0.8 |              84.4 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | verified        |             15–30m (23m) |              2–4h |         3.8h |           85.2 |              -1.0 |              84.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | verified        |             10–25m (18m) |              2–4h |         3.6h |           84.0 |              -0.8 |              83.2 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | verified        |             10–30m (20m) |              2–4h |         3.7h |           82.2 |              -0.9 |              81.3 |
|    5 | teamLab Borderless                                   | verified        |             10–25m (18m) |              3–5h |         4.6h |           81.2 |              -0.9 |              80.3 |
|    6 | Tokyo Tower                                          | verified        |             10–25m (18m) |              2–4h |         3.6h |           81.0 |              -0.8 |              80.2 |
|    7 | Shibuya City                                         | verified        |             15–30m (23m) |             5–11h |         8.8h |           79.9 |              -2.0 |              77.9 |
|    8 | Chuo City                                            | verified        |              5–15m (10m) |             6–12h |         9.3h |           78.4 |              -1.8 |              76.6 |
|    9 | Minato City                                          | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |              -2.1 |              75.7 |
|   10 | Shinjuku City                                        | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |              -2.1 |              75.7 |

### Day trip + Short

#### Before

| rank | destination                  | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Yanaka                       | verified        |             10–25m (18m) |              1–3h |         2.6h |           69.6 |                 — |              69.6 |
|    2 | Golden Gai                   | verified        |             10–25m (18m) |              1–3h |         2.6h |           68.7 |                 — |              68.7 |
|    3 | Ikuta Ryokuchi               | verified        |             50–90m (70m) |              1–3h |         4.3h |           67.7 |                 — |              67.7 |
|    4 | Sunshine City                | verified        |             10–30m (20m) |              1–3h |         2.7h |           67.5 |                 — |              67.5 |
|    5 | Seiko Museum Ginza           | verified        |              5–15m (10m) |              1–3h |         2.3h |           66.8 |                 — |              66.8 |
|    6 | Kagurazaka                   | verified        |             10–25m (18m) |              1–3h |         2.6h |           66.6 |                 — |              66.6 |
|    7 | Omiya Bonsai Village         | verified        |            45–110m (78m) |              1–3h |         4.6h |           66.5 |                 — |              66.5 |
|    8 | Boso-no-Mura                 | verified        |            60–120m (90m) |              1–3h |         5.0h |           66.1 |                 — |              66.1 |
|    9 | Shibuya Crossing and Hachiko | verified        |             15–30m (23m) |              1–3h |         2.8h |           65.8 |                 — |              65.8 |
|   10 | Omoide Yokocho               | verified        |             10–25m (18m) |              1–3h |         2.6h |           65.7 |                 — |              65.7 |

#### After

| rank | destination                  | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Yanaka                       | verified        |             10–25m (18m) |              1–3h |         2.6h |           69.6 |              -0.8 |              68.8 |
|    2 | Golden Gai                   | verified        |             10–25m (18m) |              1–3h |         2.6h |           68.7 |              -0.8 |              67.9 |
|    3 | Sunshine City                | verified        |             10–30m (20m) |              1–3h |         2.7h |           67.5 |              -0.9 |              66.6 |
|    4 | Seiko Museum Ginza           | verified        |              5–15m (10m) |              1–3h |         2.3h |           66.8 |              -0.4 |              66.4 |
|    5 | Kagurazaka                   | verified        |             10–25m (18m) |              1–3h |         2.6h |           66.6 |              -0.8 |              65.8 |
|    6 | Omoide Yokocho               | verified        |             10–25m (18m) |              1–3h |         2.6h |           65.7 |              -0.8 |              64.9 |
|    7 | Sugamo Jizo-dori             | verified        |             10–30m (20m) |              1–3h |         2.7h |           65.7 |              -0.9 |              64.8 |
|    8 | Shibuya Crossing and Hachiko | verified        |             15–30m (23m) |              1–3h |         2.8h |           65.8 |              -1.0 |              64.8 |
|    9 | Hamarikyu Gardens            | verified        |              5–15m (10m) |              1–3h |         2.3h |           65.0 |              -0.4 |              64.6 |
|   10 | Tokiwaso Manga Museum        | verified        |             10–30m (20m) |              1–3h |         2.7h |           65.4 |              -0.9 |              64.5 |

### Day trip + Half-day

#### Before

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | verified        |             10–25m (18m) |              2–4h |         3.6h |           85.2 |                 — |              85.2 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | verified        |             15–30m (23m) |              2–4h |         3.8h |           85.2 |                 — |              85.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | verified        |             10–25m (18m) |              2–4h |         3.6h |           84.0 |                 — |              84.0 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | verified        |             10–30m (20m) |              2–4h |         3.7h |           82.2 |                 — |              82.2 |
|    5 | teamLab Borderless                                   | verified        |             10–25m (18m) |              3–5h |         4.6h |           81.2 |                 — |              81.2 |
|    6 | Tokyo Tower                                          | verified        |             10–25m (18m) |              2–4h |         3.6h |           81.0 |                 — |              81.0 |
|    7 | Yokohama Landmark Tower (Sky Garden)                 | verified        |             50–90m (70m) |              2–4h |         5.3h |           78.1 |                 — |              78.1 |
|    8 | Takanawa Gateway                                     | verified        |             10–25m (18m) |              2–4h |         3.6h |           74.4 |                 — |              74.4 |
|    9 | Kirin Beer Yokohama Factory                          | verified        |             50–90m (70m) |          1.5–3.5h |         4.8h |           73.4 |                 — |              73.4 |
|   10 | Ueno Zoo                                             | verified        |             10–25m (18m) |              3–5h |         4.6h |           73.2 |                 — |              73.2 |

#### After

| rank | destination                                          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Roppongi Hills Observation Deck (Tokyo City View)    | verified        |             10–25m (18m) |              2–4h |         3.6h |           85.2 |              -0.8 |              84.4 |
|    2 | Shibuya Sky (Rooftop Observatory)                    | verified        |             15–30m (23m) |              2–4h |         3.8h |           85.2 |              -1.0 |              84.2 |
|    3 | Tokyo Metropolitan Government Building Observatories | verified        |             10–25m (18m) |              2–4h |         3.6h |           84.0 |              -0.8 |              83.2 |
|    4 | Sunshine 60 Observatory (Tenbou Park)                | verified        |             10–30m (20m) |              2–4h |         3.7h |           82.2 |              -0.9 |              81.3 |
|    5 | teamLab Borderless                                   | verified        |             10–25m (18m) |              3–5h |         4.6h |           81.2 |              -0.9 |              80.3 |
|    6 | Tokyo Tower                                          | verified        |             10–25m (18m) |              2–4h |         3.6h |           81.0 |              -0.8 |              80.2 |
|    7 | Yokohama Landmark Tower (Sky Garden)                 | verified        |             50–90m (70m) |              2–4h |         5.3h |           78.1 |              -3.1 |              75.0 |
|    8 | Takanawa Gateway                                     | verified        |             10–25m (18m) |              2–4h |         3.6h |           74.4 |              -0.8 |              73.6 |
|    9 | Ueno Zoo                                             | verified        |             10–25m (18m) |              3–5h |         4.6h |           73.2 |              -0.9 |              72.3 |
|   10 | Kirin Beer Yokohama Factory                          | verified        |             50–90m (70m) |          1.5–3.5h |         4.8h |           73.4 |              -3.2 |              70.2 |

### Day trip + Full-day

#### Before

| rank | destination          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | -------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Shibuya City         | verified        |             15–30m (23m) |             5–11h |         8.8h |           79.9 |                 — |              79.9 |
|    2 | Chuo City            | verified        |              5–15m (10m) |             6–12h |         9.3h |           78.4 |                 — |              78.4 |
|    3 | Minato City          | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |                 — |              77.8 |
|    4 | Shinjuku City        | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |                 — |              77.8 |
|    5 | Taito City           | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |                 — |              77.8 |
|    6 | Toshima City         | verified        |             10–30m (20m) |             6–12h |         9.7h |           77.8 |                 — |              77.8 |
|    7 | Enoshima             | verified        |             50–90m (70m) |              7–9h |        10.3h |           77.0 |                 — |              77.0 |
|    8 | Ginza                | verified        |              5–15m (10m) |              5–7h |         6.3h |           76.4 |                 — |              76.4 |
|    9 | Omiya Railway Museum | verified        |            45–110m (78m) |              7–9h |        10.6h |           74.8 |                 — |              74.8 |
|   10 | Ikebukuro (Toshima)  | verified        |             10–30m (20m) |              7–9h |         8.7h |           73.9 |                 — |              73.9 |

#### After

| rank | destination         | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Shibuya City        | verified        |             15–30m (23m) |             5–11h |         8.8h |           79.9 |              -2.0 |              77.9 |
|    2 | Chuo City           | verified        |              5–15m (10m) |             6–12h |         9.3h |           78.4 |              -1.8 |              76.6 |
|    3 | Minato City         | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |              -2.1 |              75.7 |
|    4 | Shinjuku City       | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |              -2.1 |              75.7 |
|    5 | Taito City          | verified        |             10–25m (18m) |             6–12h |         9.6h |           77.8 |              -2.1 |              75.7 |
|    6 | Toshima City        | verified        |             10–30m (20m) |             6–12h |         9.7h |           77.8 |              -2.2 |              75.6 |
|    7 | Ginza               | verified        |              5–15m (10m) |              5–7h |         6.3h |           76.4 |              -1.0 |              75.4 |
|    8 | Enoshima            | verified        |             50–90m (70m) |              7–9h |        10.3h |           77.0 |              -3.7 |              73.3 |
|    9 | Ikebukuro (Toshima) | verified        |             10–30m (20m) |              7–9h |         8.7h |           73.9 |              -1.9 |              72.1 |
|   10 | Akasaka (Minato)    | verified        |             10–25m (18m) |              4–6h |         5.6h |           73.0 |              -1.0 |              71.9 |

## Nearest-only over-correction check

- Tokyo · Day trip + Any: 31 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Short: 16 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Half-day: 21 distance inversions in the top 10 (not nearest-only).
- Tokyo · Day trip + Full-day: 18 distance inversions in the top 10 (not nearest-only).

## Osaka

### Any trip + Recommended

#### Before

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | verified        |             15–45m (30m) |              3–5h |         5.0h |           80.9 |                 — |              80.9 |
|    2 | Hikone City                       | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    3 | Otsu City                         | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    4 | Himeji City                       | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    5 | Kobe City                         | verified        |             15–35m (25m) |             6–12h |         9.8h |           76.7 |                 — |              76.7 |
|    6 | Sakai City                        | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    7 | Miyazu City                       | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    8 | Uji City                          | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    9 | Ikaruga Town                      | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |
|   10 | Nara City                         | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |

#### After

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | verified        |             15–45m (30m) |              3–5h |         5.0h |           80.9 |                 — |              80.9 |
|    2 | Hikone City                       | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    3 | Otsu City                         | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    4 | Himeji City                       | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    5 | Kobe City                         | verified        |             15–35m (25m) |             6–12h |         9.8h |           76.7 |                 — |              76.7 |
|    6 | Sakai City                        | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    7 | Miyazu City                       | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    8 | Uji City                          | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    9 | Ikaruga Town                      | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |
|   10 | Nara City                         | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |

### Day trip + Any

#### Before

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | verified        |             15–45m (30m) |              3–5h |         5.0h |           80.9 |                 — |              80.9 |
|    2 | Hikone City                       | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    3 | Otsu City                         | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    4 | Himeji City                       | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    5 | Kobe City                         | verified        |             15–35m (25m) |             6–12h |         9.8h |           76.7 |                 — |              76.7 |
|    6 | Sakai City                        | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    7 | Miyazu City                       | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    8 | Uji City                          | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    9 | Ikaruga Town                      | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |
|   10 | Nara City                         | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |

#### After

| rank | destination                       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | --------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone Castle (National Treasure) | verified        |             15–45m (30m) |              3–5h |         5.0h |           80.9 |              -1.3 |              79.6 |
|    2 | Hikone City                       | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |              -2.6 |              74.7 |
|    3 | Otsu City                         | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |              -2.6 |              74.7 |
|    4 | Kobe City                         | verified        |             15–35m (25m) |             6–12h |         9.8h |           76.7 |              -2.4 |              74.3 |
|    5 | Himeji City                       | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |              -2.7 |              74.1 |
|    6 | Sakai City                        | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |              -2.7 |              74.1 |
|    7 | Takeda Castle Ruins               | verified        |             20–45m (33m) |              3–5h |         5.1h |           75.3 |              -1.4 |              73.9 |
|    8 | Miyazu City                       | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |              -2.8 |              73.0 |
|    9 | Uji City                          | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |              -2.8 |              73.0 |
|   10 | Ikaruga Town                      | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |              -3.0 |              72.5 |

### Day trip + Short

#### Before

| rank | destination          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | -------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Kinkaku-ji           | verified        |             15–35m (25m) |              1–3h |         2.8h |           69.3 |                 — |              69.3 |
|    2 | Nanzen-ji            | verified        |             15–35m (25m) |              1–3h |         2.8h |           67.2 |                 — |              67.2 |
|    3 | Kobe Port Tower      | verified        |             15–35m (25m) |              1–3h |         2.8h |           65.6 |                 — |              65.6 |
|    4 | Fushimi Inari Taisha | verified        |             15–35m (25m) |              1–3h |         2.8h |           64.8 |                 — |              64.8 |
|    5 | Yasaka Shrine        | verified        |             15–35m (25m) |              1–3h |         2.8h |           64.8 |                 — |              64.8 |
|    6 | Ginkaku-ji           | verified        |             15–35m (25m) |              1–3h |         2.8h |           64.2 |                 — |              64.2 |
|    7 | Nishiki Market       | verified        |             15–35m (25m) |              1–3h |         2.8h |           63.3 |                 — |              63.3 |
|    8 | Philosopher's Walk   | verified        |             15–35m (25m) |              1–3h |         2.8h |           62.7 |                 — |              62.7 |
|    9 | Kitano Ijinkan       | verified        |             15–35m (25m) |              1–3h |         2.8h |           62.3 |                 — |              62.3 |
|   10 | Kennin-ji            | verified        |             15–35m (25m) |              1–3h |         2.8h |           61.8 |                 — |              61.8 |

#### After

| rank | destination          | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | -------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Kinkaku-ji           | verified        |             15–35m (25m) |              1–3h |         2.8h |           69.3 |              -1.2 |              68.1 |
|    2 | Nanzen-ji            | verified        |             15–35m (25m) |              1–3h |         2.8h |           67.2 |              -1.2 |              66.0 |
|    3 | Kobe Port Tower      | verified        |             15–35m (25m) |              1–3h |         2.8h |           65.6 |              -1.2 |              64.4 |
|    4 | Fushimi Inari Taisha | verified        |             15–35m (25m) |              1–3h |         2.8h |           64.8 |              -1.2 |              63.6 |
|    5 | Yasaka Shrine        | verified        |             15–35m (25m) |              1–3h |         2.8h |           64.8 |              -1.2 |              63.6 |
|    6 | Ginkaku-ji           | verified        |             15–35m (25m) |              1–3h |         2.8h |           64.2 |              -1.2 |              63.0 |
|    7 | Nishiki Market       | verified        |             15–35m (25m) |              1–3h |         2.8h |           63.3 |              -1.2 |              62.1 |
|    8 | Philosopher's Walk   | verified        |             15–35m (25m) |              1–3h |         2.8h |           62.7 |              -1.2 |              61.5 |
|    9 | Kitano Ijinkan       | verified        |             15–35m (25m) |              1–3h |         2.8h |           62.3 |              -1.2 |              61.1 |
|   10 | Kennin-ji            | verified        |             15–35m (25m) |              1–3h |         2.8h |           61.8 |              -1.2 |              60.6 |

### Day trip + Half-day

#### Before

| rank | destination                                 | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone Castle (National Treasure)           | verified        |             15–45m (30m) |              3–5h |         5.0h |           80.9 |                 — |              80.9 |
|    2 | Takeda Castle Ruins                         | verified        |             20–45m (33m) |              3–5h |         5.1h |           75.3 |                 — |              75.3 |
|    3 | Abeno Harukas 300 (Osaka Skyline)           | estimated       |             17–22m (20m) |              2–4h |         4.7h |           72.8 |                 — |              72.8 |
|    4 | Nagoya Castle (Golden Shachihoko)           | verified        |             35–75m (55m) |              2–4h |         4.8h |           72.6 |                 — |              72.6 |
|    5 | Nunobiki Herb Gardens                       | verified        |             15–35m (25m) |            1.5–4h |         3.6h |           70.4 |                 — |              70.4 |
|    6 | Mount Maya Kikuseidai (Kobe)                | verified        |             20–45m (33m) |              3–5h |         5.1h |           68.3 |                 — |              68.3 |
|    7 | Historic Kyoto (Kiyomizu-dera & Kinkaku-ji) | verified        |             15–35m (25m) |              3–5h |         4.8h |           68.2 |                 — |              68.2 |
|    8 | Himeji Castle (White Heron Castle)          | verified        |             15–35m (25m) |              3–5h |         4.8h |           68.1 |                 — |              68.1 |
|    9 | Meriken Park                                | verified        |             15–35m (25m) |            1.5–4h |         3.6h |           67.7 |                 — |              67.7 |
|   10 | Historic Nara (Todai-ji Great Buddha)       | verified        |             30–55m (43m) |              3–5h |         5.4h |           67.2 |                 — |              67.2 |

#### After

| rank | destination                                 | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone Castle (National Treasure)           | verified        |             15–45m (30m) |              3–5h |         5.0h |           80.9 |              -1.3 |              79.6 |
|    2 | Takeda Castle Ruins                         | verified        |             20–45m (33m) |              3–5h |         5.1h |           75.3 |              -1.4 |              73.9 |
|    3 | Abeno Harukas 300 (Osaka Skyline)           | estimated       |             17–22m (20m) |              2–4h |         4.7h |           72.8 |              -2.2 |              70.6 |
|    4 | Nagoya Castle (Golden Shachihoko)           | verified        |             35–75m (55m) |              2–4h |         4.8h |           72.6 |              -2.4 |              70.2 |
|    5 | Nunobiki Herb Gardens                       | verified        |             15–35m (25m) |            1.5–4h |         3.6h |           70.4 |              -1.1 |              69.3 |
|    6 | Historic Kyoto (Kiyomizu-dera & Kinkaku-ji) | verified        |             15–35m (25m) |              3–5h |         4.8h |           68.2 |              -1.1 |              67.0 |
|    7 | Himeji Castle (White Heron Castle)          | verified        |             15–35m (25m) |              3–5h |         4.8h |           68.1 |              -1.1 |              67.0 |
|    8 | Mount Maya Kikuseidai (Kobe)                | verified        |             20–45m (33m) |              3–5h |         5.1h |           68.3 |              -1.4 |              66.9 |
|    9 | Meriken Park                                | verified        |             15–35m (25m) |            1.5–4h |         3.6h |           67.7 |              -1.1 |              66.6 |
|   10 | Historic Nara (Todai-ji Great Buddha)       | verified        |             30–55m (43m) |              3–5h |         5.4h |           67.2 |              -1.8 |              65.4 |

### Day trip + Full-day

#### Before

| rank | destination  | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------ | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone City  | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    2 | Otsu City    | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |                 — |              77.3 |
|    3 | Himeji City  | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    4 | Kobe City    | verified        |             15–35m (25m) |             6–12h |         9.8h |           76.7 |                 — |              76.7 |
|    5 | Sakai City   | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |                 — |              76.7 |
|    6 | Miyazu City  | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    7 | Uji City     | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |                 — |              75.8 |
|    8 | Ikaruga Town | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |
|    9 | Nara City    | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |                 — |              75.5 |
|   10 | Kyoto City   | verified        |             15–35m (25m) |             8–14h |        11.8h |           74.5 |                 — |              74.5 |

#### After

| rank | destination  | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------ | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Hikone City  | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |              -2.6 |              74.7 |
|    2 | Otsu City    | verified        |             15–45m (30m) |             6–12h |        10.0h |           77.3 |              -2.6 |              74.7 |
|    3 | Kobe City    | verified        |             15–35m (25m) |             6–12h |         9.8h |           76.7 |              -2.4 |              74.3 |
|    4 | Himeji City  | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |              -2.7 |              74.1 |
|    5 | Sakai City   | verified        |             20–45m (33m) |             6–12h |        10.1h |           76.7 |              -2.7 |              74.1 |
|    6 | Miyazu City  | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |              -2.8 |              73.0 |
|    7 | Uji City     | verified        |             28–45m (37m) |             6–12h |        10.2h |           75.8 |              -2.8 |              73.0 |
|    8 | Ikaruga Town | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |              -3.0 |              72.5 |
|    9 | Nara City    | verified        |             30–55m (43m) |             6–12h |        10.4h |           75.5 |              -3.0 |              72.5 |
|   10 | Kyoto City   | verified        |             15–35m (25m) |             8–14h |        11.8h |           74.5 |              -3.2 |              71.4 |

## Nearest-only over-correction check

- Osaka · Day trip + Any: 28 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Short: 24 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Half-day: 28 distance inversions in the top 10 (not nearest-only).
- Osaka · Day trip + Full-day: 28 distance inversions in the top 10 (not nearest-only).

## Fukuoka

### Any trip + Recommended

#### Before

| rank | destination                   | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ----------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Daikanbo Viewpoint            | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           72.6 |                 — |              72.6 |
|    2 | Kusasenri Grassland           | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           72.6 |                 — |              72.6 |
|    3 | Okama Crater Lake             | unknown         |                        — |              1–3h |            — |           72.2 |                 — |              72.2 |
|    4 | Nakadake Crater               | verified        |             35–60m (48m) |              1–3h |         3.6h |           71.3 |                 — |              71.3 |
|    5 | Lake Tazawa                   | unknown         |                        — |              3–5h |            — |           71.0 |                 — |              71.0 |
|    6 | Takachiho Gorge               | unknown         |                        — |            1.5–3h |            — |           71.0 |                 — |              71.0 |
|    7 | Mount Bandai                  | unknown         |                        — |              5–7h |            — |           70.4 |                 — |              70.4 |
|    8 | Aomori Nebuta Museum WA RASSE | unknown         |                        — |              1–3h |            — |           70.4 |                 — |              70.4 |
|    9 | Goshikinuma Ponds             | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|   10 | Mount Zao                     | unknown         |                        — |              4–6h |            — |           69.8 |                 — |              69.8 |

#### After

| rank | destination                   | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ----------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Daikanbo Viewpoint            | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           72.6 |                 — |              72.6 |
|    2 | Kusasenri Grassland           | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           72.6 |                 — |              72.6 |
|    3 | Okama Crater Lake             | unknown         |                        — |              1–3h |            — |           72.2 |                 — |              72.2 |
|    4 | Nakadake Crater               | verified        |             35–60m (48m) |              1–3h |         3.6h |           71.3 |                 — |              71.3 |
|    5 | Lake Tazawa                   | unknown         |                        — |              3–5h |            — |           71.0 |                 — |              71.0 |
|    6 | Takachiho Gorge               | unknown         |                        — |            1.5–3h |            — |           71.0 |                 — |              71.0 |
|    7 | Mount Bandai                  | unknown         |                        — |              5–7h |            — |           70.4 |                 — |              70.4 |
|    8 | Aomori Nebuta Museum WA RASSE | unknown         |                        — |              1–3h |            — |           70.4 |                 — |              70.4 |
|    9 | Goshikinuma Ponds             | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|   10 | Mount Zao                     | unknown         |                        — |              4–6h |            — |           69.8 |                 — |              69.8 |

### Day trip + Any

#### Before

| rank | destination                   | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ----------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Daikanbo Viewpoint            | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           72.6 |                 — |              72.6 |
|    2 | Kusasenri Grassland           | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           72.6 |                 — |              72.6 |
|    3 | Okama Crater Lake             | unknown         |                        — |              1–3h |            — |           72.2 |                 — |              72.2 |
|    4 | Nakadake Crater               | verified        |             35–60m (48m) |              1–3h |         3.6h |           71.3 |                 — |              71.3 |
|    5 | Lake Tazawa                   | unknown         |                        — |              3–5h |            — |           71.0 |                 — |              71.0 |
|    6 | Takachiho Gorge               | unknown         |                        — |            1.5–3h |            — |           71.0 |                 — |              71.0 |
|    7 | Mount Bandai                  | unknown         |                        — |              5–7h |            — |           70.4 |                 — |              70.4 |
|    8 | Aomori Nebuta Museum WA RASSE | unknown         |                        — |              1–3h |            — |           70.4 |                 — |              70.4 |
|    9 | Goshikinuma Ponds             | unknown         |                        — |              2–4h |            — |           69.8 |                 — |              69.8 |
|   10 | Mount Zao                     | unknown         |                        — |              4–6h |            — |           69.8 |                 — |              69.8 |

#### After

| rank | destination                     | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Kusasenri Grassland             | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           72.6 |              -2.5 |              70.1 |
|    2 | Daikanbo Viewpoint              | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           72.6 |              -3.2 |              69.4 |
|    3 | Nakadake Crater                 | verified        |             35–60m (48m) |              1–3h |         3.6h |           71.3 |              -2.3 |              69.0 |
|    4 | Suizenji Jojuen Garden          | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           69.4 |              -2.5 |              66.9 |
|    5 | Fukuoka City                    | estimated       |             14–19m (17m) |             6–12h |        10.6h |           68.0 |              -3.3 |              64.7 |
|    6 | Kumamoto Prefectural Art Museum | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           66.5 |              -2.5 |              64.0 |
|    7 | Dazaifu Tenmangu Shrine         | estimated       |             24–31m (28m) |              1–3h |         4.0h |           66.8 |              -3.0 |              63.8 |
|    8 | Fukuoka City Museum             | estimated       |             17–22m (20m) |            1.5–3h |         4.0h |           65.0 |              -2.4 |              62.6 |
|    9 | Aso Volcano Museum              | verified        |             35–60m (48m) |              1–2h |         3.1h |           65.2 |              -2.6 |              62.5 |
|   10 | Kyushu National Museum          | estimated       |             24–31m (28m) |              2–4h |         5.0h |           65.0 |              -2.7 |              62.3 |

### Day trip + Short

#### Before

| rank | destination                     | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Daikanbo Viewpoint              | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           72.6 |                 — |              72.6 |
|    2 | Kusasenri Grassland             | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           72.6 |                 — |              72.6 |
|    3 | Nakadake Crater                 | verified        |             35–60m (48m) |              1–3h |         3.6h |           71.3 |                 — |              71.3 |
|    4 | Suizenji Jojuen Garden          | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           69.4 |                 — |              69.4 |
|    5 | Dazaifu Tenmangu Shrine         | estimated       |             24–31m (28m) |              1–3h |         4.0h |           66.8 |                 — |              66.8 |
|    6 | Kumamoto Prefectural Art Museum | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           66.5 |                 — |              66.5 |
|    7 | Aso Volcano Museum              | verified        |             35–60m (48m) |              1–2h |         3.1h |           65.2 |                 — |              65.2 |
|    8 | Fukuoka City Museum             | estimated       |             17–22m (20m) |            1.5–3h |         4.0h |           65.0 |                 — |              65.0 |
|    9 | Komyozenji Temple               | estimated       |             24–31m (28m) |          0.5–1.5h |         3.0h |           62.0 |                 — |              62.0 |
|   10 | Kawachi Wisteria Garden         | estimated       |             38–48m (43m) |            1–2.5h |         4.3h |           60.8 |                 — |              60.8 |

#### After

| rank | destination                     | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Kusasenri Grassland             | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           72.6 |              -2.5 |              70.1 |
|    2 | Daikanbo Viewpoint              | verified        |             35–60m (48m) |          0.5–1.5h |         2.6h |           72.6 |              -3.2 |              69.4 |
|    3 | Nakadake Crater                 | verified        |             35–60m (48m) |              1–3h |         3.6h |           71.3 |              -2.3 |              69.0 |
|    4 | Suizenji Jojuen Garden          | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           69.4 |              -2.5 |              66.9 |
|    5 | Kumamoto Prefectural Art Museum | verified        |             35–60m (48m) |            1–2.5h |         3.3h |           66.5 |              -2.5 |              64.0 |
|    6 | Dazaifu Tenmangu Shrine         | estimated       |             24–31m (28m) |              1–3h |         4.0h |           66.8 |              -3.0 |              63.8 |
|    7 | Fukuoka City Museum             | estimated       |             17–22m (20m) |            1.5–3h |         4.0h |           65.0 |              -2.4 |              62.6 |
|    8 | Aso Volcano Museum              | verified        |             35–60m (48m) |              1–2h |         3.1h |           65.2 |              -2.6 |              62.5 |
|    9 | Komyozenji Temple               | estimated       |             24–31m (28m) |          0.5–1.5h |         3.0h |           62.0 |              -3.9 |              58.1 |
|   10 | Kawachi Wisteria Garden         | estimated       |             38–48m (43m) |            1–2.5h |         4.3h |           60.8 |              -4.0 |              56.8 |

### Day trip + Half-day

#### Before

| rank | destination                              | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Yufuin Onsen District                    | verified        |          115–160m (138m) |              2–6h |         8.6h |           66.8 |                 — |              66.8 |
|    2 | Kyushu National Museum                   | estimated       |             24–31m (28m) |              2–4h |         5.0h |           65.0 |                 — |              65.0 |
|    3 | Mojiko Retro District                    | estimated       |             42–54m (48m) |            1.5–4h |         5.5h |           63.8 |                 — |              63.8 |
|    4 | Hakata Station & AMU Plaza               | estimated       |             14–19m (17m) |              1–4h |         4.1h |           62.0 |                 — |              62.0 |
|    5 | Fukuoka PayPay Dome & BOSS E-ZO          | estimated       |             15–20m (18m) |            1.5–4h |         4.4h |           60.8 |                 — |              60.8 |
|    6 | Mameda Historic District                 | verified        |          115–160m (138m) |              2–4h |         7.6h |           60.7 |                 — |              60.7 |
|    7 | Fukuoka Art Museum                       | estimated       |             15–20m (18m) |              2–4h |         4.7h |           57.5 |                 — |              57.5 |
|    8 | Nagasaki Peace Park & Atomic Bomb Museum | verified        |           90–140m (115m) |              2–4h |         6.8h |           54.8 |                 — |              54.8 |
|    9 | Kumamoto Castle                          | estimated       |            79–101m (90m) |              3–5h |         8.4h |           54.6 |                 — |              54.6 |
|   10 | Itsukushima Shrine (Miyajima Island)     | verified        |             60–95m (78m) |              3–5h |         6.6h |           54.5 |                 — |              54.5 |

#### After

| rank | destination                              | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ---------------------------------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Kyushu National Museum                   | estimated       |             24–31m (28m) |              2–4h |         5.0h |           65.0 |              -2.7 |              62.3 |
|    2 | Yufuin Onsen District                    | verified        |          115–160m (138m) |              2–6h |         8.6h |           66.8 |              -5.9 |              60.9 |
|    3 | Mojiko Retro District                    | estimated       |             42–54m (48m) |            1.5–4h |         5.5h |           63.8 |              -3.7 |              60.1 |
|    4 | Hakata Station & AMU Plaza               | estimated       |             14–19m (17m) |              1–4h |         4.1h |           62.0 |              -2.2 |              59.8 |
|    5 | Fukuoka PayPay Dome & BOSS E-ZO          | estimated       |             15–20m (18m) |            1.5–4h |         4.4h |           60.8 |              -2.2 |              58.6 |
|    6 | Fukuoka Art Museum                       | estimated       |             15–20m (18m) |              2–4h |         4.7h |           57.5 |              -2.2 |              55.3 |
|    7 | Mameda Historic District                 | verified        |          115–160m (138m) |              2–4h |         7.6h |           60.7 |              -6.0 |              54.7 |
|    8 | Itsukushima Shrine (Miyajima Island)     | verified        |             60–95m (78m) |              3–5h |         6.6h |           54.5 |              -3.3 |              51.2 |
|    9 | Nagasaki Peace Park & Atomic Bomb Museum | verified        |           90–140m (115m) |              2–4h |         6.8h |           54.8 |              -5.0 |              49.8 |
|   10 | Kumamoto Castle                          | estimated       |            79–101m (90m) |              3–5h |         8.4h |           54.6 |              -5.6 |              49.0 |

### Day trip + Full-day

#### Before

| rank | destination       | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | ----------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Fukuoka City      | estimated       |             14–19m (17m) |             6–12h |        10.6h |           68.0 |                 — |              68.0 |
|    2 | Osaka City        | verified        |          150–195m (173m) |             6–12h |        14.8h |           67.2 |                 — |              67.2 |
|    3 | Tokyo Station     | verified        |          250–276m (263m) |             4–10h |        15.8h |           66.2 |                 — |              66.2 |
|    4 | Huis Ten Bosch    | estimated       |             71–91m (81m) |              4–8h |        10.0h |           66.0 |                 — |              66.0 |
|    5 | Kyoto City        | verified        |          160–200m (180m) |             8–14h |        17.0h |           65.4 |                 — |              65.4 |
|    6 | Beppu City        | verified        |          115–160m (138m) |             6–12h |        13.6h |           64.2 |                 — |              64.2 |
|    7 | Hita City         | verified        |          115–160m (138m) |             6–12h |        13.6h |           64.2 |                 — |              64.2 |
|    8 | Yufu City         | verified        |          115–160m (138m) |             6–12h |        13.6h |           64.2 |                 — |              64.2 |
|    9 | Yokohama Zoorasia | verified        |          257–285m (271m) |              4–6h |        14.0h |           58.8 |                 — |              58.8 |
|   10 | Shibuya City      | verified        |          249–274m (262m) |             5–11h |        16.7h |           57.8 |                 — |              57.8 |

#### After

| rank | destination    | travel evidence | one-way range (midpoint) | recommended visit | total outing | base/catalogue | travel efficiency | final Recommended |
| ---: | -------------- | --------------- | -----------------------: | ----------------: | -----------: | -------------: | ----------------: | ----------------: |
|    1 | Fukuoka City   | estimated       |             14–19m (17m) |             6–12h |        10.6h |           68.0 |              -3.3 |              64.7 |
|    2 | Huis Ten Bosch | estimated       |             71–91m (81m) |              4–8h |        10.0h |           66.0 |              -5.3 |              60.7 |
|    3 | Osaka City     | verified        |          150–195m (173m) |             6–12h |        14.8h |           67.2 |              -8.0 |              59.2 |
|    4 | Kyoto City     | verified        |          160–200m (180m) |             8–14h |        17.0h |           65.4 |              -7.5 |              57.9 |
|    5 | Beppu City     | verified        |          115–160m (138m) |             6–12h |        13.6h |           64.2 |              -7.0 |              57.3 |
|    6 | Hita City      | verified        |          115–160m (138m) |             6–12h |        13.6h |           64.2 |              -7.0 |              57.3 |
|    7 | Yufu City      | verified        |          115–160m (138m) |             6–12h |        13.6h |           64.2 |              -7.0 |              57.3 |
|    8 | Tokyo Station  | verified        |          250–276m (263m) |             4–10h |        15.8h |           66.2 |             -10.3 |              55.9 |
|    9 | Dazaifu City   | estimated       |             23–30m (27m) |             6–12h |        11.0h |           56.0 |              -3.7 |              52.3 |
|   10 | Hiroshima City | verified        |             60–95m (78m) |             6–12h |        11.6h |           56.3 |              -4.4 |              51.8 |

## Nearest-only over-correction check

- Fukuoka · Day trip + Any: 29 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Short: 32 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Half-day: 17 distance inversions in the top 10 (not nearest-only).
- Fukuoka · Day trip + Full-day: 19 distance inversions in the top 10 (not nearest-only).
