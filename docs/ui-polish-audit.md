# Home + Destination UI polish — pre-implementation audit

Scope: focused visual/UI polish of the two weakest major surfaces (Home,
Destination detail). No recommendation/budget/transport/scoring/data changes.

## Root causes found (inspect-before-edit, verified against live DOM geometry)

### Home

1. **First-viewport is configuration-first, not proposition-first.**
   Mobile DOM order: origin → date tabs → date picker → H1 → subtitle →
   Trip Planner card → CTA → recommendations. The H1/value proposition
   (the product pitch) renders *below* four control rows, so the first
   screen reads as a settings form. Verified in DOM and screenshots
   (recommendations start ≈700–800px down on a 844px-tall phone).

2. **Origin and date read as three unrelated heavy controls.**
   `StationInput` (bordered pill w/ shadow) + two full-width weather tabs +
   a full-width date-capsule stacked in two rows (~72px). `HOME_WEATHER_TABS_CLASS`
   is `grid-cols-2` on mobile with the date picker spanning both columns —
   the third control is pushed to its own row. They only feel like one
   system on `sm+`.

3. **Trip Planner mobile is a nested-container form.**
   `home-planner-card` (border + `shadow-xl` + header row "Trip Planner" /
   "Find your match in 30s") wraps 5 rows, each *individually* bordered,
   rounded, background-filled (`rounded-[14px] border … dark:bg-surface-raised`),
   at `h-12` (48px), followed by two stacked full-width buttons. That is 5
   nested containers + a competing header + two stacked CTAs (~330px total).

4. **Competing hierarchy / off-brand CTA.**
   "Trip Planner" header + "Find your match in 30s" hint compete with the
   H1; the primary CTA is `bg-slate-900` (near-black) on mobile and desktop
   while the brand primary (Sign up, Add to Itinerary, active tab) is
   emerald. The white/outline "Surprise me" button only adds to the
   two-button stack.

### Destination detail

5. **Hero reserves fixed 380px (440px on desktop) with the action row
   bottom-anchored (`min-h-[380px] … flex-col justify-between` + `mt-auto`).**
   Title+CTA+icon content is ~300px incl. padding, so the remaining
   ~80px of the fixed hero + 24px container-top padding + 16px card-top
   padding read as a dead dark band between the action row and "At a glance".
   Measured: action row bottom 409px → section top 457px at 390×844,
   ~15–20% of the first screen (visible on ALL tested destinations:
   hakone-town, izu, kamakura-city, kiyomizu-dera).

6. **"At a glance" is a giant metadata card that dominates.**
   Whole overview (H2 + description + facts + Wikipedia + feedback + tags)
   is one `rounded-2xl border bg-white shadow-sm p-4` card with a `text-2xl`
   heading; description set at `text-base leading-7` (very airy). Facts use
   a rigid 2-col grid of identical bordered/filled boxes (`grid-cols-2`):
   long opening-hours text creates very tall cards (Hakone), "Best season"
   leaves empty space beside it, the website URL wraps badly (Izu), and
   section sits on the same page as three other identical mega-cards
   (Plan this trip / Before you go), i.e. card overload.

7. **Abrupt, CTA-like "Read more".**
   The Wikipedia toggle is a bordered, background-filled pill with an icon,
   `min-h-11`, emerald bold text — visually a primary CTA rather than a
   text-expansion affordance associated with the description.

8. **Tags and feedback compete with planning content.**
   `#tag`-prefixed badges render inside the overview card with the rest of
   the metadata; "Was this helpful?" sits above them mid-page.

9. **Per-page bottom-nav hack.**
   `DestinationDetails` root adds `pb-20` while `App.tsx` already supplies a
   shared `pb-[calc(4.25rem+env(safe-area-inset-bottom))]` on `<main>` —
   the per-page value is redundant and doesn't account for the raised
   centre FAB (~16px above the 64px bar).

### QA destinations (catalogue ids)

- `hakone-town` — long opening-hours prose ("Open access; individual
  facilities may have separate hours"), short best season.
- `izu` — website present + all standard facts (travel time present).
- `kamakura-city` — normal city with complete short values.
- `kiyomizu-dera` (gap measurement only) — temple, POI facts.

## Fix plan (implemented)

- Home: reorder to **H1 → origin/date → planner → CTAs**; single-row
  segmented date system (Today / Tomorrow / Select date); planner rows
  de-boxed (dividers only), 44px floors kept; planner header removed;
  primary CTA switched to emerald (brand); surprise CTA demoted to a
  single outline button.
- Destination: hero min-height reduced (300/330/400) and container
  padding tightened → dead band removed; overview becomes a borderless
  light section (H2 de-emphasised, description `text-sm leading-relaxed`
  + `max-w-3xl`); facts become an adaptive definition grid — long values
  span the full row, short values flow 2/4-up, no per-fact boxes;
  "Read more" becomes a quiet text affordance; tags move below the
  planning sections as clean chips (no `#`); `pb-20` removed (shared
  `<main>` padding raised to 5rem + safe-area, covering the FAB).