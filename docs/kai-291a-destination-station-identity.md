# KAI-291A — destination → exact ODPT arrival-station identity (pilot)

Coverage audit for a deterministic **destination → exact ODPT arrival-station** anchor
registry over the **TokyoMetro + Toei** pilot.

**Status: audit complete, registry NOT production-ready.** One systematic semantic
defect was found (see *Quality gate* below) and is left open pending a policy
decision. No user-facing integration exists in this slice, and none should be added
until that decision is made.

## What an anchor means here — and what it does not

The evidence path on every anchor is `geographic_unique_candidate`. It means **only**
that, under Meguruto's fixed geographic anchor policy, exactly one exact pilot ODPT
station fell inside the fixed tolerance for that destination.

It is **not** a curated access mapping. It does **not** claim the destination
recommends that station, and it carries **no** claim about station → POI access,
walking, transfers, waiting, or total travel time. The evidence path is deliberately
not named `verified_access_station`, `official_arrival_station` or
`recommended_station`, because geography proves none of those things.

## The rule

Reusing the existing `odptStationIdentity` geographic path — no new matching
machinery:

```
exactly 1 exact pilot ODPT station inside the tolerance  -> anchored
0 stations inside the tolerance                          -> unavailable
>1 stations inside the tolerance                         -> ambiguous
destination carries no coordinates                       -> coordinates_absent
```

Authorized: a **unique-within-a-bounded-radius** identity. Forbidden, and structurally
prevented: choosing the nearest of several candidates, the first candidate, a popular
station, a name-similar station, or a "main station", and widening the radius until
something matches.

Two implementation details are what make those guarantees real rather than asserted:

- **Only `coordinates` are passed to the resolver.** Passing a destination *name*
  would enable the name-based paths, and passing operator/railway would let a
  multi-candidate result be narrowed by operator. Neither is passed, which is exactly
  what keeps `>1` at `ambiguous`.
- **The tolerance is the existing resolver default (500 m)**, not a new KAI-291A
  policy. The decision never uses a local constant —
  `resolveOdptStationIdentity` is always called without a tolerance option so it
  applies its own default. A test locks the boundary (just inside 499 m anchors, just
  outside 501 m does not), so the recorded `500` cannot drift from the real policy.

Above the geographic layer, no change: `odptStationIdentity` already fails closed
`exact` → `deterministically_resolvable` → `ambiguous` → `unavailable`.

**Station complexes are left ambiguous.** A physical station served by several
railways appears once per `(operator, railway)` in the ODPT station list, so several
near-identical candidates can fall inside one radius. They are **not** collapsed by
similar name, similar coordinates, or a shared label. That preserves the ambiguity
rather than resolving it by convention, and it is the main reason the anchor yield is
low (see below).

## Semantic labelling

Short, stable, and distinct from the primitive's own vocabulary:

- `geographic_unique_candidate` — one exact station inside tolerance.
- `ambiguous` — several; no station selected.
- `unavailable` — none inside tolerance. **Not** a claim that none exists.
- `coordinates_absent` — the rule could not run.

Ward/city/administrative-area records anchor to `kind: ward`-style destinations and
**do not** inherit any stronger evidence path from their status. Nothing here
overrides `odptStationIdentity`; geographic anchors are additive and labelled.

## Inputs

- `qa/kai-291/pilot-station-index.json` — **reviewed static evidence**, 335 stations
  (186 TokyoMetro + 149 Toei, all coordinate-bearing). A normalized, credential-free
  index (`sameAs`, `operator`, `railway`, `stationCode`, `coordinates`, localized
  names) — not a raw provider dump. Retrieved once through
  `https://meguruto.app/api/odpt` using operator-narrowed `station` queries; the
  retrieval timestamps are recorded in the artifact.
- `src/shared/data/destinations-index.json` — the catalogue.

The registry is a **committed static artifact**. Normal app use never calls the
provider to learn a destination anchor. Regeneration is offline and deterministic:
no network, no clock, no ambient environment variable.

## Coverage at 500 m (measured)

| Metric | Value |
| --- | --- |
| Destinations evaluated | **1130** |
| Unique geographic anchors | **15** |
| Ambiguous (>1 station in tolerance) | **41** |
| Unavailable (0 in tolerance) | **1073** |
| Coordinates absent | **1** |

Candidate-count distribution (stations within tolerance): `0 → 1073`, `1 → 15`,
`2 → 14`, `3 → 15`, `4+ → 12`.

Anchors by operator: TokyoMetro **7**, Toei **8**.

Distance, destination → its unique anchor: min **74.7 m**, median **312.5 m**, max
**488.3 m** (<50 m: **0** · 50–100 m: **2** · 100–250 m: **3** · 250–500 m: **10**).

**No target count was used.** 15 is what the authorized rule produced on the current
catalogue; it was not tuned up or down.

### Validation cohort

The 29 records that already carry stronger local-access evidence
(`verified_required_access`, `verified_walking`) were compared against the geographic
result:

| Verdict | Records |
| --- | --- |
| `agrees` | 1 |
| `names_other_station` (contradiction) | **0** |
| `anchor_unavailable` (not comparable) | 23 |
| `anchor_ambiguous` (not comparable) | 5 |

Zero contradictions, but this cohort is a weak validator: 28 of 29 records lie outside
the TokyoMetro + Toei pilot area, so they are simply not comparable. Geography was not
overridden by this evidence in any case.

## Quality gate — STOP condition found

The cohort comparison did **not** expose the defect; inspection of the 15 anchors did.

**6 of the 15 anchors (40%) are administrative-area records** (`kind: "ward"`,
`role: "hub"`) anchored to the single station nearest their representative coordinate:

| Destination | Anchored to | Distance |
| --- | --- | --- |
| `itabashi-city` | `odpt.Station:Toei.Mita.ItabashiKuyakushomae` | 76 m |
| `koto-city` | `odpt.Station:TokyoMetro.Tozai.Toyocho` | 312 m |
| `meguro-city` | `odpt.Station:TokyoMetro.Hibiya.NakaMeguro` | 296 m |
| `nakano-city` | `odpt.Station:TokyoMetro.Tozai.Nakano` | 246 m |
| `nerima-city` | `odpt.Station:Toei.Oedo.Nerima` | 342 m |
| `suginami-city` | `odpt.Station:TokyoMetro.Marunouchi.MinamiAsagaya` | 75 m |

A ward is an **area**, not a point. Its coordinate is a representative point, not a
destination entrance, and a ward is served by dozens of stations. Resolving
"Meguro City" to Naka-meguro station asserts an arrival station that the record does
not support — the municipality-representative-point problem, arriving silently through
an otherwise-correct geographic rule.

This is not merely theoretical for the pilot: these six records are the *only*
reason the anchor count is 15 rather than 9. Wiring them into any consumer would
overstate coverage with anchors that are not trustworthy.

The nine point-style anchors look sound and are the shape KAI-291A wants, e.g.
`ryogoku-kokugikan-sumo-museum → Ryogoku`, `hamarikyu-gardens → Shiodome`,
`tokyo-metropolitan-government-building-shinjuku → Tochomae`,
`teamlab-borderless-azabudai → Kamiyacho`, `ueno-park → Ueno`,
`sugamo-jizo-dori → Sugamo`.

Note that `localTransport.kind === "unavailable"` does **not** discriminate the bad
anchors from the good ones: 978 catalogue records are unavailable, including 8 of the
9 sound point anchors. The discriminator is destination *semantics*
(`kind`/`role`: is this a point or an area?), not the access-evidence state.

**Per the KAI-291A quality gate, the audit stops here.** The registry is committed as
audit evidence only, pending a decision on whether area-kind records are anchorable.

## Not done in this slice

No user-facing integration, no departure-time control, no origin-side resolution, no
transfers, no walking or feeder legs, no fares, no recommendation/ranking/feasibility
or budget change, no production caller, and no change to `src/` runtime behaviour.
`networkCalls` and `providerCalls` in the artifact are `0` by construction.

## Regenerating

```
npx tsx scripts/audit/kai-291a-destination-station-identity.ts
```

Deterministic: identical inputs produce identical bytes, locally and in CI.
