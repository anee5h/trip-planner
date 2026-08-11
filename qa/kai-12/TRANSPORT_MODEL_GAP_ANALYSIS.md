# Meguruto — Transport Model Gap Analysis (KAI-12 Phase 10)

Research-only deliverable, 2026-08-10. Answers: can the existing prefecture-pair / municipality-pair registry truthfully represent Shinkansen gateway access, conventional-rail transfers, airport access, highway-bus terminals, and multi-leg journeys? If not, what is the minimal extension?

---

## 1. Executive decision

**The prefecture-pair / municipality-pair registry is sufficient as the _runtime lookup structure_ but not as the _evidence model_.** It cannot truthfully express:

- Shinkansen gateway access (which station, which services stop);
- conventional-rail transfers (Shinkansen → limited express → local);
- airport access legs (origin → airport, airport → destination);
- highway-bus terminals (origin terminal, destination terminal);
- service classes (ordinary/rapid/limited express) and the fare products attached to each;
- directionality beyond a single `bidirectional` flag;
- seasonal/date-dependent operations (only the ferry model has this).

**Recommendation: incremental extension, not a rewrite of the recommendation engine.**

Phase A (minimal, low risk): enrich the existing `ground-routes.json` schema with optional `serviceClass`, `gateway` fields, `fare`/`fareProduct` (per FARE_POLICY), directionality, and provenance requirements enforced by the validator — keeping the current lookup API shape.

Phase B (medium): add a **gateway/corridor model** (new JSON registry, or a `gateways` array inside the transport data): gateway entities (stations/airports/terminals) + corridor facts between gateways; destination→gateway mappings reuse/extend `relationships.gatewayHubId`. The origin-aware service then composes `origin municipality → gateway → corridor → gateway → destination municipality` only when every leg has evidence; otherwise the claim stays unknown or estimated-with-markers.

Phase C (long-term, only if product demands): full multi-leg journey planning (leg-by-leg with transfers) consuming the same registries.

---

## 2. Gap matrix

### 2.1 Ground (train / shinkansen)

| problem                                                                 | current behavior                                                                   | false claim risk                                                                                                                                                                  | minimal fix                                                                                                    | long-term model                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Prefecture-pair keys conflate gateway access with prefecture membership | `osaka→oita train [240,300]` serves all Oita destinations                          | Oita's Beppu is reachable (ferry/Shinkansen+Sonic), but remote Oita interiors are not — a user sees a verified train claim for destinations that need a 2h bus beyond the station | Split corridor claims at gateway granularity; destination gate only when municipality↔gateway leg has evidence | gateway-corridor registry; destination access legs |
| No service class                                                        | a single `train` duration per pair                                                 | a duration may be "fastest (limited express)" while the fare shown is local-only — mixed products                                                                                 | add `serviceClass` + `fareProduct`; refuse mixed duration/fare pairs                                           | per-service records                                |
| Hokkaido overgeneralization                                             | `tokyo→hokkaido shinkansen [235,300]` applies to the whole prefecture              | Sapporo (2031 terminus) is presented as Shinkansen-reachable today                                                                                                                | restrict to `hokkaido:hakodate-area`; Sapporo → Shin-Hakodate-Hokuto + limited-express leg or unknown          | gateway model                                      |
| No transfer representation                                              | flattened single legs (`osaka→gunma train [240,300]` is really Shinkansen + local) | "train" claim hides a mandatory Shinkansen/limited-express segment — fare is wrong                                                                                                | mark `transferRequired` + components, or leave unknown                                                         | leg-by-leg                                         |
| Sources are secondary (Wikipedia/Japan-guide)                           | all 52 routes cite secondary pages                                                 | duration/fare facts drift from operator reality                                                                                                                                   | re-source from operator timetables (KAI-12 research ledgers)                                                   | continuous re-verification                         |
| No directionality                                                       | `bidirectional: true` almost everywhere                                            | asymmetric services (e.g. final trains, seasonal) unrepresentable                                                                                                                 | per-direction records where needed                                                                             | directional corridor facts                         |
| Same-prefecture metro coverage tiny                                     | 14 municipality rows (Tokyo/Osaka/Hiroshima/Miyazaki/Naha)                         | intra-metro durations unverified elsewhere                                                                                                                                        | extend with verified metro corridors for high-value hubs                                                       | municipal transit registry                         |

### 2.2 Flight

| problem                                           | current behavior                                          | false claim risk                                                                                  | minimal fix                                                                                | long-term model                                     |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Direct-only registry cannot represent connections | route must exist as direct                                | a connecting itinerary added as a "direct" entry = fabricated route                               | keep direct-only; DIRECT=NO audit results omitted                                          | connection model (via-airport) with honest labeling |
| 23/34 routes lack provenance                      | validator only demands sourceUrl for fare-carrying routes | stale/nonexistent routes presented as current                                                     | require sourceUrl+checkedAt for **all** routes; future-date check                          | —                                                   |
| No SDJ/OIT/KMI/NGS airports                       | registry has 21 airports                                  | Sendai origin gets 0 flights (false negative); Oita/Nagasaki/Miyazaki destinations get none       | add airports only with verified routes                                                     | full airport catalog with route pairs               |
| 250 km nearest-airport heuristic for access       | `findArrivalAirport` picks nearest airport in zone        | a destination 240 km from a regional airport with a 3h bus leg is presented as "flight reachable" | require verified airport-access leg for new claims; keep heuristic only for existing zones | airport access-leg registry                         |
| Airport existence ≠ route existence               | (already guarded — route lookup required)                 | —                                                                                                 | keep                                                                                       | —                                                   |
| Seasonal routes                                   | no seasonality field on FlightRoute                       | seasonal route claimed year-round                                                                 | add `operatingPeriods` (ferry model)                                                       | —                                                   |
| Access-leg cost counted into "flight cost"        | cost = access + fare + access (generic estimates)         | door-to-door cost presented as the flight price                                                   | label cost components (details block already separates access ranges)                      | —                                                   |

### 2.3 Bus

| problem                         | current behavior                                                            | false claim risk                                                       | minimal fix                                                            | long-term model                                                              |
| ------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| No intercity bus registry       | `bus` verified = 0 everywhere; Explore bus filter shows legacy/estimated    | local-bus or limousine metadata standing in for intercity availability | new `bus-routes.json` (terminal-pair corridors only, official sources) | highway-bus corridor registry with terminals, seasonality, reservation rules |
| Bus eligibility from zone edges | honshu localModes includes bus → every Honshu destination is "bus-eligible" | origin→destination intercity coach assumed from local bus presence     | corridor-level authorization for intercity claims                      | destination access via gateway                                               |
| Fare variability                | no fare model                                                               | promo fare presented as standard                                       | FARE_POLICY §3 (fixed/range/null)                                      | —                                                                            |

### 2.4 Topology

| problem                                    | current behavior                                    | false claim risk                                                            | minimal fix                                                                     | long-term model                                   |
| ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| Mainland box overlap                       | Hiroshima coordinates resolve to `mainland-shikoku` | shinkansen eligibility zeroed for a major origin; distorted recommendations | tighten shikoku box / prefer prefecture metadata for coordinate origins         | replace mainland boxes with prefecture-resolution |
| `okinawa-main` localModes includes `train` | monorail-only island shows train as a local mode    | "Train" filter shows Okinawa destinations                                   | narrow to `localAccessModes` per destination or new `monorail` mode (follow-up) | mode taxonomy                                     |
| Remote zones without routes                | validator warns when unreachable                    | —                                                                           | keep                                                                            | —                                                 |

### 2.5 Fares and budget

| problem                      | current behavior                                             | false claim risk                                        | minimal fix                                         | long-term model                               |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| No rail fare storage         | `transportFares` unprovenanced, 0 records; heuristic pricing | duration-based heuristic fare presented as a real price | fare registry per FARE_POLICY with product metadata | unified fare registry (rail/bus/flight/ferry) |
| Unknown fare → ¥0            | guarded (`costUnavailable`, `null` from getTransportCost)    | regression risk                                         | keep + tests                                        | —                                             |
| Mixed duration/fare products | heuristic shinkansen fare uses midpoint of verified duration | Nozomi duration × Kodama fare                           | FARE_POLICY §2 product pairing rule                 | per-service records                           |

---

## 3. Route vs full journey (critical distinction)

These are separate facts and must never collapse:

1. route exists (corridor registry);
2. route operates on selected date (seasonality/timetable);
3. route is authorized by topology (zone edges);
4. route has verified travel time (duration registry);
5. route has verified fare (fare registry + product basis);
6. destination reachable end-to-end (origin → gateway → corridor → gateway → last mile);
7. destination suitable for a day trip (TripDurationService + visit hours).

**Example (must stay false until modeled):** a verified Tokyo→Okayama Shinkansen corridor does **not** prove Tokyo→Bitchu-Matsuyama Castle end-to-end time; the Okayama→(JR Kishin line) leg must be separately evidenced. A verified Tokyo→Fukuoka flight does **not** prove the destination is reachable from FUK within a known duration.

## 4. Multi-leg rule

Valid future shapes:

```
origin station → Shinkansen gateway → conventional rail → local transit → destination
origin → airport → flight → airport → rail/bus → destination
```

If the current transport model cannot represent those legs independently, **do not collapse them into one invented number — record the gap.** KAI-12 research ledgers record corridor facts that a future multi-leg model can consume; the runtime keeps returning unknown/estimated until then.

## 5. What changes in Phase A only (recommended first implementation PR)

1. Registry schema extension (optional fields, backward compatible): `serviceClass`, `fareProduct`, `fare`, `fareSourceUrl`, `operatingPeriods`, per-direction records, `gatewayFrom`/`gatewayTo`.
2. Validators: provenance for all routes, future-date checks, fare product integrity, duplicate-corridor detection, legacy-source prohibition, island/ferry guards.
3. Flight registry: provenance for all routes; DIRECT=NO removals; SDJ + verified routes; seasonality fields.
4. Bus registry (new file, corridors only).
5. Topology: shikoku box fix.
6. No recommendation-engine rewrite; `getValidModes`/`getOriginAwareTransportEstimate` API unchanged (registries just become richer).

### Hard acceptance gates (Luna review, 2026-08-10)

1. **Validator reference date**: `scripts/validators/transport-topology.ts` hard-codes `REFERENCE_TODAY = "2026-08-05"`, while this audit's checkedAt = 2026-08-10. Before any registry ingestion the reference date must be centralized (single config constant) and set ≥ the most recent checkedAt, so future-date checks are actually enforced, not silently bypassed.
2. **`transportOptions` gate**: `getValidModes` still requires the legacy `transportOptions[mode]` key for ground modes, and `DestinationDetails.groundMinutesFor` still falls back to `transportOptions` minutes. New registries are authoritative only when both are removed (or the fallback is visually marked unverified); until then legacy keys can hide verified routes or display legacy claims. This is a hard gate before "new registries authoritative" can be claimed.
3. **Coordinate-only origin regression test**: `MAINLAND_BOUNDS` shikoku box overlaps Honshu (Hiroshima coordinates resolve to `mainland-shikoku`). Add a coordinate-only regression test (Hiroshima/Okayama/Tottori origins must resolve `mainland-honshu`) and prefer authoritative prefecture/polygon metadata for coordinate origins.
4. **Flight fare windows**: registry values conflicting with audited facts (TAK→OKA, CTS→OKA) must be updated or marked unverified/null before ingestion (ledger `fl-err-001/002`).

## 6. Non-goals

- No per-station timetable modeling in this phase.
- No connecting-flight modeling until explicitly requested.
- No dynamic pricing engines; fares stay verified-static or null.
- No change to `transportOptions` semantics (legacy gate stays; its display fallback in DestinationDetails is a follow-up).
