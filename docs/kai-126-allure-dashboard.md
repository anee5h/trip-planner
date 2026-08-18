# KAI-126: protected E2E dashboard — engineering documentation

This document is the operating manual for Meguruto's internal engineering
surfaces. It covers the Allure dashboard at `/e2e`, the `/qa` surface,
authentication, retention, publishing, and troubleshooting.

## Surfaces

| Route | Purpose | Content |
|---|---|---|
| `https://meguruto.app/e2e` | Allure E2E dashboard | Aggregated Playwright results from the KAI-99 sharded topology (8 project/bin jobs + PWA job): suites, tests, failures, history, duration, retries, screenshots/traces, commit + run metadata |
| `https://meguruto.app/qa` | Reserved internal QA surface | The public app shell served behind the same auth gate (reserved for future internal QA tooling) |

Both are reachable **only** after Cloudflare Access authentication. An
unauthenticated request gets `401` with `X-Robots-Tag: noindex, nofollow` —
nothing is served.

## Authentication

- Cloudflare Access protects `meguruto.app/e2e` and `meguruto.app/qa` at the
  edge (your configured identity policy).
- Access injects `Cf-Access-Jwt-Assertion`; the Pages Function
  (`functions/e2e/[[path]].js`, shared by `functions/qa/[[path]].js`)
  verifies it with **jose** (`jwtVerify` + `createRemoteJWKSet`):
  - signature against the team's JWKS (`CF_ACCESS_CERTS_URL`),
  - issuer (the Access team domain),
  - audience (`CF_ACCESS_AUD` — the Access application AUD tag),
  - expiry + algorithm (RS256/ES256 only).
- Fail-closed: any missing/invalid piece → `401`.

### Required environment (Cloudflare Pages)

| Variable | Purpose |
|---|---|
| `CF_ACCESS_AUD` | Access application AUD tag |
| `CF_ACCESS_CERTS_URL` | `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` |
| `E2E_REPORT` (R2 binding) | Private bucket holding the generated dashboard |

## Storage & publishing (private R2 — never the public repo)

- The generated report lives in a **private R2 bucket**. The bucket must have
  **no public access**; the only read path is the authenticated Function.
- `.github/workflows/allure-publish.yml` is a **lightweight publisher**
  triggered by `workflow_run` on PR Checks completion (post-merge). It does
  **not** re-run E2E — it downloads the sanitized `allure-results-*`
  artifacts from the PR CI run, restores history, writes `executor.json`,
  generates (`ALLURE_NO_ANALYTICS=1`), privacy-scans, and uploads to R2.
- **Privacy gate**: the first publish is manually gated on the repository
  variable `ALLURE_PUBLISH_READY=1`. Until set, the workflow stages + scans
  but does not upload. Set it only after inspecting a representative report.

## History & retention

- Allure 2 history is preserved by restoring the **entire previous
  `history/` directory** (`history.json`, `history-trend.json`,
  `duration-trend.json`, `categories-trend.json`, `retry-trend.json`) from
  R2 into the new result set before generation.
- `executor.json` carries commit SHA, branch, workflow-run URL, and a
  monotonic `buildOrder` (`github.run_number`) for trend ordering.
- Retention: 30-day R2 lifecycle rule (owner-side) — history is bounded.
- No fabricated history: every run uses its own real results.

## Privacy

- `scripts/check-allure-privacy.mjs` scans test/report DATA (not Allure's
  framework assets) for emails, JWTs, Supabase secrets, auth headers,
  cookies, private keys. ZIP/trace contents are inspected in memory.
- Known public values (e.g. `info@meguruto.app`) are allowlisted.
- The scan runs BLOCKING in every E2E job **before** `allure-results-*`
  artifacts are uploaded, and again on the aggregated report before
  `allure-report-preview` — because this repository is public and Actions
  artifacts are readable by anyone with repo read access.
- JWT/auth/cookie/private-key detection stays strict.

## CSP & analytics

- The `/e2e` Function applies a **deliberately scoped CSP** allowing
  Allure's inline bootstrap (`'unsafe-inline'` scripts/styles on this
  private surface only) while the main app keeps its strict CSP.
- Reports are generated with `ALLURE_NO_ANALYTICS=1` — Google Tag Manager /
  external analytics are NOT present and NOT allowed (defense in depth:
  the /e2e CSP also excludes external origins).

## Service worker exclusion

- `public/sw.js` excludes `/e2e` and `/qa` — exact path AND subtree — from
  the app-shell cache, so an offline user can never read a cached dashboard
  shell and the guarded routes always hit the edge.

## Deterministic tests (PR CI)

`scripts/check-protected-routes.mjs` (required `protected-routes` job):

- throwaway RSA keypair + local JWKS server + jose-signed JWTs
- no token / malformed / expired / wrong AUD / wrong issuer / bad signature → 401
- valid token → `/e2e` serves the **real generated Allure report** with
  correct MIME + robots headers + no GTM
- valid token → `/qa` serves the SPA shell (ASSETS fetch, not `next()`)
- protected sub-assets → 401 unauth, not-401 auth'd
- **browser smoke**: Playwright loads `/e2e` with a valid token and asserts
  the Allure app boots (`#root` renders, no console errors) under the /e2e CSP
- assertion failures propagate (no `process.exit(0)` in cleanup) → CI fails

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/e2e` 401 for everyone | `CF_ACCESS_AUD`/`CF_ACCESS_CERTS_URL` unset or wrong | Set Pages env vars; verify AUD matches the Access app |
| 503 "report store not configured" | `E2E_REPORT` R2 binding missing | Add the R2 binding to Pages env |
| Report downloads instead of rendering | MIME metadata missing on upload | Uploads set `--content-type`; re-run the publish workflow |
| Dashboard has no history | First run (no prior R2 history) | Expected; appears from the second run on |
| Privacy scan fails | Unallowlisted email/secrets in output | Inspect findings; redact or add to allowlist deliberately |
| Publisher did not run | PR Checks conclusion ≠ success | The publish only runs on successful PR CI |

## Owner-side setup checklist (post-merge)

1. Create the R2 bucket (no public access).
2. Add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` + bucket-name GitHub secrets.
3. Create the Cloudflare Access application for `/e2e` + `/qa`; set the Pages env vars + R2 binding.
4. Let the first publish run; it stages + scans but does not upload. Inspect a
   representative report, then set `ALLURE_PUBLISH_READY=1`.
5. Verify: incognito `/e2e` → Access login; `curl -I /e2e` → 401 unauth.
