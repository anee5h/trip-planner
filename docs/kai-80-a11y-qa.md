# KAI-80: WCAG 2.2 AA accessibility baseline — QA evidence

Status: automated gate + documented manual/AT evidence.

## Automated gate (CI, A11Y E2E job)

- Runs against the **production build** (built once; `vite preview` —
  never the dev server; see `playwright.config.ts` `A11Y_E2E` condition).
- Two-project matrix: `chromium-mobile` + `chromium-desktop`, one project
  per CI job, unique privacy-scanned artifact names.
- `@axe-core/playwright` with the WCAG 2.2 AA union
  (wcag2a/wcag21a/wcag22a/wcag2aa/wcag21aa/wcag22aa).
- **color-contrast is NOT suppressed** — light and dark are both gated.
- Element-specific documented node exclusions only (see `e2e/a11y.ts`
  `DOCUMENTED_NODE_EXCLUSIONS`); no rule-wide waiver.
- Authenticated-state coverage uses a **deterministic non-production
  fixture** (fake `a11y-test.supabase.co` project + injected session +
  route interception). No production Supabase is touched; no production
  users/data are created, updated, or deleted.

## Coverage matrix (documented representative set — no Cartesian explosion)

| Surface | EN | JA | light | dark | mobile | desktop |
|---|---|---|---|---|---|---|
| Home `/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/destinations` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Destination detail | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Home filters + date picker | ✅ | — | ✅ | — | ✅ | ✅ |
| Primary navigation | ✅ | — | — | — | ✅ | ✅ |
| Guest auth modal | ✅ | — | ✅ | — | ✅ | ✅ |
| **Authenticated: user menu / Signed in as** | ✅ | — | ✅ | — | ✅ | ✅ |
| **Authenticated: Settings account** | ✅ | — | ✅ | — | ✅ | ✅ |
| **Authenticated: Bucket List / My Trips / Passport** | ✅ | — | ✅ | — | ✅ | ✅ |
| `/settings` | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| `/bucket-list` | ✅ | — | ✅ | — | ✅ | ✅ |
| `/passport` | ✅ | — | ✅ | — | ✅ | ✅ |
| `/my-trips` | ✅ | — | ✅ | — | ✅ | ✅ |
| Collections `/collections` | ✅ | — | ✅ | — | ✅ | ✅ |
| Loading/empty/error states | ✅ | — | ✅ | — | ✅ | ✅ |
| Dialogs/sheets (focus trap) | ✅ | — | ✅ | — | ✅ | ✅ |

Plus (see `e2e/kai-80-a11y.spec.ts`):
- Locale contract: `/` → `html.lang=en`, `/ja/` → `html.lang=ja`, refresh
  retention, EN↔JA switch gives the inverse URL + root lang.
- Real focus behavior: dialog focus entry, Tab/Shift+Tab trap, Escape
  closes, focus returns to the trigger.
- Keyboard-only: primary nav reachable + activatable via Tab/Enter;
  planner selects operable via keyboard.
- Reduced motion (`reducedMotion: "reduce"`): representative animated
  surfaces render, controls work, no non-essential animation.
- Reflow: 320px viewport on Home/detail/Search-dialog — no horizontal
  overflow, primary controls not clipped.

## KAI-80 code fixes (product defects surfaced by the gate)

- **AuthModal**: added `role="dialog"` + `aria-modal` + `aria-label` and
  Escape-to-close (was a bare overlay — no dialog semantics, no Escape).
- **SearchDialog**: added `role="dialog"` + `aria-modal` + `aria-label`
  and a real focus trap (Tab/Shift+Tab cycle; focus restored to the
  trigger on close).
- **Mobile search**: the desktop-only GlobalSearch left mobile with NO
  reachable search — added a mobile-header Search button dispatching
  `meguruto:open-search` (GlobalSearch listens) so search is reachable at
  all widths.
- **Settings**: party-size range got `id`+`htmlFor`; the two toggle
  checkboxes + analytics checkbox got `aria-label`s (axe `label` rule).
- **Destinations pagination**: prev/next icon-only buttons got
  `aria-label`s; sort SelectTrigger got `aria-label` (axe `button-name`).

## Findings (baseline → current)

Baseline recorded by route/theme with real axe counts (light + dark,
desktop, production preview) from the pre-fix build:

| Route | theme | Baseline (color-contrast) | Current (CI) |
|---|---|---|---|
| `/` | light | 94 | 0 |
| `/destinations` | light | 27 | 0 |
| `/destinations/kamakura` | light | 4 | 0 |
| `/settings` | light | 12 | 0 |
| `/bucket-list` | light | 6 | 0 |
| `/passport` | light | 5 | 0 |
| `/my-trips` | light | 6 | 0 |
| `/collections` | light | 76 | 0 |
| `/` | dark | 29 | 0 |
| `/destinations` | dark | 28 | 0 |
| `/destinations/kamakura` | dark | 7 | 0 |
| `/settings` | dark | 16 | 0 |
| **Total** | | **310** | **0 (local)** |

> The "Current (CI)" column reflects the local full-matrix runs against
> the production preview. The exact CI run on the PR head is the
> authoritative gate — until it is green across the claimed matrix, the
> automated claim is "CI gate configured and locally green", not
> "zero violations in CI".

Root causes fixed systemically (shared tokens/components):
- `--primary-foreground` light token: emerald fill + near-white text
  failed (2.9:1) → dark-green foreground (matches the dark theme's
  existing treatment), passes ~6:1.
- `text-slate-400` → `text-slate-500` (light muted text, 4.0 → 4.76:1).
- `text-emerald-600` → `text-emerald-700`; `bg-emerald-600` →
  `bg-emerald-700` (white text 3.3 → 4.8:1); `bg-emerald-500` →
  `bg-emerald-700` (settings chips).
- Dark-mode muted text lightened (`dark:text-slate-500` →
  `dark:text-slate-400`, `dark:text-slate-400` → `dark:text-slate-300`,
  `dark:text-emerald-400` → `dark:text-emerald-300`).
- Footer + badge `text-slate-500` on slate-200/slate-950 → slate-700 /
  `dark:text-slate-400`/`dark:text-slate-300`.
- Destination view-toggle inactive state `text-slate-500` →
  `text-slate-600`; grid/map active state `dark:text-emerald-400`.
- GlobalSearch Ctrl-K chip: `bg-slate-200/80 text-slate-500` →
  `bg-slate-200 text-slate-600`.
- BottomNav labels (mobile): `text-slate-500` → `text-slate-600` at 11px.

No rule-wide waivers; no element-specific exclusions are currently
listed (`DOCUMENTED_NODE_EXCLUSIONS` is empty).

## Browser/device/viewport

- Chromium (Playwright bundled), desktop 1440×900 + mobile iPhone 13
  (390×844), headless.
- EN-US + ja-JP locales; Asia/Tokyo timezone.

## Keyboard-only findings (automated evidence actually performed)

- Primary nav links reachable via Tab + activate via Enter (desktop and
  mobile-drawer layouts).
- Auth modal: initial focus enters the dialog, Tab/Shift+Tab contained,
  Escape closes, focus returns to the opener (dedicated E2E).
- SearchDialog + mobile planner sheet: focus trap + Escape + focus return.
- HomePlanner desktop selects: keyboard-open (Enter), ArrowDown highlights
  an option, selection completes (value changes).
- Mobile planner sheet: Space opens the per-field sheet, focus enters and
  is trapped, Escape closes, focus returns to the opener row.
- Manual keyboard pass: TBD (human QA).

## Accessibility-tree / supported AT equivalent

- Automated: axe-core rule set (the industry-standard automated subset of
  WCAG 2.2 AA for DOM/ARIA), run against the production build in both
  light and dark themes.
- Manual screen-reader pass: **NOT performed in this environment** —
  VoiceOver/TalkBack/NVDA cannot be driven from the agent environment.
  This is stated explicitly; no claim of screen-reader testing is made.
  **Owner-side before public launch**: a human QA pass with VoiceOver
  (macOS) / TalkBack (Android) is required (screenshare or device).

## Reduced-motion result

- Automated (Playwright `reducedMotion: "reduce"`): Home and destination
  detail render, primary controls work (auth modal opens/closes), and axe
  reports zero violations with animations reduced.
- The shared animation classes (Tailwind `animate-*` + theme transitions)
  are preserved as the existing CSS policy; no non-essential animation
  was found to remain under `prefers-reduced-motion: reduce` in the
  scanned surfaces.
- Manual verification of edge-case animations: TBD (human QA).

## Remaining limitations

- Screen-reader narration/announcements (aria-live, focus announcements)
  are not covered by axe — manual AT pass required.
- Touch-target ergonomics on real devices (not just emulation).
- Real-session authenticated flows against a live Supabase project are
  NOT exercised by CI (by design — the E2E auth fixture is a deterministic
  in-browser session, no production mutation). The authenticated UI
  surfaces are covered via the fixture; real OAuth/email flows are
  documented manual QA.
- **Known finding (pre-existing, not blocking):** the HomePlanner desktop
  Base UI Selects (Vibe/Duration/Budget/Transport) do not dismiss their
  popup after choosing an option (Base UI controlled-`value` interaction
  quirk). Selection still works (value updates; keyboard navigation
  highlights + Enter/Space activate); the popup closes on click-outside
  in real browsers. Tracked for a follow-up component fix (controlled
  `open` wiring).
