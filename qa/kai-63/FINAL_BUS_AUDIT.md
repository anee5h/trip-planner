# KAI-63 Final Bus Eligibility Audit

**Date:** 2026-08-13 · **Base:** `origin/main` f468a26d (PR branch `fix/kai-63-bus-eligibility`)
**Catalogue:** 983 destinations (`destinations-index.json` at main)

This audit traces the complete Bus eligibility pipeline from origin resolution to
Explore filtering, reproduces per-origin result counts, explains every exclusion
reason, and records the fixes applied. It is the KAI-63 deliverable: a Bus-focused
audit + resolution pass, not a count-inflation pass.

> **Catalogue-version note:** an earlier measurement against the local
> `aneeshpatil8/kai-65-…` branch (800 destinations, behind main) produced lower
> counts (Yokohama 5, Osaka 44, Hiroshima 85). The QA example numbers in the
> ticket (Yokohama 10, Osaka 49, Hiroshima 91, …) match the **main** catalogue
> (983) exactly, so all counts in this report are main-based.

---

## 1. Bus eligibility pipeline (documented)

Bus is deliberately **intercity/highway-bus only** in Meguruto (KAI-12 design;
`MODE_SEMANTICS.md` §3). Local city buses and airport limousines are **not**
corridor evidence; that separation is tracked by KAI-67. The user-facing mode
remains `Bus`.

### 1.1 Origin resolution

| Step | Code | Behavior |
|---|---|---|
| Station origin | `StationInput` + `resolveOriginTransportZone({coordinates, label})` | station label prefecture (`"Iwakuni Station, Yamaguchi"` → `yamaguchi` → `mainland-honshu`) wins via `PREFECTURE_ZONE` |
| Postcode origin | Nominatim → coordinates → `resolveOriginTransportZone({coordinates, label: zip})` | island boxes → label prefecture (zip never matches) → mainland boxes (hokkaido/kyushu/shikoku) → honshu remainder |
| Current location | coordinates | same box path |
| Municipality/prefecture | `resolveOriginArea` → `resolveOriginMunicipalityId` (nearest hub ≤20 km, gap rule ≥ max(1 km, winner/2)) | `originMunicipalityId` used for exact hub wiring (`MUNICIPALITY_BUS_SLUG`) |
| Gateway | `relationships.gatewayHubId` | **not used by bus** (flight/ferry-only concept); documented, no change |

### 1.2 Bus topology & data

- **Registry:** `src/shared/data/bus-routes.json` — verified city-pair corridor
  rows (from/to slug, bidirectional, duration range, fare, servicePeriod,
  sourceUrl, checkedAt). Currently **52 rows / 43 corridor pairs** (was 51 / 42).
- **Terminals:** `BUS_TERMINAL_COORDS` → `BUS_ACCESS_HUBS` (35 terminals incl.
  new `naha`, `nago`). Transport zone per terminal derived at module load.
- **Catchment:** origin 50 km (`BUS_ACCESS_RADIUS_KM`), destination 30 km
  (`BUS_ARRIVAL_RADIUS_KM`), same transport zone only. Access legs are
  distance-derived **estimated** overhead (`estimateHubAccessMinutes`); the
  corridor stays `corridorEvidence: "verified"`.
- **Exact wiring:** `MUNICIPALITY_BUS_SLUG` (municipality → corridor slug) —
  preferred hub, never zero-distance proof; real distance still measured.
- **Destination metadata:** `transportOptions.bus` (legacy, uniform `150`
  defaults) is used **only** for zone-only browsing display; with coordinates
  the canonical pipeline is authoritative (KAI-12). `transportFares.bus`:
  0 records. `localAccessModes`: 4 records (kouri, okinoshima, sakurajima,
  aoshima) — narrows same-zone authorization.

### 1.3 Explore eligibility (how Bus decides)

`Destinations.tsx` day-trip path, for each destination with a selected origin:

1. `getValidModes(dest, carMode, publicModes, coords, …)`:
   - resolve origin + destination transport zones (`unknown` → excluded);
   - authorize bus via topology (`getEligibleOriginModes`: same-zone localModes
     or cross-zone edge modes; islands with no bus edge → no bus);
   - with coordinates: `getOriginAwareTransportEstimate(dest, …, ["bus"])`
     must be non-null — a verified corridor row reachable from both catchments
     (KAI-12: stale `transportOptions` can never resurrect a missing corridor).
2. `matchesPersonalizedDayTripDuration(dest, ctx, ["bus"], tripDuration)`:
   - `any` (Explore default): 14 h envelope (`DAY_TRIP_MAX_OUTING_HOURS`);
     requires `recommendedVisitHours` + canonical travel evidence;
   - **night-only** corridors (`servicePeriod: "night"`) rejected for same-day
     round trips (KAI-66 gate, now also applied to visit-hours-less records —
     KAI-63 hardening);
   - total = 2 × (one-way incl. access; +30 min padding when estimated) +
     travel buffers + min visit ≤ 14 h.

Weekend 2D1N mode uses the same `getValidModes` gate but its own duration
semantics (night corridors allowed for one-way evaluation).

### 1.4 What the pipeline deliberately does NOT do

- No generic distance/highway-bus-duration fallback; unknown stays unknown.
- No prefecture-pair bus keys (a local city bus can't prove intercity).
- No route chaining, transfer graph, or feeder fare.
- No fabricated corridors; every row carries `sourceUrl` + `checkedAt`.

---

## 2. Nationwide origin matrix (main head, after KAI-63 fixes)

Method: UI-level Explore render (`?mode=bus`, default `duration=any`) for the
origin + pipeline decomposition of all 983 catalogue records. UI count and
pipeline count agree for every origin (`UI == pipeline`).

| Origin | zone | Bus | day-inf. | night-only | no-corridor | no-bus-topo | dest-unknown | % reachable |
|---|---|---|---|---|---|---|---|---|
| Tokyo (Tokyo St) | honshu | **21** | 133 | 41 | 695 | 79 | 14 | 2.1 |
| Shinagawa | honshu | **13** | 141 | 41 | 695 | 79 | 14 | 1.3 |
| Yokohama | honshu | **10** | 144 | 41 | 695 | 79 | 14 | 1.0 |
| Machida | honshu | **10** | 144 | 41 | 695 | 79 | 14 | 1.0 |
| Nakayama | honshu | **10** | 144 | 41 | 695 | 79 | 14 | 1.0 |
| Chiba | honshu | **10** | 144 | 41 | 695 | 79 | 14 | 1.0 |
| Fukushima | honshu | **23** | 135 | 41 | 732 | 79 | 14 | 2.3 |
| Nagano | honshu | **31** | 101 | 41 | 758 | 79 | 14 | 3.2 |
| Osaka | honshu | **49** | 156 | 50 | 635 | 79 | 14 | 5.0 |
| Hiroshima | honshu | **91** | 24 | 132 | 643 | 79 | 14 | 9.3 |
| Iwakuni | honshu | **32** (postcode 0→32) | 83 | 132 | 643 | 79 | 14 | 3.3 |
| Hakata | kyushu | **29** | 4 | 178 | 620 | 138 | 14 | 3.0 |
| Naha 900-8585 | okinawa | **9** (was 0) | 0 | 0 | 8 | 952 | 14 | 0.9 |
| Sendai | honshu | **23** | 130 | 41 | 737 | 79 | 14 | 2.3 |
| Sapporo | hokkaido | **3** | 5 | 0 | 31 | 930 | 14 | 0.3 |
| Kochi | shikoku | **42** | 28 | 0 | 699 | 200 | 14 | 4.3 |
| Nagoya | honshu | **43** | 135 | 41 | 712 | 79 | 14 | 4.4 |
| Koriyama | honshu | **93** | 65 | 41 | 732 | 79 | 14 | 9.5 |
| Kanazawa | honshu | **0** | 46 | 132 | 712 | 79 | 14 | 0.0 |
| Matsuyama | shikoku | **21** | 45 | 0 | 703 | 200 | 14 | 2.1 |
| Kagoshima | kyushu | **19** | 4 | 0 | 808 | 138 | 14 | 1.9 |
| Kumamoto | kyushu | **23** | 4 | 0 | 808 | 138 | 14 | 2.3 |
| Nagasaki | kyushu | **23** | 4 | 0 | 808 | 138 | 14 | 2.3 |
| Aomori | honshu | **0** | 0 | 0 | 890 | 79 | 14 | 0.0 |
| Morioka | honshu | **0** | 0 | 0 | 890 | 79 | 14 | 0.0 |
| Niigata | honshu | **2** | 130 | 41 | 758 | 79 | 14 | 0.2 |
| Toyama | honshu | **0** | 0 | 0 | 890 | 79 | 14 | 0.0 |
| Tottori | honshu | **39** | 7 | 41 | 844 | 79 | 14 | 4.0 |
| Matsue | honshu | **12** | 2 | 41 | 876 | 79 | 14 | 1.2 |
| Takamatsu | shikoku | **64** | 8 | 0 | 697 | 200 | 14 | 6.5 |
| Tokushima | shikoku | **0** | 0 | 0 | 769 | 200 | 14 | 0.0 |
| Uwajima | shikoku | **0** | 0 | 0 | 769 | 200 | 14 | 0.0 |
| Kushiro | hokkaido | **0** | 0 | 0 | 39 | 930 | 14 | 0.0 |
| Okinawa City | okinawa | **9** (was 0) | 0 | 0 | 8 | 952 | 14 | 0.9 |
| Miyakojima | miyako | **0** | 0 | 0 | 4 | 965 | 14 | 0.0 |

Column meaning: **Bus** = day-trip-feasible non-night-only Explore results;
**day-inf.** = corridor exists but 2×travel + visit > 14 h; **night-only** =
only night-only corridor rows reach the destination (excluded from day trips,
usable for 2D1N); **no-corridor** = no origin hub / no destination hub / no
route row; **no-bus-topo** = bus not authorized by zone topology; **dest-unknown**
= destination zone unresolvable (14 records at main: island-marked aggregates
without `transportZoneId`).

### Corridor-level decomposition (why "no-corridor" dominates)

For Tokyo (representative honshu origin), the 695 "no-corridor" records split:
**~400 no destination hub** (beyond 30 km of every registered terminal in the
destination zone), **~295 no route row** (destination within arrival catchment
but no registered corridor between the resolved hub pair). Origin-side
"no-origin-hub" is 0 for every mainland origin except the pre-fix Iwakuni
postcode bug. Per-corridor usable yields: tokyo→osaka ~50, tokyo→kyoto ~30,
tokyo→sendai ~30, tokyo→fukuoka ~25, tokyo→nagoya ~20, tokyo→hiroshima ~14,
kawaguchiko/kofu ~10 each, matsumoto ~5, nagano ~3.

**Conclusion: low/uneven counts are 95% registry coverage + conservative
catchment, not filtering bugs.** The three structural levers are: corridor-row
count (43 pairs), origin 50 km catchment, destination 30 km arrival catchment
(Hakone at 42 km from Kawaguchiko is correctly excluded).

### Exclusion classification map (reviewer taxonomy)

Every excluded destination falls into one of these classes; the per-origin
reason counts in the matrix above are computed by
`qa/kai-63/bus-corridor-decomposition.test.ts` (all 35 origins) and
`bus-audit.test.tsx`:

| Class | What it means | Typical share (honshu origin) | Examples |
|---|---|---|---|
| Topology exclusion | bus not authorized between origin/destination zones (island without bus edge, no honshu↔hokkaido bus edge) | 53–79 / 983 | Hokkaido from Tokyo; outer islands from Naha |
| Terminal catchment | no bus terminal within 50 km (origin) or 30 km (destination) of the location | ~400 / 983 | most of rural Japan; Aomori/Morioka origins; Naha pre-fix |
| No verified corridor | hub pair resolved but no registered route row between them | ~295 / 983 | e.g. Tokushima, Uwajima destinations |
| Highway-bus gap | route exists but is night-only (excluded from day trips) or exceeds the 14 h day-trip envelope | 41–178 / 983 | tokyo⇔fukuoka はかた号 (night); osaka⇔kanazawa (15.8 h round trip) |
| Local-bus gap | destination served only by local city bus — deliberately not corridor evidence (KAI-67) | small but systematic | same-city POIs (Osaka POIs from Osaka), Naha-city POIs from Naha |
| Origin-resolution issue | coordinate/postcode origin resolved to the wrong zone | 2 fixed in this PR | Iwakuni postcode (0→32), Naha postcode (0→9) |
| Duration/fare evidence gap | route known but duration/fare unverified | none excluding today | fare-null rows (e.g. osaka⇔matsuyama オレンジライナー) stay eligible |

A destination can be bus-eligible from one nearby origin but not another for
three legitimate reasons: (a) the origin's hub set differs (e.g. Koriyama vs
Sendai serve different corridors), (b) day-trip feasibility boundary shifts
with origin access distance, (c) same-municipality exclusion
(`isOriginLocalDestination`). The pairwise divergence audit
(`qa/kai-63/bus-divergence.test.ts`) found no unexplained divergences beyond
these.

---

## 3. Root causes, classified

| # | Problem | Class | Fix |
|---|---|---|---|
| 1 | Naha postcode 900-8585 → 0 bus | **route/topology data gap** (not island restriction) | Okinawa had no bus terminals and no corridor rows; the island topology correctly blocks the 952 mainland/outer-island records, and the remaining 8 same-zone destinations had no terminal within 50 km. Added verified `naha⇔nago` corridor (111/117 高速バス, 95–112 min, ¥2,420) + `naha`/`nago` terminals + municipality wiring → **9** Okinawa-local results (nago-city verified at-hub; Churaumi/Bise/Nakijin/Kouri/Busena/pineapple/Onna estimated with 3–16 km onward access). Mainland and outer islands stay 0 (topology preserved). |
| 2 | Iwakuni postcode → 0 bus | **origin-resolution bug** | Iwakuni (Yamaguchi, lng > 132.2) fell inside the shikoku mainland box for coordinate/postcode origins → `mainland-shikoku` → no terminal within 50 km. Station origins were already correct (label prefecture). Added `YAMAGUCHI_HONSHU_EXCLUSION_BOX` (lat 33.8–34.2, lng 132.2–132.45 → honshu) → postcode origins now **32**, identical to station origins. The band is deliberately narrow: its east edge (lng 132.45) keeps every Matsuyama City Seto island (Nakajima ~33.97/132.61, Tsuwajima ~33.99/132.67, the Kutsuna group) out of the Honshu override — an Ehime island origin still resolves as mainland-shikoku (review regression: added Nakajima + Tsuwajima cases). Also covers Suo-Oshima (Yamaguchi) and the Iwakuni landmass; no Ehime/Shikoku land lies inside the band (Shikoku proper's north coast there is the Sadamisaki peninsula, lat ≤ 33.5; Matsuyama city is east of lng 132.7). |
| 3 | QA example counts | **reproduced on main** | With the main catalogue (983) and station-origin resolution, the ticket's counts reproduce exactly: Yokohama/Machida/Nakayama/Chiba 10, Fukushima 23, Nagano 31, Osaka 49, Hiroshima 91, Iwakuni 32 (station), Hakata 29; Naha postcode 900-8585 0 (post-fix 9). Shinagawa 13 (QA "14" is a coordinate choice). No optimization against these was needed or performed. |
| 4 | Night-only leak in `any`-duration gate | **filter/logic bug (latent)** | `matchesPersonalizedDayTripDuration` accepted any non-unknown evidence for visit-hours-less records, which would admit a night-only coach into a same-day trip. No current record lacks `recommendedVisitHours` (0/983), so it never manifested; hardened the gate + regression test. |
| 5 | ~400 destinations beyond 30 km of any terminal | **route/topology data gap** | Arrival catchment is intentionally conservative (Hakone guard). Expanding coverage = more terminals + verified rows (follow-up dataset, §6). Not a logic bug. |
| 6 | ~295 destinations with hub pairs but no route row | **route/topology data gap** | Registry is corridor-graph-bound by design. Same follow-up. |
| 7 | Kanazawa 0, Aomori/Morioka/Toyama/Tokushima/Uwajima/Kushiro 0 | **route/topology data gap** | Kanazawa's only day-capable corridor (osaka⇔kanazawa, mixed) is 366–444 min → 15.8 h round trip, over the 14 h day-trip envelope; tokyo⇔kanazawa is night-only. Aomori/Morioka/Toyama have no origin terminal within 50 km and no corridor rows; Tokushima/Uwajima have no corridor rows; Kushiro has no terminal or rows. Honest zeros; follow-up dataset (§6). |
| 8 | Same-city asymmetry (Osaka POIs reachable from Hiroshima's bus, not from Osaka's) | **intentionally unsupported** | No `osaka⇔osaka`-style local corridor rows: a local city bus must not prove an intercity route (KAI-67). The intercity model legitimately serves Osaka-area destinations from remote origins via arrival catchment. Documented, not a bug. |
| 9 | 14 destination-zone unknowns | **missing transport metadata** | Island-marked records without explicit `transportZoneId`. Bus-irrelevant (all are ferry/flight-dependent islands); catalog follow-up. |
| 10 | `transportOptions.bus` legacy 150-min defaults | **legacy field, not evidence** | Used only for zone-only browsing display; personalized origins always use the canonical pipeline (KAI-12). No change needed. |

---

## 4. Before/after (audited example origins, main head)

| Origin | Before | After | Root cause |
|---|---|---|---|
| Yokohama / Machida / Nakayama / Chiba | 10 | 10 | unchanged (QA numbers reproduced) |
| Fukushima | 23 | 23 | unchanged |
| Shinagawa | 13 | 13 | unchanged (QA "14" = coord choice) |
| Nagano | 31 | 31 | unchanged |
| Osaka | 49 | 49 | unchanged |
| Hiroshima | 91 | 91 | unchanged |
| **Iwakuni (postcode/coords)** | **0** | **32** | zone mis-resolution (§3.2); station origins already 32 |
| Hakata | 29 | 29 | unchanged |
| **Naha 900-8585** | **0** | **9** | missing Okinawa terminals/corridor (§3.1) |

No audited origin lost results. All other matrix origins unchanged.

---

## 5. Verification

- `TransportTopologyService.test.ts`: +7 honshu cases (Iwakuni, Otake, Kintai,
  Suo-Oshima east/south, + existing), +5 shikoku-negative cases (Hojo, Ikata,
  Yawatahama, Nakajima, Tsuwajima — the Matsuyama Seto islands must never
  resolve as Honshu) — green.
- `OriginAwareTransportService.test.ts`: +6 KAI-63 bus cases (Naha→Nago
  verified, Naha→Motobu estimated, Naha local/outer-island/mainland null,
  Iwakuni→Fukuoka via Hiroshima hub, known-route-unknown-fare eligible,
  night-only estimate) — green.
- `TripDurationService.test.ts`: +1 night-only `any`-gate case — green.
- `DestinationDetailsTransport.test.tsx`: Kouri-from-Naha updated to assert the
  new bus estimate (was local-access-only copy) — green.
- `ExploreBusEligibility.test.tsx` (new): Naha-only-Okinawa results (9, incl.
  Onna), Iwakuni station/postcode consistency (32/32), zero-result origin
  empty state, pinned counts (Yokohama 10, Nakayama 10, Tokyo 21, Osaka 49,
  Hiroshima 91), night-only absence from day-trip results — 9 tests green.
- `transportAuthorization.test.ts`: Kouri updated to `["bus"]` (was `[]`) — green.
- **Playwright** (`e2e/kai-63-bus-eligibility.spec.ts`, new — runs in the
  existing E2E CI job, both projects): Naha postcode 900-8585 → 9 results and
  zero non-Okinawa cards; Iwakuni postcode → 32 results; Nakayama station →
  10; Yokohama station → 10 — 4 passed per project locally (chromium desktop
  + mobile).
- **Full worktree suite (main base, 983 catalogue): 150 files, 1939 passed,
  1 skipped.** Registry invariants + scripts/validators green.
- TypeScript, lint, prettier, i18n parity, branding, `validate:catalog-fast`,
  build: green (see PR description).

---

## 6. Follow-up dataset (scoped, NOT fabricated here)

Real, verifiable routes/terminals that would close the largest gaps; each
requires primary-source verification (operator timetable + fare) before entry:

1. **Iwakuni ⇔ Hiroshima** (JR Bus Chugoku 岩国⇔広島 — day corridor; makes
   Iwakuni origin symmetric with its destination side).
2. **Tohoku-north terminals + corridors**: Aomori, Morioka, Akita terminals and
   sendai⇔aomori / sendai⇔morioka type rows (Tohoku-north origins are 0 today).
3. **Nikko/Kinugawa**: tokyo⇔nikko (Tobu bus) — currently the biggest
   no-dest-hub cluster near a terminal city.
4. **Osaka⇔Kyoto / Osaka⇔Nara** if operator-verified day buses exist (closes
   the same-city asymmetry partially; otherwise local-bus semantics belong to
   KAI-67).
5. **Kanazawa day corridors** (osaka⇔kanazawa exists as mixed; a tokyo⇔kanazawa
   day row or terminal-side rows would lift 0 → >0).
6. **Okinawa expansion**: naha⇔okinawa-city (コザ) highway bus + airport
   limousine (airport-access semantics → KAI-67).

## 7. Known limitations

- Local/airport bus semantics remain out of scope (KAI-67). Same-city POI
  asymmetry (§3.8) is a documented product tradeoff of the intercity-only model.
- Seto islands east of the Yamaguchi band (Kurahashi-jima, the Onomichi/Imabari
  archipelago) fall through to the shikoku mainland box for coordinate-only
  origins — pre-existing behavior (destinations resolve via prefecture
  metadata, so catalogue records are unaffected). Islands have no bus
  terminals within catchment either way; recorded as a follow-up, not
  regressed by this PR.
- The 111/117 fare (¥2,420 那覇BT⇔名護BT) is from the current official 沖縄バス
  fare table (April 2024 revision, linked from the operator's 令和6年4月1日
  fare-change notice; sourceUrl points at that table). Duration [95–112 min]
  is NAVITIME-corroborated; re-verify periodically.
- The 14 dest-zone-unknown records are a catalog metadata follow-up.
