# KAI-42 Ferry QA

## Automated regression coverage (this PR)

| Case                                                                            | Test                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Port integrity: every service resolves BOTH ports in the dataset                | `Kai42FerryRegression.test.ts` → ports set                                                                                                                                                                         |
| Fare/duration integrity across ALL registered services                          | low ≤ high, positive, passenger service, direction match, fare/km bound against REAL port distance                                                                                                                 |
| Tomogashima operates every month (normal Mar–Dec; winter operation Jan–Feb)     | `isServiceActive` 12-month sweep                                                                                                                                                                                   |
| Wrap-year operating periods (Dec–Feb) contain winter, exclude summer            | `isServiceActive` synthetic service                                                                                                                                                                                |
| Trip availability uses OUTBOUND (first) and RETURN (last) dates separately      | `isFerryTripAvailable` — real data (winter weekend available; winter weekday closed; return crossing the year-end closure 12/29–1/3 → unavailable) + restricted fixture (return crossing the window → unavailable) |
| Closed-ferry trip semantics (return suspended, outbound suspended, day trip)    | `TravelConditions.test.ts` — restricted fixture data                                                                                                                                                               |
| Tsushima fare-window expiry (synthetic seasonal window)                         | `isFareValid` on the Tsushima pair                                                                                                                                                                                 |
| Published-fare spot checks (Ogasawara ≥ 20k, Sado jetfoil ≥ 5k, Naoshima ≥ 300) | fare band                                                                                                                                                                                                          |

Covered services: Ogasawara, Sado (jetfoil + car ferry), Naoshima (Uno + Takamatsu, ferry + highspeed), Teshima, Tomogashima, Sakurajima, Tsushima (jetfoil + ferry), Miyajima, Gunkanjima.

Already covered by `FerryEstimator.test.ts` (not duplicated): reverse direction, one-way fare doubling, Sado/Ogasawara fare expiry, same-zone Sakurajima, unknown-cost handling, round-trip fare basis.

## Corrected Tomogashima data (operator site, 2026-07-01)

- Adult fare: **¥2,800 round-trip (¥1,400 one-way)** effective 2026-07-01. The Meguruto dataset previously carried a stale ¥2,000 value; the immediately preceding operator fare was ¥2,500 (2025-04-01). The record's `fareValidFrom` prevents reuse of the new fare before its effective date.
- Operation: **NORMAL Mar 1–Dec 28** (Wednesdays off except holidays; no days off during GW 4/28–5/6 and summer 7/20–8/31); **WINTER Jan 4–Feb 28/29** (Saturdays, Sundays and holidays only, subject to weather) per the operator's 冬季運航期間変更のお知らせ; **CLOSED 12/29–1/3** (year-end, 年末年始休業). There is NO blanket December–February suspension.
- Model fidelity: the schedule is fully encoded — winter weekends-only period, normal period with Wednesday-closed, **GW (4/28–5/6) and summer (7/20–8/31) all-days overrides**, and the year-end closure (12/29–1/3). Only the operator's holiday-inclusion rule (winter sailings on Japanese public holidays; Wednesday-off exceptions on holidays) remains unmodeled — Meguruto fails conservative on those days.

## Manual browser QA checklist (island/seasonal paths) — EXECUTION REQUIRED for ticket completion

Run on the preview deploy (or `npm run dev`) for EN and JA, attach screenshots/results, and file linked Bugs for anything failing:

1. **Island planner — Tomogashima (exact modeled schedule)**: home → origin Wakayama →
   search "Tomogashima". The planner must match the operator's schedule:
   - summer weekday (e.g. 2026-08-13 Thu): ferry shown, ¥2,800 round-trip, ~20–25 min;
   - normal-period Wednesday outside the busy periods (e.g. 2026-06-10 Wed): ferry NOT shown
     (Wednesday closed);
   - Golden Week / summer Wednesday (e.g. 2026-08-12 Wed): ferry SHOWN (no days off
     4/28–5/6 and 7/20–8/31 — 期間中は休まず運航します);
   - winter Saturday/Sunday (e.g. 2027-01-16 Sat): ferry SHOWN (winter operation, ¥2,800
     fare applies) with the winter-operation note;
   - winter weekday (e.g. 2027-01-19 Tue): ferry NOT shown (weekends/holidays only);
   - year-end 12/29–1/3 (e.g. 2027-01-02): ferry NOT shown.
     The planner must never fabricate a suspension, a stale fare, or a definite sailing
     on a non-operating date.
2. **Sado**: origin Niigata → Sado. The estimator selects the BEST (fastest valid)
   ferry — the jetfoil (~8,250 JPY / ~60 min) is what renders as the resulting ferry
   estimate; the car ferry is the fallback candidate, NOT a second simultaneous card.
   QA should confirm the single best ferry renders with matching fare/duration and
   that the estimate falls back correctly if the jetfoil is invalid for the date.
3. **Ogasawara**: origin Tokyo → Ogasawara; ferry ~35,760 JPY (one-way), ~24 h — a
   long-haul island recommendation must show the high cost/duration honestly and not
   be ranked as a casual day trip.
4. **Sakurajima**: origin Kagoshima → Sakurajima; ferry ~200 JPY year-round even in
   winter (no suspension).
5. **Fare expiry**: no fare shown without a temporal context for seasonal routes
   (Tomogashima before 2026-07-01 shows the route available with cost unavailable,
   not a stale fare).
6. **Return-date crossing**: a Tomogashima trip whose RETURN leg falls on a closed day
   (winter weekday, Wednesday, or the year-end break) must be ineligible end-to-end
   (planner → roulette → budget).
7. **EN/JA parity**: ferry labels, fares and seasonality copy render in both locales
   (unavailable-fare vs unavailable-route vs seasonal-closure copy distinct).
8. **Agreement across surfaces**: Home, Destinations, details, roulette and budget
   show the same ferry availability/fare for the same dates; date changes and reloads
   preserve eligibility.
9. **Sorting sanity**: island destinations with expensive ferries rank below
   closer/cheaper options in the recommendation rails.
10. **Budget**: unknown cost never becomes zero or a full-trip budget.

Ticket completion (KAI-42 Done) additionally requires: Kagoshima → Sakurajima,
Tokyo/Kansai → Naoshima, and Ogasawara/Sado fare-window expiry checks in the browser,
with screenshots/results attached and any failures linked as Bugs.

**Tsushima fare-window expiry — NOT APPLICABLE to the currently verified source.**
The verified Kyusyu Yusen (博多–対馬) records carry flat fares with no published
validity window, so there is no real fare-expiry browser scenario to execute; the
criterion is covered at the unit level by a synthetic seasonal window in
`Kai42FerryRegression.test.ts`. If a seasonal Tsushima fare is later published and
encoded, re-enable the browser check for it.
