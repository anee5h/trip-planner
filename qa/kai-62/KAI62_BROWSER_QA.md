# KAI-62 Dark-Mode Contrast QA

Manual browser QA run against the isolated follow-up branch with the local Vite preview.

## Coverage

- Dark mode at 390×844 and 430×932 mobile viewports.
- Dark mode at 1440×900 desktop viewport.
- Explore toolbar: selected collection and active/inactive Filters.
- Trip preferences: Any transport, selected Local trains, unselected transport options, budget controls, and disabled party decrement at the minimum.
- Keyboard focus on the selected Filters control.
- Hoverable controls retained their semantic hover classes; modal and card surfaces remained readable in screenshots.

## Result

PASS. Selected controls use the muted emerald treatment (`dark:bg-emerald-500/20`, `dark:text-emerald-200`, and `dark:ring-emerald-400/50`). Inactive Filters uses the semantic overlay and subtle border tokens. No layout overflow or unreadable state was observed at the requested widths.
