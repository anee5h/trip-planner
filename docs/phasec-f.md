I think this is a good point to stop adding infrastructure and establish a long-term roadmap. Your collections system is mature enough that future work should mostly be **content + UX**.

---

# TabiMap Roadmap

## Phase C — Curated Collections Expansion (v1.5.x)

**Goal:** Grow the catalog through authoritative collections.

### Rules

- Add **one collection at a time**
- Maximum **50 destinations per release**
- Every destination must pass the pipeline before merging
- Every collection must have:

  - metadata
  - authority
  - verification source
  - review interval
  - documentation

### Naming Convention

Avoid numeric promises unless the collection is complete.

Instead of

```
Top 100 Castles
```

use

```
Japan's Top Castles
```

Description:

> Curated from the Japan Castle Foundation's 100 Famous Castles.

Same idea for:

- Japan's Top Onsen
- Japan's Top Historic Towns
- Japan's Top Cherry Blossom Spots

The title remains accurate even if the catalog grows over time.

---

## Phase D — My Journey (v1.6)

Rename

```
Prefectures
```

↓

```
My Journey
```

---

### Section 1

```
Travel Progress

184 destinations visited

18 / 47 prefectures

4 collections completed

15% catalog explored
```

---

### Section 2

```
Japan Map

Visited prefectures
```

No manual editing.

Entirely derived from:

```
Visited destinations

↓

Visited prefectures
```

Single source of truth.

---

### Section 3

```
Collections
```

Examples

```
UNESCO

6 / 25
```

```
Japan's Top Castles

9 / 30
```

```
Three Great Views

2 / 3
```

---

### Section 4

```
Achievements
```

Automatically unlocked.

Examples

```
🏯 Castle Explorer

🌏 UNESCO Explorer

🌸 Sakura Hunter

♨ Onsen Enthusiast

🗻 Mountain Explorer

🏞 National Park Explorer
```

No achievement table.

Everything derived.

---

## Phase E — Statistics

Examples

```
Most visited region

Most visited category

Average trip budget

Favorite travel style

Visited by season

Collection completion
```

Entirely generated.

---

## Phase F — Discovery

Improve destination discovery.

Examples

```
Related destinations

Nearby destinations

Complete this collection

Continue your journey

Recommended next trip
```

---

# Long-term architecture

```
Destination

↓

Visit

↓

Collection Progress

↓

Prefecture Progress

↓

Achievements

↓

Statistics
```

Everything derives from one event:

```
Visited destination
```

No duplicated state.

No manual synchronization.

---

# Source of Truth Document

I'd create a new document:

```
docs/reference/curated-collections.md
```

Purpose:

> Canonical reference for every curated collection supported by TabiMap.

---

## Structure

```markdown
# Curated Collections

## Principles

A collection must satisfy at least one:

- International authority
- Government designation
- Recognized national foundation/association
- Historical or cultural consensus

---

## Active Collections

### UNESCO Japan

Slug

unesco-japan

Display Name

UNESCO World Heritage Japan

Authority

International

Source

UNESCO World Heritage Centre

Status

Active

Target

All UNESCO sites in Japan

Current

25 / 25

---

### Japan's Top Castles

Slug

top-castles-japan

Display Name

Japan's Top Castles

Description

Curated from the Japan Castle Foundation's
100 Famous Castles.

Authority

Foundation

Source

Japan Castle Foundation

Target

Curated selection (~30)

Expansion Policy

Can expand over time.

---

### Japan's Top Onsen

Authority

Association

Source

Japan Onsen Association

Target

Curated selection (~30)

Expansion Policy

Grow gradually.
```

---

## Collection Categories

```text
International

Government

Foundation

Association

Historical Consensus
```

---

## Expansion Rules

```
Maximum 50 destinations
per release.

Every destination

✓ validated

✓ normalized

✓ documented

✓ collection membership verified
```

---

## Future Collection Candidates

Separate into two sections:

### Approved

- National Parks
- Quasi-National Parks
- UNESCO
- National Treasures
- Japan's Top Castles
- Japan's Top Onsen
- Historic Towns
- Great Night Views
- Three Great Gardens
- Three Great Views
- Three Great Waterfalls
- Three Great Buddhas
- Three Great Shrines
- Cherry Blossom Spots

### Backlog

Only collections that satisfy your editorial standards but aren't scheduled yet.

---

I also recommend one editorial principle that should guide every future collection:

> **Every collection should answer the question: "Why does this group of places belong together?"** If the answer is an identifiable authority (UNESCO, Agency for Cultural Affairs, Japan Castle Foundation) or a long-established national consensus (such as the Three Great Views), then it belongs in TabiMap. If it relies only on personal opinion or popularity, it doesn't become a curated collection. This principle will keep the catalog consistent as it grows.
