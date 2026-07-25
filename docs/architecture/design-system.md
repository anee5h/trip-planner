# Design System Specification: Icons, Typography & Interaction Rules

This document establishes TabiMap's canonical design system standards for icons, typography, interaction states, and accessibility.

---

## 1. Icon Architecture

### Core Rule: Zero Emojis in Authenticated App UI

- All interface actions, navigation tabs, status badges, and search groups must use vector icons from the centralized icon registry (`src/shared/icons/index.ts`).
- Direct imports from `lucide-react` outside `src/shared/icons/` are prohibited to ensure single-source maintainability.

### Semantic Icon Registry Mapping (`src/shared/icons/index.ts`)

- **`Icons.discover`** (`Compass`): Discover domain navigation
- **`Icons.plan`** (`CalendarDays`): Plan domain navigation
- **`Icons.passport`** (`MapPinned`): Passport domain navigation
- **`Icons.overview`** (`CircleDot`): Overview sub-tabs
- **`Icons.japanMap`** (`Map`): Japan map sub-tabs & destination sights
- **`Icons.timeline`** (`History`): Chronological feeds & changelog
- **`Icons.achievements`** (`Trophy`): Official heritage list benchmarks
- **`Icons.badges`** (`Medal`): Gamified exploration badges
- **`Icons.statistics`** (`BarChart3`): Exploration analytics
- **`Icons.profile`** (`UserRound`): User account & profile
- **`Icons.settings`** (`Settings2`): Configuration & app settings
- **`Icons.help`** (`HelpCircle`): Documentation & support
- **`Icons.feedback`** (`MessageSquareMore`): Feedback action
- **`Icons.action`** (`Zap`): Command palette actions

---

## 2. Typography System (`src/shared/components/ui/Typography.tsx`)

TabiMap standardizes text presentation using 5 composable primitives:

| Component        | Semantic HTML | Styling                                                                         | Usage                              |
| :--------------- | :------------ | :------------------------------------------------------------------------------ | :--------------------------------- |
| `<PageTitle>`    | `<h1>`        | `text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight` | Main page headers                  |
| `<SectionTitle>` | `<h2>`        | `text-lg font-bold text-slate-900 dark:text-white`                              | Section dividers & modal headers   |
| `<CardTitle>`    | `<h3>`        | `text-sm font-bold text-slate-900 dark:text-white`                              | Card headers & list titles         |
| `<BodyText>`     | `<p>`         | `text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed`         | Paragraphs & feature descriptions  |
| `<Caption>`      | `<span>`      | `text-[11px] text-slate-500 dark:text-slate-400`                                | Timestamps, metadata & stat labels |

---

## 3. Interaction & State Consistency

- **Hover Transitions**: Standard transition class `transition-all duration-200` with subtle scale/bg shifts (`hover:bg-slate-100 dark:hover:bg-slate-800`).
- **Focus Rings**: Accessible focus indicators on interactive elements (`focus:outline-none focus:ring-2 focus:ring-emerald-500`).
- **Disabled States**: Explicitly styled for clarity (`disabled:opacity-50 disabled:cursor-not-allowed`).
- **Loading Spinners**: `Loader2` or `animate-spin` rounded borders.
- **Page Transitions**: `animate-in fade-in duration-200` on top-level view containers.

---

## 4. Theme & Preference Governance

- **Single Theme Mutator**: `ThemeProvider` (`src/shared/context/ThemeContext.tsx`) is the single source of truth for application theme and the **only** component allowed to mutate root `document.documentElement` theme classes.
- **Base Location Ownership**: User Preferences Store owns `base_location`. Settings (`/settings`) is the single place to edit it using the reusable `<StationInput />` component.
