# Implementation Plan — Kanto & Chubu Official Top 100 Fine Castles Expansion

This plan audits and adds **12 official Top 100 Fine Castles of Japan (日本100名城)** across the **Kanto** and **Chubu** regions as dedicated standalone destinations in TabiMap.

---

## Audit Against Official 100 Fine Castles of Japan (日本100名城)

All 12 proposed castles are certified entries on the official **Japan Castle Foundation Top 100** list:

### Kanto Region Official Top 100 Castles (5 Castles)

1. **Edo Castle Ruins & Imperial Palace Gardens (Tokyo)** — `edo-castle-tokyo` (#112)
   - _Official #21 in Top 100_: Tokugawa Shogunate seat, Fujimi-yagura, massive stone ramparts.
2. **Kawagoe Castle Honmaru Goten (Saitama)** — `kawagoe-castle-saitama` (#113)
   - _Official #19 in Top 100_: Only surviving samurai lord's Honmaru Goten palace in eastern Japan.
3. **Sakura Castle Park & Ruins (Chiba)** — `sakura-castle-chiba` (#114)
   - _Official #20 in Top 100_: Preserved earthen fortifications, deep dry moats, National Museum of Japanese History.
4. **Mito Castle Ruins & Kodokan (Ibaraki)** — `mito-castle-ibaraki` (#115)
   - _Official #14 in Top 100_: Tokugawa Mito clan stronghold, restored Otemon gate, historic Kodokan clan school.
5. **Tsutsujigasaki Castle / Takeda Shrine (Yamanashi)** — `takeda-castle-yamanashi` (#116)
   - _Official #24 in Top 100_: Legendary warlord Takeda Shingen's fortified residence and moat complex.

### Chubu Region Official Top 100 Castles (7 Castles)

6. **Hikone Castle (Shiga / Chubu border)** — `hikone-castle-shiga` (#117)
   - _Official #50 in Top 100_: **National Treasure** original 1622 wooden keep, Genkyuen garden.
7. **Gifu Castle (Gifu)** — `gifu-castle-gifu` (#118)
   - _Official #39 in Top 100_: Oda Nobunaga's mountain fortress atop Mt. Kinka overlooking Nagara River.
8. **Ueda Castle (Nagano)** — `ueda-castle-nagano` (#119)
   - _Official #27 in Top 100_: Sanada clan fortress that repelled the Tokugawa army twice (1585 & 1600).
9. **Takato Castle Park (Nagano)** — `takato-castle-nagano` (#120)
   - _Official #28 in Top 100_: Japan's #1 cherry blossom castle park with 1,500 Kohigan trees.
10. **Kakegawa Castle (Shizuoka)** — `kakegawa-castle-shizuoka` (#121)
    - _Official #42 in Top 100_: Japan's first authentic wooden reconstructed keep & original Ninomaru Goten.
11. **Kanazawa Castle Park (Ishikawa)** — `kanazawa-castle-ishikawa` (#122)
    - _Official #35 in Top 100_: Maeda clan seat, Hishi Yagura turret & Gojukkoku Nagaya storehouses.
12. **Maruoka Castle (Fukui)** — `maruoka-castle-fukui` (#123)
    - _Official #36 in Top 100_: **One of Japan's 12 original surviving keeps** (built 1576), oldest architectural style in Japan.

---

## Data & Schema Standards

Each castle destination will be populated with full Schema v2 properties:

- **Index Entry**: Added to `src/shared/data/destinations-index.json`.
- **Detail Entry**: Dedicated detail JSON file created in `public/data/destinations/${id}.json`.
- **Image Validation**: Guaranteed HTTP 200 clean high-res CDN images for hero and gallery slots.
- **Fields**: Complete `ratings`, `crowd`, `season`, `comfort`, `budgetBreakdown`, structured `itineraries`, `coordinates`, `highlights`, `tags`, `restaurants`, `cafes`, `notes`, `reservation`, and `parking`.

---

## Proposed Changes

### `src/shared/data/destinations-index.json`

#### [MODIFY] `destinations-index.json`

- Append destination objects 112 through 123.

### `public/data/destinations/`

#### [NEW] `edo-castle-tokyo.json`

#### [NEW] `kawagoe-castle-saitama.json`

#### [NEW] `sakura-castle-chiba.json`

#### [NEW] `mito-castle-ibaraki.json`

#### [NEW] `takeda-castle-yamanashi.json`

#### [NEW] `hikone-castle-shiga.json`

#### [NEW] `gifu-castle-gifu.json`

#### [NEW] `ueda-castle-nagano.json`

#### [NEW] `takato-castle-nagano.json`

#### [NEW] `kakegawa-castle-shizuoka.json`

#### [NEW] `kanazawa-castle-ishikawa.json`

#### [NEW] `maruoka-castle-fukui.json`

---

## Verification Plan

### Automated Tests

- Run full Vitest suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Test search for "Castle", "Edo", "Hikone", "Gifu", "Kanazawa", "Maruoka" on `/destinations` and verify images, ratings, budget breakdown, and itineraries render cleanly without missing details.
