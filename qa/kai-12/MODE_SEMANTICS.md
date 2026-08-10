# Meguruto — Product Semantics of Every Transport Mode (KAI-12 Phase 2)

Decisions here define what each filter/estimate *means* to the user, and what evidence a route needs before it may be shown. Approved by the KAI-12 research pass (2026-08-10); the UI-label part is a documented decision, **no label change is made in this research phase** — label changes, if any, are a follow-up PR.

---

## 1. Shinkansen

**There is exactly one conceptual Shinkansen mode.** "Shinkansen" and "bullet train" are synonyms for the same network; the app must never present them as two modes.

- **English UI label: "Shinkansen"** (consistent everywhere; already the case in `home.transportModes.shinkansen` → "Shinkansen", `recommendation.reasons.transportShinkansen.title` → "Shinkansen Connected").
- **Japanese UI label: 新幹線** (already the case: `home.transportModes.shinkansen` → 新幹線).
- Decision: do **not** introduce "Bullet train" anywhere as a mode name or synonym filter. (Documented for future contributors.)

### Gateway semantics (required definition)

A destination is **not** "Shinkansen accessible" merely because its prefecture contains a Shinkansen station.

Working definition for a verified Shinkansen claim:

1. A **Shinkansen gateway station** must exist (station where Shinkansen services actually stop — see `GATEWAY_INVENTORY.md`);
2. the gateway must have an **onward transport leg** to the destination (conventional rail / bus / local transit / walk) that the app can represent or explicitly marks as last-mile;
3. **the destination itself must not require a hidden multi-leg assumption.** If the app can model `origin → Shinkansen gateway → conventional rail → destination` today, the claim is representable. If it cannot, the claim must not be flattened into a fake single-leg duration (see `TRANSPORT_MODEL_GAP_ANALYSIS.md` §Multi-leg rule).

Prefecture-pair registries are a **coarse intermediate representation**, not the gateway model. They remain acceptable only when the pair is effectively gateway-equivalent (e.g. Tokyo→Osaka via Tokyo Stn / Shin-Osaka) and must never be used to claim Shinkansen for destinations whose prefecture simply contains a station.

## 2. Train

**What the backend `train` mode currently means** (audited): the `ground-routes.json` train entries mix ordinary/local, rapid, and — critically — corridors that in reality require **limited-express or Shinkansen+transfer itineraries** (e.g. `osaka→oita train [240,300]` is realistically ferry or Shinkansen+Sonic; `osaka→gunma train [240,300]` is realistically Shinkansen to Takasaki + local). `getValidModes`/estimators make **no service-class distinction**.

So today `train` semantically means "conventional rail of any service class" — it **includes** limited express and commuter/private rail when a corridor exists, and it can **flatten** itineraries that are not pure local rail.

**UI label:** the mode chip is "Train" (電車); the Explore facet label is **"Local trains" (在来線)** (`DestinationFilters.tsx:282,876`). Because backend `train` includes limited-express/intercity conventional rail, "Local trains" is potentially misleading.

- **Decision for this PR:** do **not** silently change the label. Document the follow-up: consider renaming the facet to simply "Train" (電車) to match the mode chip, or adding a service-class field to the rail registry (KAI-12 model proposal) and then label honestly per corridor.
- **Semantic requirement going forward:** any corridor whose realistic service is limited-express (mandatory surcharge) must carry that fact; a base-fare-only claim must not be presented as a complete fare (see `FARE_POLICY.md`).

## 3. Highway bus

The `bus` mode must distinguish four very different products:

| product | example | intercity access evidence? |
|---|---|---|
| **local city bus** | municipal bus within a city | NO — never evidence of intercity reachability |
| **airport limousine bus** | Narita/Haneda/KIX limousine | NO — airport access only; must not make a destination "Bus reachable" from a user's origin |
| **highway/intercity coach** | Willer Express Tokyo–Osaka, JR Bus day/night coaches | YES — this is what the Bus filter may legitimately show |
| **destination shuttle** | on-site shuttle at a resort | NO — destination-internal |

**Working rule:** "Bus" availability for an origin→destination pair requires a verified **intercity/highway coach corridor** between the origin's gateway and the destination's gateway. A local destination bus, a limousine link, or a shuttle never counts. The current app has **zero** verified intercity bus corridors (`bus verified = 0` for all 8 baseline origins) — this is a gap to fill with verified corridors (`HIGHWAY_BUS_AUDIT.md`), never by reusing local-bus metadata.

## 4. Flight

`flight` means **a real scheduled passenger air connection** between an origin-zone airport and a destination-zone airport.

- **Direct routes vs multi-stop itineraries are different.** The current model (`flight-estimates.json` + `getFlightRoute`) is **direct-only** — a route entry is a direct flight. 
- **Decision:** because the current model cannot represent an intermediate airport/connection honestly, **connecting itineraries must not be added** to the registry. A route that only exists via connection (e.g. HND→Ishigaki in reality flies via OKA or FUK on the same/another carrier) must be marked DIRECT=NO and omitted from the registry — or the registry must gain a connection representation first (architecture gap, `FLIGHT_AUDIT.md` / `TRANSPORT_MODEL_GAP_ANALYSIS.md`).
- **Codeshares are not additional physical flights** — one physical flight, one registry entry.
- **Seasonal routes are not year-round** — seasonality must be recorded and the validator must prevent seasonal facts being presented as year-round.

## 5. Car / my_car

Out of scope for route research (KAI-12 focuses on public modes) but topology constraints (no road edge Honshu↔Hokkaido; none Honshu↔Shikoku… actually a road edge *does* exist for Shikoku via bridges) already prevent false island claims. Ferries are excluded this pass except where they prevent a false train/bus claim (e.g. Osaka→Oita).

## 6. Ferry

Ferries are excluded from KAI-12 research, but ferry dependence must continue to block false train/bus/flight claims (e.g. Naoshima, Teshima, islands without airport access).

---

## 7. Consequences for this pass

1. No UI label changes in this PR (research-only). Follow-up ticket: rename "Local trains" facet or introduce service classes.
2. Registry work in later KAI-12 implementation PRs must respect: one Shinkansen mode (EN "Shinkansen", JA 新幹線); `train` = conventional rail of any service class with service class recorded where surcharges apply; `bus` = intercity/highway coach only; `flight` = direct scheduled flights only.
3. Every new verified route must answer: *what exactly does this number represent* (service, seat/product class, fare basis, direction, seasonal window).
