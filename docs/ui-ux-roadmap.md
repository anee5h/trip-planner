# TabiMap — UI/UX Roadmap

_Grounded against `main` @ `39fdb90`. Supersedes the earlier draft, which was written without reference to the actual codebase — several of its phases described features (drag-and-drop planner, "likely functional" My Trips) that are either already built differently or already verified in detail elsewhere._

## What this roadmap is, and isn't

This is a **polish and consistency pass**, not a rebuild. The app's core value is its practical planning tools (recommendation engine, budget logic, transport filtering, trip planner) — confirmed solid through direct code review across many sessions. Nothing here should compromise that in favor of looking more "inspirational." Per your direction, the homepage stays utility-first (search/filters/cards), and accessibility + performance are pulled forward rather than left for last, since a personal project doesn't need to defer the things that are actually cheap and durable in favor of decorative polish.

One thing worth being direct about: the original draft's closing projection ("Architecture 10/10, Code quality 10/10, UI 9.5/10") isn't something a UI pass can actually deliver — those are separate axes from what's in this document, and a design system doesn't retroactively fix backend correctness or test coverage. This plan targets UI/UX quality only; it's not a claim about the rest of the app.

---

## Phase 1 — Design System — 🟢 Completed (Priority 1)

- [x] **Adoption.** `design-tokens.ts` defines spacing, radii, shadow elevations, typography, and semantic colors (`success`, `warning`, `danger`, `info`). Core components (`DestinationCard`, `Button`) adopt token utility classes (`rounded-card`, `rounded-button`, `shadow-card`, `hover:shadow-hover`).
- [x] **Semantic color tokens.** Registered `success`, `warning`, `danger`, `info` in both `design-tokens.ts` and `tailwind.config.js`.
- [x] **Single source of truth.** Synchronized spacing/radii/shadows/colors across theme registries.

---

## Phase 2 — Homepage Polish — 🟢 Completed (Priority 6)

- [x] Retained utility-first grid layout with dark mode slate grid mask for maximum text contrast.
- [x] Cleaned up curated sections to eliminate duplicate destination card rendering or hardcoded transport mode display bugs.

---

## Phase 3 — Destination Pages — 🟢 Completed (Priority 4)

- [x] Quick-facts scannable summary row (transport time, budget, walking difficulty, best season).
- [x] Nearby destinations, dynamically computed via coordinate data using the Haversine distance formula (`getDistance()`).
- [x] Toolbar action bar (Save / Compare / Plan Trip / Share).

---

## Phase 4 — Explore / Destinations Page — 🟢 Completed (Priority 7)

- [x] Floating active filter pills bar with single-click dismiss controls and "Reset All".
- [x] Live result count badge ("N destinations matching").
- [x] Grid and Map view mode toggles with ARIA accessibility labels.

---

## Phase 5 — Trip Planner Polish — 🟢 Completed (Priority 5)

- [x] Visual timeline/vertical-flow presentation of stops with node markers and emerald connecting line.
- [x] Sequence numbers visually representing itinerary flow.
- [x] Stop reorder and deletion buttons with explicit ARIA accessibility labels.

---

## Phase 6 — My Trips Dashboard — 🟢 Completed (Priority 8)

- [x] Stat cards, places visited, prefectures explored, progress %, live search filtering, and Bucket List consolidation into one single unified dashboard.

---

## Phase 7 — Accessibility — 🟢 Completed (Priority 2)

- [x] Keyboard navigation focus rings (`focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`).
- [x] ARIA labels on all icon-only buttons across `TripDetails`, `DestinationCard`, `Home`, and `Compare`.
- [x] Touch target sizing (≥44px).

---

## Phase 8 — Performance — 🟢 Completed (Priority 3)

- [x] Image lazy-loading for destination cards (`loading="lazy"`).
- [x] Asynchronous decoding (`decoding="async"`).
- [x] Route-based code splitting confirmation.

---

## Phase 9 — Micro-interactions — 🟢 Completed (Priority 9)

- [x] Save/favorite pulse & tap scale feedback (`active:scale-95`).
- [x] Hardware-accelerated hover lift on destination cards (`hover:-translate-y-1`).
- [x] Smooth transition timings (`duration-300` / `duration-150`).

---

## Phase 10 — Mobile UX — 🟢 Completed (Priority 10)

- [x] Responsive comparison stacked cards and auto-scaled SVG Japan Map component.

---

## Priority Order & Completed Status

| Priority | Phase                           | Status       | Rationale                                                              |
| -------- | ------------------------------- | ------------ | ---------------------------------------------------------------------- |
| 1        | Design System — finish adoption | 🟢 Completed | Semantic color tokens added, core components migrated to token classes |
| 2        | Accessibility                   | 🟢 Completed | ARIA labels added to icon buttons, focus ring indicators configured    |
| 3        | Performance                     | 🟢 Completed | `loading="lazy"` and `decoding="async"` added to cards and hero images |
| 4        | Destination Pages               | 🟢 Completed | Dynamic nearby destinations added using Haversine distance formula     |
| 5        | Trip Planner Polish             | 🟢 Completed | Upgraded itinerary planner to vertical timeline flow with node markers |
| 6        | Homepage Polish                 | 🟢 Completed | Utility-first contrast-safe layout maintained                          |
| 7        | Explore Page                    | 🟢 Completed | Active filter pills bar & live results count badge                     |
| 8        | My Trips Dashboard              | 🟢 Completed | Unified Bucket List + Trips + Visited Places dashboard                 |
| 9        | Micro-interactions              | 🟢 Completed | Card hover lift & button tap scale feedback                            |
| 10       | Mobile UX                       | 🟢 Completed | Mobile stacked cards & fluid SVG map auto-scaling                      |

## What's deliberately not in this plan

- A homepage redesign toward a photo-led, inspirational layout — explicitly decided against
- Any claim about architecture, code quality, or backend correctness improving as a result of this work — those are separate, already-tracked in the main product roadmap, and not something a UI pass changes
