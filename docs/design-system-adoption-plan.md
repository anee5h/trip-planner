# Implementation Plan — Phase 1: Design System Adoption (TabiMap UI/UX Roadmap)

This plan completes **Phase 1: Design System** by adding semantic color tokens, ensuring a single source of truth for design tokens, and migrating key components (`DestinationCard`, `Button`, `Badge`) to utilize these tokens.

---

## User Review Required

> [!NOTE]
> Single source of truth approach: We will add semantic colors to `design-tokens.ts` and configure `tailwind.config.js` to reference the tokens seamlessly.

---

## Proposed Changes

### 1. Add Semantic Color Tokens & Single Source of Truth

#### [MODIFY] `src/shared/theme/design-tokens.ts`

Add semantic colors (`success`, `warning`, `danger`, `info`, `surface`, `border`, `mutedText`) to `designTokens`:

```ts
export const designTokens = {
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
    xxxl: "48px",
    layout: "64px",
    huge: "96px",
  },
  radii: {
    button: "12px",
    card: "16px",
    image: "16px",
    dialog: "20px",
    pill: "9999px",
  },
  shadows: {
    card: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
    hover: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    modal:
      "0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.15)",
  },
  colors: {
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    info: "#3b82f6",
  },
  typography: {
    hero: "text-[48px] font-black leading-tight tracking-tight",
    sectionTitle: "text-[32px] font-extrabold leading-snug",
    pageTitle: "text-[28px] font-extrabold leading-snug",
    cardTitle: "text-[20px] font-bold leading-normal",
    body: "text-[16px] font-normal leading-relaxed",
    secondary:
      "text-[14px] font-medium leading-relaxed text-slate-500 dark:text-slate-400",
    caption:
      "text-[12px] font-medium leading-none text-slate-400 dark:text-slate-500",
  },
};
```

#### [MODIFY] `tailwind.config.js`

Update Tailwind theme extensions to register semantic color tokens:

```js
    extend: {
      colors: {
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#3b82f6",
      },
      ...
```

---

### 2. Component Migration (Proof of Adoption)

#### [MODIFY] `src/features/destinations/components/DestinationCard.tsx`

Migrate hardcoded classes to token utilities (`rounded-card`, `shadow-card`, `hover:shadow-hover`, typography presets).

#### [MODIFY] `src/shared/components/ui/button.tsx`

Ensure default button radii use `rounded-button`.

---

## Verification Plan

### Automated Tests

- Run all vitest unit tests and compilation build:
  ```bash
  npx vitest run
  npm run build
  ```

### Manual Verification

- Verify that `DestinationCard` and buttons render cleanly with the updated token styling classes.
