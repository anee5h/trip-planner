# TabiMap Requirements

## Destination Collections, Official Lists & Achievement System

**Version:** 1.0
**Status:** Proposed Feature
**Priority:** High

---

# Overview

TabiMap should evolve beyond a destination database into a **curated travel guide to Japan**.

Destinations should belong to one or more **Collections** based on:

- Official government designations
- National rankings
- Historic significance
- UNESCO recognition
- Cultural importance
- Natural beauty
- Travel uniqueness
- Fun achievements

Collections power:

- badges
- filters
- collection pages
- achievements
- progress tracking
- recommendations

---

# Data Model

A destination can belong to multiple collections.

Example:

```
Himeji Castle

Collections

✓ Original 12 Castles
✓ Top 100 Castles
✓ National Treasure
✓ UNESCO
✓ Cherry Blossom Spot
```

Collections become reusable across the application.

---

# 1. Castles

## Existing

- Original 12 Castles
- Top 100 Castles
- Top 100 Fine Castles

## Add

- National Treasure
- UNESCO World Heritage
- Cherry Blossom Castle
- Mountain Castle
- Illuminated Castle
- Palace Castle
- Reconstruction
- Seaside Castle

---

# 2. Onsen

## Official

- Top 100 Onsen
- National Onsen Resort

## Historic

- Ancient Onsen (1000+ years)
- Edo Period Onsen

## Features

- Rotenburo
- Konyoku
- Sand Bath
- Mud Bath
- Sulfur Spring
- Carbonated Spring
- Iron Spring

## Scenic

- Snow Onsen
- Mountain Onsen
- Ocean View Onsen
- River Onsen
- Forest Onsen

---

# 3. Mountains

## Official

- Japan 100 Famous Mountains

## Features

- Active Volcano
- Dormant Volcano
- Ropeway
- Sunrise Spot
- Sunset Spot
- Alpine Route
- Hiking
- Beginner Friendly
- Advanced Hiking

---

# 4. Gardens

## Official

- Three Great Gardens

## Designations

- National Scenic Beauty
- Historic Garden

## Seasonal

- Sakura Garden
- Autumn Garden
- Iris Garden
- Wisteria Garden
- Rose Garden

---

# 5. Waterfalls

## Official

- Japan Top 100 Waterfalls

## Features

- Highest
- Multi-tier
- Frozen Winter
- Easy Access
- Hidden Waterfall

---

# 6. Beaches

## Official

- Blue Flag Beach
- Top 100 Beach

## Features

- White Sand
- Black Sand
- Sunset Beach
- Surf Spot
- Snorkeling
- Family Beach

---

# 7. Lakes

- Largest Lake
- Caldera Lake
- Crater Lake
- Sacred Lake
- National Park

---

# 8. Rivers

- Scenic River
- Rafting
- River Cruise
- Autumn Leaves

---

# 9. Bridges

## Historic

- National Treasure
- Historic Bridge

## Unique

- Suspension Bridge
- Wooden Bridge
- Stone Bridge
- Glass Bridge
- Longest Bridge
- Iconic Bridge
- Illuminated Bridge

---

# 10. Towers

Existing category.

Expand:

- Tallest
- Observation Tower
- TV Tower
- Historic Tower
- Free Observatory
- Paid Observatory
- Night View
- 360° View

---

# 11. Observation Decks

- Free Observatory
- Tallest Observatory
- Rooftop Observatory
- Night View
- Sunset Spot
- 360° View

---

# 12. Shrines

## Official

- National Treasure
- UNESCO

## Collections

- Three Great Shrines
- Famous Torii
- Power Spot
- Inari Shrine
- Mountain Shrine

---

# 13. Temples

- National Treasure
- UNESCO
- Zen Temple
- Five-story Pagoda
- Pilgrimage
- Historic Temple

---

# 14. Historic Towns

## Official

- Important Preservation District for Groups of Traditional Buildings

## Features

- Samurai Town
- Merchant Town
- Castle Town
- Post Town
- Canal Town

---

# 15. Cherry Blossoms

## Official

- Top 100 Cherry Blossom Spots

## Features

- Night Illumination
- Riverside Sakura
- Castle Sakura
- Mountain Sakura

---

# 16. Autumn Leaves

## Official

- Top 100 Autumn Leaves

## Features

- Gorge
- Temple
- Lake
- Ropeway
- Mountain

---

# 17. Night Views

## Official

- New Three Great Night Views
- Night View Heritage

## Features

- Observatory
- Mountain
- Skyline
- Bay View

---

# 18. Flower Parks

- Lavender
- Wisteria
- Nemophila
- Tulips
- Sunflowers
- Cosmos
- Hydrangea
- Roses

---

# 19. Forests

- Forest Therapy Base
- Primeval Forest
- National Forest
- UNESCO

---

# 20. National Parks

- National Park
- Quasi National Park
- Geopark
- UNESCO Biosphere Reserve

---

# 21. Hiking

- Famous Trail
- Pilgrimage
- Ropeway Access
- Beginner Friendly
- Advanced
- Multi-day Trek

---

# 22. Railways

- Scenic Railway
- Heritage Railway
- Steam Locomotive
- Luxury Train

---

# 23. Wildlife

- Deer
- Monkey
- Fox
- Crane
- Bear Habitat
- Aquarium
- Zoo
- Bird Sanctuary

---

# 24. Food Destinations

- Famous Ramen
- Seafood Market
- Matcha
- Wagyu
- Sake Brewery
- Street Food
- Fruit Region
- Tea Region

---

# 25. Festivals

- Top Festival
- Fire Festival
- Snow Festival
- Lantern Festival
- Fireworks Festival

---

# 26. UNESCO

Universal collection.

Categories:

- World Heritage
- Biosphere Reserve
- Global Geopark

---

# 27. National Cultural Designations

- National Treasure
- Important Cultural Property
- Historic Site
- Special Historic Site
- Place of Scenic Beauty
- Special Scenic Beauty
- Natural Monument
- Special Natural Monument

---

# 28. Record Holders

- Oldest
- Largest
- Smallest
- Tallest
- Longest
- Highest
- Deepest
- First in Japan
- Only One
- Guinness Record

---

# 29. Seasonal Collections

Spring

- Sakura
- Wisteria
- Tulips

Summer

- Hydrangea
- Lavender
- Beaches
- Fireworks

Autumn

- Momiji
- Ginkgo

Winter

- Snow
- Illumination
- Ice Festival

---

# 30. Family Collections

- Kids Friendly
- Aquarium
- Zoo
- Theme Park
- Science Museum
- Animal Park

---

# 31. Hidden Gems

- Local Favorite
- Hidden Gem
- Offbeat
- Underrated
- Remote

---

# Achievement System

Collections automatically become achievements.

Examples:

```
Visit all Original 12 Castles

Visit all Three Great Gardens

Visit all Top 100 Castles

Visit all UNESCO Sites

Visit all National Treasures

Visit all Top 100 Onsen

Visit all Top 100 Waterfalls

Visit all Famous Mountains

Visit all Top Sakura Spots
```

---

# Collection Pages

Every collection should automatically generate its own page.

Example:

```
/collections/original-12-castles

Overview

History

Interactive Map

Progress

12 destinations

Difficulty

Nearby suggestions
```

---

# Filters

Collections become filters.

Examples

```
Original 12

UNESCO

National Treasure

Top 100

Cherry Blossoms

Autumn

Power Spot

Night View

Historic Town

Free Observatory
```

---

# Badges

Each collection receives a distinctive visual badge with an icon and color theme. For example:

| Collection Type   | Example Style            |
| ----------------- | ------------------------ |
| UNESCO            | Blue globe               |
| National Treasure | Gold medal               |
| Top 100           | Purple ribbon            |
| Original          | Bronze shield            |
| Nature            | Green leaf               |
| Historic          | Brown castle             |
| Scenic            | Teal mountain            |
| Seasonal          | Pink blossom / Red maple |

Badges should be consistent across destination cards, detail pages, filters, and collection pages.

---

# Future Extensibility

The collection system should be data-driven rather than hardcoded. A destination should reference collection IDs, allowing new collections to be added without application code changes. This enables future expansion into museums, art islands, cycling routes, pilgrimages, UNESCO sites, and regional tourism campaigns while automatically supporting filters, badges, progress tracking, achievements, and collection landing pages.

---

## Recommended implementation order

### Phase 1 (Highest value)

- Original 12 Castles
- Top 100 Castles
- UNESCO
- National Treasure
- Top 100 Onsen
- Top 100 Cherry Blossom Spots
- Top 100 Autumn Leaves
- Three Great Gardens

### Phase 2

- Top 100 Waterfalls
- 100 Famous Mountains
- Historic Towns
- Night View Heritage
- Blue Flag Beaches
- National Parks

### Phase 3

- Bridges
- Towers
- Observation Decks
- Railways
- Food Destinations
- Festivals
- Hidden Gems
- Seasonal Collections

This approach turns TabiMap into more than a destination search tool—it becomes a collection-driven travel companion where users can discover, track, and complete some of Japan's most iconic and officially recognized travel experiences.
