# KAI-220 Budget v2 final audit

Date: 2026-09-01
Baseline: current `main` after merged KAI-260 / PR #300

## Decision

KAI-260's range-first `TripEstimateEngine` remains the sole traveller-facing
estimate engine. KAI-220 closes the catalogue migration and consumer audit; it
does not restore the earlier strict “all components verified or unavailable”
rule.

The final budget policy is:

| Tier                | Full-day party-total baseline | Per-person daily planning limit | Meaning                                                  |
| ------------------- | ----------------------------: | ------------------------------: | -------------------------------------------------------- |
| Economy             |                       ¥50,000 |                         ¥25,000 | bounded economy ceiling                                  |
| Standard            |                      ¥100,000 |                         ¥50,000 | default planning ceiling                                 |
| Comfortable         |                      ¥200,000 |                        ¥100,000 | broad comfortable ceiling                                |
| Flexible (`luxury`) |                    no ceiling |                      no ceiling | unconstrained matching; neutral standard display profile |

Overnight planner limits add the canonical party-total accommodation profile
per night (`economy ¥6k–12k`, `standard ¥10k–22k`, `comfortable ¥18k–40k`,
`luxury ¥35k–70k`) and do not multiply lodging by party size. Explore and Home
use the same context-aware policy helper; the engine's range is never collapsed
to a midpoint for filtering or display.

## Deterministic five-origin benchmark

Command:

```text
npx tsx --tsconfig tsconfig.app.json scripts/audit/kai-220-budget-audit.ts
```

Origins: Nakayama, Tokyo, Osaka, Hakata, and Naha. Each scenario uses the
canonical engine, the selected valid transport modes, and one- and two-person
parties. `routable` means at least one authorized mode exists; `bounded` means
the chosen mode has a usable finite total range.

| Origin    |            Day p1 |            Day p2 |           2D1N p2 |           3D2N p2 |
| --------- | ----------------: | ----------------: | ----------------: | ----------------: |
| Nakayama  |         916 / 916 |         916 / 916 |         916 / 916 |         916 / 916 |
| Tokyo     |         915 / 915 |         915 / 915 |         915 / 915 |         915 / 915 |
| Osaka     |         801 / 801 |         801 / 801 |         801 / 801 |         801 / 801 |
| Hakata    |         885 / 885 |         885 / 885 |         885 / 885 |         885 / 885 |
| Naha      |         831 / 831 |         831 / 831 |         831 / 831 |         831 / 831 |
| **Total** | **4,348 / 4,348** | **4,348 / 4,348** | **4,348 / 4,348** | **4,348 / 4,348** |

There are 1,187 unroutable origin/destination combinations out of 5,535;
these are excluded as unavailable routes, not priced as zero and not mislabeled
as cost estimates. Among routable combinations, traveller-facing `Cost
unavailable` / `料金不明` count is **0**.

The selected ranges are mostly deterministic estimates rather than verified
source totals: across all 26,088 origin/scenario evaluations, 24,672 are labelled
`estimated` and 1,416 `rough`; no bounded result is presented as verified solely
because it is usable for planning.

### Range distribution (standard profile, selected-mode max)

| Scenario |      p25 |   median |      p75 |      p90 |      max |
| -------- | -------: | -------: | -------: | -------: | -------: |
| Day p1   |  ¥21,900 |  ¥48,600 |  ¥55,100 |  ¥65,500 |  ¥91,500 |
| Day p2   |  ¥43,200 |  ¥97,200 | ¥110,200 | ¥131,000 | ¥183,000 |
| 2D1N p1  |  ¥49,500 |  ¥73,800 |  ¥79,300 |  ¥89,500 | ¥115,500 |
| 2D1N p2  |  ¥77,000 | ¥125,600 | ¥136,600 | ¥157,000 | ¥209,000 |
| 3D2N p1  |  ¥79,000 | ¥103,300 | ¥108,800 | ¥119,000 | ¥145,000 |
| 3D2N p2  | ¥114,000 | ¥162,600 | ¥173,600 | ¥194,000 | ¥246,000 |

The thresholds are therefore intentionally calibrated as party-total baseline
ceilings: ¥50k keeps the economy day-trip band useful, ¥100k brackets the
standard two-person day median, and ¥200k covers 98.0% of two-person 3D2N
selected ranges while leaving the long-tail to Flexible. Lowest Budget remains
available and sorts by the canonical finite range ceiling with deterministic
id tie-breaking; unknown/unroutable values never become accidental zeroes.

## Safety/anomaly checks

The benchmark reports **0 anomalies**. Regression coverage exercises:

- range preservation and outward formatting in English and Japanese;
- verified-free versus missing admission (`unknown != ¥0`);
- missing-origin fares widened to bounded model ranges rather than hidden;
- party-size scaling for person costs;
- party-total accommodation without a second party multiplication;
- overnight meals and accommodation for 2D1N/3D2N;
- no midpoint collapse for range-first estimates;
- Flexible's infinite matching ceiling with a neutral display estimate;
- no synthetic generic destination budget fields in the catalogue;
- Any-budget and canonical Explore budget handling.

## Consumer reconciliation

The following surfaces now use the canonical range/result boundary:

- Home cards and recommendation scoring;
- Explore budget filtering and Lowest Budget sorting;
- destination cards and destination detail transport-cost rows;
- hub/cost-breakdown and at-a-glance widgets;
- Compare page and Compare modal;
- generated itinerary cost summaries through `GeneratedPlanCostService`.

`Explore` no longer uses the selected tier as a second cost formula: the
canonical standard-profile range is compared with the context-aware tier cap.
The tier changes the matching ceiling, not the meaning of the estimate. This
prevents the previous tautology where an economy-profile estimate was always
below its own economy cap.

The generic fields `budgetMin`, `budgetRecommended`, `budgetMax`,
`budgetBreakdown`, and `budgetMetadata` were removed from the canonical index,
lite index, all 1,107 generated detail assets, relationship projection, and
client projection. Their old writer paths are gone; `check:deprecated-fields`
reports zero writers. `BudgetService` keeps only a bounded compatibility facade
for historical fixtures/external callers and has no production catalogue input
for those fields.

## Verification recorded

- `TMPDIR="$HOME/.tmp-vitest" npx vitest run --maxWorkers=2 --reporter=dot`:
  passed; full suite green.
- `npx tsc -b --noEmit`: passed.
- `npm run typecheck:kai256`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run validate:i18n` and `npm run validate:localization`: passed.
- `npm run check:branding`: passed.
- `npm run validate:catalog-fast`: passed; 0 errors.
- `npm run check:catalog-ci`: passed; all catalogue/model gates green.
- `npm run check:catalog-sync`: passed; two-run idempotency and committed
  generated outputs are byte-identical.
- `npm run check:deprecated-fields`: passed; zero catalogue writers.
- `npm run build`: passed.
- `npm run seo:check`: passed.
- `npm run verify:pages-functions`: passed.
- `npm run check:bundle-secrets`: passed.
- `npm run audit:kai-89-structured-templates`: passed.
- `npx playwright test e2e/kai-89-data-safety.spec.ts`:
  passed on mobile and desktop.
- `git diff --check`: passed.

The KAI-74 mobile Japanese overnight-rail assertion still fails because the
existing recommendation pipeline intentionally suppresses overnight candidates
when no personalized origin is configured; this KAI-220 diff does not change
that eligibility rule (the pipeline change only propagates estimate quality).
The standalone accessibility run also hit the environment's Chromium GPU
crash before assertions completed. These are recorded as pre-existing or
environment caveats, not represented as passing checks.

Independent Codex Luna review completed against the executable change set and
verified generated-artifact evidence: **PASS**, with no blocking findings.
Non-blocking suggestions were to add explicit Flexible URL round-trip tests and
expand the audit to non-standard tier scenarios; neither blocks KAI-220.
