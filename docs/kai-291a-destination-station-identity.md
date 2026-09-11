# KAI-291A — destination → exact ODPT arrival-station identity (pilot)

Coverage and semantic audit for a deterministic **destination → exact ODPT
arrival-station** anchor registry over the **TokyoMetro + Toei** pilot.

**Status: audit complete, registry NOT production-ready.** The anchorability policy
below is *proposed* and awaiting a decision. No user-facing integration exists in
this slice, and none should be added until the policy is settled.

## 1. The rule

Two stages, in this order. Stage 0 decides whether geography may be used *at all*;
only then does the 500 m rule run.

```
STAGE 0 — anchorability (decided BEFORE any candidate count is interpreted)
  role === "hub"                                  -> not_anchorable_by_geography (hub_role)
  kind in {city, ward, town, village,
           district, historic_town}               -> not_anchorable_by_geography
                                                     (administrative_or_locality_kind)
  otherwise                                        -> anchorable, continue to stage 1

STAGE 1 — geographic identity (existing odptStationIdentity path, unchanged)
  exactly 1 exact pilot station within 500 m       -> geographic_unique_candidate
  0 stations within 500 m                          -> unavailable
  >1 stations within 500 m                         -> ambiguous
  destination carries no coordinates               -> coordinates_absent
```

Forbidden and structurally prevented: choosing the nearest of several candidates, the
first candidate, a popular station, a name-similar station, or a "main station"; and
widening the radius until something matches. Nothing here narrows ambiguity by
distance.

### Why stage 0 exists

The geographic resolver is **not** what was wrong. The quality gate found that the
*input coordinate semantics* were wrong: a ward's coordinate is a representative
point, not an arrival point. Stage 0 is about coordinate meaning, and it is applied
before the candidate count so that a hub's 1-in-tolerance station can never become an
anchor.

### `not_anchorable_by_geography` ≠ `not_anchorable`

Deliberately distinct. This status forbids **deriving** an anchor from an area's
representative coordinates; it does not declare the destination permanently
incapable. `meguro-city` must not become Naka-meguro merely because the ward's
representative point sits near it — but a future explicit product rule or curated
mapping could legitimately say *Meguro hub → Meguro Station* on a different evidence
path. The rule forbids geographic derivation, not the destination.

### Two implementation details that make this real

- **Only `coordinates` are passed to the resolver.** Passing a destination *name*
  would enable the name-based paths, and passing operator/railway would let a
  multi-candidate result be narrowed by operator. Neither is passed, which is what
  keeps `>1` at `ambiguous`.
- **The tolerance is the existing resolver default (500 m)**, not a new KAI-291A
  policy. The decision never uses a local constant — `resolveOdptStationIdentity` is
  always called without a tolerance option. A test pins the boundary (just inside
  499 m anchors, just outside 501 m does not), so the recorded `500` cannot drift.

**Station complexes are left ambiguous.** A physical station served by several
railways appears once per `(operator, railway)`, so several near-identical candidates
can fall inside one radius. They are not collapsed by similar name, similar
coordinates, or a shared label.

## 2. Coverage at 500 m (measured)

| Status | Destinations |
| --- | --- |
| Ambiguous (>1 station in tolerance) | 24 |
| Unavailable (0 in tolerance) | 886 |
| **Not anchorable by geography** | **211** |
| Coordinates absent | 0 |
| **Unique geographic anchors** | **9** |
| **Total evaluated** | **1130** |

The five statuses partition all 1130 destinations and sum exactly to it.

`destinationsWithoutCoordinates = 1`, reported **separately and deliberately
overlapping**: the anchorability gate runs first, so a coordinate-less hub is
classified `not_anchorable_by_geography`. Counting coordinate absence only through the
`coordinates_absent` status would report 0 and hide the gap. The two axes are
independent and neither masks the other.

Anchorable-only candidate distribution: `0 → 886`, `1 → 9`, `2 → 10`, `3 → 9`,
`4+ → 5`. Excluded destinations are kept out of this distribution, since their count
is observational only.

Anchors by operator: TokyoMetro **3**, Toei **6**.
Distance, destination → its unique anchor: min **142.6 m**, median **376.6 m**, max
**488.3 m** (<50 m: 0 · 50–100 m: 0 · 100–250 m: 2 · 250–500 m: 7).

**No target count was used.** Nothing was tuned to reach a number.

### The 211 exclusions

`role === "hub"` covers 164 records; the administrative/locality kinds cover 208;
their **union is 211** (161 satisfy both, 3 are hub with a non-administrative kind).

## 3. Review of every unique geographic candidate (all 15)

Every destination geography would resolve uniquely, **including the ones stage 0
excludes**, so nothing disappears from the audit. Selected by observed candidate
count, never by destination id.

| Destination | EN / JA | role | kind | ODPT station | d (m) | classification | proposed outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hamarikyu-gardens` | Hamarikyu Gardens / 浜離宮恩賜庭園 | poi | garden | `Toei.Oedo.Shiodome` | 488 | point/site-like | `geographic_unique_candidate` |
| `itabashi-city` | Itabashi City / 板橋区 | hub | ward | `Toei.Mita.ItabashiKuyakushomae` | 76 | administrative/regional | `not_anchorable_by_geography` |
| `koto-city` | Koto City / 江東区 | hub | ward | `TokyoMetro.Tozai.Toyocho` | 312 | administrative/regional | `not_anchorable_by_geography` |
| `meguro-city` | Meguro City / 目黒区 | hub | ward | `TokyoMetro.Hibiya.NakaMeguro` | 296 | administrative/regional | `not_anchorable_by_geography` |
| `nakano-city` | Nakano City / 中野区 | hub | ward | `TokyoMetro.Tozai.Nakano` | 246 | administrative/regional | `not_anchorable_by_geography` |
| `nerima-city` | Nerima City / 練馬区 | hub | ward | `Toei.Oedo.Nerima` | 342 | administrative/regional | `not_anchorable_by_geography` |
| `ryogoku-kokugikan-sumo-museum` | Ryogoku Kokugikan and Sumo Museum / 両国国技館・相撲博物館 | poi | museum | `Toei.Oedo.Ryogoku` | 377 | point/site-like | `geographic_unique_candidate` |
| `shinjuku-gyo-en` | Shinjuku Gyo-en / 新宿御苑 | poi | park | `TokyoMetro.Marunouchi.ShinjukuGyoemmae` | 379 | point/site-like | `geographic_unique_candidate` |
| `sugamo-jizo-dori` | Sugamo Jizo-dori / 巣鴨地蔵通り商店街 | poi | street | `Toei.Mita.Sugamo` | 247 | point/site-like | `geographic_unique_candidate` |
| `suginami-city` | Suginami City / 杉並区 | hub | ward | `TokyoMetro.Marunouchi.MinamiAsagaya` | 75 | administrative/regional | `not_anchorable_by_geography` |
| `sumida-hokusai-museum` | The Sumida Hokusai Museum / すみだ北斎美術館 | poi | museum | `Toei.Oedo.Ryogoku` | 282 | point/site-like | `geographic_unique_candidate` |
| `takanawa-gateway-minato` | Takanawa Gateway / 高輪ゲートウェイ | (none) | (none) | `Toei.Asakusa.Sengakuji` | 363 | requires_review | `hold_for_review` |
| `teamlab-borderless-azabudai` | teamLab Borderless / チームラボボーダレス（麻布台ヒルズ） | poi | museum | `TokyoMetro.Hibiya.Kamiyacho` | 424 | point/site-like | `geographic_unique_candidate` |
| `tokyo-metropolitan-government-building-shinjuku` | Tokyo Metropolitan Government Building Observatories / 東京都庁展望室 | (none) | (none) | `Toei.Oedo.Tochomae` | 143 | requires_review | `hold_for_review` |
| `ueno-park` | Ueno Park / 上野恩賜公園 | poi | park | `TokyoMetro.Ginza.Ueno` | 410 | point/site-like | `geographic_unique_candidate` |

**Proposed outcomes: 7 `geographic_unique_candidate` · 6
`not_anchorable_by_geography` · 2 `hold_for_review`.**

The six wards fall out of the **general** rule (`role == "hub"`, `kind == "ward"`) —
no destination id is special-cased, and a test proves it by re-running `meguro-city`
with point-like semantics and asserting it then anchors.

### The nine non-administrative candidates, reviewed individually

The question asked of each was not "is that probably the nearest station?" but "is
this a concrete visitor location for which a unique 500 m station anchor is
semantically meaningful?"

- **Keep (7)** — `ueno-park` → Ueno, `shinjuku-gyo-en` → Shinjuku-gyoemmae,
  `hamarikyu-gardens` → Shiodome, `sumida-hokusai-museum` → Ryogoku,
  `ryogoku-kokugikan-sumo-museum` → Ryogoku, `teamlab-borderless-azabudai` →
  Kamiyacho, `sugamo-jizo-dori` → Sugamo. Each is a specific building, park, garden
  or named street, and for `shinjuku-gyo-en` the anchored station is literally named
  for the destination.
- **Hold for review (2)** — `takanawa-gateway-minato` and
  `tokyo-metropolitan-government-building-shinjuku`. Both have `role == null` **and**
  `kind == null`: the catalogue has not classified them, so nothing in the record
  states what its coordinate denotes, and the audit cannot validate that semantics.
  `takanawa-gateway-minato` is additionally odd on its own terms — the destination
  *is* a station complex whose namesake station is outside the pilot operators, so
  geography resolves it to a *different* station (Sengakuji, 363 m).

The rule that flags them is general, not id-based: **a record with neither `role` nor
`kind` cannot be semantically validated**, so it is held rather than assumed good.
Two of the fifteen therefore do not count as trustworthy today. This is reported as
found rather than rounded up to nine — **7 trustworthy anchors, not 9**.

## 4. Does a non-administrative kind hide the same problem?

Short answer: **no such case was found**, with one caveat about unclassified records.

`role × kind` cells that produced a unique geographic candidate:

| role | kind | n | candidate counts (0/1/2/3/4+) | unique cand. | anchorable | not anchorable |
| --- | --- | --- | --- | --- | --- | --- |
| poi | museum | 112 | 104/3/2/1/2 | 3 | 112 | 0 |
| (none) | (none) | 49 | 36/2/5/5/1 | 2 | 49 | 0 |
| poi | park | 32 | 30/2/0/0/0 | 2 | 32 | 0 |
| hub | ward | 23 | 6/6/3/3/5 | 6 | 0 | 23 |
| poi | garden | 21 | 19/1/1/0/0 | 1 | 21 | 0 |
| poi | street | 9 | 7/1/1/0/0 | 1 | 9 | 0 |

The large non-administrative cells produced **zero** unique candidates, so they offer
no evidence of hidden area semantics — and no evidence against it, since they are
simply outside the pilot network. Every record has `0` candidates in
`standalone/nature` 125, `standalone/castle` 59, `standalone/(none)` 52,
`poi/shrine` 27, `destination/museum` 26, `standalone/onsen` 20, `destination/temple`
19 and `destination/(none)` 18. The one exception is `poi/temple`: 35 of 36 records
have `0` candidates and **1 has 3** (ambiguous, so it anchors nothing under the
unique-candidate rule either).

So the excluded kinds are the only ones that *demonstrated* the area problem. The
remaining non-administrative kinds are **not** auto-excluded, per instruction: they
have physical extent but can be concrete visitable places, and the evidence to
restrict them does not exist yet.

**Caveat worth a decision:** 151 records have `kind == null`. Of those, 49 are
unclassified in both dimensions (the `(none)/(none)` cell, which produced the 2 held
anchors) and **102 carry a `role` but no `kind`** — partially classified. None of the
102 currently produces an anchor, so today's count is unaffected, but on this
treatment they would also be anchorable. If they should instead be held, that is a
one-line change to the review flag; it does not change the 9.

The full 103-cell matrix is in `qa/kai-291/destination-station-anchors.md` (and the
JSON artifact), including per-cell coordinate coverage and candidate distributions.

## 5. Validation cohort

The 29 records carrying stronger access evidence
(`verified_required_access`, `verified_walking`):

| Verdict | Records |
| --- | --- |
| `agreement` | 1 |
| `contradiction` | **0** |
| `comparable_no_station_named` | 0 |
| `not_comparable_anchor_absent` | 28 |

Zero contradictions. This cohort is a weak validator, though: 28 of 29 lie outside the
TokyoMetro + Toei pilot area, so they are simply not comparable. Geography was not
overridden by this evidence in any case.

**`localTransport` availability does not decide geographic anchorability.** Two
records with identical semantics and opposite evidence states classify identically,
and a test asserts it. The relevant axes are destination semantics and coordinate
meaning.

## 6. Proposed production policy

The smallest deterministic rule the evidence supports:

```
if an explicit/canonical station anchor exists:
    use the stronger evidence path      (geographic derivation is not used)
else if not geographically anchorable:
    role === "hub"                      -> not_anchorable_by_geography (hub_role)
    kind in {city, ward, town,
             village, district,
             historic_town}             -> not_anchorable_by_geography
                                           (administrative_or_locality_kind)
else if the record is semantically unclassified (role and kind both absent):
    hold_for_review
else:
    fixed 500 m rule
    0 candidates                        -> unavailable
    1 exact candidate                   -> geographic_unique_candidate
    >1                                  -> ambiguous
```

No closest-wins. Station complexes are never collapsed. Nothing widens the radius.
The 500 m tolerance is not lowered and not tuned.

## 7. Not done in this slice

No user-facing integration, no departure-time control, no origin-side resolution, no
transfers, no walking or feeder legs, no fares, no recommendation/ranking/feasibility
or budget change, no production caller, and no change to `src/` runtime behaviour.
The artifact records `networkCalls = 0` and `providerCalls = 0`; the classification
reuses the already-committed candidate evidence and made no live ODPT request.

## 8. Inputs and regeneration

- `qa/kai-291/pilot-station-index.json` — reviewed static evidence, 335 stations
  (186 TokyoMetro + 149 Toei, all coordinate-bearing). A normalized, credential-free
  index (`sameAs`, `operator`, `railway`, `stationCode`, `coordinates`, localized
  names) — not a raw provider dump. Retrieved once through
  `https://meguruto.app/api/odpt` with operator-narrowed `station` queries.
- `src/shared/data/destinations-index.json` — the catalogue.

The registry is a committed static artifact; normal app use never calls the provider
to learn a destination anchor.

```
npx tsx scripts/audit/kai-291a-destination-station-identity.ts
```

Deterministic and environment independent: identical inputs produce identical bytes
locally and in CI, with or without `GITHUB_SHA`.
