# Meguruto — Formal Fare Policy (KAI-12 Phase 9)

Status: **approved for KAI-12 implementation phases**. A fare without a defined basis is misleading; every stored fare must answer _"What exactly does this ¥ amount buy?"_

Current schema state: flight routes carry `fare: [min,max] | null` + `fareStatus` + optional `fareSourceUrl`; ferry services carry the richest model (`fareBasis`, `fareValidFrom/To`, `operatingPeriods`, operator); ground routes have **no fare field**; `destination.transportFares` exists but is unprovenanced and unused (0 records). `TRANSPORT_PRICING_CONFIG` heuristics are estimates, never verified fares.

---

## 0. Fare provenance metadata (required wherever the schema supports it)

Every fare record must be able to answer: what does this ¥ amount buy? Required metadata where applicable:

| field                    | values                               | notes                                                                                                         |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| currency                 | `"JPY"`                              | only supported currency; validator enforces nonnegative + JPY                                                 |
| adult/child              | `"adult"` (standard)                 | child = 50% on most rail; KAI-12 stores **adult** fares only; child discounts are display math, not stored    |
| one-way/round-trip       | `"one-way"`                          | Meguruto budgets double one-way for return; ferry `ferryFareBasis` may be `"round-trip"` — never double again |
| seat/class               | e.g. `"ordinary"`, `"green"`         | default `"ordinary"`                                                                                          |
| reserved/non-reserved    | `"reserved"` / `"non-reserved"`      | critical for Shinkansen (non-reserved vs reserved differ)                                                     |
| base fare vs total fare  | `"base"` vs `"total"`                | **never label a base fare as total** when a surcharge is mandatory                                            |
| tax included             | `true`                               | all JR fares include 10% consumption tax; keep explicit                                                       |
| reservation fee included | `false` (default)                    | limited-express tickets often include seat fee; record explicitly when known                                  |
| fixed/range/variable     | `"fixed"` / `"range"` / `"variable"` | dynamic pricing → `"variable"` + validity window or NULL                                                      |
| validFrom / validUntil   | ISO dates                            | fare validity window; outside window → fare not applied (ferry model)                                         |
| fare source URL          | https URL                            | distinct from route-existence source URL when they differ                                                     |
| checkedAt                | ISO date                             | must be ≤ audit reference today; no future dates                                                              |

**Schema rule:** if the schema cannot encode the distinction safely, **do not force data in** — write the architecture proposal first (see `TRANSPORT_MODEL_GAP_ANALYSIS.md`). That is the case today for rail fares: `transportFares` has no provenance fields, so KAI-12 adds a registry-based fare model before storing any rail fare.

---

## 1. Conventional rail — standard basis

**Decision:** the standard stored fare is the **ordinary adult one-way base fare** (運賃, includes tax, non-reserved seating applies to ordinary local/rapid).

- **Local/rapid services with no surcharge:** base fare **is** the complete fare → may be presented as total.
- **Limited-express services (surcharge mandatory):** the complete one-way fare = base fare **+ limited-express surcharge (特急料金)**. Storage rule:
  - both components verified → store total with `fareBasis: total`, components in metadata;
  - only base fare verified → store `fare: [base, base]` with `fareProduct: base` and **never present as the journey total** (UI must not show "¥X" as the trip fare without the surcharge);
  - neither → `fare: null`.
- IC-fare variants (IC 運賃) are identical to cash fares on JR (rounding differences only on some private railways) — store the standard fare; note private-rail IC vs cash differences only when they exceed rounding.
- Child = half, rounded up; not stored.
- Green-car supplements are **never** part of the standard fare.

## 2. Shinkansen — standard basis

**Decision:** the standard budget fare is the **ordinary-class, non-reserved, one-way adult fare** (自由席・普通車・大人・片道), including base fare + non-reserved seat fee (i.e., the complete fare for riding an unreserved seat). Rationale: the cheapest legitimate Shinkansen journey.

- Ordinary **reserved** (指定席) fares are a documented second standard where relevant. Seat semantics (verified 2026-08-10 against official sources):
  - **Nozomi (Tokaido/Sanyo)**: since the 2025-03-15 timetable change, non-reserved cars are **cars 1–2** outside peak periods; **all-reserved** during designated peak periods (2026 peak windows published by JR Central/JR West) — non-reserved ticket holders may stand. Ordinary non-reserved fares exist but are unusable for seated travel in peak windows.
  - **Mizuho/Sakura (Sanyo/Kyushu)**: non-reserved cars are **cars 1–3** (8-car sets; JR West notes per-train variation).
  - **Hikari/Kodama/Kagayaki** (JR Central/West/East): non-reserved cars exist outside peak; **Kagayaki is all-reserved**.
  - **Hayabusa/Komachi/Tsubasa**: all-reserved; **Yamabiko/Nasuno/Hayate/Toki/Tanigawa/Asama**: carry non-reserved cars.
    Rule: **never combine one service's journey time with another product's fare.** If the duration evidence is "fastest (Nozomi)" and the fare evidence is "non-reserved", both must be labeled with the seat-product (and peak/all-reserved window) or the pair must be refused.
- Green car / GranClass: never standard.
- Premium service surcharge (e.g. Nozomi additional charge on Tokaido/Sanyo where applicable): include when the service pattern in the duration claim is that service.
- Child discounts and season-ticket products: out of scope.

## 3. Highway bus — standard basis

**Decision:** adult one-way standard fare for the named route/service.

- Pricing varies by travel day (holiday/discount days), seat type (3列 vs 4列, independent seats), advance purchase, and dynamic pricing on some operators.
- If the operator publishes a **stable standard fare** (JR Bus group, Willer standard seats often have fixed base + seasonal fluctuation): store as fixed or narrow range with source.
- If pricing is **day/seat/advance-dependent**: store a documented **range** with `fareVariability: range|variable`, or `fare: null` when only promo fares exist.
- **Never** scrape a promotional fare and call it the route fare.
- Local city bus and airport limousine fares are **not** intercity-bus fares (see MODE_SEMANTICS §3) and must not populate the intercity bus fare field.

## 4. Flights — standard basis

**Decision:** flight fares are dynamic; Meguruto stores **only** what an official source supports:

- (a) **stable published standard fare** (正規運賃/普通運賃 tables published by ANA/JAL/Skymark etc.) → store the published range, `fareStatus: verified`, `fareProduct: standard`, source URL;
- (b) **official published fare range** (e.g. "from ¥X to ¥Y depending on date") → store range, mark `variable`;
- (c) **only promo fares available** → `fare: null`, `fareStatus: "unverified"` — **null is better than false precision**.

Budget behavior: `getTransportCost` already returns `null` (never ¥0) when `costUnavailable`; UI shows "transport excluded"/cost-unavailable labels. That behavior is the policy and must survive.

## 5. Fare validity and time coupling

- Duration and fare must reference the same service product family on the same corridor (see §2 Shinkansen rule). A verified Nozomi time with a Kodama non-reserved fare is a **mixed product** and must not be stored as one record.
- Fare validity windows: reuse the ferry model (`fareValidFrom/To`); outside the window the route stays but the fare is not applied.
- checkedAt: actual date of the check; never future-dated; validator compares against a reference today.

## 6. Validator rules to add (implementation phases)

1. verified route ⇒ `sourceUrl` + `checkedAt` required (extend to **all** ground/flight routes, not only fare-carrying ones);
2. `checkedAt` ≤ reference today (ISO), no future dates;
3. `timeRange` valid (`0 ≤ min ≤ max`), nonnegative fares, `currency === "JPY"` where modeled;
4. fare validity window sanity (from ≤ to; both or neither);
5. base-vs-total integrity: a route marked `fareProduct: base` with a mandatory-surcharge flag may not be presented as total;
6. no route marked `verified` sourced from legacy `transportOptions`;
7. no ferry/flight-dependent island gaining train/car-only access;
8. no duplicate route IDs; no contradictory duplicate corridor (both directions tested where directionality exists);
9. no unsupported direct-flight claim (DIRECT=NO entries must not reach the registry as direct);
10. unknown fares never become ¥0 (already enforced by `costUnavailable` semantics — keep tests).

## 7. Budget consumers (current behavior to preserve)

- `getTransportCost` precedence: explicit fare → verified-duration heuristics → `null`.
- With explicit origin coords, ground fares require a verified origin-aware duration; otherwise `null` (never a fabricated price).
- Round-trip = one-way × 2 × party for transit; car = per-vehicle cost × cars needed; ferry respects `fareBasis` (round-trip not doubled).
- `getSortableVerifiedBudget` sorts verified-only; unknown never zero-costs.
- `transportFares` (legacy field): 0 records today; KAI-12 does **not** extend it — fares move to the route registries with provenance (see gap analysis).
