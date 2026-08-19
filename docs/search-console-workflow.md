# Search Console organic-discovery & CTR-optimization loop (KAI-120)

This document is the **operating manual** for the recurring Search Console
review. It deliberately separates:

1. **Repo-automatable work** — the readiness checker, sitemap/canonical/hreflang
   generation, SEO validation scripts, and this process.
2. **Owner-side Search Console actions** — property verification, sitemap
   submission, export/download of data, and any Google account work. These
   require Aneesh's Google login and CANNOT be automated from the repo.

## Repo-side tooling

```bash
npm run check:search-console   # static readiness gate (no auth, no network)
npm run check:search-console -- --live   # also probes meguruto.app surfaces
```

`scripts/check-search-console-readiness.mjs` verifies deterministically
(build-free: it generates the SEO output **in memory** from the source SPA
shell via the pure prerender functions, so it can never silently skip):

- `public/robots.txt` exists with the sitemap directive;
- the sitemap is the **exact set** of canonical EN destination URLs (all
  978 — `status` is quality metadata only, never an indexability gate) plus
  the public hub URLs, with no missing/unexpected/duplicate entries and no
  `/ja/...` URLs (KAI-108 hreflang is HTML-based, not sitemap-based);
- the post-KAI-108 HTML contract on every prerendered page: exact EN
  canonical on EN pages, exact JA canonical on JA pages, and the identical
  complete `en`/`ja`/`x-default` hreflang set on both locales, with exact
  `<html lang="en">` / `<html lang="ja">` — **no status-based exception**;
- **no** private/QA/e2e/account surface (`/settings`, `/my-trips`,
  `/bucket-list`, `/passport`, `/profile`, `/favorites`, `/visited-map`,
  `/qa`, `/editorial`, `/compare`, `/e2e`) leaks into the sitemap or prerender.

`--live` additionally probes `https://meguruto.app` (unauthenticated,
read-only) with content assertions: robots.txt 200 + sitemap directive,
sitemap.xml 200 + expected destination coverage, EN home + JA home exact
canonical + hreflang, a representative EN/JA destination pair, and a
representative private route exposing `x-robots-tag: noindex`.

## Owner-side Search Console setup (one-time)

1. In Google Search Console, add the **Domain property** `meguruto.app`
   (Domain-property verification covers all subdomains + protocols).
2. **Domain properties support DNS verification only** — verify via a DNS
   TXT record (no repo change, nothing to commit or keep out of the sitemap).
   HTML-file token verification belongs to URL-prefix properties and is NOT
   used here.
3. In **Sitemaps**, submit `https://meguruto.app/sitemap.xml`.
4. Confirm Search Console reports the sitemap as "Success", then use the
   **Page indexing** report (not the old "Coverage" page) to monitor
   indexed/non-indexed URLs and their reasons.

> ⚠️ No verification token is committed to the repo (DNS verification needs
> none). No credentials or API keys are committed.

## Indexing expectations (all 978 canonical destinations)

Meguruto's SEO contract (KAI-97 + KAI-108):

- **978 canonical destinations**; all 978 are public/indexable;
- `status` (`published`/`beta`/`verified`/`planned`) is **quality metadata
  only** — it never gates indexability, sitemap inclusion, prerendering, or
  hreflang;
- all 978 get EN + JA prerendered pages;
- all 978 EN canonical destination URLs appear in the sitemap;
- the JA mirror is localized copy; hreflang (`en`/`ja`/`x-default`) carries
  the locale relationship in the HTML.

Google does NOT guarantee every submitted/indexable URL enters the index.
The workflow therefore monitors **indexing reasons and trends** (e.g.
"Discovered – currently not indexed", "Crawled – currently not indexed",
"Excluded" reasons) rather than demanding one exact indexed count equal to
978 or any other fixed number. A large unexpected spike in one reason — or
a destination family disappearing — is the signal to investigate, not a
single count.

## Weekly review process

Run this every week, 10–15 minutes, from the Search Console **Performance**
report (28-day window).

### 1. Branded pulse (1 min)

Search Console → Performance → filter query contains `meguruto` OR `メグルト`.
Record clicks, impressions, CTR, avg position into the trend sheet (below).
A large branded-impression drop = investigate (indexing, sitemap, robots).

### 2. Non-branded scan (5 min)

Performance → exclude branded queries. Sort by impressions. Then:

- **Indexing/technical** (Page indexing report first): any spikes in
  Excluded/Not indexed/Discovered-currently-not-indexed for destination
  URLs? Escalate to the sitemap/robots/hreflang workstreams (KAI-108/68).
- **Low-CTR / high-impression**: queries with impressions > threshold but
  CTR < 2%. These are snippet/title/description candidates → KAI-117.
- **Positions 5–30**: queries where Meguruto ranks 5–30 with real (non-zero)
  impressions. These are the **organic-growth backlog** — improving an
  existing page beats creating a new one.
- **Query clusters**: group near-identical queries (singular/plural,
  word order, locality variants) into ONE cluster before judging demand.
  A cluster with repeated unmet intent = candidate for existing-page depth
  or (rarely) a new page.

### 3. EN vs JA review (when enough data exists)

Once both locales have meaningful impression volume, compare them:

- EN pages vs `/ja/` pages: impressions, clicks, CTR, avg position, and
  which queries each wins;
- JA-specific discovery gaps (Japanese-language queries the EN pages don't
  answer and vice versa);
- hreflang sanity: no locale cannibalization signal (EN page ranking for JA
  queries or the reverse) in the Page indexing + Performance reports.

### 4. Classify opportunities (3 min)

For each meaningful opportunity, classify before acting:

| Class | What it means | Action |
|---|---|---|
| **Indexing/technical** | crawler, canonical, sitemap, hreflang, 404, rendering | Fix technical issue; escalate to Linear (KAI-68/108/117 as appropriate) |
| **CTR/snippet** | shown but presentation weak | Title/H1/meta description work → KAI-117 |
| **Existing-page depth** | intent relevant but page shallow | Add genuinely useful content/internal links/images to the canonical page |
| **New distinct page type** | repeated intent, no strong canonical, Meguruto has unique data | Create ONE new page (comparison, collection, high-intent origin) |
| **Ignore/observe** | low-volume noise, irrelevant intent, insufficient evidence | Do nothing; log for later |

Default: **improve the strongest existing canonical page** before creating a
new one.

### 5. Decision rubric for new pages

Create a new public page ONLY when ALL hold:

- repeated/meaningful demand (cluster-level impressions, not one long-tail);
- distinct user intent not well served by any existing canonical page;
- enough unique Meguruto data/content to fill the page honestly (travel
  time, cost, seasonality, interests — from the catalogue, never invented);
- a clear internal-link home (destination → city/prefecture → collection →
  related destination → origin/day-trip page).

Never create doorway/scaled pages (`/day-trip-from-X-to-Y` × every origin ×
every season). A single long-tail impression is never sufficient.

### 6. Record & escalate

- Keep a lightweight trend sheet (private, not in the repo): date, branded
  clicks/impressions/CTR/avg-position, top 5 non-branded queries/pages,
  indexing warnings, actions taken.
- Every action maps to a Linear ticket (KAI-115/116/117/118/119/127/123).
  Attach the exact query/page evidence to the ticket.
- **No fabricated data.** Reports cite Search Console exports only.

## How findings feed Linear

| Finding | Linear target |
|---|---|
| Weak titles/snippets | KAI-117 |
| Destination/collection depth gaps | KAI-115/116/118 |
| Image/Discover presentation | KAI-119 |
| New page type (comparisons, origins) | KAI-115 + new ticket |
| Internal-link structure | KAI-116 |
| Branded Japanese visibility | KAI-114 |

## Baseline trend sheet (private artifact)

Owner fills this from the first Search Console export. It is NOT committed
to the repo — it contains private account data.

| Date | Branded clicks | Branded impr. | Branded CTR | Branded avg pos. | Non-branded impr. | Indexed page count | Top queries (top 5) | Top pages (top 5) | Notes |
|---|---|---|---|---|---|---|---|---|---|

First export row should capture: clicks, impressions, CTR and average
position (branded and non-branded), the Page-indexing indexed page count,
top queries, top pages, and — once both locales have data — the EN vs JA
comparison (clicks/impressions/CTR/position per locale).

## Critical restrictions

- Do not invent ranking data; use Search Console exports/screenshots only.
- Do not commit verification tokens, credentials, or API keys.
- Do not create pages for trivial query variations.
- Do not bundle unrelated SEO implementation into this workflow ticket.
