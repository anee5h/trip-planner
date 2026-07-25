# Implementation Plan — Priority 3: Performance Polish (TabiMap UI/UX Roadmap)

This plan implements **Performance Polish** optimizations across TabiMap, incorporating image lazy loading (`loading="lazy"` + `decoding="async"`), image fade-in transitions, and confirming route code splitting boundaries.

---

## User Review Required

> [!NOTE]
> Performance updates will optimize image loading attributes and add smooth image load transitions without modifying data logic or route definitions.

---

## Proposed Changes

### 1. Image Lazy Loading & Async Decoding

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

- Add `loading="lazy"` and `decoding="async"` attributes to destination card image tags.
- Implement an image loaded state transition (`opacity-0` -> `opacity-100`) to prevent abrupt visual pops when images load over slow connections.

#### [MODIFY] `src/features/destinations/DestinationDetails.tsx`

- Add `decoding="async"` to main destination detail hero images.

---

## Verification Plan

### Automated Tests

- Run vitest suite and compilation build check:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Inspect DOM elements in Chrome DevTools to verify `loading="lazy"` and `decoding="async"` attributes are present on destination card images.
- Verify smooth fade-in image appearance during scrolling.
