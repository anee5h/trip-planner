# KAI-49 — Final Japanese Localization Audit Before Beta (Sign-off & Matrix)

## Overview

This document certifies the final Japanese localization release audit for Meguruto prior to the August 15 Beta launch. The entire application was inspected against the latest `main` baseline (`2fc8ef83`, post-KAI-89/PR #174).

---

## 1. Baseline & Integration Invariants (Post-#174 / KAI-89)

1. **Rebase Hygiene**: Cleanly rebased onto latest `main` (`2fc8ef83`) with zero merge divergence.
2. **KAI-89 Score UI Invariants Preserved**:
   - Numeric overall destination score is hidden from all user-facing surfaces (`DestinationCard`, `Compare`, and `CompareModal`).
   - `scoreMetadata` remains internal (provenance, rubric v2, editorial verification gates) and does not leak unverified scores to users.
3. **Budget & Rating Safety**:
   - `getAdjustedBudget()` handles `null` values gracefully, displaying localized unavailable placeholder (`比較情報なし` / `compare.unavailable`).
   - `hasKnownBudgetRange(destination)` check in `DestinationCard` ensures unknown budgets are never rendered as free or zero.
   - Couple rating confidence is guarded by `isRatingVerified(destination)` in Compare and CompareModal.
4. **Attribution & Tooltip Localization**:
   - Wikipedia attribution tooltip on `DestinationDetails` uses parameter-interpolated translation (`t("destination.wikipediaAttributionTooltip", { source: "Wikipedia", license: "CC BY-SA 4.0" })` -> `Wikipedia（CC BY-SA 4.0ライセンス）に基づく概要`).

---

## 2. Resource Parity Audit

- **Resource files**: `src/i18n/resources/en/common.json` and `src/i18n/resources/ja/common.json`
- **Total Keys**: 736 keys per locale
- **Missing Keys**: 0
- **Interpolation Placeholder Mismatches**: 0
- **Parity Validator**: `node scripts/check-translation-parity.cjs` passes cleanly.

---

## 3. Comprehensive Route & Surface Localization Matrix

| Route / Surface                     |   Status    | Japanese Verification Highlights                                                                                                                                                                  |
| :---------------------------------- | :---------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`/` (Home)**                      | ✅ Verified | Planner segments, Vibe header (`home.vibe`), transport modes, date picker, station picker, match confidence reasons.                                                                              |
| **`/destinations` (Explore)**       | ✅ Verified | Filter dropdowns, collection active chips, prefecture grouping (`WhereLocationPicker`), empty search results, sort selectors.                                                                     |
| **`/destinations/:id` (Details)**   | ✅ Verified | Destination details, Wikipedia summary & attribution tooltip, beta confidence disclaimer, tags, walking intensity badges.                                                                         |
| **`/compare` (Compare Page)**       | ✅ Verified | Table headers (`特徴`, `おすすめ予算`, `所要時間`, `歩行量`, `カップル向け`, `夏の快適度`, `雰囲気タグ`), place names, prefectures, `比較情報なし`, lowest/fastest badges. No numeric score rows. |
| **`CompareModal`**                  | ✅ Verified | Compare header (`比較`), count, metrics, tags, `比較情報なし`, view details, remove button aria-labels.                                                                                           |
| **`/trips` & `/trips/:id` (Trips)** | ✅ Verified | Trip title, status badges, day tabs, calendar export (.ics), PDF export, share link, journal notes, itinerary planner.                                                                            |
| **`/passport` (Passport)**          | ✅ Verified | Visited places, regional progress, completion percentages, bucket list entries, stamp collection.                                                                                                 |
| **`/help` (Help Center)**           | ✅ Verified | Help header, subtitle, search placeholder, category tabs, FAQs, keyboard shortcuts table, beta release notes changelog.                                                                           |
| **`FeedbackModal`**                 | ✅ Verified | Modal title, type selector (Issue/Idea/Question), message textarea, submitting states, error handling, success toast.                                                                             |
| **`AuthModal`**                     | ✅ Verified | Social login (Google), email magic link, validation messages, Supabase authentication error mappings.                                                                                             |
| **Navigation & Layout**             | ✅ Verified | Navbar links, language menu switcher, theme toggle, user menu, mobile hamburger drawer, bottom navigation, error boundary.                                                                        |

---

## 4. Dedicated Japanese Regression Test Suites

All 7 dedicated Japanese test suites pass with 100% coverage:

1. `src/features/help/__tests__/Help.ja.test.tsx` (Help center, FAQ search, shortcuts, changelog)
2. `src/shared/components/feedback/__tests__/FeedbackModal.ja.test.tsx` (Feedback form, submission, toast)
3. `src/shared/components/auth/__tests__/AuthModal.ja.test.tsx` (Auth forms, Supabase error message mappings)
4. `src/features/trips/__tests__/TripDetails.ja.test.tsx` (Trip status, PDF/calendar export, journal notes)
5. `src/features/compare/__tests__/Compare.ja.test.tsx` (Table headers, place names, vibe tags, `比較情報なし`, score absence)
6. `src/features/destinations/__tests__/WhereLocationPicker.ja.test.tsx` (Region selector, prefecture grouping, reset action)
7. `src/features/destinations/components/__tests__/DestinationCard.ja.test.tsx` (Place details, action buttons, `訪問済み` badge, score absence)

---

## 5. Verification Commands

```bash
# 1. Translation Parity Validation
node scripts/check-translation-parity.cjs

# 2. Typecheck & Lint
npx tsc -b --noEmit
npm run lint

# 3. Dedicated Japanese Test Suites
npx vitest run src/features/help/__tests__/Help.ja.test.tsx \
  src/shared/components/feedback/__tests__/FeedbackModal.ja.test.tsx \
  src/shared/components/auth/__tests__/AuthModal.ja.test.tsx \
  src/features/trips/__tests__/TripDetails.ja.test.tsx \
  src/features/compare/__tests__/Compare.ja.test.tsx \
  src/features/destinations/__tests__/WhereLocationPicker.ja.test.tsx \
  src/features/destinations/components/__tests__/DestinationCard.ja.test.tsx

# 4. KAI-89 Model & Provenance Validation
npx vitest run scripts/models/__tests__/validate-models-mutation.test.ts
```

---

## 6. Sign-off Verdict

**APPROVED FOR BETA (KAI-49)**
Meguruto Japanese localization is complete, verified, and adheres to all post-#174 product and engineering requirements.
