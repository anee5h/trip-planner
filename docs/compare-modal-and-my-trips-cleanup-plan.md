# Implementation Plan: Compare Modal & My Trips Navigation Streamlining

This plan addresses the user's latest directives:

1. Remove redundant page-level header tab pills from `MyTrips.tsx` (as Itineraries and Bucket List are accessed via top Navbar dropdown).
2. Remove standalone "Compare" tab from top Navbar.
3. Transform Compare into a **Large Modal (`CompareModal.tsx`)** capped at **max 3 destinations**, with strict column layout & image scaling safeguards so wide photos never distort columns.
4. Add a sleek, floating **Compare Action Bar** at the bottom of the screen whenever 1-3 destinations are added to compare.

---

## 1. Feature Specifications & Architectural Changes

### A. Streamline `MyTrips.tsx` Header

- **Remove Tab Pills**: Remove the redundant `[ Itineraries (0) ]` and `[ Bucket List (0) ]` pills from the `MyTrips.tsx` page header.
- **Dynamic Context Header**: Display clean title & subtitle based on active URL tab:
  - `tab=bucketlist`: **My Bucket List** — _Saved destinations you want to visit across Japan_.
  - Default / `tab=planned`: **My Travel Itineraries** — _Manage your custom travel itineraries and route plans_.

### B. Remove Compare Navbar Tab (`Navbar.tsx`)

- Remove `{ name: "Compare", path: "/compare", icon: Settings }` from `navItems` in `Navbar.tsx`.
- The top navigation bar will now cleanly display **Destinations**, **Passport**, and **My Trips** (with its dropdown menu).

### C. Enforce Max 3 Places Limit (`useTripStore.tsx`)

- Update `toggleCompare` in `useTripStore.tsx` to strictly cap `compareList` at **3 destinations**.
- If a 4th destination is added, automatically cycle out the oldest comparison item so `compareList.length <= 3`.

### D. Build Large Compare Modal (`CompareModal.tsx`) & Floating Action Bar

- Create `src/features/compare/components/CompareModal.tsx`:
  - **Large Modal Container**: `max-w-6xl` responsive dialog with backdrop blur.
  - **Strict Column Proportions**: 1, 2, or 3 equal-width columns (`w-1/3 min-w-[200px]`).
  - **Image Aspect & Overflow Protection**:
    - Image wrapper: `w-full h-36 md:h-44 rounded-xl overflow-hidden bg-slate-100 relative`.
    - Image element: `w-full h-full object-cover shrink-0`.
    - Ensures wide high-aspect hero images never force column expansion or break table layout.
  - **Full Matrix**: Ratings (Overall, Couple, Seasons), Budget (Recommended), Travel Time, Walking steps, Tags, and View Details action.
- Add `CompareFloatingBar.tsx` rendered at the bottom of main layout when `compareList.length > 0`. Clicking "Compare Now" opens `CompareModal`.

---

## 2. Proposed File Modifications

| Component / File                                                                                | Action   | Summary                                                                                          |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| [MyTrips.tsx](file:///home/aneesh/Desktop/projects/trip/src/features/profile/MyTrips.tsx)       | `MODIFY` | Remove header switcher pills; adapt dynamic page title based on `tab` searchParam.               |
| [Navbar.tsx](file:///home/aneesh/Desktop/projects/trip/src/shared/components/layout/Navbar.tsx) | `MODIFY` | Remove "Compare" tab from top navigation bar.                                                    |
| [useTripStore.tsx](file:///home/aneesh/Desktop/projects/trip/src/shared/hooks/useTripStore.tsx) | `MODIFY` | Enforce max 3 limit in `toggleCompare`.                                                          |
| `src/features/compare/components/CompareModal.tsx`                                              | `NEW`    | Create Large Compare Modal with max 3 equal-width column grid and object-cover image protection. |
| `src/features/compare/components/CompareFloatingBar.tsx`                                        | `NEW`    | Create floating bottom action bar when `compareList.length > 0`.                                 |
| [App.tsx](file:///home/aneesh/Desktop/projects/trip/src/App.tsx)                                | `MODIFY` | Mount `CompareFloatingBar` & `CompareModal` globally.                                            |

---

## 3. Verification Plan

### Automated Verification

1. `npm run pipeline` — Verify data pipeline integrity.
2. `npm run lint` — Confirm 0 linter errors.
3. `npm run test:run` — Ensure unit test suite passes.
4. `npm run build` — Confirm clean production build compilation.

### Manual Verification

1. Open `MyTrips` page -> Verify header pills are removed and header title dynamically adapts to Itineraries vs Bucket List.
2. Inspect Navbar -> Verify "Compare" tab is removed from desktop and mobile nav.
3. Click "Compare" on 1, 2, and 3 destination cards -> Verify floating Compare Bar appears at bottom (`Compare (3/3)`).
4. Click "Compare Now" -> Opens Large Compare Modal.
5. Verify 3 columns render with equal width and hero images fit perfectly inside `object-cover` containers without column distortion.
6. Try adding a 4th item -> Verify maximum limit of 3 is enforced.
