# Error Monitoring Operations (KAI-46)

## Pipeline

1. **Capture** — `src/shared/utils/errorReporter.ts`:
   - global `window.onerror` + `unhandledrejection` (installed in `main.tsx`)
   - `ErrorBoundary.componentDidCatch` (route crashes, feature `react-boundary`)
   - explicit `reportError(error, "trips-sync")` on Supabase trip sync failures
   - operational auth failures via `reportAuthFailureIfOperational`
     (`useAuth.tsx`, features `auth:sign-in|sign-up|sign-out|reset-password|update-profile|session`).
     Ordinary user-input failures (wrong password, validation — Supabase
     status 400) are **not** reported; rate limits (429) and server faults
     (≥500) are.
   - privacy-safe context: app version, deployment commit SHA, route,
     locale, browser class, feature, error name/message, first 3 stack
     frames. **Never** tokens, auth payloads, request bodies, cookies,
     localStorage, or personal data — every string passes through the
     shared redactor (`src/shared/utils/redact.ts`) that strips JWTs,
     Bearer tokens, `sb_secret_` keys, API-key/password-like values and
     emails before anything leaves the browser.
2. **Transport** — up to 10 **separate** `POST /api/errors` requests per
   minute (rate-limited client-side; not a single batched request), each
   handled by the Pages Function `functions/api/errors.js` → Supabase
   `error_events` table (`supabase/migrations/002_error_events.sql`).
   The Function is the privacy boundary: it re-applies the same shared
   redaction (the endpoint can be POSTed directly, bypassing the browser
   reporter), enforces a 16 KiB payload cap, a server-side rate limit
   (30/min per IP; KV-durable when an `ERROR_RATE_KV` binding exists,
   per-isolate fallback otherwise — the KV path is a get → increment →
   put sequence, so it is a best-effort distributed limiter, not a
   strictly atomic guarantee under concurrency), strict body validation,
   and an env configuration guard. User attribution is derived
   **server-side** from a verified Supabase session token; client-supplied
   user ids are never trusted. The reporter attaches the current access
   token best-effort — a failed token lookup never blocks or breaks
   reporting.
3. **Retention** — rows older than **90 days** are deleted by the
   Function's opportunistic cleanup (at most hourly per isolate) and by
   the manual SQL in the migration. `user_id` references
   `auth.users(id)` with `ON DELETE SET NULL`, so account deletion
   (#195) never leaves dangling or owner-identifying error rows.
4. **Triage** — owner reads `error_events` in the Supabase dashboard
   (filter by `created_at desc`, `feature`, `browser`).

## Alert thresholds

The owner checks the table; Hermes cron watchdogs can notify when a
threshold trips.

| Signal            | Threshold                                                   | Severity | Action                            |
| ----------------- | ----------------------------------------------------------- | -------- | --------------------------------- |
| Crash loop        | ≥5 `react-boundary` events in 15 min (same feature/browser) | P1       | Hotfix; consider rollback         |
| Trip sync failure | ≥5 `trips-sync` events in 15 min                            | P1       | Check Supabase status + RLS       |
| Auth failure      | ≥5 `auth:*` events in 15 min                                | P2       | Check Supabase Auth config        |
| Single-user crash | <5 events, distinct user                                    | P3       | File bug; batch with next release |

Severity: P1 = same-day response (owner), P2 = next-scheduled deploy,
P3 = backlog. Response SLA: P1 ≤ 24 h, P2 ≤ 3 days, P3 next release.

## Converting reports to Linear Bugs

1. From a cluster of `error_events` rows, extract the common
   `error_name` + `message` prefix and the `feature` tag.
2. Create a Linear Bug (project Meguruto, label `Bug`) with:
   - title: `[error-monitoring] <error_name> in <feature>`
   - body: message, app version, commit SHA, browser breakdown, affected
     routes, Supabase query link (filtered dashboard URL), severity + owner
3. Delete the converted row(s) so the next threshold evaluation starts
   fresh (the schema has no acknowledgement/annotation field).

## In-app feedback capture

KAI-96 (Done) provides the durable, owner-visible in-app feedback path
(`/api/feedback` → `feedback` table + owner email); KAI-46's "beta
feedback capture" acceptance item is satisfied by that work — this PR
only documents the error-monitoring pipeline.

## Source maps / production verification

- The reporter is compiled into the production bundle like any module —
  verify after deploy: open the app, force a route crash (unknown route
  does NOT crash; use a debug path), and confirm a row appears in
  `error_events` within a minute.
- Source maps are not published (vite default: `build.sourcemap` off, and
  the Pages runtime verifier asserts no `.map` files ship); stack heads
  therefore reference minified frames — the message + feature + version +
  commit are the primary triage signals.
