# KAI-40 — Investigate intermittent Supabase `JWT issued at future` sync failure

## KAI-40 status

- base SHA: `c3fb7078f0ef31c50ffd1457af563d2a5df16d19` (origin/main @ 2026-08-11)
- head SHA: (filled at commit time)
- branch: `aneeshpatil8/kai-40-investigate-intermittent-supabase-jwt-issued-at-future-sync`
- PR: (filled at PR time)
- CI state: (filled after push)
- Working tree at branch start: clean worktree from `origin/main`
- Installed versions: `@supabase/supabase-js@2.111.0`, `@supabase/auth-js@2.111.0`
- Auth/session files identified: `src/lib/supabase.ts`, `src/shared/hooks/useAuth.tsx`, `src/shared/hooks/useTripSync.ts`, `src/shared/hooks/useTripStore.tsx`, `src/shared/services/trips/TripRepository.ts`, `src/shared/hooks/clearProfileOrchestration.ts`

## Incident reconstruction

Observed: `PGRST303` / `JWT issued at future` while loading `user_data` on 2026-08-06 ~17:11 JST. Local clock verified healthy (NTP synchronized); browser refresh cleared the error.

PostgREST performs the `iat` check **server-side only**: `JWTIssuedAtFuture` fires iff `iat > server_now + 30s` (30s skew allowance is hardcoded in PostgREST; verified in source). The client's clock never participates in the rejection, so a healthy local clock is consistent with both the incident and the error.

The rejection therefore means the access token the browser presented was minted with `iat` more than 30s ahead of the PostgREST node that validated it at that moment. Since GoTrue sets `iat` from its own clock, this is infrastructure clock skew between the minting auth node and the validating PostgREST node (GoTrue ahead of PostgREST), or a token minted by an environment with a skewed clock and persisted in the client session.

Why a browser refresh fixed it: on reload, auth-js `_recoverAndRefresh` refreshes the session when the stored access token is within its 90s expiry margin (client-side `expires_at` bookkeeping) — the freshly minted token carries a sane `iat` and the replay of hydration succeeds. The stored future-iat token was NOT refreshed while the tab was open because the client-side expiry computation (`expires_at = client_now + expires_in`) said it was still valid, so every request kept failing with the same stale token.

No Meguruto lifecycle bug was found in the hydration/account-switch/sign-out races (existing version + identity guards already discard late responses). What was missing: **bounded recovery for the specific case where the stored token is rejected as not-yet-valid and a legitimate refresh resolves it.**

## Root-cause classification

| hypothesis                             | status                                        | evidence                                                                                                                                                                              |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| local machine clock wrong              | EXCLUDED                                      | server-side check only; observed NTP-synchronized clock; client clock does not enter PostgREST's comparison (PostgREST `Jwt.hs` `checkForErrors`, `now` = server UTC)                 |
| JWT genuinely minted with future `iat` | HIGHLY LIKELY                                 | only way to trigger `JWTIssuedAtFuture`; requires minting clock ahead of PostgREST by >30s                                                                                            |
| stale/corrupt client session           | HIGHLY LIKELY (as carrier)                    | the rejected token was a stored session token; it stayed in use because client expiry bookkeeping considered it valid; refresh on reload produced a fresh token and cleared the error |
| token refresh race                     | EXCLUDED                                      | auth-js single-flights refresh (`refreshingDeferred`) and rotates atomically; a concurrent refresh would have produced a fresh token, not a future-iat rejection                      |
| resumed-tab/session lifecycle issue    | POSSIBLE (secondary)                          | visibilitychange triggers `_recoverAndRefresh` only within the expiry margin; a long-idle tab holding a future-iat token resumes and reuses it until margin hits                      |
| upstream/server clock skew             | POSSIBLE — primary suspect for root mechanism | documented real incident class (PostgREST/GoTrue skew within Supabase infra, e.g. answeroverflow m/1448859178981654701); not directly observable from client logs                     |
| other identified cause                 | —                                             | none found; single Supabase client, no manual token plumbing, no `setSession`, no Authorization header handling, no RLS weakening                                                     |

Confidence: the _mechanism_ (future-iat token rejected server-side, resolved by refresh) is CONFIRMED from primary sources + code. The _original trigger_ (which node's clock was skewed, or whether the token came from another environment) is not observable from the client and remains POSSIBLE.

## Current auth/sync architecture

```
App bootstrap (main.tsx)
  └─ AuthProvider (useAuth.tsx)
       ├─ supabase.auth.getSession()          → initial user
       ├─ onAuthStateChange(SIGNED_IN/TOKEN_REFRESHED/SIGNED_OUT) → user state
       └─ TripStoreProvider (useTripStore.tsx)
            └─ useTripSync (useTripSync.ts)   ← authenticated sync boundary
                 ├─ user_data hydration  (select + maybeSingle)
                 ├─ user_data save       (debounced upsert)
                 ├─ trips hydration      (SupabaseTripRepository.fetchTrips)
                 ├─ trips save           (debounced batch upsert/delete)
                 └─ origin repair        (upsert home_station)
```

Race points audited:

- **Double hydration** — none: hydration is keyed on `user?.id` + version ref; `getSession` and `INITIAL_SESSION` both resolve to the same `user` value.
- **Account switch / sign-out** — protected: `hydrationVersionRef` + `previousUserIdRef` guards discard late responses (`isCurrentHydration`); account change clears account-scoped state. Verified by existing tests (`useTripSyncHydration`, `useTripSyncAccountSwitch`).
- **TOKEN_REFRESHED** — does not restart hydration (user id unchanged).
- **Refresh stampede** — auth-js single-flights + failure cooldown (verified in installed source); app layer adds a shared in-flight promise (see recovery contract).
- **Tab sleep/resume** — auth-js runs `_recoverAndRefresh` on visibilitychange (visible) and a 30s auto-refresh tick with 90s margin; Meguruto adds no per-focus refresh.

## Security findings

- Single `createClient` in `src/lib/supabase.ts` (anon key, default options, no debug).
- No manual token handling: no `setSession`, no `Authorization` plumbing, no `supabase.auth.token` storage access.
- No service-role key client-side, no RLS policy changes.
- Existing `console.error("[Meguruto Sync] …")` logging prints only error objects (`code`/`message`), never sessions or tokens.

## Fix made

Bounded, error-specific recovery for the future-iat/nbf PGRST303 class, centralized in the authenticated sync layer:

- `src/shared/hooks/jwtRecovery.ts` — `withJwtFutureRecovery` (1 refresh + 1 replay), `isJwtFutureRejection` (code `PGRST303` + message `issued at future`/`not yet valid` only), `refreshSessionOnce` (shared in-flight promise).
- `src/lib/jwtTiming.ts` — `getJwtTimingMetadata`: decodes only `iat`/`exp`/`nbf` for diagnostics; never returns/persists the token; `null` on any malformed input.
- `src/shared/hooks/useTripSync.ts` — routes all five authenticated operations (user_data hydrate/save, trips hydrate/save, origin repair) through the helper.

No production fix for the root infra skew is possible client-side; the fix makes the app recover when a legitimate refresh resolves the stale token, and surface a real failure otherwise.

## Recovery contract

```
user_data/trips request
  → PGRST303 "JWT issued at future" (or "not yet valid") only
  → log timing metadata from the rejected session (iat delta, exp delta)
  → refreshSession() exactly once (deduplicated across concurrent failures)
  → identity unchanged? (hydration version + user id)
      ├─ yes → replay original request exactly once
      └─ no  → abort silently (no cross-account replay)
  → replay success → resume normal sync
  → replay failure / refresh failure → existing "error" state + toast + Retry UI
```

Maximum **1 refresh + 1 replay** per operation. No recursion, no retry chain, no background timers. Non-PGRST303 errors (network, 500, RLS, schema, expired/audience/parse claims) never trigger recovery.

## Diagnostics

Events (via existing `[Meguruto Sync]` console convention):

- `sync.<phase>.jwt_future` — `{ iat?, exp?, issuedInFutureBySeconds?, expiresInSeconds?, now, attempt, user }`
- `sync.<phase>.recovery_start` / `sync.<phase>.recovery_success` / `sync.<phase>.recovery_failed`

`user` is a redacted id (`abc…xyz`). No access token, refresh token, Authorization header, session object, or cookie material is logged; a test asserts the token string never reaches the console. Broader monitoring remains KAI-46 scope.

## Regression tests

New (31 tests):

- `src/lib/__tests__/jwtTiming.test.ts` — malformed/missing tokens, future/past `iat`, expired `exp`, `nbf`, non-numeric claims, base64url, no-token-leak.
- `src/shared/hooks/__tests__/jwtRecovery.test.ts` — Case A (refresh+replay), Case B (persistent failure stops), Case C (refresh failure, no replay), Case D (non-JWT errors never refresh), identity-change guards, concurrent stampede → one refresh, no-secrets logging.
- `src/shared/hooks/__tests__/useTripSyncJwtRecovery.test.tsx` — integration: hydrate Case A/B/C/D, trips hydrate recovery, profile-save recovery, sign-out during recovery, simultaneous profile+trips stampede (one refresh).

Full suite: 134 files / 1687 tests pass (`VITEST_MAX_WORKERS=1`). `tsc -b --noEmit`, `oxlint`, `prettier --check`, i18n parity (537 keys), branding (346 files), catalog fast validation, `vite build`, `git diff --check` all pass.

## Concurrency/account-switch tests

- 3+ simultaneous PGRST303 failures → exactly 1 `refreshSession` call, bounded replays (asserted at helper and integration level).
- A-request-in-flight → sign-out → refresh resolves → no replay into signed-out state, status `idle`, no toast.
- Identity guard checked before refresh and before replay (hydration version + user id).

## Browser QA

- **initial load / reload**: guest mode boots cleanly, zero console/page errors (no Supabase credentials available in the worktree — `.env` absent, only `.env.example`).
- **resume / sign-out / account switch / network recovery**: cannot be exercised without a real Supabase project; covered deterministically by the test suite above. Recorded as not naturally reproducible.

## Data safety

Failed hydration never clears local state (settlers untouched on error) and never reports `ready` with empty data — persistent failure stays `error` with the existing Passport Retry UI (`ui.passportLoadError`). Cross-account data cannot hydrate: replay aborts when identity changes.

## Scope audit

No transport, recommendation, catalogue, UNESCO, or mobile-search implementation was changed. Changed files: `src/shared/hooks/useTripSync.ts`, `src/shared/hooks/jwtRecovery.ts` (new), `src/lib/jwtTiming.ts` (new), three test files (new).

## Remaining risks

- P1: if GoTrue↔PostgREST skew is active for longer than the incident window, recovery degrades to the existing error state (correct, but user must retry later). No client-side mitigation is safe.
- P2: "JWT expired"-class PGRST303 (client clock behind) is intentionally not auto-recovered; existing error+retry path applies. Add if evidence shows it occurring.
- P3: `sync.*` diagnostics are console-only until KAI-46 monitoring lands.

## Verdict

`KAI-40 READY FOR MERGE`
