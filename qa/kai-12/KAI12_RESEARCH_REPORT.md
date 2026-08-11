# KAI-12 — Meguruto Nationwide Transport Truth Audit & Expansion: V4 Flash Final Report (Research Phase)

**Report date:** 2026-08-10 · **Branch:** `aneeshpatil8/kai-63-remove-default-explore-filters-and-audit-transport-mode` @ `fdd944a3` (KAI-63 **not merged** — per ticket rule this phase is **research-only**; no implementation, no new branch, no commits)
**Primary researcher:** v4-worker (DeepSeek V4 Flash Max) agents — run ids:

- Shinkansen: `1337e0b6-89dc-499` (research) + `00541593-6a2b-409` (draft from salvage)
- Conventional rail: `7bf761b7-982a-47f`
- Domestic flights: `b8118c28-46b0-4f1`
- Highway bus: `f96b8513-38bb-4d1`
- Architecture/baseline/explore: explore agents `yp606m` (tests/validators/stats) + `83cxg3` (consumers)
- Independent final review: LunaMax (`59016332-2d70-4d1`) — verdict in §11

---

## 1. Current architecture summary

Deliverable: `qa/kai-12/CURRENT_TRANSPORT_ARCHITECTURE.md`. Verified origin-aware estimates come from `OriginAwareTransportService` over three registries — `ground-routes.json` (66 rail rows, prefecture/municipality pairs, no fares, secondary sources), `flight-estimates.json` (34 direct routes; 26 with fares; 23 without provenance), `ferry-estimates.json` (out of scope, reference fare model). Mode authorization from `transport-topology.json` zone edges + registries; `destination.transportOptions` remains a legacy support-gate and display fallback, never canonical proof. Budget: explicit `transportFares` (0 records, unprovenanced) or duration-based heuristics; unknown fares → `null`/cost-unavailable, never ¥0. Evidence ladder verified → bounded estimated (≤120 km same-zone) → unknown is enforced in `TripDurationService`, WeekendPolicy (unknown = ineligible), and `getSortableVerifiedBudget`.

## 2. Catalogue transport baseline (8 representative origins, 761 destinations)

Deliverable: `qa/kai-12/TRANSPORT_COVERAGE_BASELINE.md`. Key numbers:

| origin                      | train verified | shinkansen verified | bus verified | flight verified | flight-only visible | train-only visible |
| --------------------------- | -------------- | ------------------- | ------------ | --------------- | ------------------- | ------------------ |
| Nakayama/Yokohama           | 121            | 0                   | 0            | 216             | 216                 | 663                |
| Tokyo                       | 280            | 202                 | 0            | 216             | 216                 | 663                |
| Osaka                       | 248            | 247                 | 0            | 79              | 79                  | 663                |
| Fukuoka                     | 15             | 114                 | 0            | 356             | 356                 | 588                |
| Hiroshima (⚠️ mis-resolved) | 1              | 0                   | 0            | 264             | 264                 | 563                |
| Sapporo                     | 0              | 121                 | 0            | 461             | 461                 | 536                |
| Sendai                      | 0              | 121                 | 0            | **0**           | **0**               | 663                |
| Nagoya                      | 0              | 145                 | 0            | 79              | 79                  | 663                |

Baseline defects surfaced: bus verified = 0 nationwide; Sendai origin flight = 0 (SDJ absent); Hiroshima origin resolves to `mainland-shikoku` (box overlap); Sapporo shinkansen=121 is a prefecture-pair overgeneralization artifact; legacy buckets dominate (train legacy-only 308–639 per origin); 7 destinations unknown-zone.

## 3. Shinkansen audit (Phase 5)

Deliverable: `qa/kai-12/SHINKANSEN_AUDIT.md` + `research/SHINKANSEN_AUDIT_DRAFT.md` (30-row ledger, operator-official sources only). Verified: Tokaido (Tokyo–Shin-Osaka 141–150 min, non-reserved 13,870 / Nozomi reserved 14,720 / Hikari-Kodama reserved 14,400; Tokyo–Kyoto direct 14,170; Nozomi-skips-Shizuoka pattern), Sanyo (Shin-Osaka–Hakata 140–142 min, Nozomi/Mizuho reserved 16,020 — Shin-Osaka–Hiroshima fare UNVERIFIED, conflicting caches rejected), Tohoku/Hokkaido (Tokyo–Sendai Hayabusa 89–92 min 11,430; Tokyo–Shin-Aomori 17,910; **Shin-Hakodate-Hokuto terminus — Sapporo NOT reachable until ~FY2030/31**; 2026-03-14 JR East revision), Joetsu/Hokuriku (Tokyo–Niigata 10,780; Nagano 8,250; Toyama 12,980; Kanazawa 14,400; **Shin-Tsuruga terminus since 2024-03-16**), Kyushu (Hakata–Kagoshima 76–80 min 11,950; Hakata–Kumamoto 33 min 5,840; **Hakata–Nagasaki = Kamome + Relay Kamome two-train relay via Takeo-Onsen, one through ticket, 6,490**; 2025-04-01 revision). Gateway semantics table: Nara/Wakayama/Tottori/Shimane/Shikoku/Miyazaki/Oita/Mie/Saga-city have **no** shinkansen gateway — onward legs must be separately modeled; no claims without them.

## 4. Conventional rail audit (Phase 6)

Deliverable: `qa/kai-12/CONVENTIONAL_RAIL_AUDIT.md` + draft (31 rows). Verified totals ✅: Tokyo–Yokohama 528/530 (post-2026-03-14 revision), Tokyo–Kamakura 902/910, Odakyu Romancecar, Tobu Nikko (1,400+1,650), Kintetsu Nara/Ise/Toba, Nagoya–Takayama Hida 6,360, JR Kyushu integrated totals (Yufuin no Mori 6,130, Sonic 6,910), JR Hokkaido (Suzuran 4,890, Hokuto 9,770), N'EX 3,140, Skyliner 2,580, Rapi:t, Sendai Access Line 680, monorail 520, subway 260. Base-only ⚠️ rows (17) never claim totals (Kuroshio/Haruka splits, JR East derived C表 fares, etc.). Excluded ❌: Hakata–Nagasaki conventional (discontinued 2022-09-23), Hakata–Kagoshima conventional (shinkansen-primary), Nagoya–Irago (rail+bus), Hiroshima Airport rail (bus-primary 1,500/50 min). Semantics: LEX-mandatory destinations (Takayama/Yufuin/Beppu/Noboribetsu/Hakodate/Nikko/Hakone) — base-only claims would understate cost; JR East 2026-03-14 revision makes pre-2026 Tokyo fares stale.

## 5. Direct-flight audit (Phase 7)

Deliverable: `qa/kai-12/FLIGHT_AUDIT.md` + draft. All 34 registry routes verified against official airline/airport sources: **no false directs**. Found: 4 duration errors (TAK–OKA, CTS–OKA, KOJ–ASJ, HND–ISG/MMY), 2 seasonal-only routes presented year-round (ITM–ISG Jul 17–Aug 28; FUK–KUM Jul 1–Aug 31), SDO (Sado) has **no scheduled service since April 2014**, 6 operator-attribution corrections (Spring Japan, KIX-CTS cargo-only, NGO-FUK no Peach, OKA-ISG/MMY no RAC/Peach, HND-AKJ ADO codeshare), 4 missing catalogue airports with verified HND directs (SDJ/KMI/OIT/NGS). Fares: 26 routes with ANA S26 official standard-fare table ranges; 8 LCC-only routes correctly `null` (promo never scraped).

## 6. Highway-bus audit (Phase 8)

Deliverable: `qa/kai-12/HIGHWAY_BUS_AUDIT.md` + draft. **27 verified intercity corridors** (operator-official): Tokyo–Osaka/Kyoto (JR Bus 3,300–19,000; Willer), Tokyo–Nagoya, Tokyo–Hiroshima night, Tokyo–Sendai, Tokyo–Fukuoka night (Nishitetsu はかた号), Osaka–Hiroshima, Osaka–Fukuoka night-only, Osaka–Nagoya 名神, Osaka/Tokyo–Shikoku (Takamatsu/Matsuyama via Seto Ohashi), Fukuoka–Kagoshima/Nagasaki/Kumamoto, Sapporo–Hakodate/Asahikawa/Noboribetsu, Sendai–Yamagata/Aizu, Tokyo–Niigata/Kanazawa/Nagano/Matsumoto/Kofu/Kawaguchiko, Osaka–Tottori, Takamatsu–Matsuyama. **7 excluded** (Tokyo–Takamatsu suspended 2020; Osaka–Fukuoka ムーンライト suspended 2017; Osaka–Nara/Wakayama no intercity coach; Nagoya–Ise none; Hiroshima–Matsuyama none; Seibu no Tokyo–Kansai). Airport limousines (5) separated — never intercity evidence. 22/27 corridors have variable/dynamic fares → schema needs ranges.

## 7. Fare policy (Phase 9)

Deliverable: `qa/kai-12/FARE_POLICY.md`. Standard bases: conventional rail = ordinary adult one-way base, LEX surcharge separate (total only when both verified); Shinkansen = ordinary non-reserved outside peak where the seat product exists — since the 2025-03-15 change Nozomi carries non-reserved cars 1–2 outside peak windows and is all-reserved in peak windows; Mizuho/Sakura carry non-reserved cars 1–3; Kagayaki/Komachi/Tsubasa/Hayabusa are all-reserved (reserved fares mandatory) — never mix service-time with another product's fare; highway bus = adult one-way standard or documented range, promo never; flight = published standard fare or null. Provenance metadata: currency JPY, adult, one-way, seat/class, reserved/non-reserved, base-vs-total, tax included, reservation fee, fixed/range/variable, validFrom/To, fare source URL, checkedAt. Unknown > false precision.

## 8. Source ledger (Phase 11)

Deliverable: `qa/kai-12/TRANSPORT_SOURCE_LEDGER.md` — **304 production rows** (78 flight incl. 10 `fl-err` rows — 9 airport/registry/seasonal findings + 1 fare conflict, 98 rail incl. airport-access, 86 bus incl. limousine + 7 excluded, 42 shinkansen), each with routeId | mode | claim | source URL | source type | operator | checkedAt 2026-08-10 | validity | implementation location | reviewer result. Dispositions after Luna round 4: 265 REVIEWED, 28 FIX-REQUIRED, 7 EXCLUDED, plus 3 REVIEWED-with-Luna-re-verification (terminus / non-reserved cars / relay) and 1 REVIEWED-fare-null (bus-016-f). Fare rows separate from duration rows. Current-registry provenance audit included (66 ground rows = secondary sources, QUARANTINED; 23/34 flight rows unprovenanced, QUARANTINED).

## 9. Gap analysis + model proposal (Phases 10 & 12)

Deliverables: `qa/kai-12/TRANSPORT_MODEL_GAP_ANALYSIS.md` (problem | current behavior | false-claim risk | minimal fix | long-term matrix; route-vs-journey distinction; multi-leg rule: never collapse unrepresentable legs into one invented number) and `qa/kai-12/TRANSPORT_GAPS.md` (9 gap categories × impact ranking: 🅱️ intercity bus registry missing, ground-registry origin asymmetry, SDJ/KMI/OIT/NGS airports, no fare schema, seasonal flights, multi-leg flattening incl. tokyo→hokkaido overgeneralization, Hiroshima topology bug; validator additions mapped to the ticket's mandatory list).

## 10. Changes implemented, tests, validation, files

- **Changes implemented:** none in code — research phase only (KAI-63 unmerged). All work = 13 files in `qa/kai-12/` (11 audit/policy/analysis docs + `research/` drafts).
- **Tests/validators:** not run — no code changed. `verify:pr`, `validate:catalog-fast`, transport tests, budget tests: **not applicable to a docs-only phase**; they are the KAI-12 implementation-phase gate (ticket §Validation).
- **Files changed:** `qa/kai-12/CURRENT_TRANSPORT_ARCHITECTURE.md`, `TRANSPORT_COVERAGE_BASELINE.md`, `MODE_SEMANTICS.md`, `GATEWAY_INVENTORY.md`, `SHINKANSEN_AUDIT.md`, `CONVENTIONAL_RAIL_AUDIT.md`, `FLIGHT_AUDIT.md`, `HIGHWAY_BUS_AUDIT.md`, `FARE_POLICY.md`, `TRANSPORT_MODEL_GAP_ANALYSIS.md`, `TRANSPORT_SOURCE_LEDGER.md`, `TRANSPORT_GAPS.md`, `research/{SHINKANSEN,CONVENTIONAL_RAIL,FLIGHT,HIGHWAY_BUS}_AUDIT_DRAFT.md`.
- **Commit SHA:** none (no commits made; branch unchanged at `fdd944a3`; user's uncommitted work untouched — `git status` verified).

## 11. Luna independent review

Spawned: luna-reviewer (LunaMax / gpt-5.6-luna), agent id `59016332-2d70-4d1`, task "Luna independent KAI-12 review" (full ticket requirements + file list; instructed to inspect actual files and re-verify sources online, verdict APPROVE/REQUEST CHANGES).

**Verdict (round 1): REQUEST CHANGES** — 6 blockers + 5 likely issues, all addressed in revision 2 (2026-08-10):

| #   | blocker                                                                                                                                       | fix applied                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Baseline reported commit `89ce96b9`; HEAD is `fdd944a3`                                                                                       | Baseline re-run on `fdd944a3` (counts identical — later KAI-63 commits touched Explore UI/tests only); commit recorded in TRANSPORT_COVERAGE_BASELINE.md                                                                                                             |
| 2   | Ledger incomplete (8 flight pairs missing: HND–CTS, HND–FUK, HND–MMY, NGO–CTS, NGO–FUK, FUK–OKA, KOJ–ASJ, ITM–KUM) + all dispositions PENDING | Ledger regenerated from curated audit rows: 302 rows, all reconciled; dispositions REVIEWED / FIX-REQUIRED / EXCLUDED; 8 missing pairs present (fl-001, fl-002, fl-007, fl-021, fl-023, fl-024, fl-032, fl-034)                                                      |
| 3   | Provenance not production-safe (66 ground rows = secondary sources; JR Central fare PDF 404; rail-001-f cited timetable page as fare)         | Current-registry section marked **QUARANTINED**; sk-001-f/003-f/005-f URLs replaced with verified `https://global.jr-central.co.jp/en/tickets/` (HTTP 200); rail fare sources annotated                                                                              |
| 4   | Fare-basis labels contradicted policy (rail-034-f/036-f/039-f)                                                                                | Product labeling rebuilt: BASE only / BASE + LEX / INTEGRATED TOTAL with per-row allowed verdict; 15 base-only rows verified as genuine no-LEX corridors                                                                                                             |
| 5   | Nozomi/Mizuho seat semantics wrong                                                                                                            | FARE_POLICY §2 + SHINKANSEN_AUDIT §3 corrected: Nozomi non-reserved cars 1–2 outside peak (all-reserved in peak windows, 2025-03-15 change); Mizuho/Sakura cars 1–3 non-reserved — verified against JR Central press release 000043969 and JR Kyushu 700-series page |
| 6   | Flight registry conflicts (TAK→OKA [60,75] vs [110,120]; CTS→OKA [180,210] vs [200,225])                                                      | Ledger rows fl-err-001/002 FIX-REQUIRED; FLIGHT_AUDIT §6 quarantine note; gap-analysis gate 4                                                                                                                                                                        |

Likely issues disposition: coordinate-only box overlap → gap-analysis gate 3 (regression test); `transportOptions` gate → gap-analysis gate 2 (hard acceptance gate); validator date → gate 1; qa/kai-12 untracked → per AGENTS.md/release rules, research artifacts stay untracked until the implementation PR is opened (no commit made in research phase).

Luna's independent spot-check log (all confirmed our data): JR Hokkaido terminus Shin-Hakodate-Hokuto; Hakata–Nagasaki Takeo-Onsen relay; Mizuho/Sakura cars 1–3 non-reserved; Hakata–Beppu ¥6,910 integrated total; TAK→OKA and CTS→OKA duration discrepancies.

**Verdict (round 2): REQUEST CHANGES** (agent `c7d403df-bbd0-42e`) — residual issues, all fixed in revision 3 (2026-08-10):

| residual issue                                                                                             | fix applied                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17 rail fare rows cited timetable pages as fare evidence (rail-001-f, rail-010-f, rail-019-f, rail-035-f…) | 7 rows re-sourced to official fare tables (JR East 2026-03-14 dentoku table `dentoku_yamate.pdf` for Tokyo–Yokohama/Kamakura/Takao; JR West fact sheet; Hankyu fare page); Tobu/JR Kyushu timetable-booklet rows annotated as official fare-bearing pages; 15 derived/fare-search rows marked FIX-REQUIRED with reason |
| 7 NULL flight-fare rows vs registry's 8                                                                    | 7 LCC-null rows confirmed; FUK→TSJ registry-null-vs-audited-standard conflict recorded as fl-err-010 (FIX-REQUIRED at ingestion)                                                                                                                                                                                       |
| bus-016 (Osaka↔Matsuyama Iyotetsu) missing fare companion                                                  | bus-016-f added, fare UNVERIFIED per FARE_POLICY §3 (REVIEWED — honest null)                                                                                                                                                                                                                                           |
| SHINKANSEN_AUDIT.md:93 omitted 2025-03-15 change                                                           | explicit 2025-03-15 reference added (Nozomi non-reserved cars 1–2; car 3 changed to reserved)                                                                                                                                                                                                                          |
| Stale “Mizuho all-reserved” in research/SHINKANSEN_AUDIT_DRAFT.md:48                                       | corrected to non-reserved cars 1–3                                                                                                                                                                                                                                                                                     |
| Stale report text: “229 production rows … PENDING” and a “Nozomi/Mizuho reserved-only” phrasing            | §7 fare-basis sentence corrected (2025-03-15 seat semantics); §8 updated to 304 rows + disposition summary; current documents state Nozomi non-reserved cars 1–2 outside peak (2025-03-15 change) and Mizuho/Sakura non-reserved cars 1–3                                                                              |

Luna round-2 spot-checks confirmed two more figures online: Hakata–Kumamoto ¥3,300+¥2,540=¥5,840 (JR Kyushu revision PDF) and Sendai–Yamagata bus ¥1,100 (Yamagata Kotsu).

**Verdict (round 3): REQUEST CHANGES** (agent `14d7d877-234d-4a3`) — two blockers + one likely, all fixed in revision 5 (2026-08-10):

| residual                                                                                                                               | fix applied                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rail-019-f (Osaka–Himeji) and rail-023-f (Kyoto–Otsu) REVIEWED against JR West routes-schedule page, which does not publish pair fares | downgraded to FIX-REQUIRED (capture official pair-fare page)                                                                                                                                                   |
| rail-005-f/006-f (Tobu) timetable PDF flagged as timetable-only                                                                        | downgraded to FIX-REQUIRED (capture fare-bearing page for 1,400+1,650)                                                                                                                                         |
| §8 stale counts (302 rows / old dispositions)                                                                                          | §8 updated to actual: 304 rows = 78 flight (incl. 10 `fl-err` rows) + 98 rail + 86 bus + 42 shinkansen; 265 REVIEWED, 28 FIX-REQUIRED, 7 EXCLUDED, 3 REVIEWED-with-Luna-re-verification + 1 REVIEWED-fare-null |
| ledger title “revision 4” vs body “Revision 5”                                                                                         | normalized to revision 5 — final                                                                                                                                                                               |

Luna round-3 spot-checks re-confirmed online: Tokyo–Yokohama IC ¥528/ticket ¥530 (JR East dentoku_yamate.pdf), Hakata–Beppu ¥6,910 and Hakata–Kumamoto ¥5,840 (JR Kyushu fare/ticket/123), Sendai–Yamagata bus ¥1,100 (Yamagata Kotsu).

**Verdict (round 4): REQUEST CHANGES** (agent `2ee881de-1f37-467`) — documentation-wording only, fixed in revision 6 (2026-08-10): §8 now says “10 `fl-err` rows” (9 airport/registry/seasonal findings + 1 fare conflict, `fl-err-010`) with the precise disposition breakdown (265 REVIEWED / 28 FIX-REQUIRED / 7 EXCLUDED / 3 REVIEWED-with-Luna-re-verification / 1 REVIEWED-fare-null). Luna round-4 spot-check re-confirmed Hakata–Beppu ¥6,910 on the official JR Kyushu fare page.

**Verdict (round 5): REQUEST CHANGES** (agent `67b62318-a9ef-492`) — single blocker: stale blanket seat-wording remained in `KAI12_RESEARCH_REPORT.md:97–98` (historical fix record) and `research/SHINKANSEN_AUDIT_DRAFT.md:118` (“reserved-only confirmed”). Fixed in revision 7 (2026-08-10): the fix-record rows now state the current facts (Nozomi non-reserved cars 1–2 outside peak since 2025-03-15; Mizuho/Sakura non-reserved cars 1–3), and the draft's UNVERIFIED row now says non-reserved amounts not confirmed rather than reserved-only. Whole-tree grep: no remaining blanket Nozomi/Mizuho reserved-only claims outside historical fix records.

**Verdict (round 6): ✅ APPROVE** (agent `ecd0b42a-afb5-42f`, 2026-08-10) — residual wording corrected; structural counts reconcile (304 rows: 78 flight / 98 rail / 86 bus / 42 shinkansen; dispositions 265 REVIEWED / 28 FIX-REQUIRED / 7 EXCLUDED / 3 Luna-re-verified / 1 fare-null); prohibited sources absent; uncertain data remains explicitly UNVERIFIED, FIX-REQUIRED, or QUARANTINED; all 13 deliverables + 4 research drafts present; no new findings.

## 12. Unresolved gaps (honest list)

1. Shin-Osaka–Hiroshima/Okayama & Hiroshima–Hakata fares UNVERIFIED (conflicting caches rejected); Gifu-Hashima/Maibara/Fukushima/Nagano–Kanazawa times or fares UNVERIFIED.
2. 23/34 existing flight rows still lack provenance until implementation; 4 duration errors + 2 seasonal flags to fix.
3. All 66 existing ground rows need operator re-sourcing.
4. Bus: fare variability model + Willer JS-render caveat; fare tables dated 2025-10…2026-07 to re-verify at ingestion.
5. Airport access legs (origin→airport→dest) remain generic estimates; verified rail access legs recorded but unmodeled.
6. Kansai↔Chugoku and Chubu↔Kanto air (ITM/KIX–HIJ, NGO–HND/FUK) exist but unregistered.
7. No schema for fares yet (`transportFares` deprecated in favor of registry fields per FARE_POLICY §0).
8. Hiroshima-origin topology box overlap awaits a one-line bounds fix in implementation.

## 13. Recommended next action

When KAI-63 merges: branch `data/kai-12-verified-ground-air-transport` from new main; implement in the suggested PR order (A: architecture/validators → B: shinkansen+rail corridors → C: flight registry/provenance → D: bus registry → E: fares), each PR independently reviewable, with the mandatory validation gate (`VITEST_MAX_WORKERS=1 npm run verify:pr`, `npm run validate:catalog-fast`, transport/budget/recommendation tests, `git diff --check`).
