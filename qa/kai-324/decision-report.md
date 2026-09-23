# KAI-324 — Provenance and approval dry run

Catalogue base: `c25fb10ad594b539799d23e1edc7cd60f3051393` (verified: yes)
KAI-323 artifact base: `a94556fcf2718a05a90c69df878c7c2b44779492`
Catalogue snapshot SHA-256: `4ea4060831362061eed18d11ecb0f62a24f604463c4019159faae183a9c89c92`
KAI-323 validated artifacts: 25/25/25/25 records; accepted/manual: 8

This is a deterministic, read-only evaluation. It does not mutate the canonical catalogue, derived assets, Supabase, budget calculations, or production services.

## Ownership

- Canonical admission source of truth: `src/shared/data/destinations-index.json` (`Destination.admission`)
- Validator: `src/shared/services/budget/factValidation.ts`
- Budget consumers: `src/shared/services/budget/tripEstimateEngine.ts`, `src/shared/services/budget/BudgetService.ts`, `src/shared/services/budget/GeneratedPlanCostService.ts`
- Eventual approved publish target: `Destination.admission in src/shared/data/destinations-index.json`
- This PR does not execute that publish.

## Decision counts

- Total KAI-323 records evaluated: **25**
- Automatically approved: **0**
- Held for manual review: **11**
- Rejected proposed replacements: **14**
- KAI-323 accepted research candidates represented: **8**; none are automatically approved by this gate.
- Existing admission facts explicitly untouched: **25**

## Rules

- Automatic approval requires exact destination identity, an HTTPS official source matching the registry, successful source access, sanitized evidence, explicit product/category/scope/tax/date metadata, valid JPY values, manual verification, equivalence with the trusted current fact, and no conflict.
- Variable, date/time-dependent, bundled, premium, online/counter, age-band, changed-source, stale, or condition-ambiguous facts are held.
- Failed/unresolved source results are rejected as replacements; they never clear or downgrade the existing fact.
- Free requires explicit free evidence; zero or missing prices are not free.
- `observedMinimum`/`observedMaximum` from KAI-323 parser output are not treated as admission bounds.

## Decision trails

### cup-noodles-museum-yokohama
- Decision: **held_for_review**
- Prior KAI-323 action: `price\_matches\_review\_scope`
- Confidence: medium
- Source: https://www.cupnoodles-museum.jp/en/yokohama/ (price\_text\_retrieved)
- Evidence quotation: “Admission Fee — Adults: 500 yen; high school age children and younger admitted free. Admission-only online tickets are not available; My CUPNOODLES Factory voucher is a separate product.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `age_band_requires_review`, `pricing_scope_requires_review`, `source_not_currently_trusted`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`, `kai323_scope_review_required`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### disneyland
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.tokyodisneyresort.jp/en/tdl/ticket/index (timeout)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_access_degraded`, `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### disneysea
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.tokyodisneyresort.jp/en/tds/ticket/index (timeout)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_access_degraded`, `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### enoshima-aquarium
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.enosui.com/en/ (admission\_labels\_retrieved\_numeric\_table\_not\_recovered)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### fukui-prefectural-dinosaur-museum
- Decision: **held_for_review**
- Prior KAI-323 action: `manual\_review`
- Confidence: medium
- Source: https://www.dinosaur.pref.fukui.jp/en/info.html (price\_labels\_retrieved\_numeric\_table\_not\_recovered)
- Evidence quotation: “Admission Fees; Adults; Child; admission to Field Station is not included.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `manual_review_required`
- Proposed field changes: none
- Existing fact untouched: **yes**

### fukuoka-art-museum
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.fukuoka-art-museum.jp/en/visit/ (admission\_labels\_retrieved\_numeric\_table\_not\_recovered)
- Evidence quotation: “Hours and Admission; adult ticket label present; numeric values not recovered.”
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### ghibli-museum
- Decision: **held_for_review**
- Prior KAI-323 action: `price\_matches\_review\_scope`
- Confidence: medium
- Source: https://www.ghibli-museum.jp/en/tickets/ (price\_text\_retrieved)
- Evidence quotation: “Admission by age: 19+ JPY 1,000; 13–18 JPY 700; 7–12 JPY 400; 4–6 JPY 100. Advance reservation required; no museum-counter purchase.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `channel_price_requires_review`, `weekday_condition_requires_review`, `pricing_scope_requires_review`, `source_not_currently_trusted`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`, `kai323_scope_review_required`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### hamarikyu-gardens
- Decision: **held_for_review**
- Prior KAI-323 action: `price\_matches\_review\_scope`
- Confidence: medium
- Source: https://www.tokyo-park.or.jp/teien/en/hama-rikyu/outline.html (price\_text\_retrieved)
- Evidence quotation: “Entrance fee: ¥300 (65 and over: ¥150); no charge for primary school children or younger and eligible Tokyo junior-high students.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `age_band_requires_review`, `pricing_scope_requires_review`, `source_not_currently_trusted`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`, `kai323_scope_review_required`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### himeji-castle
- Decision: **held_for_review**
- Prior KAI-323 action: `manual\_review`
- Confidence: medium
- Source: https://www.himejicastle.jp/en/ (page\_retrieved\_price\_not\_recovered)
- Evidence quotation: none
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `evidence_quotation_missing`, `manual_review_required`
- Proposed field changes: none
- Existing fact untouched: **yes**

### jigokudani-monkey-park
- Decision: **rejected**
- Prior KAI-323 action: `remain\_unknown`
- Confidence: low
- Source: https://en.jigokudani-yaenkoen.co.jp/ (admission\_revision\_notice\_no\_numeric\_price\_recovered)
- Evidence quotation: “Important Notice Regarding Admission Fee Revision; online ticketing announced.”
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### kenroku-en
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.pref.ishikawa.jp/siro-niwa/kenrokuen/ (page\_retrieved\_price\_not\_recovered)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### korakuen-okayama
- Decision: **held_for_review**
- Prior KAI-323 action: `price\_matches\_review\_scope`
- Confidence: medium
- Source: https://okayama-korakuen.jp/section/english/info/index.html (price\_text\_retrieved)
- Evidence quotation: “Individual Tickets: ¥500; child entry shown as free of charge. Combined tickets and partner museum tickets are separate products.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `pricing_scope_requires_review`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`, `kai323_scope_review_required`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### matsumoto-castle-nagano
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.matsumoto-castle.jp/lang/eng/ (page\_retrieved\_price\_not\_recovered)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### national-museum-of-nature-and-science
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.kahaku.go.jp/english/visit/ (official\_path\_not\_found)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_access_degraded`, `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### osaka-aquarium-kaiyukan
- Decision: **held_for_review**
- Prior KAI-323 action: `manual\_review`
- Confidence: medium
- Source: https://www.kaiyukan.com/language/eng/ (ticket\_labels\_retrieved\_numeric\_table\_not\_recovered)
- Evidence quotation: “Admission fees and other tickets; e-tickets on sale now.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `manual_review_required`
- Proposed field changes: none
- Existing fact untouched: **yes**

### osaka-castle
- Decision: **held_for_review**
- Prior KAI-323 action: `price\_matches\_review\_scope`
- Confidence: medium
- Source: https://www.osakacastle.net/guide/ (price\_text\_retrieved)
- Evidence quotation: “通常料金 大人 1,200円; 600円 要証明; 無料 要証明; 2025年4月1日から入館料変更.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `pricing_scope_requires_review`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`, `kai323_scope_review_required`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### sapporo-beer-museum
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.sapporobeer.jp/brewery/s\_museum/ (page\_retrieved\_price\_not\_recovered)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### shibuya-sky-shibuya
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.shibuya-scramble-square.com/sky/ticket/ (tls\_validation\_failed)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_access_degraded`, `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### teamlab-borderless-azabudai
- Decision: **held_for_review**
- Prior KAI-323 action: `review\_required\_variable\_product`
- Confidence: medium
- Source: https://borderless.teamlab.art/tokyo/ (variable\_price\_text\_retrieved)
- Evidence quotation: “Dynamic pricing: 18+ JPY 3,600; 13–17 JPY 2,800; 4–12 JPY 1,500; on-site purchase +200 yen; Flexible Pass JPY 1,800 is a distinct product.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `variable_or_date_dependent`, `age_band_requires_review`, `channel_price_requires_review`, `weekday_condition_requires_review`, `pricing_scope_requires_review`, `source_not_currently_trusted`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### teamlab-botanical-garden-osaka
- Decision: **held_for_review**
- Prior KAI-323 action: `review\_required\_variable\_product`
- Confidence: medium
- Source: https://www.teamlab.art/e/botanicalgarden/ (variable\_price\_text\_retrieved)
- Evidence quotation: “Dynamic pricing: 16+ JPY 1,800; 6–15 JPY 500; preschool children; on-site surcharge +200 yen adults/+100 yen children.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `variable_or_date_dependent`, `age_band_requires_review`, `channel_price_requires_review`, `weekday_condition_requires_review`, `pricing_scope_requires_review`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### teamlab-planets
- Decision: **held_for_review**
- Prior KAI-323 action: `review\_required\_conflict\_or\_scope`
- Confidence: medium
- Source: https://planets.teamlab.art/tokyo (price\_text\_retrieved)
- Evidence quotation: “18 Years and above JPY 4,200; Junior high school students / High school students JPY 2,800; Ages 4-12 JPY 1,500; 3 years old and younger.”
- Reason: A candidate exists, but provenance, scope, conflict, freshness, or manual-review requirements prevent automatic approval.
- Validation issues: `admission_scope_missing`, `visitor_category_missing`, `tax_basis_missing`, `verification_date_missing`, `age_band_requires_review`, `channel_price_requires_review`, `weekday_condition_requires_review`, `pricing_scope_requires_review`, `trusted_state_conflict`, `source_not_currently_trusted`, `existing_product_metadata_missing`, `existing_visitor_category_missing`, `existing_tax_basis_missing`
- Proposed field changes: `/admission` candidate retained for review
- Existing fact untouched: **yes**

### tokyo-skytree-sumida
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://tokyo-skytree.jp/en/ticket/individual/reservation/online.html (dns\_failure)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `source_access_degraded`, `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### tokyo-tower-minato
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://en.tokyotower.co.jp/ticket/ (ticket\_page\_retrieved\_no\_numeric\_text)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### universal-studios-japan
- Decision: **rejected**
- Prior KAI-323 action: `no\_new\_evidence\_keep\_current`
- Confidence: low
- Source: https://www.usj.co.jp/web/en/us/tickets (page\_retrieved\_no\_price\_text)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

### zenkoji-temple
- Decision: **rejected**
- Prior KAI-323 action: `remain\_unknown`
- Confidence: low
- Source: https://www.zenkoji.jp/en/ (page\_retrieved\_price\_not\_recovered)
- Evidence quotation: none
- Reason: No defensible new admission fact was produced; the existing catalogue fact remains untouched.
- Validation issues: `evidence_quotation_missing`, `source_failure_or_unresolved`
- Proposed field changes: none
- Existing fact untouched: **yes**

## Publish boundary

The publish helper requires a separate reviewed approval artifact containing the deterministic report SHA, reviewer, review date, explicit confirmation, and approved destination IDs. It validates every approved change before writing, writes a backup, uses an atomic file replacement, is idempotent, and supports restoring the backup. No approval artifact or production publish was executed in this PR.
