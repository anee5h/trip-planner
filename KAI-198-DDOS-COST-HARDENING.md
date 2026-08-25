# KAI-198 — DDoS and cost-hardening audit

Checked 2026-08-25 (Asia/Tokyo). This is the evidence record for the focused
implementation on fix/kai-198-ddos-cost-hardening.

## Handoff status

- Starting branch: fix/kai-198-ddos-cost-hardening
- Starting SHA: c9e82006b763cc46400c3f7bef8ee6e71c731811
- Starting status: clean; branch matched origin/main at the starting SHA
- Repository instructions: /tmp/KAI-198-agent-instructions.md was read in
  full. No RELEASE_RULES.md, AGENTS.md, or CLAUDE.md was present in this
  checkout.
- No merge was performed.
- Final commit and PR handles are supplied in the agent handoff after push.
- npm ci was required because the initial checkout had incomplete node_modules;
  it completed successfully. The repository pins Node 22.14.0 but this
  workspace ran Node 26.5.0/npm 11.17.0. Build and focused checks pass in this
  environment; repeat the normal CI gate on the pinned runtime.

**OWNER ACTION REQUIRED:** Cloudflare and Supabase dashboards, deployed
bindings, plan, billing, usage, quota settings, WAF rules, fail-open/fail-closed
mode, Access applications, Auth settings, grants, and RLS policies were not
accessible. This report never treats account state as verified and does not
recommend enabling a paid product or changing production data.

## Executive result

The repository-side cost/abuse boundary is ready for review:

1. Pages Function invocation changed from an include-all /* rule to a 46-entry
   application/API allowlist. The 15 static exclusions and includes total 61
   rules, below Cloudflare's documented 100-rule limit.
2. A top-level English and Japanese 404.html removes Pages' default SPA
   fallback for excluded static misses. Scanner paths and missing assets now
   return cheap real 404 pages rather than the 4.9 kB SPA shell.
3. Feedback, error reporting, and account deletion now have bounded request
   bodies, endpoint-specific abuse guards, and Retry-After responses. The
   in-isolate guard is intentionally best effort; a Cloudflare edge rule
   remains an owner action.
4. The Japanese QA mirror is now behind the same fail-closed Cloudflare Access
   guard as English QA.
5. A missing destination manifest now fails closed with a noindex 503 and
   Retry-After, rather than returning a Function-rendered shell for every
   arbitrary destination ID.
6. Static/Function security headers, EN/JA SEO behavior, private noindex
   behavior, protected routes, PWA assets, bundle secret scanning, and the
   hostile-path corpus pass locally.

The production billing/usage baseline and after metrics cannot be claimed
without owner dashboard access. The measurable local before/after evidence is
recorded below.

## Request-family audit and route table

Cloudflare documents that _routes.json controls which paths can invoke Pages
Functions, with exclude taking priority, and that static requests which do not
invoke a Function are free and unlimited. See [Pages Functions
routing](https://developers.cloudflare.com/pages/functions/routing/) and
[Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

### Before

public/_routes.json contained one include rule, /*, plus 13 static
exclusions. Therefore every non-excluded request was eligible for a Function,
including arbitrary scanner paths and all application deep links.

The Pages project had no top-level 404 page. Cloudflare documents that without a
top-level 404.html, Pages assumes an SPA and matches incoming paths to the
root. In the local Pages runtime, /assets/nonexistent.js and
/data/nonexistent.json consequently returned the root shell with status 200.
See [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

### After

The full route policy is in public/_routes.json:

| Request family                                                                                                                                                                                                                                | Function ownership after the change                                              | Required behavior                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| /                                                                                                                                                                                                                                             | Catch-all Function exact route                                                   | EN shell, security headers                                                                                |
| EN shell routes: /destinations, /collections, /compare, /favorites, /bucket-list, /my-trips, /passport, /visited-map, /profile, /settings, /help, /qa, /editorial, /terms, /privacy, /cookies                                                 | Catch-all Function exact routes                                                  | Preserve navigation, redirects, private noindex, and headers                                              |
| EN collections: /collections/*                                                                                                                                                                                                                | Catch-all Function, one slug segment                                             | SPA shell for valid client route; deeper unknown paths are static 404                                     |
| EN destinations: /destinations/*                                                                                                                                                                                                              | Dedicated destination Function                                                   | Manifest lookup, prerendered SEO HTML, locale shell for known non-published IDs, real 404 for unknown IDs |
| /api/feedback                                                                                                                                                                                                                                 | Exact API Function route                                                         | POST-only, bounded validation, Supabase insert, optional owner email                                      |
| /api/errors                                                                                                                                                                                                                                   | Exact API Function route                                                         | POST-only, redaction, bounded validation, Supabase insert and retention cleanup                           |
| /api/account/delete                                                                                                                                                                                                                           | Exact API Function route                                                         | POST-only, session verification, recent reauthentication, ordered deletion                                |
| /qa, /qa/*                                                                                                                                                                                                                                    | Access-gated Function                                                            | 401/noindex when unauthenticated; QA shell only after verified Access JWT                                 |
| /e2e, /e2e/*                                                                                                                                                                                                                                  | Access-gated Function                                                            | 401/noindex when unauthenticated; private R2 only after verified Access JWT                               |
| /ja, /ja/                                                                                                                                                                                                                                     | Catch-all Function exact routes                                                  | /ja 308 to /ja/; Japanese shell                                                                           |
| JA shell routes: /ja/destinations, /ja/collections, /ja/compare, /ja/favorites, /ja/bucket-list, /ja/my-trips, /ja/passport, /ja/visited-map, /ja/profile, /ja/settings, /ja/help, /ja/qa, /ja/editorial, /ja/terms, /ja/privacy, /ja/cookies | Catch-all Function exact routes, except dedicated JA destination and QA adapters | Preserve Japanese shell, private noindex, and Access protection for /ja/qa                                |
| JA collections: /ja/collections/*                                                                                                                                                                                                             | Catch-all Function, one slug segment                                             | Japanese SPA shell for valid client route                                                                 |
| JA destinations: /ja/destinations/*                                                                                                                                                                                                           | Dedicated Japanese destination Function                                          | Japanese manifest/prerender/404 behavior                                                                  |
| Static assets: /assets/_, /data/_, /og/_, /.vite/_, icons, PWA files, sitemap, robots, favicons                                                                                                                                               | Static layer; explicitly excluded from Functions                                 | Direct static response; missing path is served by top-level static 404                                    |
| Everything else, including /wp-admin, /wp-login.php, /.env, /.git/config, /phpmyadmin, /server-status, random paths, and unknown API paths                                                                                                    | No Function include                                                              | Cheap static 404, no SPA shell, noindex                                                                   |

The exact allowlist has 46 includes:

- EN: /, /destinations, /destinations/_, /collections, /collections/_,
  /compare, /favorites, /bucket-list, /my-trips, /passport, /visited-map,
  /profile, /settings, /help, /qa, /qa/_, /editorial, /terms, /privacy,
  /cookies, /e2e, /e2e/_.
- JA: /ja, /ja/, /ja/destinations, /ja/destinations/_, /ja/collections,
  /ja/collections/_, /ja/compare, /ja/favorites, /ja/bucket-list,
  /ja/my-trips, /ja/passport, /ja/visited-map, /ja/profile, /ja/settings,
  /ja/help, /ja/qa, /ja/qa/*, /ja/editorial, /ja/terms, /ja/privacy,
  /ja/cookies.
- APIs: /api/feedback, /api/errors, /api/account/delete.

The 15 exclusions retain the existing static families and add /404.html and
/ja/404.html. The verifier checks that every built static family is covered and
that the policy stays within the documented 100-rule limit.

### Local before/after metrics

| Metric                                  |                                                                         Before |                                                               After | Evidence                                       |
| --------------------------------------- | -----------------------------------------------------------------------------: | ------------------------------------------------------------------: | ---------------------------------------------- |
| _routes.json includes                   |                                                                         1 (/*) |                                              46 exact/family routes | Parsed source and built output                 |
| _routes.json excludes                   |                                                                             13 |                                                                  15 | Parsed source and built output                 |
| Combined route rules                    |                                                                             14 |                                                                  61 | node route-count check                         |
| Built output files                      |                                                                          3,261 |                                                               3,263 | dist file count after build; two new 404 pages |
| Built static families excluded          |                                  Existing assets/data/OG/PWA/metadata families |                               Same families plus explicit 404 pages | verify-pages-functions.mjs                     |
| /assets/nonexistent.js                  |                                     200 SPA shell, 4,916-byte body in baseline |                                                   404, no SPA shell | Local wrangler pages dev corpus                |
| /data/nonexistent.json                  |                                                      200 SPA shell in baseline |                                                   404, no SPA shell | Local wrangler pages dev corpus                |
| Hostile scanner corpus                  | Unknown paths reached the catch-all Function; static-looking misses soft-200ed | All required scanner/static misses 404 without Function-owned shell | Local wrangler pages dev corpus                |
| Unknown destination with valid manifest |                                                 Destination Function, real 404 |                                 Same, with noindex/security headers | Runtime verifier                               |
| Missing destination manifest            |                                                          Locale shell fallback |                    503/noindex with Retry-After: 60, no shell fetch | Unit regression test                           |
| QA mirror protection                    |                                      English Access guard; /ja/qa only noindex |                Both EN and JA return 401/noindex without Access JWT | Runtime and protected-route checks             |

The production request count, Function invocation count, CPU, R2 operations,
KV operations, Supabase requests, and billing delta remain **OWNER ACTION
REQUIRED**. No production before/after claim is possible from this checkout.

## Implementation changes

| File                                                   | Change                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| public/_routes.json                                    | Replaced include-all routing with the explicit 46-entry allowlist; retained static exclusions                                                           |
| public/404.html, public/ja/404.html                    | Added minimal localized noindex static 404 pages to disable Pages SPA fallback                                                                          |
| functions/_request-guards.js                           | Added a bounded per-isolate IP/scope guard with 429/Retry-After responses; the code documents why no durable binding was added speculatively            |
| functions/api/feedback.js                              | Added 8 KiB UTF-8 body bound and 3 requests/IP/10 minutes before Supabase/Resend work                                                                   |
| functions/api/errors.js                                | Kept 16 KiB UTF-8 body bound and 30 requests/IP/minute; optional KV remains durable when configured, with per-IP in-isolate fallback; added Retry-After |
| functions/api/account/delete.js                        | Added 16 KiB UTF-8 body bound and 3 requests/IP/15 minutes before session verification; added Retry-After                                               |
| functions/_destination-handler.js                      | Added security/noindex headers for malformed IDs and fail-closed 503 behavior for a missing manifest                                                    |
| functions/e2e/[[path]].js, functions/ja/qa/[[path]].js | Reused the Access guard for /ja/qa and served the localized QA shell only after authorization                                                           |
| scripts/**tests**/...                                  | Added body-bound, abuse-guard, per-IP fallback, destination fail-closed, and authorization regressions                                                  |
| scripts/verify-pages-functions.mjs                     | Added hostile-path/static-miss corpus, route-budget assertions, both-locale QA checks, and real-404/no-shell checks                                     |
| KAI-198-cloudflare-supabase-research.md                | First-party Cloudflare/Supabase research and account-state boundary                                                                                     |

No new dependency, database migration, Cloudflare binding, paid product, or
production data mutation was added.

## API audit

| Endpoint                 | Current side effects                                                                                                     | Bounds and controls                                                                                                                                              | Residual risk / owner action                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST /api/feedback       | Optional session verification; Supabase feedback insert; background Resend notification via waitUntil                    | POST-only; 8 KiB UTF-8 body; type/message/field schema caps; 3/IP/10 min local guard; secret key server-only                                                     | No idempotency key, so retries can create duplicate feedback. Add the one available free edge rate rule only after owner confirms traffic and NAT impact; do not rate-limit page GETs or verified bots |
| POST /api/errors         | Optional session verification; redacted error_events insert; best-effort 90-day cleanup DELETE                           | POST-only; 16 KiB UTF-8 body; message/field caps; sensitive-value redaction; 30/IP/minute via ERROR_RATE_KV when present, per-isolate otherwise; 429/Retry-After | KV binding and quota are unknown. KV get/increment/put is best effort, not atomic. Owner must inspect binding/usage and Supabase write volume                                                          |
| POST /api/account/delete | Auth session verification; password grant or recent amr; ordered deletes from trips, user_data, feedback; Auth user last | POST-only; 16 KiB UTF-8 body; 3/IP/15 min local guard; server-derived user ID; recent-auth check; failure payload says whether retry is safe                     | High-impact operation. Owner should edge-rate-limit this path with a threshold that does not punish shared NAT; no destructive production test was run                                                 |
| Any other /api/*         | None                                                                                                                     | Not in _routes.json; static 404                                                                                                                                  | No accidental catch-all API invocation                                                                                                                                                                 |

The local guard is deliberately bounded to 2,048 tracked client/scope buckets;
it is not a distributed guarantee across isolates. This is the smallest
repo-only control that reduces backend work without introducing a paid or
unverified durable service. The code carries the ponytail: deferral comment.

### Validation and side-effect review

- All three handlers reject non-POST methods before backend work.
- Feedback and errors derive user_id only from verified Supabase session tokens;
  client-supplied IDs are ignored.
- Account deletion derives the target user from the verified session and checks
  password ownership or recent authentication before any delete.
- Account deletion uses URL query parameters for ownership filters and deletes
  application tables before the Auth user, with retry-safe partial-failure
  responses.
- Resend is optional and best effort; feedback remains stored if email
  notification fails.
- Missing server secrets fail closed. No client bundle contains Supabase secret
  or service-role credentials.
- Body caps are enforced in application code before JSON parsing/backend calls.
  The handler still reads the request text before measuring its UTF-8 size; a
  dashboard-level request-size limit should be checked by the owner if one is
  available.

## Supabase direct-access audit

The browser uses the public VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in
src/lib/supabase.ts. The public client directly uses Auth and authenticated
reads/writes for user-owned trip data:

- Auth: session lookup/listener, Google/Twitter/LINE OAuth, email
  sign-in/sign-up, password reset, and password update in
  src/shared/hooks/useAuth.tsx.
- user_data: authenticated select/upsert through the trip-sync hook.
- trips: authenticated select/upsert/delete through
  src/shared/services/trips/TripRepository.ts.
- feedback and error_events: no direct browser Data API path; Pages Functions
  write them with server credentials.
- Account deletion: no direct browser admin path; Pages Function only.
- No application .rpc, Storage, or Realtime use was found in source. This does
  not prove those products are disabled in the Supabase project.

Supabase's current RLS guidance says exposed tables need both least-privilege
grants and RLS policies, and that policies should use auth.uid() for owner
checks. See [Supabase Row Level
Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [Securing the Data
API](https://supabase.com/docs/guides/api/securing-your-api).

Repository evidence is incomplete:

- supabase/migrations/001_feedback.sql and 002_error_events.sql enable RLS
  but define no public anon/authenticated policies; server writes use elevated
  credentials.
- No user_data or trips table migration is present in this checkout.
- Therefore the actual RLS state, grants, indexes, exposed schemas, views,
  RPCs, Storage policies, Realtime settings, and direct project endpoint
  behavior are **OWNER ACTION REQUIRED**.

Desired owner verification, without making a production change in this task:

1. Enable RLS on user_data and trips.
2. Revoke unneeded anon and authenticated grants.
3. Permit only authenticated owners: user_data.id = auth.uid() and
   trips.user_id = auth.uid() for the operations the UI actually needs.
4. Use both using and with check on updates/inserts so ownership cannot be
   reassigned.
5. Verify indexes on owner columns and bounded result sizes.
6. Test anonymous reads/writes, cross-user reads/writes, delete ownership,
   malformed filters, and any dashboard-visible RPC/Storage/Realtime surface
   with non-destructive test data.

Supabase documents that secret/service-role keys bypass RLS and must remain
server-side. See [Supabase API
keys](https://supabase.com/docs/guides/getting-started/api-keys). The bundle
scan passed on 3,247 built files; only the public legacy anon key pattern is
expected in the browser.

Supabase documents Auth token-bucket limits, email-send limits, and optional
Turnstile/hCaptcha. See [Auth rate
limits](https://supabase.com/docs/guides/auth/rate-limits),
[CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), and
[anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).
Whether Meguruto has CAPTCHA, anonymous sign-in, custom SMTP, signup policy,
or project-specific limits enabled is **OWNER ACTION REQUIRED**. Direct
Supabase traffic can bypass Cloudflare, so the owner must review those limits
independently.

## Cloudflare plan, product, and billing audit

The research file contains the full first-party source index:
[KAI-198-cloudflare-supabase-research.md](KAI-198-cloudflare-supabase-research.md).
The following is the repository evidence and the required account boundary.

| Product or cost surface            | Repository evidence                                                                              | Current state                                                                                  | Action                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pages Functions / Workers requests | Functions directory and _routes.json                                                             | Code is now allowlisted; plan, deployed policy, daily requests, CPU, and billing model unknown | Owner checks Functions Metrics, plan, usage, quota alerts                    |
| Pages fail open/closed             | No dashboard config in repo                                                                      | Unknown                                                                                        | Owner checks Pages project Settings → Runtime; see exact action below        |
| WAF/rate limiting                  | No rules-as-code or API config                                                                   | Unknown                                                                                        | Owner checks the one available Free rule before adding anything              |
| DDoS protection / Bot Fight Mode   | No dashboard config                                                                              | Unknown                                                                                        | Automatic DDoS protection is documented; Bot Fight Mode state/impact unknown |
| R2                                 | wrangler.jsonc has a local test binding; workflow publishes a private Allure report to remote R2 | Production bucket, public access, usage, quota, and billing unknown                            | Owner checks R2 bucket and alerts                                            |
| KV                                 | ERROR_RATE_KV is optional in /api/errors; no binding is committed                                | Unknown whether production binding exists                                                      | Owner checks KV binding/usage; no new binding added                          |
| Images                             | No Images API, binding, or URL pattern found                                                     | Dashboard state unknown                                                                        | No action; owner verifies no hidden transform/delivery cost                  |
| D1                                 | No D1 binding or query found                                                                     | Dashboard state unknown                                                                        | No action; owner verifies no hidden database                                 |
| Argo / Cache Reserve               | No repository configuration found                                                                | Dashboard state unknown                                                                        | Do not enable; owner checks account only                                     |
| Workers Logs / Security Analytics  | No repository billing setting                                                                    | Dashboard state unknown                                                                        | Owner checks observability volume and retention                              |

Current documented plan facts are conditional, not Meguruto account facts:

- Pages static asset requests are free/unlimited when they do not invoke a
  Function; Pages Functions are billed as Workers requests. The Workers Free
  allowance documented by Cloudflare is 100,000 requests/day shared by Pages
  Functions and Workers, resetting at midnight UTC. See [Pages Functions
  pricing](https://developers.cloudflare.com/pages/functions/pricing/) and
  [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- Cloudflare's Free rate-limiting matrix documents one rule, path/verified-bot
  matching, IP counting, a 10-second period, and a 10-second mitigation
  timeout. It does not provide a separate Free rule per write endpoint or a
  method expression. See [Rate limiting
  rules](https://developers.cloudflare.com/waf/rate-limiting-rules/).
- Current documented KV Free limits include 100,000 reads/day and 1,000
  writes/day; operations fail when a limit is exceeded. See [KV
  pricing](https://developers.cloudflare.com/kv/platform/pricing/).
- Current documented R2 Free allowances include 10 GB-month storage, 1
  million Class A operations, and 10 million Class B operations per month;
  unauthorized HTTP 401 requests do not incur R2 charges. See [R2
  pricing](https://developers.cloudflare.com/r2/pricing/).
- Images has a documented Free unique-transform allowance, but no Images use
  exists in this repository. See [Images
  pricing](https://developers.cloudflare.com/images/pricing/).
- Cache Reserve is usage-based/paid in the current documentation. No Cache
  Reserve code or config exists here. See [Cache
  Reserve](https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/).

No paid Cloudflare product was enabled by this change. No billing cap or
production quota setting can be verified from source.

## Exact owner actions

Every row is an inspection/action item, not an action performed by this agent.
Do not upgrade a tier or enable an ambiguous paid feature.

| Dashboard location                                                                                 | Current state                                         | Desired state and reason                                                                                                                                                                                                                                                                                                                                                                    | Free/rollback                                                                                              |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Cloudflare Workers & Pages → Meguruto Pages project → Settings → Runtime → Fail open/closed        | Unknown                                               | Record the mode. For this denial-of-wallet posture, prefer fail-closed if the owner accepts a temporary error page when Function quota is exhausted; verify that static availability and protected/API paths behave as intended. Cloudflare documents this as a project-level behavior, so do not change blindly                                                                            | No paid product. Roll back to the recorded prior mode if legitimate availability is harmed                 |
| Cloudflare Security → Security rules → Rate limiting rules                                         | Unknown; no rule is in repo                           | If the Free UI permits it, scope the single rule only to /api/feedback, /api/errors, and /api/account/delete, exclude cf.client.bot, count by IP, and choose a threshold from real traffic. The application already rejects non-POST because Free matching does not provide a method field. Do not cover page GETs/static assets; shared NAT and accessibility traffic must not be punished | Free only; disable the rule to roll back. Do not buy Advanced Rate Limiting                                |
| Cloudflare Security → Settings → Bot Fight Mode                                                    | Unknown                                               | Do not use as endpoint policy. Leave unchanged unless an active incident justifies an emergency toggle; check verified crawlers/preview clients first because broad challenges can affect SEO and accessibility                                                                                                                                                                             | Free toggle; turn it back off to roll back                                                                 |
| Cloudflare Security → Analytics → Traffic/Events                                                   | Unknown                                               | Record request spikes, mitigated/flagged events, scanner paths, and verified-bot behavior before and after deploy                                                                                                                                                                                                                                                                           | Monitoring only                                                                                            |
| Workers & Pages → project → Functions Metrics                                                      | Unknown                                               | Record total requests, invocations, errors, status classes, and subrequests for the hostile corpus and API endpoints after deploy                                                                                                                                                                                                                                                           | Monitoring only                                                                                            |
| Workers & Pages → project → Usage/Billing/Plan/Notifications                                       | Unknown                                               | Record Free vs paid plan, Pages/Workers quota, CPU limits, overage behavior, alert recipients, and current usage. Do not infer from docs                                                                                                                                                                                                                                                    | No change; rollback means restore the documented alert/cap settings                                        |
| R2 → bucket used by private Allure workflow → Settings/Usage                                       | Unknown                                               | Verify public access is disabled, bucket name/binding is intentional, lifecycle/retention and usage alerts are present, and the workflow does not upload unbounded reports                                                                                                                                                                                                                  | No tier change. Roll back by disabling the nonessential report publish/binding after recording prior state |
| Workers & Pages/Storage → KV → ERROR_RATE_KV                                                       | Unknown                                               | Verify whether the binding exists, reads/writes are within plan, and TTL cleanup works. The code remains functional without it                                                                                                                                                                                                                                                              | No new binding. Roll back by removing the binding and use the per-isolate fallback                         |
| Supabase Project → Authentication → Rate Limits                                                    | Unknown                                               | Record actual signup, recovery, OTP, verification, refresh, and anonymous-sign-in limits; keep Auth endpoints protected independently of Cloudflare                                                                                                                                                                                                                                         | Free dashboard settings only; restore recorded prior values                                                |
| Supabase Project → Authentication → Bot/Abuse Protection, CAPTCHA/Turnstile, signup settings, SMTP | Unknown                                               | Verify whether public signup/anonymous sign-in is needed. Enable existing free CAPTCHA controls only after owner validates the legitimate auth UX and callback configuration                                                                                                                                                                                                                | No tier change; disable the setting to roll back                                                           |
| Supabase Project → Database → Table Editor/SQL → user_data, trips, feedback, error_events          | Partially evidenced in repo; production state unknown | Verify RLS, grants, owner policies, indexes, retention, and cross-user denial. Do not run destructive SQL in this ticket                                                                                                                                                                                                                                                                    | No schema change by this agent; rollback any owner follow-up through the normal migration process          |
| Supabase Project → Reports/Usage/Auth logs                                                         | Unknown                                               | Record Data API, Auth, Storage, Realtime, and database usage plus 429/5xx/error spikes                                                                                                                                                                                                                                                                                                      | Monitoring only                                                                                            |

## Fail-open/closed behavior and emergency runbook

### Normal operation

1. Check Pages Functions Metrics and Security Analytics for Function
   invocations, 404/401/429/5xx rates, CPU errors, and scanner concentration.
2. Check /api/feedback, /api/errors, and /api/account/delete status classes;
   distinguish expected 401/413/429 from Supabase/Resend 5xx.
3. Check Supabase Auth logs/rate limits and Data API logs/usage; verify
   cross-user requests remain denied by RLS.
4. Check R2 object count/size and operation usage for the private report;
   check ERROR_RATE_KV read/write usage if the binding exists.
5. Keep normal page GETs, static assets, verified crawlers, shared-NAT users,
   and accessibility clients outside tight write-path limits.

### Suspected denial-of-wallet or DDoS event

1. Capture the time window, paths, countries/ASNs/IP concentration, verified
   bot status, Pages Function invocations, CPU, 429s, and Supabase/Auth
   failures before changing settings.
2. Use the one free rate-limit rule only on the three high-cost API paths,
   excluding known good bots. Do not apply a low IP threshold to /, page
   routes, /assets/_, /data/_, or other static content.
3. If the owner confirms Function quota exhaustion is causing uncontrolled
   exposure and the project setting supports it, use the recorded fail-closed
   mode consistent with the availability decision. Expect an availability
   impact; this is the stated tradeoff.
4. If the event is broad and still active, evaluate the existing free Bot
   Fight Mode only as an emergency, after checking crawler/accessibility
   impact. Do not purchase a paid security product during the incident from
   this ticket.
5. If Supabase is the direct target, use Supabase Auth/Data API controls and
   RLS; Cloudflare rules cannot protect a direct Supabase hostname.
6. If R2/KV usage or errors spike, pause the nonessential report workflow or
   remove the optional KV binding only after recording the prior state.

### Recovery and rollback

- Disable the temporary edge rule and restore the recorded prior fail-open/
  closed mode after the event.
- Re-deploy the last known-good build if a route or manifest deployment is
  malformed; a missing manifest intentionally returns 503 rather than a shell.
- Restore the prior R2 workflow/binding and KV binding state from the recorded
  dashboard values.
- Rotate secrets only if exposure evidence exists; never place a secret in the
  frontend bundle.
- Do not delete Supabase rows or change production tiers as an incident
  shortcut. Use the owner-approved migration/change process.

## Verification evidence

### Passing checks

- npm run build — exit 0; Vite build passed; SEO generator wrote 2,118
  outputs with 1,057 canonical destinations; PWA precache generated 72 assets.
- Focused final suite:
  npm run test:run -- scripts/**tests**/feedbackFunction.test.mjs
  scripts/**tests**/errorsFunction.test.mjs
  scripts/**tests**/accountDeleteFunction.test.mjs
  scripts/**tests**/destinationFunction.test.mjs src/seo/**tests**/router.test.ts
  src/seo/**tests**/prerender.test.ts
  — 6 files passed, 104 tests passed, exit 0.
- node scripts/verify-pages-functions.mjs — exit 0; runtime verifier passed
  EN/JA shells, published/unknown destinations, private noindex, both
  protected QA mirrors, real 404s, hostile/static misses, route budget,
  security headers, PWA files, and account-delete runtime cases.
- npm run check:security-headers — exit 0; security headers OK on 5 routes
  plus the 404 contract.
- npm run check:bundle-secrets — exit 0; no secret patterns in 3247 built
  files.
- npm run check:pwa — exit 0; PWA manifest, worker policy, and production
  output checks passed.
- npm run check:protected-routes — exit 0; KAI-126 protected-route boundary
  checks all passed, including unauthenticated 401s, valid Access JWTs, R2
  assets, and browser smoke.
- git diff --check — exit 0.

### Repository-wide suite result

npm run test:run completed with exit 1:

- 237 test files
- 2,704 tests passed
- 2 skipped
- 4 failed

The four failures are outside this diff:

1. src/features/destinations/**tests**/ExploreDefaultState.test.tsx —
   D1: junk car value and legacy mode labels are rejected, not restrictive
   timed out at 15 seconds.
2. src/features/home/**tests**/Home.test.tsx —
   keeps the compact visible label and the full range in aria/title timed out
   at 15 seconds.
3. src/features/home/**tests**/Home.test.tsx —
   renders Meguruto（メグルト） visibly under the JA hero on all screen sizes
   expected the association element but received null.
4. src/features/home/**tests**/HomeFutureDates.test.tsx —
   selects a future date via calendar and syncs date= to the URL timed out in
   waitForCondition.

No changed file is under those feature-test paths. The changed endpoint,
destination, SEO, route, protected-surface, security-header, secret-scan, and
PWA checks are green.

## Open blockers

- **OWNER ACTION REQUIRED:** production Cloudflare plan, deployed _routes.json,
  Pages fail-open/closed mode, WAF/rate-limit rules, Bot Fight Mode, Functions
  Metrics, Security Analytics, Workers Logs, R2, KV, Images, D1, Argo, Cache
  Reserve, billing alerts, and quota usage.
- **OWNER ACTION REQUIRED:** direct Supabase endpoint exposure, project plan
  and usage, Auth rate limits/CAPTCHA/signup settings, and RLS/grants/indexes
  for user_data and trips.
- Full repository test gate is red on the four unrelated UI tests listed above.
  The focused KAI-198 gate is green.
- No production before/after traffic or billing metrics are available. Capture
  them after deployment using the monitoring runbook.

The code is safe to submit as a focused reviewable PR with the owner actions
explicitly called out. It must not be merged until the owner verifies the
dashboard and Supabase items and decides how to handle the unrelated full-suite
failures.
