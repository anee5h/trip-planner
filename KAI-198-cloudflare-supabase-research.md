# KAI-198: Cloudflare and Supabase research

Research checked: 2026-08-25. Sources are limited to current first-party Cloudflare and Supabase documentation available on that date.

## Boundary: account state is not verified

**OWNER ACTION REQUIRED:** Cloudflare and Supabase dashboard/account state is inaccessible in this workspace. This report therefore does not guess Meguruto's actual Cloudflare plan, Workers/Pages billing model, enabled products, deployed `_routes.json`, fail-open/fail-closed setting, rate-limit rules, usage, or Supabase Auth/Data API/RLS/grant configuration. The documented capabilities below are conditional facts, not evidence that any setting is enabled.

No paid Cloudflare or Supabase tier should be enabled based on this research alone.

## Cloudflare Pages routing

`_routes.json` belongs in the build output. Its `include` list identifies routes eligible for Pages Function invocation; `exclude` identifies routes that must not invoke Functions, and `exclude` takes priority over `include`. Wildcards match any number of path segments. At least one include rule is required, the combined include/exclude total is limited to 100 rules, and each rule is limited to 100 characters. [Cloudflare Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)

An `include: ["/*"]` rule invokes Functions on all routes. Cloudflare's example shows that adding an exclusion for a static directory prevents Function invocation and the associated invocation charge. [Cloudflare Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)

Cloudflare says a Pages project with Functions invokes the Function for all requests by default; `_routes.json` is the mechanism for restoring the free static-request path. Static asset requests are free and unlimited on both Free and paid plans when they do not invoke Functions. [Cloudflare Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)

**KAI-198 implication (inference):** removing an include-all rule is not automatically safe for an SPA. A route reduction must preserve whichever application-shell, deep-link, SEO, redirect, and real-404 behavior currently depends on a Function. The documentation establishes the invocation semantics; it does not establish Meguruto's application behavior.

## Pages Functions billing and quota exhaustion

| Area               | Current documented behavior                                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static assets      | Free and unlimited when the request does not invoke a Function. [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)                                                                                                                                                                                        |
| Pages Functions    | Billed as Workers requests. On the Workers Free plan, Pages Function requests share the 100,000-request daily Workers allowance; the allowance resets at midnight UTC. [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Workers Free limit | 100,000 requests per day; when exceeded, Cloudflare returns Error 1027. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)                                                                                                                                                                                         |
| Workers Standard   | $5/month minimum account charge, 10 million requests included per month, then $0.30 per additional million requests; CPU usage has a separate included allowance and overage price. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)                                                                           |

On the Workers Free plan, Pages exposes a **Fail open / closed** setting under the Pages project runtime settings. Fail open bypasses the Function so requests behave as if no Worker is configured; for Pages, Cloudflare describes static assets continuing to be served. Fail closed returns an error page instead of static assets; the Workers limits page identifies the response as Cloudflare Error 1027. [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

The daily Pages Functions limit can be removed by upgrading to Workers Standard, which is a paid plan. That is a billing decision, not a KAI-198 recommendation. [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

**Recommendation:** fail closed is the safer default for security-sensitive/API behavior because it does not silently bypass the Function when the free quota is exhausted. Fail open preserves static availability but can make a route behave as though its Function is absent. The correct project-level choice is still OWNER ACTION REQUIRED because the deployed route mix and current dashboard setting are unknown.

## Free-plan Cloudflare rate limiting

Cloudflare's current rate-limiting availability matrix lists the following for the **Free** plan:

| Capability                        | Free-plan value                                 |
| --------------------------------- | ----------------------------------------------- |
| Rules                             | 1 rule                                          |
| Fields in the matching expression | `Path`, `Verified Bot`                          |
| Counting characteristic           | `IP`                                            |
| Cached-asset exclusion            | Not available                                   |
| Custom counting expression        | Not available                                   |
| Counting model                    | Number of requests                              |
| Counting period                   | 10 seconds                                      |
| Mitigation timeout                | 10 seconds                                      |
| Action behavior                   | Perform the action during the mitigation period |

Source for every row: [Cloudflare rate limiting rules — availability](https://developers.cloudflare.com/waf/rate-limiting-rules/). The same page states that rate-limit rules require an expression, action, counting characteristics, period, requests-per-period, and mitigation timeout/action behavior. [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)

The general rate-limiting parameter model uses `expression`, `characteristics`, `counting_expression`, `requests_per_period`, `period`, `action`, and `mitigation_timeout`. The available period values vary by plan; the API documents values including 10, 60, 120, 300, 600, and 3600 seconds, while the Free availability matrix limits the Free plan to a 10-second counting period and 10-second mitigation timeout. [Cloudflare rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/), [Cloudflare rate limiting rules — availability](https://developers.cloudflare.com/waf/rate-limiting-rules/)

For Free, the documented matching fields do not include Method, User Agent, Source IP as an expression field, query, or request body. The rule can count by IP, but the Free matrix does not provide custom counting expressions or IP-with-NAT support. [Cloudflare rate limiting rules — availability](https://developers.cloudflare.com/waf/rate-limiting-rules/)

**Design implication (inference):** one Free rule can be path-scoped, but it cannot express a separate independent rule for each write endpoint. A low threshold applied to ordinary page GETs would also be exposed to false positives because the counter characteristic is IP; shared NAT/mobile egress can place multiple legitimate users in one IP bucket. Keep ordinary page GETs out of a tight rule and reserve the single rule for the smallest high-cost path set that the account owner confirms.

Free/Pro/Business challenge actions use request throttling rather than a configurable duration; when a visitor passes a challenge, the corresponding counter is reset. The dashboard/API action and duration choices must still be confirmed in the account because plan availability controls the UI. [Cloudflare rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/)

### Bot and crawler caveats

Cloudflare warns that applying rate limiting to verified bots may affect SEO. Cloudflare's bot guidance identifies verified bots such as Googlebot, Bingbot, and uptime monitors, and shows `cf.client.bot` as the verified-bot exception signal. [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [Stop malicious bots while allowing legitimate traffic](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/)

If enabled, Free Bot Fight Mode is broad: it is included for Free plans, applies across the domain, issues computationally expensive challenges to matching bots, and cannot be customized through custom rules. It is therefore not an endpoint-specific substitute for protecting feedback/account writes, and it should be checked against legitimate crawlers and previews before use. [Cloudflare Free bot plan](https://developers.cloudflare.com/bots/plans/free/), [Stop malicious bots while allowing legitimate traffic](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/)

Cloudflare also cautions that rate limiting is not a precise origin-request ceiling: counter updates can lag by a few seconds, so excess requests may reach the origin before mitigation starts. [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)

## Workers CPU limits, pricing, and logs

These are relevant because Pages Functions use the Workers billing/runtime model. On Workers Free, the documented limits are 10 ms CPU time per HTTP request, 128 MB memory, and 50 subrequests per invocation. Exceeding the CPU limit returns Error 1102; exceeding the daily request limit returns Error 1027. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Workers Standard has no request-duration charge or limit, a default 30-second CPU limit that can be raised to 5 minutes, and usage over the included request/CPU allowances is metered. This is why a paid account state must not be assumed when evaluating denial-of-wallet risk. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Workers Logs requires an observability setting for a Worker to write logs. Workers Logs is included on Free and paid plans; the current Free allowance is 200,000 log events per day with 3-day retention, while Workers Paid includes 20 million events per month and charges $0.60 per additional million with 7-day retention. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

## Supabase Auth rate limits and abuse controls

Supabase Auth uses a token-bucket algorithm for IP-limited operations. Each bucket has a maximum capacity of 30 requests; sustained traffic above the refill rate is denied with HTTP 429. Some limits are configurable in Authentication > Rate Limits or through the Management API. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

Current documented Auth limits:

| Operation                                              | Limiting key and documented limit                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Built-in email sends from signup/recovery/email change | Combined project-wide total: 2 emails/hour; adjustable only with custom SMTP.                                      |
| OTP sends                                              | Combined project-wide total: 30 OTPs/hour by default; customizable.                                                |
| OTP/magic-link repeat to the same user                 | 60-second window by default; customizable.                                                                         |
| Signup confirmation repeat to the same user            | 60-second window by default; customizable.                                                                         |
| Password-reset repeat to the same user                 | 60-second window by default; customizable.                                                                         |
| Verification                                           | IP address: 360 requests/hour, with bursts up to 30.                                                               |
| Token refresh                                          | IP address: 1,800 requests/hour, with bursts up to 30.                                                             |
| MFA challenge/verification                             | IP address: 15 requests/hour.                                                                                      |
| Anonymous sign-in                                      | IP address: 30 requests/hour, with bursts up to 30; applies when signup has no email or phone in the request body. |

Source for every row: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits). The actual project values are OWNER ACTION REQUIRED.

By default, Supabase Auth rate-limits using the client IP. For a server-side framework or proxy, end-user-IP forwarding requires the `Sb-Forwarded-For` header, a secret API key, and explicit enablement; publishable and legacy `anon`/`service_role` keys are not supported for this forwarding feature. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits/)

Supabase supports hCaptcha and Cloudflare Turnstile on sign-in, sign-up, and password-reset forms. Supabase specifically recommends invisible CAPTCHA or Turnstile for anonymous sign-ins because anonymous users are stored in the database and can otherwise be abused to grow it; anonymous sign-ins have a documented IP limit of 30/hour. [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)

Supabase Auth also exposes settings to allow/deny new signups and anonymous sign-ins. Whether either flow is enabled for Meguruto is not accessible here. [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration)

## Supabase Data API, RLS, and keys

Supabase documents two separate controls for the Data API: Postgres grants decide whether `anon`, `authenticated`, or `service_role` can reach an object; RLS policies decide which rows those roles can read or modify. Use both controls for every exposed object. [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)

For every table in an exposed schema, Supabase recommends enabling RLS, creating policies per operation, and granting only the privileges each role needs. Adding a policy does not remove existing grants; a table protected only by policies can still retain an unintended insert/update/delete path if grants are left broad. [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)

The `public` schema is exposed by default in Supabase's custom-schema guidance. Objects in exposed schemas therefore need an intentional grant/RLS review. A table or view without RLS can be accessed by any role that has a matching grant. [Supabase using custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)

The publishable key is low privilege and is intended to be exposed in public clients, but only with RLS and least-privilege grants. The legacy `anon` key is likewise a low-privilege project identifier rather than a secret, and must be paired with RLS. Secret keys and the legacy `service_role` key are elevated, bypass RLS, and must remain server-side. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase securing your data](https://supabase.com/docs/guides/database/secure-data), [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

RLS does not apply to functions; Supabase says to grant `EXECUTE` only to roles that need to call them and to review `SECURITY DEFINER` functions carefully. Supabase's Data API pre-request hook can enforce checks such as per-IP/per-user limits, but that hook applies to PostgREST/Data API and not Realtime, Storage, or other Supabase products. [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)

**KAI-198 implication (inference):** Cloudflare Pages/WAF rules protect traffic that reaches the Cloudflare zone, not a client that calls a Supabase project endpoint directly. Direct Supabase traffic therefore needs its own Auth, grant/RLS, function, Storage, and Realtime review; RLS controls authorization and row scope, not a general request-volume budget.

## OWNER ACTION REQUIRED checklist

Do not mark any item as already enabled or free without inspecting the account:

- Cloudflare Workers & Pages → the Pages project → Settings → Runtime → **Fail open / closed**; record the actual mode and test the static/dynamic consequence. [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)
- Cloudflare Security → Security rules → **Rate limiting rules**; confirm whether the Free rule exists, its path expression, threshold, action, and verified-bot handling. Do not assume the one-rule allowance is unused. [Create a Cloudflare rate-limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/)
- Cloudflare **Security Events** and Workers & Pages → Worker → **Observability**; inspect request spikes, mitigations, invocations, CPU errors, and log volume. Free and paid observability/logging allowances differ. [Cloudflare bot guidance](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- Supabase Project Settings → Authentication → **Rate Limits**, **Bot and Abuse Protection/CAPTCHA**, signup/anonymous-sign-in settings, and email/SMTP configuration. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration)
- Supabase API/Data API settings and database grants/RLS: enumerate exposed schemas, tables, views, functions/RPCs, Storage, and Realtime; verify client keys are publishable/legacy anon only and no secret/service-role key is bundled. [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- Record the actual Cloudflare plan, Workers usage model, metered products, quota alerts/caps, and Supabase project plan/usage. None of those account facts are verifiable in this workspace; do not infer them from these docs.

## Source index

- [Cloudflare Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/)
- [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Cloudflare rate limiting parameters](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/)
- [Cloudflare Free bot plan](https://developers.cloudflare.com/bots/plans/free/)
- [Stop malicious bots while allowing legitimate traffic](https://developers.cloudflare.com/use-cases/solutions/stop-malicious-bots/)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase securing your data](https://supabase.com/docs/guides/database/secure-data)
- [Supabase securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase using custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas)
