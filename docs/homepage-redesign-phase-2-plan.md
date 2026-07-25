# Implementation Plan — Phase 2: Homepage Redesign (TabiMap UI/UX Roadmap)

This plan outlines the visual and layout overhaul of the TabiMap Homepage (`Home.tsx`) to shift from a purely utility-first search view to an inspirational consumer travel experience, featuring a photograph hero section, categorized interests filtering, and inspirational picks (Trending, Summer Picks, Weekend Escapes, Hidden Gems).

---

## Proposed Changes

### 1. Homepage Visual Overhaul

#### [MODIFY] `src/features/home/Home.tsx`

- Replace the grid container hero on lines 103-107 with a full-width background photo hero section (using a premium travel image).
- Embed a centered query/search card with gradient backdrop overlays over the hero photo.
- Introduce curated homepage recommendations carousels/sections under new categories:
  - **Trending Picks** (top recommendations).
  - **Summer Escapes** (high summer season percentage destinations).
  - **Hidden Gems** (destinations with lower budget requirements but great overall ratings).
  - **Recently Added** (new destinations).
- Group search filter categories into responsive interest badges: Nature, Food, History, Relaxation, Photography, Family, Road Trips.

---

## Verification Plan

### Automated Tests

- Build and compile check:
  ```bash
  npm run build
  ```

### Manual Verification

- Launch the development server.
- Verify that the homepage renders a photograph hero background with a centered, floating search drawer.
- Verify that the curated horizontal sections (Trending, Summer Picks, etc.) display correctly.
