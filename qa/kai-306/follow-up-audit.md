# KAI-306: Follow-up Audit Ledger

This ledger is **append-only** and sits beside the frozen 2026-10-08 audit (`destination-sample-audit.json/.md`), which is unchanged. `npm run audit:kai-306` reverses every ledger patch from the live catalogue and requires the exact pinned October 8 candidate bytes, so the historical replay stays reproducible and no unledgered catalogue change passes silently.

**Automated vs manual:** the script verifies the hash chain, the patch values, the 20-ID cohort and that generated detail files match canonical fields. It does **not** re-fetch sources. Each PASS/FAIL below is a manual adjudication against the cited source observation on the stated check date.

## Current adjudicated state

- Public-fact gate: **15 PASS / 5 FAIL** (2026-10-08 frozen result: 8 PASS / 12 FAIL).
- Still FAIL: `kyoto-city`, `kiyomizu-dera`, `nijo-castle-kyoto`, `osaka-castle`, `hakone-open-air-museum`.
- KAI-306 is **not** complete: the 20-destination gate has not been independently reassessed.

## 1. PR A — operational facts, hours and localized copy (7 destinations)

- Date: 2026-10-16 · sources checked: 2026-10-16 · base `03eab1e82820d8d3ff4e0396ddcc217d32085a68`
- Related PR: PR A (kai-306-pr-a-operational-facts) (PR creation authorized by user; URL pending).
- Canonical SHA-256: `1a7f6fa064cb` → `1b2aaac01b82`.

**Automated validation**

- npm run sync-destination-details regenerated all 1,130 details; npm run check:catalog-sync confirmed byte-identical idempotence.
- npm run check:destination-models, npm run validate-destinations, npm run validate-destination-details and npm run validate:i18n passed.
- npm run test:kai-307-smoke passed (12 tests); KAI-307 Playwright release smoke passed 18 desktop and 18 mobile cases. The smoke asserts rendered EN/JA descriptions, hours, highlights, reservation text, admission applicability and forbidden stale copy for all seven PR A destinations.
- KAI-203, KAI-257 and KAI-219 audits passed. KAI-219 reports zero free-without-evidence admission facts.
- Targeted PR A and audit-cohort Vitest checks passed 83 tests across 9 files after the final copy/source edits, including versioned KAI-219E2/KAI-250/KAI-251/KAI-252 identity/admission follow-ups and KAI-260 Fushimi transition justification.
- npx tsc --noEmit -p tsconfig.app.json, npm run lint, npm run format:check and npm run build passed; lint/build emitted only non-blocking warnings.
- npm run audit:kai-306 verified exact frozen replay and the 7-record/56-field canonical follow-up chain; the original 8 PASS / 12 FAIL report is unchanged. Manual follow-up adjudication is 15 PASS / 5 FAIL; KAI-306 remains incomplete.
- Full Vitest suite run before the final Tower/Skytree copy-only adjustments: 5,502 passed, 2 skipped, 3 timed out. The three timed-out tests passed in isolated reruns (ExploreDefaultState: 32; KAI-292C4E prerequisite: 10); no assertion failures appeared in the full run. The final copy/source edits are covered by the 83 focused tests and 36 E2E cases above.

**Manual review**

- Official primary pages were opened and reviewed on 2026-10-16; observations are source-linked paraphrases, not copied page text.
- PASS/FAIL outcomes are manual adjudications of the listed findings, not an independent reassessment of the complete 20-destination public-fact gate.
- Matched EN/JA mobile/desktop screenshots are local review artifacts, not committed binaries. The user explicitly requested PR creation; visual/content review remains open on PR A, and no merge is authorized.

### fushimi-inari-taisha: FAIL → PASS

- Original finding: Classified as museum; unsupported 24-hour and admission assertions.
- Observation at check time: At origin/main, kind was museum; the rendered schedule claimed 24-hour access (with separate office hours), EN/JA copy still included an unsupported fixed trail length/count, and admission was marked not_applicable without a reviewed source establishing free general entry or a fee.
- Corrected fields: `kind`, `admission unavailable/source_missing; no fee/free-entry claim`, `businessHours/openingHours/openingHoursJa`, `description and highlights (EN/JA; no exact route length or gate count)`, `reservation copy (EN/JA)`, `notesJa removed`, `kind-derived comfort model output`.
- Audit-manifest follow-up: `scripts/audit/kai-219e2-candidates.json` · `identityFollowUp.kind.after` — "museum" → "shrine". The original cohort identity is preserved and the current category follows reviewed official shrine evidence.
- Audit-manifest follow-up: `scripts/audit/kai-219e2-candidates.json` · `state` — "not_applicable" → "unavailable". No reviewed official visitor page established a general-entry fee or free-entry assertion; the admission amount remains unavailable.
- Audit-manifest follow-up: `scripts/audit/kai-219e2-candidates.json` · `reasonCode` — "no_single_admission_product" → "source_missing". Replace the unsupported N/A reason with a current source-missing status; do not infer a zero cost.
- Audit-manifest follow-up: `scripts/audit/kai-250-candidates.json` · `identityFollowUp.kind.after` — "museum" → "shrine". The source-backed category correction is versioned separately from the cohort's historical identity value.
- Audit-manifest follow-up: `scripts/audit/kai-251-local-transport-manifest.json` · `identityFollowUp.kind.after` — "museum" → "shrine". The source-backed category correction is versioned separately from the cohort's historical identity value.
- Adjudication (manual): The category now identifies a shrine. Visiting hours and general-entry cost remain unknown; the detail surfaces preserve an unverified-hours warning and unavailable admission rather than imply 24-hour/free access. PASS means the unsupported claims were removed, not that those unknowns are verified.
- Source (2026-10-16): [https://inari.jp/en/](https://inari.jp/en/) — Official shrine site identifies Fushimi Inari Taisha as the head shrine of Inari; the reviewed visitor pages do not establish a general-entry fee or free-entry claim.
- Source (2026-10-16): [https://inari.jp/en/access/](https://inari.jp/en/access/) — Official access page was reviewed; it did not publish a shrine visiting-hours schedule or general admission price. No replacement hours or price are inferred.
- Source (2026-10-16): [https://inari.jp/en/request/](https://inari.jp/en/request/) — Official visitor guidance was reviewed; it did not publish a general admission price or 24-hour access schedule.
- Source (2026-10-16): [https://inari.jp/en/map/spot_07/](https://inari.jp/en/map/spot_07/) — Official map entry names the Senbon Torii feature; the displayed copy uses that name instead of an unsupported total gate count.
- Source (2026-10-16): [https://inari.jp/en/map/spot_01/](https://inari.jp/en/map/spot_01/) — Official map entry identifies Inariyama as a sacred site; no exact visitor-route length is inferred.
- Residual: Official visitor pages reviewed on 2026-10-16 did not establish shrine visiting hours or a general-entry price; keep hours unverified and admission unavailable/source_missing.

### dotonbori: FAIL → PASS

- Original finding: Classified as museum; unsupported district-wide hours.
- Observation at check time: At origin/main, kind was museum, the district carried a museum-style 09:30–17:00 schedule and Monday closure, English highlights were generic, Japanese reservation copy referred to general shrine visits, and its not_applicable admission fact still cited the association homepage whose fetch had failed.
- Corrected fields: `kind`, `businessHours/openingHours/openingHoursJa`, `description and highlights (EN/JA)`, `admission applicability remains not_applicable for the district; source provenance refreshed`, `reservation copy (EN/JA)`, `notesJa removed`, `kind-derived comfort model output`.
- Audit-manifest follow-up: `scripts/audit/kai-219e2-candidates.json` · `identityFollowUp.kind.after` — "museum" → "district". Preserve the cohort's originally recorded kind while recording the source-backed KAI-306 correction.
- Audit-manifest follow-up: `scripts/audit/kai-219e2-candidates.json` · `sourceUrls` — ["https://www.dotonbori.or.jp/en/"] → ["https://osaka-info.jp/en/spot/dotonbori/"]. Refresh the area identity/provenance link from the historically failed association homepage to the reviewed official Osaka tourism listing.
- Audit-manifest follow-up: `scripts/audit/kai-252-local-transport-manifest.json` · `identityFollowUp.kind.after` — "museum" → "district". The source-backed category correction is versioned separately from the cohort's historical identity value.
- Adjudication (manual): The kind is district, the museum schedule is removed, and local copy names attractions present on the reviewed official district page. Public streets are distinguished from businesses; individual venue hours and reservations remain venue-specific. The scoped not_applicable admission state is retained for the district itself, and its provenance now points to the reviewed official district listing rather than the failed association URL.
- Source (2026-10-16): [https://osaka-info.jp/en/spot/dotonbori/](https://osaka-info.jp/en/spot/dotonbori/) — Official Osaka tourism page describes Dotonbori as a shopping/entertainment district and canal-side area, calls out the Glico sign, three-dimensional signs, restaurants, takoyaki and Tonbori Riverwalk, and gives store-dependent hours rather than a district schedule.
- Residual: No single district-wide schedule is asserted; individual businesses may change hours and booking policies.

### meiji-jingu: FAIL → PASS

- Original finding: Incorrect 24-hour access claim; seasonal shrine hours.
- Observation at check time: At origin/main, the canonical hours field described sunrise-to-sunset, but localized detail hours still claimed 24-hour access; Japanese hours were English, reservation copy implied on-site tickets, highlights were generic, and the admission source URL pointed to a Shibuya tourism page.
- Corrected fields: `businessHours/openingHours/openingHoursJa`, `openingHoursMetadata`, `description and highlights (EN/JA)`, `admission source, checkedAt and basis`, `reservation copy (EN/JA)`.
- Adjudication (manual): Localized detail fields now agree with the official seasonal sunrise/sunset policy. A fixed time window is not derived; facilities inside remain separately scoped.
- Source (2026-10-16): [https://www.meijijingu.or.jp/en/visit/](https://www.meijijingu.or.jp/en/visit/) — Official visit page states the shrine is free of charge and its gates open with sunrise and close with sunset, provides a month-by-month table, and notes that facilities inside have shorter hours. The catalogue avoids a fixed clock range.
- Source (2026-10-16): [https://www.meijijingu.or.jp/en/about/](https://www.meijijingu.or.jp/en/about/) — Official about page identifies Meiji Jingu as a Shinto shrine in central Tokyo and names Emperor Meiji and Empress Shoken.
- Source (2026-10-16): [https://www.meijijingu.or.jp/en/whattosee/forest/](https://www.meijijingu.or.jp/en/whattosee/forest/) — Official forest page describes the forest surrounding the main shrine buildings; copy avoids an unsupported tree-count claim.
- Residual: Seasonal clock times remain on the official monthly table; inner-garden and museum schedules/fees are not asserted here.

### shibuya-crossing-hachiko: FAIL → PASS

- Original finding: Unsupported “world's busiest” superlative and 09:00–17:00 hours.
- Observation at check time: At origin/main, Shibuya Crossing was described with an unsupported world's-busiest claim and giant screens, carried 09:00–17:00 hours, and reservation copy referred to tickets for a public crossing.
- Corrected fields: `description and highlights (EN/JA)`, `businessHours/openingHours/openingHoursJa`, `reservation copy (EN/JA)`.
- Adjudication (manual): The unsupported ranking, screen copy and facility-style schedule are removed. EN/JA copy now describes the crossing and nearby Hachiko statue; no admission or booking is asserted for the public crossing.
- Source (2026-10-16): [https://www.gotokyo.org/en/spot/78/index.html](https://www.gotokyo.org/en/spot/78/index.html) — Official Tokyo tourism page describes pedestrians crossing the multi-cornered intersection from all directions and does not establish an opening schedule or world's-busiest ranking.
- Source (2026-10-16): [https://www.gotokyo.org/en/spot/86/index.html](https://www.gotokyo.org/en/spot/86/index.html) — Official Tokyo tourism page identifies the Hachiko statue near Shibuya Station as a meeting point.
- Residual: Nearby shops and facilities keep their own hours and reservation policies; these are not attributed to the crossing.

### hakone-town: FAIL → PASS

- Original finding: Unsupported 24-hour town-wide access; malformed Japanese highlights.
- Observation at check time: At origin/main, the town-wide hub claimed 24-hour access and the canonical JA highlights were generic/template copy; the reviewed editorial pilot also overrode the canonical Japanese highlight list with broad Lake Ashi/onsen/Owakudani labels.
- Corrected fields: `description (EN/JA)`, `businessHours/openingHours/openingHoursJa`, `highlights (JA; canonical content and reviewed editorial pilot)`, `reservation copy (EN/JA)`, `generic notes removed`.
- Application override (separate from canonical hash patches): `src/shared/data/editorialPilot.ts` · `EDITORIAL_PILOT.hakone-town.ja.highlights` — ["芦ノ湖","温泉","大涌谷"] → ["芦ノ湖の海賊船クルーズ","大涌谷","箱根彫刻の森美術館"]. PlaceCatalog gives the reviewed pilot precedence over canonical content.ja; the specific pilot highlights now match the sourced canonical list without replacing the reviewed Japanese description.
- Adjudication (manual): The town hub no longer claims a fixed or 24-hour schedule. EN/JA descriptions and highlights name distinct attractions, while venue hours and reservations remain operator-specific. The PlaceCatalog editorial pilot took precedence over canonical Japanese highlights, so only this destination's reviewed pilot highlights were aligned with the sourced canonical list; its reviewed Japanese description was preserved.
- Source (2026-10-16): [https://www.hakonenavi.jp/international/en/](https://www.hakonenavi.jp/international/en/) — Official Hakone tourism portal presents multiple areas and separately operated attractions; it does not publish a single town-wide visitor schedule.
- Source (2026-10-16): [https://www.hakonenavi.jp/international/en/spot/105](https://www.hakonenavi.jp/international/en/spot/105) — Official Hakone Sightseeing Cruise page identifies the Lake Ashi pirate-ship cruise and its ports, supporting the localized highlight without a numeric claim.
- Source (2026-10-16): [https://www.hakonenavi.jp/international/en/spot/99](https://www.hakonenavi.jp/international/en/spot/99) — Official Hakone tourism page identifies Owakudani as a visitor attraction; the Japanese pilot highlight names it directly.
- Source (2026-10-16): [https://www.hakonenavi.jp/international/en/spot/65](https://www.hakonenavi.jp/international/en/spot/65) — Official Hakone tourism page identifies the Hakone Open-Air Museum as a separate attraction; its individual schedule is not generalized to the town.
- Residual: Operating hours, fees and booking requirements remain specific to each attraction; no town-wide schedule or ticket is asserted.

### tokyo-tower-minato: FAIL → PASS

- Original finding: Main Deck hours conflict with operator information; identity/copy needs review.
- Observation at check time: At origin/main, Main Deck hours ended at 22:30 with last admission 22:00; EN copy claimed 332.9m and called the tower a post-war symbol, while JA copy was template text and highlights mixed facilities/features without source scope.
- Corrected fields: `businessHours/openingHours/openingHoursJa`, `openingHoursMetadata`, `description (EN/JA): align height to operator's 333m and remove unsupported post-war characterization`, `highlights/notes (EN/JA)`.
- Adjudication (manual): Main Deck hours now match the operator; EN/JA description uses the operator-rounded 333m height, removes the post-war characterization, and keeps Top Deck Tour separate without substituting its schedule.
- Source (2026-10-16): [https://en.tokyotower.co.jp/fee/](https://en.tokyotower.co.jp/fee/) — Official operator fee/business-hours page describes Tokyo Tower as 333m and lists Main Deck 09:00–23:00 with last admission 22:30; it notes congestion may close it earlier. The corrected schedule is scoped only to Main Deck.
- Source (2026-10-16): [https://tdt.tokyotower.co.jp/en/](https://tdt.tokyotower.co.jp/en/) — Official Top Deck Tour site describes a distinct tour experience; its schedule remains separate from Main Deck hours, and no other facility hours are asserted.
- Residual: Top Deck Tour and other facility schedules remain separate and are not asserted. Parking/reservation details were not re-audited in this scope.

### tokyo-skytree-sumida: FAIL → PASS

- Original finding: Fixed hours conflict with date-specific official calendar.
- Observation at check time: At origin/main, a fixed 08:00–22:00 schedule was attached to a venue whose operator publishes a date-specific calendar and can change hours; Japanese copy was template text and its adjacent Solamachi/Planetarium highlights lacked Tokyo Skytree Town scope.
- Corrected fields: `businessHours/openingHours/openingHoursJa`, `openingHoursMetadata`, `description and highlights (EN/JA; nearby Tokyo Skytree Town facilities explicitly scoped)`.
- Adjudication (manual): The fixed schedule is replaced with date-variable guidance and the operator calendar link. Japanese template copy now names the observation decks and scopes Solamachi/Planetarium TENKU as nearby Tokyo Skytree Town facilities; no single historical day's hours are generalized.
- Source (2026-10-16): [https://en.tokyo-skytree.jp/open-hours/](https://en.tokyo-skytree.jp/open-hours/) — Official operator hours page states hours may change without notice, gives last admission one hour before closing, and links a per-day calendar.
- Source (2026-10-16): [https://en.tokyo-skytree.jp/open-hours/day_hours/](https://en.tokyo-skytree.jp/open-hours/day_hours/) — Official date-specific calendar was reviewed; one day's schedule is not promoted as a fixed daily opening time.
- Source (2026-10-16): [https://en.tokyo-skytree.jp/](https://en.tokyo-skytree.jp/) — Official operator homepage names the 634m tower and its 350m/450m observation decks, with Mount Fuji visible on clear days.
- Source (2026-10-16): [https://en.tokyo-skytree.jp/floor/tembodeck_350/](https://en.tokyo-skytree.jp/floor/tembodeck_350/) — Official floor page identifies the Tembo Deck at 350m and says clear-day views span the Kanto Plain.
- Source (2026-10-16): [https://en.tokyo-skytree.jp/floor/tembogalleria/](https://en.tokyo-skytree.jp/floor/tembogalleria/) — Official floor page identifies the Tembo Galleria at 450m.
- Source (2026-10-16): [https://www.tokyo-solamachi.jp/](https://www.tokyo-solamachi.jp/) — Official Tokyo Solamachi site identifies the adjacent shopping complex and its 300-plus stores.
- Source (2026-10-16): [https://www.konicaminolta.com/planetarium/theaters/tenku/index.html](https://www.konicaminolta.com/planetarium/theaters/tenku/index.html) — Official Konica Minolta page identifies Planetarium TENKU as a separately operated attraction in TOKYO SKYTREE TOWN, not inside the tower.
- Residual: The per-day calendar is not machine-checked for a selected visit date; guests must consult the official calendar for their date.

## 2. Polish Fushimi hours copy and source Tokyo Tower illumination

- Date: 2026-10-21 · sources checked: 2026-10-21 · base `b7b6ba2ea6565985a17c01cb869349fcab188860`
- Related PR: [PR A follow-up (kai-306-pr-a-operational-facts)](https://github.com/anee5h/trip-planner/pull/492) (open).
- Canonical SHA-256: `1b2aaac01b82` → `4680b70b5463`.

**Automated validation**

- npm run audit:kai-306 — passed; verified 20 records, 7 changed, 56 field paths and the canonical SHA-256 chain.
- npm run check:catalog-sync — passed; second generation produced zero diff and all generated files are current.
- npm run check:kai-89-structured-templates — passed; audit snapshot is current.

**Manual review**

- Fushimi Inari official access and visitor-guidance pages checked on 2026-10-21; neither lists fixed shrine-ground visiting hours, so the copy states this without claiming 24-hour access.
- Tokyo Tower official Towerpedia and light-up pages checked on 2026-10-21; they support the night-illumination highlight and EN/JA field-specific source links.

### fushimi-inari-taisha: PASS → PASS

- Original finding: Hours text described the review process instead of giving a concise visitor-facing status.
- Observation at check time: The cited official access and visitor-guidance pages provide no fixed visiting-hours schedule for the shrine grounds; no specific schedule is asserted.
- Corrected fields: `businessHours/openingHours/openingHoursJa (EN/JA)`.
- Adjudication (manual): Reworded the hours to remove review-process language while keeping the schedule unknown and office/service schedules separate; no 24-hour claim was restored.
- Source (2026-10-21): [https://inari.jp/en/access/](https://inari.jp/en/access/) — Official access guidance gives transport directions and does not list fixed shrine-ground visiting hours.
- Source (2026-10-21): [https://inari.jp/en/request/](https://inari.jp/en/request/) — Official visitor guidance describes shrine-ground rules and does not list fixed visiting hours.
- Residual: A fixed shrine-ground visiting-hours schedule is not published on the cited official pages.

### tokyo-tower-minato: PASS → PASS

- Original finding: Night illumination highlight lacked a field-specific official source.
- Observation at check time: Official English and Japanese Tokyo Tower pages describe the Tower light-up, including its nightly Landmark Light presentation.
- Corrected fields: `highlights and content.en/content.ja.highlights source metadata`.
- Adjudication (manual): Kept the concise Night illumination highlight and added official EN/JA field-specific sources.
- Source (2026-10-21): [https://en.tokyotower.co.jp/plan/towerpedia/](https://en.tokyotower.co.jp/plan/towerpedia/) — Official Towerpedia describes Tokyo Tower lighting as Landmark Light and states that it switches off at midnight.
- Source (2026-10-21): [https://www.tokyotower.co.jp/lightup/](https://www.tokyotower.co.jp/lightup/) — Official Japanese light-up page describes the tower illumination and its sunset-to-midnight schedule.

## 3. PR #492 review — Fushimi admission evidence and date-aware opening hours

- Date: 2026-10-22 · sources checked: 2026-10-22 · base `9fbac8eea2cdd89e55219eb0f50ec20e221b910a`
- Related PR: [PR #492 review remediation](https://github.com/anee5h/trip-planner/pull/492) (Open; awaiting checks and required sign-off; merge remains unauthorized).
- Canonical SHA-256: `4680b70b5463` → `b830e1595282`.

**Automated validation**

- npm run sync-destination-details regenerated all 1,130 details after canonical edits; npm run check:catalog-sync confirmed a byte-identical second generation.
- Focused Vitest checks passed: 91 tests across six files, including date-aware Meiji evening itinerary, Dotonbori district anchor, and five bounded KAI-260 Fushimi budget estimates.
- npm run audit:kai-219 passed with zero free-without-evidence admission facts.
- npm run audit:kai-306 passed with the 3-entry canonical hash chain; npx tsc --noEmit -p tsconfig.app.json, npm run lint and npm run format:check passed.

**Manual review**

- The KANSAI Guide and Meiji Jingu official visitor page were reviewed on 2026-10-22; source observations are recorded below.
- The additional audit-wide hash-scope issue is recorded for follow-up; this PR keeps the existing 20-destination cohort boundary and does not change the ledger design.

### fushimi-inari-taisha: PASS → PASS

- Original finding: Admission was kept unavailable because the reviewed shrine pages did not state whether general entry is free.
- Observation at check time: The KANSAI Guide lists the shrine fee as free and its grounds as open year-round; the listing was updated 2026-06-23.
- Corrected fields: `admission: verified_free, ¥0–¥0, general_entry`.
- Adjudication (manual): The explicit regional tourism listing is accepted as source evidence for free general entry. The cost is bounded at ¥0–¥0; optional offerings and services remain outside this field.
- Source (2026-10-22): [https://www.the-kansai-guide.com/en/directory/item/11818/](https://www.the-kansai-guide.com/en/directory/item/11818/) — Official Kansai tourism listing explicitly says “[Fee] Free” and “Grounds open year-round”; the price field is scoped to general shrine entry.
- Residual: Voluntary offerings and separate services are excluded from the general-entry cost; the source does not provide a daily visiting-hours schedule.

### meiji-jingu: PASS → PASS

- Original finding: The fresh verifiedAt metadata classified sunrise-to-sunset text as verified, but the planner could not resolve a closing window and could schedule an evening visit after closing.
- Observation at check time: The official visitor page publishes opening and closing times for each month and notes that some facilities inside have shorter hours.
- Corrected fields: `openingHoursMetadata.monthlySchedule`, `planner date-aware schedule assessment and warning`.
- Adjudication (manual): Date-selected plans now use the published month-specific grounds schedule. Without a travel date, the verified descriptive hours remain visible with a scheduling warning.
- Source (2026-10-22): [https://www.meijijingu.or.jp/en/visit/](https://www.meijijingu.or.jp/en/visit/) — Official visitor page provides all 12 monthly opening and closing times, including October 05:40–16:40, and says some internal facilities have shorter hours.
- Residual: The monthly schedule covers the shrine grounds; shorter hours for facilities inside are not modeled as separate itinerary stops.

## 4. PR #492 follow-up — explicit Fushimi free-entry evidence marker

- Date: 2026-10-22 · sources checked: 2026-10-22 · base `799a9c5bdfa9c7ef14eea0199202fbe5bd9451f7`
- Related PR: [PR #492 review remediation](https://github.com/anee5h/trip-planner/pull/492) (Open; awaiting checks and required sign-off; merge remains unauthorized).
- Canonical SHA-256: `b830e1595282` → `7f96234e9e12`.

**Automated validation**

- npm run validate:catalog-fast passed with zero errors; the existing catalogue warnings remain non-blocking.
- Focused Vitest check for kai306PrAOperationalFacts.test.ts passed all 29 tests.
- npm run sync-destination-details regenerated the Fushimi detail file, and npm run check:catalog-sync confirmed generated catalogue consistency.
- npm run audit:kai-306 passed after recording this append-only entry, verifying the four-entry canonical hash chain.

**Manual review**

- The KANSAI Guide listing was re-reviewed on 2026-10-22; it explicitly labels the shrine fee free. The admission field remains limited to general shrine entry, excluding voluntary offerings and separate services.

### fushimi-inari-taisha: PASS → PASS

- Original finding: The regional tourism source supports free general entry, but the catalogue fast validator requires an explicit FREE_ENTRY marker in the evidence basis.
- Observation at check time: The KANSAI Guide lists the shrine admission fee as free and its grounds open year-round; its listing was updated 2026-06-23.
- Corrected fields: `admission.basis: explicit FREE_ENTRY marker with source and scope retained`.
- Adjudication (manual): The admission value remains verified_free at ¥0–¥0 for general entry; the explicit marker makes the cited free-entry evidence legible to the automated validator.
- Source (2026-10-22): [https://www.the-kansai-guide.com/en/directory/item/11818/](https://www.the-kansai-guide.com/en/directory/item/11818/) — Official Kansai tourism listing explicitly says “[Fee] Free” and “Grounds open year-round”; the price field is scoped to general shrine entry.
- Residual: Voluntary offerings and separate services remain excluded from the general-entry cost.
