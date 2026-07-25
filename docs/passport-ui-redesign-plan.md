# Technical Implementation Plan: Passport Page UI Redesign & Map Tooltips

This technical implementation plan addresses the user feedback to streamline the Passport page layout, replace the hardcoded dark achievement styling with TabiMap's native light/dark-aware design system tokens, enable native hover tooltips on the interactive map, and remove redundant left-hand prefecture box grids and banner text.

---

## 1. Explicit UI & Token Corrections

### A. Convert Achievements Section to Light/Dark-Aware System Tokens

- **Current Issue**: Lines 191–276 in `PrefectureChecklist.tsx` use a hardcoded dark neon container (`bg-slate-900 text-white border-slate-800 bg-slate-800/60`) which creates an inconsistent, AI-generated aesthetic relative to the rest of the application.
- **Explicit Fix**: Convert the entire Achievements section container and sub-cards to use TabiMap's standard light/dark-aware token pattern:
  - Main Section Container: `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-3xl p-6 md:p-8 shadow-sm`
  - Header & Typography: `text-slate-900 dark:text-white` title with `text-slate-600 dark:text-slate-400` subtitle.
  - Individual Achievement Cards: `bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-emerald-500/50 transition-all rounded-2xl p-4`
  - Stat Badges & Progress Bars: `bg-slate-200 dark:bg-slate-700` progress track with clean `bg-emerald-500` progress fill, and high-contrast completion badges (`bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800`).

### B. Interactive Map Hover Tooltips

- Enable `@react-map/japan`'s native tooltips via `hints={true}` with custom floating popup styling:
  - `hints={true}`
  - `hintTextColor="#ffffff"`
  - `hintBackgroundColor="#0f172a"`
  - `hintPadding="6px 12px"`
  - `hintBorderRadius={8}`
- Hovering mouse cursor over any prefecture path on the SVG map displays a floating tooltip with the prefecture name (_Tokyo_, _Kyoto_, _Shizuoka_, _Hokkaido_, etc.).

### C. Clean Layout (Remove Left Name Box Grid & Banner Text)

- **Remove Left Box Grid**: Delete the bulky 47-prefecture checkbox grid on the left.
- **Remove Derived Banner**: Delete the redundant banner text (_"100% Derived from Visited Places"_).
- **Layout Architecture**:
  1. **Page Header**: Passport title (`Compass` icon), description, and overall summary stats (e.g. `12 / 47 Prefectures Visited`, `3 / 9 Achievements Unlocked`).
  2. **Featured Interactive Map**: Large, centered map with filled visited prefectures and native hover tooltips.
  3. **Region Breakdown Bar**: A compact horizontal strip showing visited counts by region (e.g. _Kanto 4/7_, _Kansai 3/7_, _Chubu 2/9_).
  4. **Passport Achievements Section**: Clean light/dark-aware card grid matching TabiMap's design system.

---

## 2. Proposed File Changes

### `src/features/map/PrefectureChecklist.tsx`

- **[MODIFY]**: Replace hardcoded `bg-slate-900` container with light/dark tokens (`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800`).
- **[MODIFY]**: Add `hints={true}` and tooltip styling props to `<Japan />`.
- **[DELETE]**: Remove redundant 47-prefecture checkbox grid and banner text.
- **[NEW]**: Render region exploration summary pills and light/dark achievement cards.

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Validate collection schemas and referential integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure all 27 unit tests pass.
4. `npm run build` — Verify production build compilation.

### Manual Verification

1. Open `/passport` in browser.
2. Verify interactive map displays floating hover tooltips with prefecture names.
3. Confirm clean layout without left box clutter or redundant banner text.
4. Verify achievement section seamlessly toggles between light and dark modes matching the rest of the application.
