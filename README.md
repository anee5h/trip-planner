# 🗾 TabiMap

**TabiMap** is a travel planner for **local travellers in Japan** looking for day trips and weekend getaways.

Instead of spending hours comparing destinations, checking the weather, estimating travel costs and reading travel blogs, TabiMap helps you find places that match **your budget, available time and travel preferences**.

Whether you're looking for a quick day trip or planning your next weekend escape, TabiMap helps answer one simple question:

> **Where should we go this weekend?**

🌐 **Live Demo:** https://tabimap-cld.pages.dev

---

# Why I built TabiMap

After moving to Japan, I realised that planning a simple trip involved opening multiple apps and websites.

I'd usually have Google Maps open for travel times, a weather forecast in another tab, train fare calculators, travel blogs and a notes app just to compare a few destinations.

There are plenty of websites showing places to visit, but very few help narrow them down based on your own situation.

I built TabiMap to simplify that process.

Instead of browsing endless lists, the app recommends destinations based on things that actually matter when planning a trip:

- Current weather
- Travel time
- Budget
- Preferred transport
- Personal interests
- Time of year

The goal isn't to replace travel guides—it's to make deciding **where to go** much easier.

---

# Features

### 🎯 Smart Recommendations

Receive personalised destination recommendations using a weighted scoring system based on:

- Weather
- Budget
- Travel time
- Transport preferences
- Seasonal suitability
- Activities
- User preferences

### 💰 Budget Planning

Estimate how much a trip will cost before you leave.

Each destination includes estimated expenses such as:

- Transport
- Food
- Attractions
- Parking (where applicable)

making it easier to decide whether a destination fits your budget.

### 🗺️ Explore Japan

- 327 curated destinations across Japan
- Detailed destination pages
- Suggested itineraries
- Travel logistics
- Seasonal highlights

### ❤️ Personal Travel Dashboard

- Bucket List
- Destination comparison
- Visited prefecture tracker
- Saved preferences
- User accounts with Supabase

---

# Tech Stack

### Frontend

- React 19
- TypeScript
- React Router 7
- Tailwind CSS
- Vite

### Backend & Services

- Supabase
- Open-Meteo API

### Tooling

- Vitest
- Husky
- Oxlint
- ESLint
- Prettier

### Deployment

- Cloudflare Pages

---

# Architecture

```
React UI
     │
     ▼
Recommendation Engine
     │
     ├── Weather Service
     ├── Destination Service
     ├── Budget Calculator
     └── User Preferences
              │
              ▼
      Ranked Destinations
```

---

# Performance

To keep the application fast:

- Route-level lazy loading
- Destination data split into individual JSON files
- Incremental destination loading
- Optimised images
- React Suspense
- Error Boundaries

---

# Challenges

One of the biggest challenges was balancing recommendation quality with frontend performance.

Originally, all destination data was bundled together, increasing the initial download size.

To improve performance, destination information was split into individual JSON files. The application now loads lightweight summaries first and fetches full destination details only when required.

This keeps the initial load fast while still allowing detailed destination pages.

---

# Future Ideas

- Multi-day trip planning
- Shared trip links
- More destinations across Japan
