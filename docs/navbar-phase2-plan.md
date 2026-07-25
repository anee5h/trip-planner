# Architecture & Implementation Plan: Global Navigation, Search & User Platform

This document defines the core product architecture, technical design, and implementation plan for TabiMap's **Global Search & Command Palette** (`Cmd+K`), **Full-Page Account Hubs** (`/profile`, `/settings`, `/help`), and **Streamlined Navigation Platform**.

---

## 1. Product Philosophy & Information Architecture

TabiMap organizes user workflows around a clear 7-domain mental model:

| Product Pillar | URL Route                       | Core Responsibility                                             |
| :------------- | :------------------------------ | :-------------------------------------------------------------- |
| **Discover**   | `/destinations`, `/collections` | Explore regional sights & thematic travel collections           |
| **Plan**       | `/my-trips`, `/bucket-list`     | Organize custom trip itineraries & saved places                 |
| **Passport**   | `/passport`                     | Track personal travel history, prefectures & achievements       |
| **Search**     | `Cmd+K` / Header Bar            | Instantly find content, destinations, collections & actions     |
| **Profile**    | `/profile`                      | User identity, personal account details & travel summary        |
| **Settings**   | `/settings`                     | Application configuration (Base Location, transit, preferences) |
| **Help**       | `/help`                         | Learn features, keyboard shortcuts, FAQs & documentation        |

---

## 2. Global Search & Command Palette Engine (`src/features/search/`)

### Unified Search Abstraction

Every searchable entity (Destinations, Collections, Navigation links, Quick Actions) is transformed into a standardized `SearchDocument`. The search engine operates agnostically on `SearchDocument` objects without needing entity-specific query logic.

```typescript
export type SearchDocumentType =
  "destination" | "collection" | "action" | "navigation";

export interface SearchDocument {
  id: string;
  title: string;
  subtitle: string;
  type: SearchDocumentType;
  url: string;
  keywords: string[];
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
  category?: string;
  score?: number;
  metadata?: Record<string, any>;
}
```

### Search Ranking & Scoring Pipeline

Queries are evaluated against `SearchDocument` items and assigned a relevance score:

1. **Exact Title Match**: `score += 100`
2. **Title Prefix Match**: `score += 80`
3. **Title Substring / Keyword Match**: `score += 60`
4. **Category / Prefecture Match**: `score += 40`
5. **Tag / Description Match**: `score += 20`

Results are ordered by `score` descending and grouped into Spotlight/Raycast-style visual categories.

### Command Palette Result Grouping

```
Search destinations, collections, actions... [⌘K]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚡ NAVIGATION & ACTIONS
  • Go to Passport          (Shortcut: P)
  • Go to Settings          (Shortcut: S)
  • Go to Help Center       (Shortcut: H)

🗾 DESTINATIONS
  • Fushimi Inari Taisha    Kyoto • Shrine / Temple
  • Himeji Castle           Hyogo • Castle

📁 COLLECTIONS
  • UNESCO World Heritage   25 Locations
  • 12 Existing Castles     12 Locations
```

---

## 3. Account Navigation & Full-Page Hubs

### Account Menu Dropdown (`Navbar.tsx`)

The avatar dropdown focuses strictly on account identity, configuration, and documentation:

```
Signed in as traveler@example.com
─────────────────────────────────
👤 Profile                  (/profile)
⚙️ Settings                 (/settings)
❓ Help                     (/help)
💬 Send Feedback            (Feedback Dialog)
─────────────────────────────────
🚪 Sign Out
```

_(Removed duplicate `My Trips (Visited)` menu entry)._

### Profile Hub (`/profile`)

Organized using consistent tabbed sub-navigation:

- **Overview**: High-level identity badge, total logged stats, member since date.
- **Account**: Username, display name, email, avatar customization.
- **Security**: Password management & authentication options.
- **Connected Accounts**: Auth provider link status.
- **Travel Summary**: Exploration history summary stats.

### Settings Platform (`/settings`)

Comprehensive application configuration:

- **General**: Base Location (Home Station/Prefecture), Default Currency, Language, Units (Metric/Imperial).
- **Travel Preferences**: Car mode preference, public transit modes (shinkansen, express, bus), default party size, car ownership.
- **Appearance**: Theme selection (System, Light, Dark), UI density.
- **Accessibility**: Reduced motion, high-contrast mode, font scale.
- **Account & Data**: Data export & account deletion controls.

### Help & Documentation (`/help`)

Dedicated documentation platform:

- **Getting Started**: Quickstart guide for discovery, planning, and logging visits.
- **FAQ**: Searchable frequently asked questions accordion.
- **Keyboard Shortcuts**: Cheat sheet for all global keyboard shortcuts (`Cmd+K`, `Esc`, `Tab`).
- **Changelog**: Release history notes (`v1.5.0`, `v1.4.0`).
- **Contact Support**: Direct contact details.

---

## 4. Out of Scope (Non-Goals)

> [!NOTE]
> To keep execution tightly focused, the following items are explicitly out of scope for this phase:
>
> - Server-side external search engines (stays fast client-side indexing)
> - AI-powered travel recommendations
> - Full-text search inside itinerary trip files
> - Search history cloud sync across devices
> - Public user profiles & social feeds

---

## 5. Domain Folder Structure

```
src/
├── features/
│   ├── search/
│   │   ├── GlobalSearch.tsx         # Navbar search input & Cmd+K badge
│   │   ├── SearchDialog.tsx         # Command Palette dialog (Cmd+K modal)
│   │   ├── SearchResults.tsx        # Grouped Raycast-style result list
│   │   ├── hooks/
│   │   │   └── useSearch.ts        # Query state, keybindings, scoring
│   │   ├── services/
│   │   │   └── searchIndex.ts      # Index builder & document scoring
│   │   └── types.ts                 # SearchDocument & score types
│   ├── profile/
│   │   ├── Profile.tsx              # Full-page /profile container & tab controller
│   │   └── components/
│   ├── settings/
│   │   ├── Settings.tsx             # Full-page /settings container & tab controller
│   │   └── components/
│   └── help/
│       ├── Help.tsx                 # Full-page /help container
│       └── components/
```

---

## 6. Verification Plan

### Automated Tests

- Type-check codebase: `npx tsc --noEmit`
- Production build validation: `npm run build`

### Manual Verification

1. **Command Palette (`Cmd+K`)**:
   - Press `Cmd+K` anywhere to open Command Palette.
   - Type `"Kyoto"`, `"Settings"`, or `"UNESCO"` and verify ranked, grouped results.
   - Test keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Esc`).
2. **Page Navigation**:
   - Open Avatar Menu -> Click `Profile` -> Route `/profile`.
   - Open Avatar Menu -> Click `Settings` -> Route `/settings` (configure Base Location).
   - Open Avatar Menu -> Click `Help` -> Route `/help`.
   - Verify `Send Feedback` triggers feedback submission dialog.
