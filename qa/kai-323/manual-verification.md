# KAI-323 Manual Verification

Base: `a94556fcf2718a05a90c69df878c7c2b44779492`

## Counts

- Attempted destinations: **25**
- Official page responses at HTTP 200: **17**
- Accepted structured results after manual review: **8**
  - Fixed/adult or age-band results: 6
  - Variable/date-dependent results: 2
- Unresolved, failed, or manual-review-only results: **17**
- Accepted extraction precision: **8/8 = 100%** for records classified as accepted after manual review.
- Coverage: **8/25 = 32%** of the pilot cohort; this is not a catalogue-wide accuracy claim.

A page returning HTTP 200 was never counted as an extraction success by itself. Accepted results required all of: correct attraction identity, an official source URL, a named ticket product, currency, the applicable visitor category, and a manually reviewed source-text basis. Variable results remained variable and were not turned into a fixed catalogue range.

## Accepted results

- teamLab Planets: adult JPY 4,200; age-band values retained separately; time-specified online admission; no on-site sale text preserved.
- Osaka Castle Museum: ordinary adult admission JPY 1,200; student/exemption categories retained separately.
- Hamarikyu Gardens: adult JPY 300; senior and conditional free-entry text retained as conditions.
- Korakuen Garden: individual adult admission JPY 500; child wording retained without inventing an age mapping.
- Cup Noodles Museum Yokohama: adult JPY 500; high-school age and younger free; admission-only online/counter distinction retained.
- Ghibli Museum: JPY 1,000 / 700 / 400 / 100 age bands; advance reservation only.
- teamLab Borderless: current dynamic-price example and age bands; on-site surcharge and Flexible Pass kept distinct; no catalogue range proposed.
- teamLab Botanical Garden Osaka: current dynamic-price example and age bands; on-site surcharge and preschool category kept distinct; no catalogue range proposed.

## Unresolved or unsupported outcomes

- Date-dependent park pricing: Universal Studios Japan, Tokyo Disneyland, Tokyo DisneySea.
- Dynamic or product-dependent pages without a defensible fixed result: Tokyo Tower, Osaka Aquarium, Fukuoka Art Museum, and several regional attractions.
- Technical failures: Shibuya Sky TLS validation, Tokyo Skytree DNS, Disney page timeouts, and the selected National Museum path returning 404.
- Numeric tables not recovered safely: Fukui Dinosaur Museum, Enoshima Aquarium, Himeji Castle, Kenrokuen, Matsumoto Castle, Sapporo Beer Museum, Zenko-ji, and others.
- Jigokudani Monkey Park exposed an admission-fee revision notice but not a current numeric amount in the bounded response; it remains unknown.

No unresolved record was converted to free, zero, a fabricated range, or an approved catalogue update.
