# Implementation Plan: Reorganize My Trips into Dedicated Itineraries & Bucket List Views

This plan removes redundant "Visited Places" and stats from `MyTrips.tsx` (as visited tracking is fully covered in Travel Passport `/passport`) and splits **My Trips** into two dedicated, clean sub-views (**Itineraries** & **Bucket List**) selectable via a **Header Dropdown Selector** and a **Navbar Dropdown Menu**.

---

## 1. Feature Specifications & User Value

- **Clean Focus**:
  - Remove redundant stats badges ("Places Visited", "Prefectures", "Explored %") and the "Visited Places" tab from `MyTrips.tsx`.
  - Focus **My Trips** exclusively on **Itineraries** (trip plans) and **Bucket List** (saved/favorite sights).
- **Navbar Dropdown Menu**:
  - When hovering or clicking "My Trips" in the top Navbar, display a dropdown menu with 2 direct options:
    1. 🗺️ **Itineraries** (`/my-trips?tab=planned`)
    2. 🔖 **Bucket List** (`/my-trips?tab=bucketlist`)
- **Header Dropdown & Toggle Selector**:
  - In `MyTrips.tsx`, render a sleek dropdown selector `[ 🗺️ Itineraries ▾ ]` / `[ 🔖 Bucket List ▾ ]` for seamless sub-page switching.

---

## 2. Proposed Component Architecture & Changes

### A. Navbar Upgrade

#### [MODIFY] `src/shared/components/layout/Navbar.tsx`

- Add a dropdown hover/click menu for the "My Trips" navigation item.
- Provide direct links to **Itineraries** (`/my-trips?tab=planned`) and **Bucket List** (`/my-trips?tab=bucketlist`).
- Ensure mobile navigation menu also features these 2 clean sub-items.

### B. MyTrips Dashboard Redesign

#### [MODIFY] `src/features/profile/MyTrips.tsx`

- Remove `visitedDestinations`, `visitedPrefectures`, `progressPercent` stats badges from page header.
- Remove `visited` tab and filtered visited places section.
- Add Header View Selector Dropdown (`Itineraries` ↔ `Bucket List`).
- Render clean views for **Itineraries** (with "+ Create New Trip" primary action) and **Bucket List** (with destination cards and empty state prompt).

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Verify data pipeline integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure unit test suite passes.
4. `npm run build` — Confirm clean production build compilation.

### Manual Verification

1. Open the Navbar on desktop and mobile -> Hover/click "My Trips" -> Verify dropdown showing "Itineraries" and "Bucket List".
2. Click "Itineraries" -> Loads `/my-trips?tab=planned` showing trip plans and "+ Create New Trip" button.
3. Click "Bucket List" -> Loads `/my-trips?tab=bucketlist` showing saved bucket list sights.
4. Switch views using the Header Dropdown Selector in `MyTrips.tsx`.
5. Verify `/passport` continues to track explored prefectures and visited places history.
