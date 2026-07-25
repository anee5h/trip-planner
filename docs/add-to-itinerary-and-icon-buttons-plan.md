# Implementation Plan: Add to Itinerary & Icon-Only Toolbar

This implementation plan defines the Add to Itinerary user flow and Destination Details header action buttons, detailing explicit behavior contracts, responsive layouts, cancellation rules, accessibility, out-of-scope boundaries, and verification strategies.

---

## 1. Explicit Behavior Contract

- **Predictable Selection**: Clicking "Add to Itinerary" or the `+` card button ALWAYS presents the Itinerary Picker modal (even if only 1 trip exists), preventing accidental additions.
- **In-Modal Creation**: The Itinerary Picker modal includes a `+ Create New Itinerary` action at the bottom of the list.
- **Cancellation**: Closing or dismissing the modal performs no action and leaves existing itineraries unchanged.
- **Duplicate Prevention**: If the destination already exists in the selected itinerary, addition is skipped and an informative warning toast is displayed (`Destination already exists in "Weekend Kansai"`).
- **Append Order**: New destinations are appended to the end of the itinerary's `stops` array.
- **Preservation**: Existing itinerary items and custom stop notes are strictly preserved.
- **Rich Toast Notification**: Successful additions display `✓ Added to "[Itinerary Title]"` with a `[View Trip]` action link. The toast persists for 4 seconds, is dismissible, and navigates via the React Router SPA navigator (`navigate('/my-trips?tripId=...')`).
- **Responsive Layout**: Renders as a clean responsive modal / popover on desktop viewports and a bottom-sheet drawer on mobile viewports.
- **Accessibility & Tooltips**: Icon-only buttons include `aria-label`, visible keyboard focus indicators, and hover tooltip popups.

---

## 2. Out of Scope

- Drag-and-drop itinerary reordering within the picker modal (deferred).
- Multi-destination batch selection (deferred).
- Collaborative itinerary sharing or real-time co-editing (deferred).
- Automatic itinerary route optimization (deferred).

---

## 3. Proposed Changes

### A. Destination Details Header Refactoring

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Replace `Get Directions` and `Share` text buttons with symbol-only icon buttons (`aria-label="Get Directions"`, `aria-label="Share destination"`).
- Add a prominent primary button: `<Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold px-4 py-2"><Plus className="w-4 h-4 mr-1.5" /> Add to Itinerary</Button>`.
- Trigger itinerary selection flow upon click.

### B. Destination Card Component Refactoring

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

- Add a `Plus` (`+`) icon button in the top-right overlay stack (alongside Bookmark and Visited buttons).
- Include `aria-label="Add to Itinerary"` and hover tooltip.
- Trigger itinerary selection flow upon click.

### C. Itinerary Selection Modal & Flow

#### [NEW] `src/features/trips/components/ItineraryPickerModal.tsx`

- Renders a clean list of existing user itineraries.
- Displays duplicate status indicator if destination is already present in a trip.
- Bottom action: `+ Create New Itinerary`.
- Handles addition, duplicate check, responsive drawer/modal layout, and fires rich success toast with SPA `[View Trip]` link.

---

## 4. Verification Plan

### Automated Verification

1. `npm run lint` — Confirm 0 linter errors.
2. `npm run test:run` — Ensure all 27 unit tests pass.
3. `npm run build` — Verify production build compilation.

### Manual Verification

1. Click "Add to Itinerary" on a Destination Details page and verify the picker modal opens predictably.
2. Select an itinerary and confirm the rich success toast displays `✓ Added to "[Trip Title]"` with a working `[View Trip]` link that navigates via React Router.
3. Attempt adding the same destination again to verify duplicate warning toast (`Destination already exists in "[Trip Title]"`).
4. Dismiss/close the modal without selecting an itinerary and verify no changes occur.
5. Verify `+ Create New Itinerary` inside the modal creates a new trip and adds the stop.
6. Verify icon-only Share and Directions buttons render symbol-only with tooltips and `aria-label`s.
