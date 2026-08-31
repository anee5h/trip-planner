# KAI-206 detail-page audit and evidence

Captured from the clean post-#298 baseline (`origin/main` at `e36f946`) and the KAI-206 branch with Playwright at a 390px iPhone 13 viewport and a 1440px desktop viewport. The audit routes are:

- Standard destination EN: `/destinations/ueno-park`
- Hub/city EN: `/destinations/kyoto-city`
- Standard destination JA: `/ja/destinations/ueno-park`
- Hub/city JA: `/ja/destinations/kyoto-city`
- Each route is captured at both iPhone 13 mobile and 1440px desktop where applicable.

## Baseline audit

### Standard destination detail

Old visual order:

1. Hero identity and actions
2. At a glance: description, travel facts, on-site cost, read-more/wiki content, feedback and tags
3. Plan this trip: day-plan generator and a second cost surface
4. Before you go: logistics and ratings/match tabs, followed by notes, highlights, weather and practical information as a long vertical card stack
5. Related places: combination rail, nearby places rail and half-day options rail

Findings:

- Cost was presented in At a glance and again in the planner, competing for attention.
- The supporting Before you go cards were all expanded, so weather/practical information had the same visual weight as the primary planner.
- Related content already used horizontal rails, but the cards were larger than needed for discovery and the section spacing amplified the perceived length.
- The planner heading and nested planner card created a large framed block before the user reached the supporting information.

### Hub/city/town detail

Old visual order:

1. Hero identity and actions
2. At a glance
3. Top sights and explore: Top Sights rail, area links, Best for rainy days rail, Food and evening options rail, and map
4. Plan your visit: day-plan generator, cost surface and duration links
5. Before you go: the same expanded logistics/supporting stack as standard destinations
6. Go next: combination rail and nearby hubs rail

Findings:

- The hub discovery block was a 1,788px mobile / 1,923px desktop stack in the captured route, with three child-discovery rails plus the map before planning.
- The hub’s primary planning action appeared after a large discovery block.
- Rainy-day and food/evening rails were separate vertical blocks even though both represented additional child destinations.
- Top Sights used the existing relationship-derived `featuredChildSights`; KAI-257 integrity must remain unchanged.

## KAI-206 information architecture

New visual/DOM order:

### Standard destination

1. `overview`: hero is followed by a compact At a glance surface with identity, why-go copy and essential facts
2. `plan-this-trip`: primary day-plan action followed by the one canonical budget/cost surface
3. `before-you-go`: logistics and comfort remain immediately scannable; weather, notes, highlights, reservation details and secondary practical information move into one expandable supporting-details surface
4. `related-places`: nearby and half-day discovery remain horizontal rails with compact cards

### Hub/city/town

1. `overview`
2. `plan-your-visit`: primary hub planning action and the one canonical cost surface, followed by duration links
3. `top-sights`: existing relationship-safe Top Sights rail, area browse links, one deduplicated “More things to do” rail combining the existing rainy-day and food/evening child sets, then the map
4. `before-you-go`
5. `go-next`: combination rail and nearby hub rail

No destination records or relationship rules were changed. The additional hub rail is a stable, ID-deduplicated union of the existing `indoorChildren` and `foodAndEveningChildren`, excluding already-featured Top Sights. Opening-hours/access status and the official website are now visible in At a glance; the disclosure is reserved for secondary practical information.

## Before/after measurements

`scrollHeight` is the rendered document height after stable load. The final screenshot capture scrolls through the page before taking screenshots so lazy-loaded rail media is represented; `scrollWidth` remained equal to the viewport/client width in every captured case.

| Case | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Standard mobile EN | 4,235px | 3,300px | 935px (22.1%) |
| Standard desktop EN | 3,739px | 3,104px | 635px (17.0%) |
| Hub mobile EN | 5,760px | 4,392px | 1,368px (23.8%) |
| Hub desktop EN | 5,452px | 4,298px | 1,154px (21.2%) |
| Hub mobile JA | 5,675px | 4,291px | 1,384px (24.4%) |
| Standard mobile JA | 4,157px | 3,209px | 948px (22.8%) |
| Standard desktop JA | 3,747px | 3,101px | 646px (17.2%) |
| Hub desktop JA | 5,380px | 4,270px | 1,110px (20.6%) |

Cost-surface count stayed at one. The At a glance cost prop is no longer populated, so the planner breakdown is the single destination-level budget surface. Hub discovery and related rails keep their existing card metadata/actions; the cost breakdown remains the authoritative expanded cost presentation.

## Screenshot evidence

Screenshots are captured at the same routes/viewports before and after. The capture helper scrolls through the page before taking the screenshot so lazy-loaded card imagery is represented.

| Surface | Before | After |
| --- | --- | --- |
| Destination mobile EN | [before](KAI-206-screenshots/kai206-before-destination-mobile.png) | [after](KAI-206-screenshots/kai206-after-destination-mobile.png) |
| Destination desktop EN | [before](KAI-206-screenshots/kai206-before-destination-desktop.png) | [after](KAI-206-screenshots/kai206-after-destination-desktop.png) |
| Hub mobile EN | [before](KAI-206-screenshots/kai206-before-hub-mobile.png) | [after](KAI-206-screenshots/kai206-after-hub-mobile.png) |
| Hub desktop EN | [before](KAI-206-screenshots/kai206-before-hub-desktop.png) | [after](KAI-206-screenshots/kai206-after-hub-desktop.png) |
| Destination mobile JA | [before](KAI-206-screenshots/kai206-before-destination-ja-mobile.png) | [after](KAI-206-screenshots/kai206-after-destination-ja-mobile.png) |
| Destination desktop JA | [before](KAI-206-screenshots/kai206-before-destination-ja-desktop.png) | [after](KAI-206-screenshots/kai206-after-destination-ja-desktop.png) |
| Hub mobile JA | [before](KAI-206-screenshots/kai206-before-hub-ja-mobile.png) | [after](KAI-206-screenshots/kai206-after-hub-ja-mobile.png) |
| Hub desktop JA | [before](KAI-206-screenshots/kai206-before-hub-ja-desktop.png) | [after](KAI-206-screenshots/kai206-after-hub-ja-desktop.png) |

Raw measurements are stored in `KAI-206-audit-before.json` and `KAI-206-audit-after.json`; `scripts/kai-206-audit.mjs` reproduces the capture/audit pass against the local dev server.
