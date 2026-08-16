# Account Deletion Operations (KAI-44)

Server-authorized account deletion via `POST /api/account/delete`
(`functions/api/account/delete.js`). The caller can never choose which
user is deleted — the target uid is derived server-side from the verified
Supabase session token.

## Data inventory

Audited against the connected production Supabase schema (and the repo's
planned migrations) at restack time:

| Table                                   | Ownership column                                | Treatment on account deletion                                                            |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `trips`                                 | `user_id`                                       | Deleted                                                                                  |
| `user_data`                             | `id`                                            | Deleted (ownership column is `id`, NOT `user_id`)                                        |
| `feedback`                              | `user_id`                                       | Deleted (user-written feedback may contain personal text)                                |
| `error_events`                          | `user_id` → `auth.users(id)` ON DELETE SET NULL | NOT deleted — 90-day operational retention (KAI-46) anonymizes attribution automatically |
| Collaboration memberships / invitations | —                                               | **Not implemented** — nothing to delete; documented rather than silently omitted         |

- The explicit per-table manifest in the Function is
  `[{trips, user_id}, {user_data, id}, {feedback, user_id}]` — ownership
  columns are never assumed to be uniform.
- `feedback` and `error_events` are planned schema (migrations
  `001_feedback.sql` / `002_error_events.sql`); the manifest treats a
  404 (table not yet applied) as "nothing to delete", so deletion works
  before and after those migrations land.
- Re-audit the production schema immediately before any deploy/merge.

## Compensation policy

- App rows are deleted FIRST (idempotent — DELETE with no rows is a
  success, so retries are safe); the Auth user is deleted LAST (point of
  no return).
- Every stage is exception-guarded: a network failure returns an honest
  `{ error, step, deleted, retrySafe }` payload instead of crashing the
  Function.
- If an app-table step fails → Auth user is NOT deleted; client shows a
  retry-safe partial-failure message.
- If Auth deletion fails after app data succeeded → retry completes the
  deletion (already-deleted rows are no-ops).
- Ambiguous "server succeeded, response lost": the client reconciles by
  checking the session (`supabase.auth.getUser()`); if the session is no
  longer valid, the deletion reached the point of no return and is
  treated as completed rather than a false failure.

## Reauthentication

Irreversible deletion requires recent authentication — enforced by the
SERVER, not just the UI (anyone can POST directly to the endpoint):

- **Password accounts** (provider `email`): the client sends the password
  in the delete request; the Function verifies it RIGHT NOW via the GoTrue
  password grant (`POST /auth/v1/token?grant_type=password`) and requires
  the grant user to match the session user. A stolen/old session cannot
  supply the password.
- **OAuth accounts** (Google/Twitter/LINE): reauthentication is a real
  provider round-trip — the user marks deletion pending and completes a
  fresh `signInWithOAuth` (Supabase's `/reauthenticate` nonce is only for
  password changes, so an OTP combination is NOT used). On the redirect
  back, the fresh session's token carries a new `amr` timestamp and the
  pending deletion executes automatically. The pending intent is
  IDENTITY-BOUND ({userId, provider, createdAt}) and expires after 15
  minutes (same window as amr) — a cancelled OAuth flow can never execute
  days later against a fresh, unrelated sign-in. The Function requires
  the token's `amr` claim to carry an authentication timestamp within 15
  minutes; `amr` is set when the session was AUTHENTICATED and is NOT
  updated by silent token refresh — a months-old session that keeps
  refreshing cannot satisfy the check, while a freshly reauthenticated
  OAuth account can delete. Tokens without a recent `amr` are rejected
  with 401 `reauth_required` BEFORE any table DELETE.

Server failure semantics: `/auth/v1/user` 401/403 → 401 `invalid_session`;
upstream 5xx or network failure → 502 `verification_failed` (retry-safe) —
an upstream outage is never reported as "session expired".

## Browser QA runbook (disposable account, production-equivalent env)

Required evidence before closing KAI-44 (owner runs against a disposable
account; record results in the Linear issue):

1. Create a disposable account (email/password).
2. Add favorites/visited data (`user_data`).
3. Create a trip (`trips`).
4. Optionally submit feedback (`feedback`).
5. Open profile → Delete account → type `DELETE` → enter password.
6. Verify afterwards:
   - Auth user is gone (`auth.admin.users` lookup / sign-in fails);
   - `user_data` row gone; `trips` rows gone; `feedback` rows gone;
   - `error_events` rows (if any) have `user_id` NULL;
   - client is signed out; reopening/refreshing private routes restores
     no data;
   - EN and JA confirmation copy both work;
   - basic flow works on mobile and desktop viewports.
7. Negative checks: wrong password → deletion NOT performed; OAuth
   account → fresh provider sign-in required (and after completing it,
   deletion DOES proceed — not a dead end); stale session (amr older than
   15 min) → 401 reauth_required, nothing deleted; second delete attempt →
   no error (idempotent).
