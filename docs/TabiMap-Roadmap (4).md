# TabiMap Roadmap

## ✅ Phase 1 — Engineering Foundation (Completed)

### Architecture

- [x] Modular recommendation engine
- [x] Cloud synchronization
- [x] Supabase Authentication
- [x] Row Level Security (RLS)
- [x] Responsive UI
- [x] Bucket List
- [x] Visited Destinations
- [x] Visited Prefectures
- [x] Weather-aware recommendations
- [x] Budget-aware recommendations
- [x] Surprise Me
- [x] Dynamic weather tabs

### Engineering Improvements

#### Cloud Sync Refactor

- [x] Extracted synchronization logic into `useTripSync.ts`
- [x] Separated authentication state management
- [x] Added debounced cloud synchronization
- [x] Reduced complexity of `useTripStore.tsx`

#### Homepage Refactor

- [x] Extracted `useTripPlannerState`
- [x] Extracted `useWeatherContext`
- [x] Extracted `useTripRecommendations`
- [x] Simplified `Home.tsx`

#### Testing

- [x] Added RecommendationService unit tests
- [x] Tested transport filtering
- [x] Tested rainy weather routing
- [x] Tested budget thresholds
- [x] Tested visited destination exclusions

#### Quality

- [x] Production build verification
- [x] Vitest integration
- [x] Git branch synchronization

---

# 🚧 Phase 2 — Recommendation Engine

## Explainability

- Recommendation reasons
- Confidence score
- Why this destination?

## Better Filters

- Accessibility
- Couple
- Family
- Solo
- Photography
- Hiking
- Food
- History
- Nature

## Search

- Better keyword search
- Natural Language Search

---

# 🚧 Phase 3 — Trip Planning

- Trip entity
- My Trips
- Draft trips
- Trip history
- Trip journal
- Official itineraries
- Custom itineraries
- Reorder itinerary
- Custom stops
- Google Maps integration
- Google Calendar integration
- Share trips
- Export PDF
- Printable itinerary

---

# 🚧 Phase 4 — Destination Experience

## Rich Destination Pages

- Hero section
- Quick facts
- Why Visit
- Highlights
- Suggested itineraries
- Budget breakdown
- Seasonal guide
- Local food
- Nearby destinations
- Practical information
- Trip readiness
- Personal notes

---

# 🚧 Phase 5 — Destination Expansion

## Kanto

- Okutama
- Mt. Mitake
- Hinohara
- Chichibu
- Nagatoro
- Sawara
- Nokogiriyama
- Yoro Valley
- Kusatsu Onsen
- Ikaho Onsen
- Shima Onsen
- Mount Tsukuba
- Fukuroda Falls
- Hitachi Seaside Park

## Chubu

- Kamikochi
- Takayama
- Shirakawa-go
- Gujo Hachiman
- Narai-juku
- Tsumago-juku
- Magome-juku
- Suwa
- Bessho Onsen
- Shosenkyo Gorge
- Nishizawa Valley
- Fujiyoshida

## Destination Metadata

Every destination will include:

- Best season
- Budget
- Travel time
- Visit duration
- Difficulty
- Family friendly
- Couple friendly
- Solo friendly
- Accessibility
- Pet friendly
- Photography rating
- Cherry blossom rating
- Autumn foliage rating
- Rain suitability
- Typical crowds
- Transport options
- Destination tags

---

# 🚧 Phase 6 — Explorer Collections & Gamification

## Collections

- 47 Prefectures
- UNESCO World Heritage Sites
- Original Castles
- National Parks
- Top Onsen Towns
- Three Scenic Views
- Cherry Blossom Collection
- Autumn Collection
- 100 Famous Mountains
- 100 Famous Waterfalls

## Progress Tracking

- Collection progress
- Interactive maps
- Remaining destinations
- Recommended next destination

## Badges

- Bronze
- Silver
- Gold
- Completion badges

Examples:

- 🏯 Castle Master
- 🌍 UNESCO Explorer
- 🗾 Japan Explorer
- ♨ Onsen Collector

## Explorer Titles

- Castle Master
- Weekend Wanderer
- Sakura Seeker
- Rail Explorer
- Japan Explorer

## Achievements

### Travel

- First Trip
- 10 Trips
- 50 Trips
- 100 Trips

### Transport

- Rail Explorer
- Road Tripper

### Seasons

- Sakura Explorer
- Autumn Hunter
- Winter Explorer

### Planning

- Master Planner

### Budget

- Budget Traveller

### Adventure

- Sunrise Chaser
- Rain Warrior
- Weekend Warrior

## Explorer Profile

- Explorer Level
- XP
- Badges
- Collections
- Equipped Title
- Progress statistics

---

# 🚧 Phase 7 — Community

- Shared itineraries
- Public profiles
- Public collections
- Travel journal sharing
- Favourite itineraries

---

# 🚧 Phase 8 — AI & Mobile

## AI

- AI itinerary generation
- AI destination search
- Personalized travel insights
- Smart trip summaries

## Mobile

- Offline itineraries
- Offline checklists
- Trip reminders
- Improved calendar sync

---

# Long-Term Vision

**Discover → Plan → Explore → Remember**

TabiMap helps local travellers in Japan:

- Discover destinations
- Plan complete trips
- Schedule adventures
- Explore through curated collections
- Track travel achievements
- Build a lifelong travel journal

Rather than replacing Google Maps, TabiMap complements it:

- **TabiMap** → Discover & Plan
- **Google Maps** → Navigate
- **Google Calendar** → Schedule
