# KAI-323 Apify Evaluation

Base: `a94556fcf2718a05a90c69df878c7c2b44779492`

## Decision

Do not adopt Apify for this pilot. A bounded standard-HTTP probe was sufficient to retrieve 17 of 25 official pages, and 8 records yielded price text that survived manual review. The remaining failures were primarily date/product-dependent pages, JavaScript or table-rendering gaps, timeouts, DNS/TLS failures, and unresolved official content—not problems that a generic crawler would safely solve without additional product-specific interpretation.

A browser Actor could improve page rendering for some sources, but it would not make date-selected prices into a defensible fixed fee. It would also add terms, rate-limit, credential, and cost-management surface. No Actor was implemented, no existing Actor was invoked, and no recurring scrape was configured.

## Usage and spending

- Apify requests: **0**
- Apify Actors: **0**
- Apify credits consumed: **0**
- Apify cost: **$0**
- Spending cap used for this pilot: **$0 hard cap**; no additional credits or plan upgrade authorized.
- Apify credentials: not used and not stored.

## HTTP comparison

- Cohort: 25 official URLs.
- Robots probe: 25 domains/paths checked; none returned a `Disallow: /` rule for `User-agent: *` in the bounded parser.
- Page responses: 17 returned HTTP 200; 8 were timeout, DNS/TLS, 404-path, or otherwise non-success cases.
- Accepted structured/manual results: 8.
- Terms pages: no terms result was systematically located in this probe, so no recurring automation permission is claimed for any domain.
- The one-off probe used a normal descriptive user agent, one-second inter-domain pacing, no authentication, no CAPTCHA bypass, no paywall bypass, and no Google Maps or reseller data.

## Recommendation

Keep a lightweight, opt-in HTTP/fixture pipeline for source research. Reconsider a browser-capable provider only after KAI-324 defines source eligibility and conflict/approval gates, and only with an explicit per-run cap and a source-specific reason that static HTTP is insufficient. Do not schedule KAI-327 work from this pilot alone.
