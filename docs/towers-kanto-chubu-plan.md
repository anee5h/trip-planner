# Implementation Plan — Kanto & Chubu Standalone Tower Destinations Expansion

This plan adds **10 iconic observation and landmark towers** across the **Kanto** and **Chubu** regions as dedicated standalone destinations in TabiMap.

---

## Complete List of Standalone Towers

### Kanto Region (6 Towers)

1. **Tokyo Skytree (Sumida, Tokyo)** — `tokyo-skytree-sumida` (#102)
   - _Height_: 634m (world's tallest free-standing broadcast tower). Tembo Deck (350m) & Tembo Galleria (450m), Tokyo Solamachi complex.
2. **Tokyo Tower (Minato, Tokyo)** — `tokyo-tower-minato` (#103)
   - _Height_: 332.9m. Iconic red-and-white lattice Eiffel tower, Main Deck (150m), Top Deck (250m), RED° TOKYO TOWER e-sports park.
3. **Yokohama Marine Tower (Yokohama, Kanagawa)** — `yokohama-marine-tower` (#104)
   - _Height_: 106m. Historic lighthouse tower in Yamashita Park, 360-degree views of Yokohama Port & Bay Bridge.
4. **Chiba Port Tower (Chiba City, Chiba)** — `chiba-port-tower` (#105)
   - _Height_: 125m. Diamond/mirror-glass tower on Tokyo Bay waterfront, Lover's Sanctuary, sunset views over Tokyo Bay.
5. **Oarai Marine Tower (Oarai, Ibaraki)** — `oarai-marine-tower` (#106)
   - _Height_: 60m. Triangular glass observation tower offering panoramic Pacific Ocean views & Oarai shrine coastal scenery.
6. **Art Tower Mito (Mito, Ibaraki)** — `art-tower-mito` (#107)
   - _Height_: 100m. Striking helix-shaped titanium tetrahedron tower designed by Pritzker laureate Arata Isozaki.

### Chubu Region (4 Towers)

7. **Chubu Electric Power MIRAI TOWER / Nagoya TV Tower (Nagoya, Aichi)** — `mirai-tower-nagoya` (#108)
   - _Height_: 180m. Japan's first TV tower (1954), Registered Tangible Cultural Property in Hisaya-odori Park.
8. **Higashiyama Sky Tower (Nagoya, Aichi)** — `higashiyama-sky-tower-nagoya` (#109)
   - _Height_: 134m (total 214m elevation on hill). Panoramic views of Nagoya skyline & Central Japan Alps.
9. **Befco Bakauke Observatory / Toki Messe Tower (Niigata City, Niigata)** — `toki-messe-tower-niigata` (#110)
   - _Height_: 140.5m. Tallest observation deck on the Sea of Japan coast, 360-degree views of Shinano River & Sado Island.
10. **Nagoya Port Building / Maritime Tower (Nagoya, Aichi)** — `nagoya-port-tower` (#111)
    - _Height_: 63m. White sailboat-shaped tower overlooking Nagoya Port, maritime museum & 360-degree observation deck.

---

## Data & Schema Standards

Each tower destination will be populated with full Schema v2 properties:

- **Index Entry**: Added to `src/shared/data/destinations-index.json`.
- **Detail Entry**: Dedicated detail JSON file created in `public/data/destinations/${id}.json`.
- **Image Validation**: Guaranteed HTTP 200 clean high-res CDN images for hero and gallery slots.
- **Fields**: Complete `ratings`, `crowd`, `season`, `comfort`, `budgetBreakdown`, structured `itineraries`, `coordinates`, `highlights`, `tags`, `restaurants`, `cafes`, `notes`, `reservation`, and `parking`.

---

## Proposed Changes

### `src/shared/data/destinations-index.json`

#### [MODIFY] `destinations-index.json`

- Append destination objects 102 through 111.

### `public/data/destinations/`

#### [NEW] `tokyo-skytree-sumida.json`

#### [NEW] `tokyo-tower-minato.json`

#### [NEW] `yokohama-marine-tower.json`

#### [NEW] `chiba-port-tower.json`

#### [NEW] `oarai-marine-tower.json`

#### [NEW] `art-tower-mito.json`

#### [NEW] `mirai-tower-nagoya.json`

#### [NEW] `higashiyama-sky-tower-nagoya.json`

#### [NEW] `toki-messe-tower-niigata.json`

#### [NEW] `nagoya-port-tower.json`

---

## Verification Plan

### Automated Tests

- Run full Vitest suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Test search for "Tower", "Skytree", "MIRAI", "Oarai" on `/destinations` and verify images, ratings, budget breakdown, and itineraries render without empty fields or broken image fallback placeholders.
