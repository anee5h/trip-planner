# Architecture Specification: Primary Navigation & Information Architecture

## 1. Core Navigation Pillars

TabiMap structures user workflows into 7 core pillars:

```
TabiMap Information Architecture

Discover            Plan                Passport            Search (Cmd+K)
├── Destinations    ├── My Trips        ├── Overview        └── Unified Index
└── Collections     └── Bucket List     ├── Japan Map
                                        ├── Timeline
                                        ├── Achievements
                                        ├── Badges
                                        └── Statistics

User Platform
├── Profile (/profile)
├── Settings (/settings)
└── Help (/help)
```

## 2. Navigation Ownership Rules

- **Discover**: Owns destination exploration, sight details, and curated thematic collections.
- **Plan**: Owns custom itinerary planning, daily route mapping, and bucket list saved places.
- **Passport**: Owns travel history logging, prefecture progress tracking, heritage achievements, and exploration stats.
  - Sub-tabs: `Overview`, `Japan Map`, `Timeline`, `Achievements`, `Badges`, `Statistics`.
  - **Achievements**: Official heritage benchmarks (UNESCO, 12 Existing Castles).
  - **Badges**: Gamified rewards (Kanto Explorer, First Step, Japan Master).
- **Search**: Owns instant content & action discovery via persistent header input and `Cmd+K` command palette.
- **Profile**: Owns user identity, display name, email, connected auth, and travel summary.
- **Settings**: Owns application configuration (Base Location, transport modes, party size, appearance, accessibility).
- **Help**: Owns documentation, FAQs, keyboard shortcut reference, changelog, and feedback triggers.

## 3. Navigation Bar Rules

- Top desktop header layout: `[Logo] [Search Bar (flex-1 max-w-md)] [Discover ▼] [Plan ▼] [Passport] [User Avatar]`
- Discover and Plan use forgiving hover dropdown menus (180ms delay).
- Passport is a direct top-level link.
- User Avatar dropdown contains account & app management items (`Profile`, `Settings`, `Help`, `Send Feedback`, `Sign Out`).
- Duplicate navigation items (e.g. `My Trips` in profile dropdown) are prohibited.
