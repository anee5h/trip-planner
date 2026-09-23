# KAI-323 Proposed Admission Updates

Base: `a94556fcf2718a05a90c69df878c7c2b44779492`

This is a reviewed proposal only. No production catalogue or Supabase record was changed.

- Cohort size: **25**
- Outcome counts: manual_review 3, no_change_confirmed 5, remain_unknown 14, review_required_conflict_or_scope 1, review_required_variable_product 2
- A variable/date-dependent result is not converted into a fixed catalogue fee.
- Different ticket products remain separate; unresolved records remain unresolved.

| Destination | Existing | Extracted result | Proposed action |
| --- | --- | --- | --- |
| cup-noodles-museum-yokohama | 500–500 JPY | 500 JPY adult; museum admission only; factory voucher excluded | no_change_confirmed |
| disneyland | variable | failed: Bounded request timed out; no price claim made. | remain_unknown |
| disneysea | variable | failed: Bounded request timed out; no price claim made. | remain_unknown |
| enoshima-aquarium | 3320–3320 JPY | unresolved: Official page returned 200 but numeric admission values were not recovered from the bounded response. | remain_unknown |
| fukui-prefectural-dinosaur-museum | 1000–1000 JPY | manual_review: Official price labels and product boundary were recovered, but numeric table values were not recovered safely. | manual_review |
| fukuoka-art-museum | open_ended | unresolved: Official page was reachable but no defensible numeric value was recovered. | remain_unknown |
| ghibli-museum | 1000–1000 JPY | 1000 JPY adult; Ghibli Museum admission | no_change_confirmed |
| hamarikyu-gardens | 300–300 JPY | 300 JPY adult; garden entrance | no_change_confirmed |
| himeji-castle | 2500–2500 JPY | manual_review: Official page was reachable and identified admission products, but no numeric price was safely recovered from the sanitized response. | manual_review |
| jigokudani-monkey-park | unavailable | unresolved: Official page exposed a fee-revision notice but no current numeric price was recovered; remain unknown. | remain_unknown |
| kenroku-en | 320–320 JPY | unresolved: Official page returned 200 but numeric admission text was not recovered in the bounded response. | remain_unknown |
| korakuen-okayama | 500–500 JPY | 500 JPY adult; Korakuen individual admission | no_change_confirmed |
| matsumoto-castle-nagano | 1200–1300 JPY | unresolved: Official page returned 200 but numeric admission text was not recovered in the bounded response. | remain_unknown |
| national-museum-of-nature-and-science | 630–630 JPY | failed: Selected official path returned 404; no alternate page was forced during the bounded pilot. | remain_unknown |
| osaka-aquarium-kaiyukan | 2800–3500 JPY | manual_review: Official page was reachable but numeric price values were not recovered safely. | manual_review |
| osaka-castle | 1200–1200 JPY | 1200 JPY adult; Osaka Castle Museum ordinary admission | no_change_confirmed |
| sapporo-beer-museum | 1000–1000 JPY | unresolved: Official page returned 200 but numeric admission text was not recovered; free museum access must not be inferred. | remain_unknown |
| shibuya-sky-shibuya | variable | failed: TLS certificate validation failed during the bounded HTTP probe; no price claim made. | remain_unknown |
| teamlab-borderless-azabudai | variable | 3600 JPY adult; Entrance Pass; current displayed dynamic-price example | review_required_variable_product |
| teamlab-botanical-garden-osaka | variable | 1800 JPY adult; teamLab Botanical Garden admission; current displayed dynamic-price example | review_required_variable_product |
| teamlab-planets | open_ended | 4200 JPY adult; regular admission ticket; premium pass kept distinct | review_required_conflict_or_scope |
| tokyo-skytree-sumida | 1800–3600 JPY | failed: DNS failure for the selected official host; no price claim made. | remain_unknown |
| tokyo-tower-minato | 1500–1500 JPY | unresolved: Official ticket page was reachable but numeric prices were not recoverable from the bounded response; products must not be mixed. | remain_unknown |
| universal-studios-japan | variable | unresolved: Official page returned 200 but no defensible numeric price text was present in the bounded response; do not infer a fixed fee. | remain_unknown |
| zenkoji-temple | unavailable | unresolved: Official page returned 200 but no defensible numeric price text was recovered. | remain_unknown |
