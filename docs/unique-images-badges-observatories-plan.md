# Implementation Plan — Unique Destination Image Audit, Special Badges UI, & High-Rise Observatories Expansion

This plan addresses image duplicates across castles, towers, and Fujiyoshida, adds **6 major high-rise observatories**, and introduces custom UI badges for **12 Original Keeps**, **World's Tallest Tower**, **Top 100 Castle**, and **Free Observatory**.

---

## 1. Image Audit & Authentic Media Replacement

Audit and replace generic/duplicate Unsplash URLs with topic-tailored, authentic high-resolution images for:

- **Fujiyoshida** (`fujiyoshida` / Chureito Pagoda): Authentic Chureito Pagoda + Mt. Fuji vista.
- **Towers (10 Destinations)**: Distinct images for Tokyo Skytree, Tokyo Tower, Yokohama Marine Tower, Chiba Port Tower, Oarai Marine Tower, Art Tower Mito, MIRAI Tower, Higashiyama Sky Tower, Toki Messe, and Nagoya Port Building.
- **Castles (12 Destinations)**: Distinct images for Edo Castle, Kawagoe Goten, Sakura Castle, Mito Castle, Takeda Shrine, Hikone Castle, Gifu Castle, Ueda Castle, Takato Castle, Kakegawa Castle, Kanazawa Castle, and Maruoka Castle.

---

## 2. New High-Rise Observatories (6 Destinations)

1. **Tokyo Metropolitan Government Building Observatories (Shinjuku, Tokyo)** — `tokyo-metropolitan-government-building-shinjuku` (#124)
   - _Height_: 202m. 45th Floor North & South free observation decks with Mt. Fuji panoramas.
2. **Shibuya Sky (Shibuya, Tokyo)** — `shibuya-sky-shibuya` (#125)
   - _Height_: 229m. Open-air rooftop glass-edge observatory atop Shibuya Scramble Square.
3. **Roppongi Hills Observation Deck / Tokyo City View (Roppongi, Tokyo)** — `roppongi-hills-tokyo-city-view` (#126)
   - _Height_: 270m. Rooftop Sky Deck & 52F indoor observatory facing Tokyo Tower.
4. **Sunshine 60 Observatory / Tenbou Park (Ikebukuro, Tokyo)** — `sunshine-60-observatory-ikebukuro` (#127)
   - _Height_: 251m. Indoor sky park featuring artificial grass lawn overlooking Tokyo.
5. **Yokohama Landmark Tower Sky Garden (Yokohama, Kanagawa)** — `yokohama-landmark-tower-sky-garden` (#128)
   - _Height_: 273m. 69th floor observatory accessed via Japan's fastest elevator (750m/min).
6. **Abeno Harukas 300 (Osaka)** — `abeno-harukas-300-osaka` (#129)
   - _Height_: 300m. 58th-60th floor open-air atrium observatory atop Japan's 300m landmark skyscraper.

---

## 3. Special Custom Badges UI

Update `DestinationCard.tsx` and `DestinationDetails.tsx` to render prominent badges:

- 🏰 **`12 Original Keeps`**: Amber/Gold badge (`bg-amber-500/90 text-white`) for the 12 original surviving keeps (Matsumoto, Inuyama, Hikone, Maruoka).
- 🏯 **`Top 100 Castle`**: Rose/Red badge (`bg-rose-600/90 text-white`) for official 100 Fine Castles of Japan.
- 🗼 **`World's Tallest Tower`**: Cyan/Sky badge (`bg-sky-600/90 text-white`) for Tokyo Skytree.
- 🏙️ **`Free Observatory`**: Emerald/Green badge (`bg-emerald-600/90 text-white`) for free observatories (Tokyo Metro Gov, Befco Bakauke).

---

## Proposed Changes

### UI Components

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

- Render special badges on image overlay header based on `destination.tags` and `destination.categories`.

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Render special badge highlights next to title and header.

### Dataset & Public Files

#### [MODIFY] `src/shared/data/destinations-index.json`

- Update Fujiyoshida, towers, and castles with unique images.
- Add destinations 124 through 129.

#### [NEW] `public/data/destinations/tokyo-metropolitan-government-building-shinjuku.json`

#### [NEW] `public/data/destinations/shibuya-sky-shibuya.json`

#### [NEW] `public/data/destinations/roppongi-hills-tokyo-city-view.json`

#### [NEW] `public/data/destinations/sunshine-60-observatory-ikebukuro.json`

#### [NEW] `public/data/destinations/yokohama-landmark-tower-sky-garden.json`

#### [NEW] `public/data/destinations/abeno-harukas-300-osaka.json`

---

## Verification Plan

### Automated Tests

- Run full Vitest suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Check `/destinations` cards and detail pages to confirm unique non-duplicate images and distinct badge styling for `12 Original Keeps`, `World's Tallest Tower`, `Top 100 Castle`, and `Free Observatory`.
