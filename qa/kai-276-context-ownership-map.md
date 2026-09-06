# KAI-276 Context Ownership Map

Base: `feb22a0db82716fcdea66196eacc7b0190f32010`
Branch: `fix/kai-276-trip-decision-context`

This document records the pre-change ownership map, the reproduced current-main defects, and the post-change ownership/precedence contract.

## Current representations before KAI-276

| Representation                | Owner                                                      | Scope                      | Persistence                                  | Main consumers                 |
| ----------------------------- | ---------------------------------------------------------- | -------------------------- | -------------------------------------------- | ------------------------------ |
| Home draft planner controls   | `HomePlannerStateContext.draftState`                       | Home only; unapplied edits | React state; provider unmounts on navigation | Home controls                  |
| Home applied planner controls | `HomePlannerStateContext.appliedState`                     | Home recommendations       | React state; provider unmounts on navigation | Home cards and link builders   |
| Home date/weather selection   | `HomeDateStateContext`                                     | Home only                  | React state; View-all omitted Today date     | Home recommendations and links |
| Explore filters               | `Destinations.tsx` local state                             | Explore only               | URL query plus local state                   | Explore filters/cards          |
| Detail navigation context     | `useLocation().state` (`navState`)                         | Current history entry      | React Router state; lost on direct/reload    | Detail estimate/planning       |
| Detail preference fallback    | auth profile metadata                                      | App-wide fallback          | Saved profile                                | Detail when route state absent |
| Compare page/modal context    | none; IDs only                                             | Compare surfaces           | `trip-planner-compare` IDs                   | Compare estimates              |
| Planner widget context        | `DestinationPlanningSection` props + `DayPlanWidget` state | Current Detail             | React state                                  | Plan window/generated plan     |
| Origin                        | `TripStoreProvider`                                        | App-wide                   | local storage/profile sync                   | Home/Explore/Detail/engine     |

## Field ownership before implementation

| Field                | Home                          | Explore                                       | Detail                          | Compare              | Planner                                   |
| -------------------- | ----------------------------- | --------------------------------------------- | ------------------------------- | -------------------- | ----------------------------------------- |
| origin               | TripStore origin/coords       | TripStore origin/coords                       | TripStore origin/coords         | not consumed         | `homeCoords` adapter only                 |
| date                 | Home date context; card links | URL/local date; Today View-all omitted `date` | `navState.travelDate` only      | absent               | travelDate prop; not canonical cost input |
| duration             | applied Home state            | URL/local state                               | route state → auth → `fullDay`  | hard-coded `fullDay` | prop, but local default plan type wins    |
| party                | applied Home state            | URL then auth fallback                        | route state → auth → `2`        | engine default       | prop/local party                          |
| public modes         | applied Home state            | URL `mode[]`                                  | route state → auth → broad list | absent               | collapsed adapter                         |
| car mode             | applied Home state            | URL `car`                                     | route state → auth → `none`     | absent               | collapsed adapter                         |
| budget               | Home tier + derived cap       | URL tier/cap                                  | route state → auth → `50000`    | absent               | no selection                              |
| destination          | recommendation/card           | Explore card                                  | route `:id`                     | persisted IDs        | Detail plus stops                         |
| nights/accommodation | canonical engine duration     | Explore resolver duration                     | Detail route duration           | zero-night full-day  | generated plan duration                   |

## Baseline precedence

| Surface | Baseline precedence                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Home    | local draft/applied → URL duration → auth preferences → product defaults; provider unmount loses applied state |
| Explore | URL query → local state → auth party fallback → product defaults                                               |
| Detail  | Router `location.state` → auth preferences → product defaults                                                  |
| Compare | destination IDs → hard-coded no-origin/full-day/engine party default                                           |
| Planner | props → local `full_day`/540-minute default; duration was not interpreted                                      |

Required target precedence: **explicit current trip context → deliberately persisted trip/search state → saved preference → product default**.

## Reproduced current-main defects

- **Kyoto:** with Tokyo origin, party 2, `2d1n`, shinkansen, and origin travel, Detail reproduced `¥32.4k–77k`; Compare's hard-coded full-day/no-origin/default-mode call reproduced `¥8k–15k`.
- **Ueno:** party 4, Tokyo origin, `2d1n`, train reproduced `¥37.2k–76.8k`; Compare defaulted to party 2/no origin/full day and could show `N/A` because its summary record omitted canonical admission fields.
- **Today:** Home View-all omitted `date=`, so Explore displayed equivalent state as Any date rather than retaining explicit Today semantics.
- **Half day:** Detail route state carried `duration=halfDay`, but planner initialized `09:00–18:00` / 540 minutes.
- **Navigation:** Home provider state was route-local; Detail state was transient `location.state`; logo/back/reload could rebuild defaults/preferences.

## KAI-276 canonical ownership after implementation

`src/shared/context/TripContext.tsx` is the app-level canonical context provider. It owns one serializable context:

- `origin` (label, coordinates, source, transport zone);
- `travelDate` plus `dateSemantics` (`any`, `today`, `tomorrow`, `custom`);
- `duration` (`halfDay`, `fullDay`, `2d1n`, `3d2n`, `any`);
- `partySize`;
- `publicModes` (including meaningful `[]`);
- `carMode` (`none`, `my_car`, `rental`);
- `budget` (`any` or finite cap plus tier);
- `destinationId` where applicable.

Route/query state is synchronized into this provider. Explicit context is persisted in `sessionStorage` as `meguruto-active-trip-context`; product defaults are never persisted as active context. Home remounts hydrate from this context once, and Detail/Compare read it when route state is absent.

### After precedence

1. Explicit current route/user context (`location.state`, Explore query, Home Apply).
2. Deliberately persisted `TripContext` session state.
3. Saved auth preference, only when no explicit context exists.
4. Product default.

`mergeTripContext` uses property presence/nullish semantics: `publicModes=[]`, `carMode="my_car"`, `travelDate=null`, and numeric zero values are not replaced by defaults.

## Estimate ownership after implementation

- Home and Explore continue to use the canonical `TripEstimateEngine` adapters.
- Detail receives active canonical party/duration/date/transport/budget values.
- Compare page and Compare modal load the **full** catalogue and, when context is explicit, call `resolveExploreBudgetEstimate` → `TripEstimateEngine` with the same origin, duration, party, and transport context. Budget cap is retained as context but does not filter away the selected transport estimate.
- Direct Compare with no active context retains its legacy on-site fallback rather than inventing a trip.
- Planner initial type/minutes are derived from canonical duration: half-day → `half_day`/300 minutes; full-day and overnight durations → `full_day`/540 minutes; explicit `defaultPlanType` still wins.

## Before/after matrix

| Scenario     | Surface A                       | Surface B                     | Root cause                                                            | After                                                                |
| ------------ | ------------------------------- | ----------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Kyoto cost   | Detail `¥32.4k–77k`             | Compare `¥8k–15k`             | Compare hard-coded full-day/no-origin/default mode and summary fields | Explicit context uses full record + same resolver/engine semantics   |
| Ueno party 4 | Home/Detail party 4             | Compare default party 2/N/A   | Compare omitted party/origin and used lite record                     | Compare modal/page preserve party 4, origin, train, 2D1N; `¥37k–77k` |
| Today        | Home Today                      | Explore Any date              | View-all dropped `date=`                                              | Today ISO date is serialized and parsed identically                  |
| Half day     | Home/Detail `halfDay`           | Planner 09:00–18:00           | Planner default ignored duration                                      | Planner opens 5-hour half-day window                                 |
| Car context  | Home/Explore explicit car/modes | Detail/Compare defaults       | Separate route/local state                                            | Canonical context preserves public modes and `my_car` vs rental      |
| Navigation   | Detail/Explore                  | Home/logo/back-forward/reload | Providers/state were route-local                                      | Session context hydrates Home and survives browser navigation        |

## Independent representation/path count

- **Context representations:** baseline had at least 8 field owners/representations (Home draft/applied/date, Explore state/query, Detail router state/preferences, Compare IDs/defaults, Planner local state, TripStore origin). After: one canonical `TripContext` is the cross-surface owner; local draft state remains only for unapplied Home editing and Planner UI controls.
- **Traveller-facing estimate paths:** baseline had 5 material paths (Home, Explore, Detail, generated-plan summary, Compare page/modal). After: Compare page/modal join the existing context-aware Explore/TripEstimateEngine path; generated-plan aggregation remains the existing KAI-277/KAI-260 canonical adapter and was not rebuilt.
- **Intentional remaining scope difference:** a direct `/compare` visit with no active trip remains an on-site fallback. It is not presented as a complete trip estimate; an active context switches it to the canonical complete estimate path.
