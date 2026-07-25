# TabiMap Product Architecture Documentation

Welcome to TabiMap's long-lived product architecture specifications directory. These documents define the architectural boundaries, UX patterns, and domain responsibilities for TabiMap.

---

## Architecture Index

| Document                                    | Scope & Responsibilities                                                            | Update When                                                           |
| :------------------------------------------ | :---------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| 📄 **[navigation.md](navigation.md)**       | Core 7 product pillars, route structure, and header navbar governance.              | Adding top-level routes or changing primary navigation rules.         |
| 📄 **[destinations.md](destinations.md)**   | Destination Relationship Model graph schema, hub/POI roles, and navigation rules.   | Modifying destination relationship fields or travel hub modeling.     |
| 📄 **[passport.md](passport.md)**           | Passport feature domain, 6 canonical sub-tabs, Achievements vs Badges rules.        | Adding Passport sections or changing travel progression tracking.     |
| 📄 **[search.md](search.md)**               | Unified `SearchDocument` abstraction, scoring pipeline & Command Palette (`Cmd+K`). | Modifying search ranking algorithms or extending searchable entities. |
| 📄 **[account.md](account.md)**             | User platform routes (`/profile`, `/settings`, `/help`) & avatar menu options.      | Adding user account settings, preferences, or support features.       |
| 📄 **[design-system.md](design-system.md)** | Icons registry, typography components, interaction states, and theme governance.    | Updating UI primitives, icon mappings, or typography rules.           |

---

## High-Level Product Architecture

```
TabiMap
│
├── Primary Pillars
│   ├── Discover      (/destinations, /collections)
│   ├── Plan          (/my-trips, /bucket-list)
│   └── Passport      (/passport)
│
├── Search & Discovery
│   └── Command Palette (Cmd+K)
│
└── User Platform
    ├── Profile       (/profile)
    ├── Settings      (/settings)
    └── Help          (/help)
```

## Maintenance & Governance Guidelines

- **Inspect Before Modifying**: Always read the authoritative spec before introducing new routes or top-level UI components.
- **Maintain Separation of Concerns**: Keep content discovery, trip planning, travel history, and application settings strictly isolated within their designated product domains.
