# Implementation Plan — Header Polish, Compact Filter Bar, & Region/Prefecture Filtering

This plan removes the redundant "Explore" tab from the header, links the "TabiMap" logo to the homepage, makes the `/destinations` filter area compact, and adds a unified Region & Prefecture filter.

---

## 1. Header Navigation Polish (`Navbar.tsx`)

1. **Logo Link**: Clicking `TabiMap` logo navigates to `/`.
2. **Remove "Explore" Tab**: Remove `{ name: "Explore", path: "/", icon: Compass }` from `navItems` array so header links read cleanly (`Destinations`, `Prefectures`, `Compare`, `My Trips`).

---

## 2. Compact Filter Bar Redesign (`DestinationFilters.tsx` & `Destinations.tsx`)

### Layout Compression:

- Reorganize filter bar from a giant multi-row panel into a **sleek, single-line main bar** with a collapsible "More Filters" toggle.
- **Top Row (Always Visible)**:
  - Search Input (with inline clear button)
  - Unified Region & Prefecture Filter Multi-Select Popover
  - Sort By Dropdown
  - "More Filters" toggle badge (showing active filter count)
  - Quick Reset button
- **Collapsible Drawer (Expandable)**:
  - Transport Mode buttons (No Car / Rental / Train / Bullet / Bus)
  - Max Budget slider & Max Walking slider
  - Weather / Season dropdown & Party Size stepper
  - Suitability & Interest chips

---

## 3. Unified Region & Prefecture Multi-Select Filter

### Behavior:

- User can select entire regions (e.g. "Kanto" automatically selects all Kanto prefectures: Tokyo, Kanagawa, Saitama, Chiba, Ibaraki, Tochigi, Gunma).
- User can select individual prefectures (e.g. only "Tokyo" and "Nagano", or multiple prefectures across multiple regions).
- Deselecting a region unchecks its prefectures.
- Filter logic matches destinations whose `region` or `prefecture` is selected.

---

## Proposed Changes

### UI Components

#### [MODIFY] `src/shared/components/layout/Navbar.tsx`

- Remove "Explore" tab from `navItems`.

#### [MODIFY] `src/features/destinations/components/DestinationFilters.tsx`

- Add Region & Prefecture popover dropdown.
- Compress filter controls into compact bar with collapsible drawer.

#### [MODIFY] `src/features/destinations/Destinations.tsx`

- Add `selectedRegions` and `selectedPrefectures` states.
- Filter destinations by matching `selectedRegions` and `selectedPrefectures`.

---

## Verification Plan

### Automated Tests

- Run full Vitest suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Test navigation: verify clicking `TabiMap` logo goes home, and "Explore" tab is gone.
- Test region/prefecture filter: select Kanto + Nagano, verify only Kanto prefectures + Nagano destinations show up.
- Test compact filter layout: verify filter bar occupies minimal vertical height by default and expands cleanly when clicking "More Filters".
