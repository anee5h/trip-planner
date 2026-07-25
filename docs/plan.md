I think this is a great evolution for TabiMap. Rather than adding more items to the top navigation over time, you're defining a stable information architecture that can grow with the product.

I'd document it something like this:

---

# Feature Specification: Primary Navigation & Information Architecture

**Status:** Proposed
**Owner (dev):** You
**Purpose:** Establish a scalable top-level navigation that organizes TabiMap around the three stages of travel: discovering destinations, planning trips, and tracking travel history.

---

# 1. Problem / Motivation

The current navigation exposes individual pages (`Destinations`, `Passport`, `My Trips`). While this works today, it does not scale well as new features are introduced.

Planned features such as:

- Collections
- Bucket List
- Travel Calendar
- Badges
- Japan Map
- Statistics
- Timeline

would eventually require additional top-level navigation items or inconsistent placement throughout the application.

The navigation should instead organize features into a small number of stable categories that remain intuitive as TabiMap grows.

---

# 2. Goals

- Keep primary navigation limited to three top-level categories.
- Create a scalable information architecture.
- Reduce navigation clutter.
- Group related functionality together.
- Allow future features to be added without redesigning the navigation.

---

# 3. Navigation Structure

```
Discover ▼
├── Destinations
├── Collections
└── Map (future)

Plan ▼
├── My Trips
└── Bucket List

Passport ▼
├── Overview
├── Japan Map
├── Travel Calendar
├── Timeline
├── Collections Progress
├── Badges
└── Statistics
```

---

# 4. Navigation Philosophy

The three navigation categories represent distinct stages of a travel journey.

## Discover

Help users find places worth visiting.

Contains:

- Destination directory
- Curated collections
- Interactive map (future)

Primary question answered:

> "Where should I go?"

---

## Plan

Help users organize future travel.

Contains:

- Itineraries
- Bucket List

Primary question answered:

> "How should I plan my trip?"

---

## Passport

Serve as the user's personal travel record.

Contains:

- Travel overview
- Visited Japan map
- Travel calendar
- Timeline
- Collection progress
- Badges
- Statistics

Primary question answered:

> "Where have I been?"

Passport becomes the user's travel dashboard rather than a single page.

---

# 5. Design Principles

## Progressive Disclosure

Only expose three navigation categories.

Additional functionality is accessed through dropdown menus rather than increasing the number of primary navigation items.

---

## Feature Grouping

Closely related features should live together.

Examples:

- Badges belong inside Passport.
- Japan Map belongs inside Passport.
- Collections belong under Discover.
- Bucket List belongs under Plan.

Features should not appear in multiple navigation groups unless there is a strong usability reason.

---

## Scalability

Future additions should naturally fit existing categories.

Examples:

### Discover

- Seasonal Recommendations
- Nearby Destinations
- Hidden Gems

### Plan

- Shared Trips
- Road Trips
- Trip Templates

### Passport

- Countries Visited
- Yearly Recap
- Travel Journal
- Achievements

---

# 6. Navigation Visual Design

The navigation should communicate the active section clearly while remaining lightweight.

## Active State

The currently active navigation item should use:

- Green text
- 2–3 px green underline
- Subtle green-tinted background
- Medium font weight

Avoid filled pills or high-contrast buttons for persistent navigation.

The goal is to communicate the current location without making the navigation visually heavy.

---

## Inactive State

Inactive items should use:

- Neutral text color
- Transparent background
- Underline only appears on hover
- Smooth hover transition

---

## Dropdown Menus

Each primary navigation item opens a lightweight dropdown.

Requirements:

- Keyboard accessible
- Closes on outside click
- Closes on Escape
- Supports arrow-key navigation
- Current page highlighted

---

# 7. Passport Information Architecture

Passport is not a single feature.

It is the central hub for tracking travel progress.

```
Passport

Overview

↓

Japan Map

↓

Travel Calendar

↓

Timeline

↓

Collections Progress

↓

Badges

↓

Statistics
```

These features are intentionally grouped together to provide a unified view of travel history rather than scattering them across separate pages.

---

# 8. Future Home Page Integration

The navigation complements the existing recommendation-focused home page.

Suggested user journeys:

### I know where I want to go

```
Home

↓

Search

↓

Destination
```

---

### I need inspiration

```
Home

↓

Trip Planner

↓

Recommendations

↓

Destination
```

---

### I want to organize a trip

```
Plan

↓

My Trips

↓

Itinerary
```

---

### I want to review my travel history

```
Passport

↓

Calendar / Map / Badges
```

---

# 9. Out of Scope

- Mega menus
- Multi-level nested dropdowns
- Customizable navigation
- Recently visited shortcuts
- Pinned navigation items
- Search integrated into dropdown menus

---

# 10. Acceptance Criteria

- [ ] Navigation contains only three primary categories.
- [ ] Each category opens a dropdown menu.
- [ ] Active section uses green text, green underline, and a subtle green background tint.
- [ ] Passport becomes the dedicated travel hub.
- [ ] Related features are grouped under their respective categories.
- [ ] Future features can be added without introducing new top-level navigation items.
- [ ] Navigation is fully keyboard accessible and responsive.

---

I particularly like one decision in this design: **making Passport the "travel hub" instead of just another page**. As you add the Japan map, travel calendar, badges, collections, and statistics, users will naturally think, _"I want to see my travel progress,"_ and know to go to Passport. That gives the feature a strong identity and keeps the top-level navigation clean as TabiMap grows.
