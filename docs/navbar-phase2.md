# Implementation Plan: Account Menu & Global Search Refinement

Refine the authenticated user experience by simplifying the account dropdown, removing redundant navigation, and introducing a global search entry point while keeping account-related settings logically organized.

---

## Goal Description

Improve the account menu to focus exclusively on user account and application settings while reducing duplicate navigation.

Additionally, introduce a prominent global search bar in the top navigation to improve destination discovery without increasing navigation complexity.

---

## Architecture Principles

- **Single Responsibility**: The account menu should contain account and application settings, not primary navigation.
- **No Duplicate Navigation**: Features accessible from the primary navigation should not be duplicated in the profile menu.
- **Search First**: Searching destinations and collections should be a first-class interaction.
- **Settings Together**: User preferences and defaults should live in a dedicated settings experience.
- **Scalable Structure**: The menu should remain stable as new product features are introduced.

---

# Current Issues

## Account Menu

Current menu mixes:

- Account actions
- Product navigation

Current structure:

```
Signed in as
email@example.com

Edit Profile
Set Preferences
My Trips (Visited)

────────────

Sign Out
```

Problems:

- "My Trips" duplicates the primary navigation.
- "Edit Profile" implies a simple form rather than a complete account page.
- Base location has no obvious home.
- Future account features have no clear place.

---

# Proposed Account Menu

```
Signed in as

email@example.com

────────────

👤 Profile

⚙️ Preferences

❓ Help & Feedback

────────────

🚪 Sign Out
```

The menu becomes dedicated to account management rather than application navigation.

---

# Profile Page

Rename:

```
Edit Profile
```

to

```
Profile
```

The Profile page becomes the user's account hub.

Future sections may include:

- Avatar
- Display Name
- Email
- Connected Accounts
- Travel Summary
- Account Security
- Data Export

---

# Preferences

Move application-wide preferences into a dedicated Preferences page.

Examples:

- Base Location
- Budget Defaults
- Preferred Transport
- Walking Distance
- Language
- Theme
- Units
- Notification Preferences

Base Location should be configured here rather than occupying permanent navbar space.

---

# Remove Redundant Navigation

Remove:

```
My Trips (Visited)
```

Reason:

My Trips is already accessible via:

```
Plan
↓
My Trips
```

The account menu should not duplicate primary navigation.

---

# Global Search

Introduce a persistent search input within the desktop navigation.

Example:

```
TabiMap

[ Search destinations, collections... ]

Discover ▼

Plan ▼

Passport ▼

Avatar
```

---

## Initial Search Scope

Search:

- Destinations
- Collections

Future expansion:

- Prefectures
- Cities
- Regions
- Itineraries
- Bucket List

---

## Search Behavior

The search should support:

- Instant filtering
- Keyboard navigation
- Recent searches
- Clear button
- Enter to open first result

Future enhancements:

- Fuzzy search
- Search suggestions
- Popular destinations
- Search history

---

# Navigation Ownership

Primary Navigation owns:

- Discover
- Plan
- Passport

Account Menu owns:

- Profile
- Preferences
- Help & Feedback
- Sign Out

This separation prevents duplicate entry points throughout the application.

---

# Proposed Component Changes

## [MODIFY] `src/shared/components/layout/Navbar.tsx`

### Desktop Navigation

- Add global search bar between logo and navigation items.
- Preserve existing navigation categories.
- Keep account avatar aligned to the right.

### Account Dropdown

Replace:

```
Edit Profile
Set Preferences
My Trips
```

with:

```
Profile
Preferences
Help & Feedback
```

Remove duplicate navigation items.

---

## [NEW] `src/features/profile/`

Create a dedicated Profile feature.

```
src/features/profile/

├── Profile.tsx
├── components/
│   ├── AccountInformation.tsx
│   ├── TravelSummary.tsx
│   ├── ConnectedAccounts.tsx
│   └── SecuritySettings.tsx
├── index.ts
└── types.ts
```

---

## [MODIFY] `src/features/preferences/`

Add Base Location configuration.

Possible settings:

- Base Location
- Preferred Transport
- Budget Defaults
- Walking Radius
- Theme
- Language

---

## [NEW] `src/features/search/`

Create reusable global search components.

```
src/features/search/

├── GlobalSearch.tsx
├── SearchDialog.tsx
├── SearchResults.tsx
├── search.ts
└── types.ts
```

---

# Future Enhancements

Account Menu:

- Changelog
- Feedback
- Keyboard Shortcuts

Search:

- Recent Searches
- Search History
- Saved Searches
- AI Trip Suggestions

Profile:

- Travel Journal
- Yearly Recap
- Achievement Timeline
- Public Profile (optional)

---

# Acceptance Criteria

- [ ] Account menu contains only account-related functionality.
- [ ] Duplicate navigation entries are removed.
- [ ] "Edit Profile" is renamed to "Profile".
- [ ] Base Location is managed through Preferences.
- [ ] Desktop navigation includes a global search bar.
- [ ] Search supports destinations and collections.
- [ ] Account menu remains keyboard accessible.
- [ ] Existing navigation behavior remains unchanged.

---

# Verification Plan

## Automated

```bash
npm run lint
npm run test:run
npm run build
```

## Manual

1. Open account dropdown.
2. Verify menu only contains:
   - Profile
   - Preferences
   - Help & Feedback
   - Sign Out
3. Verify "My Trips" no longer appears in the account menu.
4. Open Profile and verify it functions as the user account hub.
5. Open Preferences and verify Base Location can be configured.
6. Verify the navbar search appears on desktop.
7. Search for destinations and collections and verify relevant results are returned.
8. Confirm keyboard navigation works for both the account menu and search.
