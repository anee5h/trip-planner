# Meguruto testing strategy and release-quality evidence

## Purpose and evidence boundary

Meguruto is a data-heavy, bilingual, origin-aware travel planner. Its quality model is therefore broader than “the React app builds”: a release must preserve connected user journeys, localization contracts, evidence-bearing transport and budget decisions, catalogue relationships, public metadata, browser accessibility, service-worker behavior, and privileged Pages Function boundaries.

This is the focused test/CI/release reference. It records what the repository actually checks, where the checks run, and what they do **not** prove. The source of truth for a command, trigger, or gate remains the linked workflow or script; this document is not a substitute for reading those files.

The current audited base for this branch is `origin/main` at [`1d0f0b3b`](https://github.com/anee5h/trip-planner/commit/1d0f0b3b7a8ec9a691dabe6bc8e85f22c71ce91b), which includes the current Meguruto architecture, recommendation, transport, data-quality, and testing references. KAI-297 is linked as a dated QA baseline, not as an evergreen production or test-count claim.

## 1. Quality model and threat matrix

| Failure mode | Existing coverage | What remains unproven |
|---|---|---|
| Home → recommendation → detail → planner path breaks | [`kai-297-recruiter-golden-path.spec.ts`](../e2e/kai-297-recruiter-golden-path.spec.ts), related Home/detail/planner specs, Chromium mobile + desktop bins | Mocked catalogue/weather and browser emulation do not prove every live provider response or every data record. |
| EN/JA UI contradictions or wrong locale contract | [`check-translation-parity.cjs`](../scripts/check-translation-parity.cjs), [`kai-80-a11y.spec.ts`](../e2e/kai-80-a11y.spec.ts), KAI-297 EN/JA journey, [`PlaceCatalog.test.ts`](../src/shared/services/place/__tests__/PlaceCatalog.test.ts) | Key/placeholder parity does not judge translation quality, terminology, or every product sentence. |
| Mobile-only overflow, focus, or control regressions | Chromium mobile project, KAI-80 narrow/reflow/focus tests, mobile a11y matrix, responsive E2E specs | Chromium iPhone emulation is not physical iOS Safari, Android Chrome, or an installed PWA. |
| Inaccurate or overconfident transport | [`OriginAwareTransportService.test.ts`](../src/shared/services/transport/__tests__/OriginAwareTransportService.test.ts), transport-domain tests, [`docs/transport-estimation.md`](transport-estimation.md) | Fixtures validate selected corridors and fail-closed semantics; they do not establish nationwide route accuracy, live availability, or provider uptime. |
| Unknown admission/fare represented as zero | [`tripCostEngine.test.ts`](../src/shared/services/budget/__tests__/tripCostEngine.test.ts), [`kai-285-admission-semantics.test.ts`](../src/shared/services/budget/__tests__/kai285-admission-semantics.test.ts), [`factValidation.ts`](../src/shared/services/budget/factValidation.ts) | Unit fixtures cannot prove every catalogue fact has current source evidence. |
| Catalogue relationship or generated-output inconsistency | [`DestinationRelationshipService.test.ts`](../src/shared/services/destination/__tests__/DestinationRelationshipService.test.ts), read-only audit, warning baseline, generated-file sync in [`check-catalog-ci.ts`](../scripts/check-catalog-ci.ts) | The catalogue gate can intentionally skip on an irrelevant diff; accepted warning debt is not the same as zero findings. |
| Guest/auth route leakage or unsafe persistence intent | [`PendingPersistenceIntent.test.ts`](../src/shared/services/auth/__tests__/PendingPersistenceIntent.test.ts), KAI-297/KAI-80 fake-auth journeys, [`check-protected-routes.mjs`](../scripts/check-protected-routes.mjs) | Local JWKS/Pages tests do not prove the production Cloudflare Access policy or a real account lifecycle. |
| Bad 404, robots, canonical, sitemap, or SEO output | [`generate-seo-outputs.ts`](../scripts/generate-seo-outputs.ts) with `--check`, build `seo:check`, [`verify-pages-functions.mjs`](../scripts/verify-pages-functions.mjs) | The Pages Function verifier is included in `verify:pr` but not `release:verify` and is not a standalone job in `pr-checks.yml`. Search-engine indexing and every deployed edge path remain external behavior. |
| Service-worker cache, offline shell, or upgrade regression | [`check-pwa.cjs`](../scripts/check-pwa.cjs), [`kai-64-pwa.spec.ts`](../e2e/kai-64-pwa.spec.ts), [`kai-64-upgrade.spec.ts`](../e2e/kai-64-upgrade.spec.ts), [`kai-121-lazy-catalogue.spec.ts`](../e2e/kai-121-lazy-catalogue.spec.ts) | Production-preview Chromium does not prove install, close/reopen, update UX, or Cache Storage behavior on a physical iOS/Android device. |
| Privileged Pages Function, JWT/JWKS, or public-artifact privacy failure | `protected-routes` job, [`check-protected-routes.mjs`](../scripts/check-protected-routes.mjs), bundle-secret and Allure privacy scans, [`allure-publish.yml`](../.github/workflows/allure-publish.yml) | Production bindings, Access identity policy, private R2 enablement, and owner-side deployment settings are not established by local fixtures. |

No adjacent test is treated as proof of a risk it does not assert. In particular, a passing build is not catalogue accuracy, a passing mocked provider test is not provider availability, and a passing browser-emulated PWA test is not physical-device validation.

## 2. Test layers and responsibility

### Vitest and service/component tests

`npm run test:run` executes the repository's Vitest suite, including shared recommendation, transport, budget, itinerary, catalogue, auth/persistence, weather, and localization logic. Representative contracts include:

- recommendation determinism, feasibility, confidence, and composition in [`RecommendationScorer.test.ts`](../src/shared/services/recommendation/__tests__/RecommendationScorer.test.ts), [`RecommendationPipeline.test.ts`](../src/shared/services/recommendation/RecommendationPipeline.test.ts), and related recommendation tests;
- origin-aware corridors, topology boundaries, rough-estimate semantics, fare scope, and unknown routes in [`OriginAwareTransportService.test.ts`](../src/shared/services/transport/__tests__/OriginAwareTransportService.test.ts);
- cost ranges, provenance, admission applicability, and fail-closed unknown/free states in [`tripCostEngine.test.ts`](../src/shared/services/budget/__tests__/tripCostEngine.test.ts) and [`kai-285-admission-semantics.test.ts`](../src/shared/services/budget/__tests__/kai285-admission-semantics.test.ts);
- full/lite catalogue loading, retry boundaries, bilingual projections, and relationship indexes in [`PlaceCatalog.test.ts`](../src/shared/services/place/__tests__/PlaceCatalog.test.ts) and [`DestinationRelationshipService.test.ts`](../src/shared/services/destination/__tests__/DestinationRelationshipService.test.ts);
- persistence adapters and safe post-auth intents in [`TripRepository.test.ts`](../src/shared/services/trips/__tests__/TripRepository.test.ts) and [`PendingPersistenceIntent.test.ts`](../src/shared/services/auth/__tests__/PendingPersistenceIntent.test.ts);
- supported Japanese editorial coverage in [`localizationCoverage.test.ts`](../src/shared/utils/__tests__/localizationCoverage.test.ts).

These tests are fast, deterministic regression evidence for code and fixture semantics. They do not mount every production route, run the Cloudflare workerd runtime, call live providers, or prove deployed HTML/headers.

### Playwright browser journeys

Playwright exercises user-visible route transitions and cross-feature contracts. Normal E2E uses the Vite dev server; the dedicated PWA and a11y jobs use a production build served by preview. The KAI-297 flow seeds an origin, freezes the clock, mocks the weather forecast, serves catalogue JSON from disk, and checks guest EN/JA journeys across both configured browser projects. The shared [`e2e/fixtures.ts`](../e2e/fixtures.ts) intercepts the full and lite catalogue assets from committed source files for deterministic normal E2E.

The fixture is intentionally not a universal external-provider mock. Production-preview PWA tests abort non-local external requests; the KAI-121 runtime checks assert local network/cache behavior; older journeys may have their own provider assumptions. Authenticated browser checks use a synthetic, non-production Supabase project and route interception only when the relevant fixture flag is enabled. CI sets `E2E_AUTH_FIXTURE=1` for normal E2E and uses `A11Y_E2E=1` for the a11y build/matrix. No test requires connecting to production Supabase or mutating a production user/account.

### Accessibility and security layers

- [`e2e/kai-80-a11y.spec.ts`](../e2e/kai-80-a11y.spec.ts) uses `@axe-core/playwright` on representative public, authenticated-fixture, EN/JA, light/dark, narrow, dialog/focus, reduced-motion, and error/empty surfaces. Required controls are asserted; the suite is not a promise of complete manual WCAG conformance.
- [`check-protected-routes.mjs`](../scripts/check-protected-routes.mjs) generates a throwaway RSA keypair and local JWKS server, signs valid and invalid JWT variants, boots the real Pages Functions through `wrangler pages dev`, and checks deny/allow paths, protected assets, a generated Allure report, MIME, robots, and browser rendering. It validates the boundary implementation with local bindings, not the production Access tenant; it does not directly assert CSP directives.
- [`verify-pages-functions.mjs`](../scripts/verify-pages-functions.mjs) boots the built Pages runtime with a local Supabase mock and checks destination HTML/404s, SPA/private routes, static assets, headers, PWA resources, account-delete runtime behavior, `_routes.json`, and static-vs-Function policy agreement. It requires `dist/` and is not itself a named `pr-checks.yml` job.

### Read-only catalogue audits

[`audit-catalog-integrity.ts`](../scripts/audit-catalog-integrity.ts) reads canonical/index/detail/meta/collection inputs, reports relationship, geography-suspicion, timing, naming, source/generated consistency, and recommendation-impact findings, and does not rewrite catalogue data. [`check-catalog-warnings.ts`](../scripts/check-catalog-warnings.ts) fails audit errors or new warning fingerprints against the committed debt ledger. [`check-catalog-sync.ts`](../scripts/check-catalog-sync.ts) generates outputs in memory, compares them byte-for-byte with committed files, and generates twice to prove idempotency. These checks protect data contracts; they are not editorial fact verification for every source URL.

## 3. Playwright configuration and reproducibility

The authoritative configuration is [`playwright.config.ts`](../playwright.config.ts). CI pins Node **22** with `actions/setup-node`; `.nvmrc` and `.node-version` are both present with `22.14.0`, but the workflows pin Node explicitly rather than consuming those files. The repository has no `engines` field, and [`package-lock.json`](../package-lock.json) is lockfile version 3. The declared dependency ranges start at Vitest `5.0.0`, Playwright `1.63.0`, TypeScript `7.0.2`, Vite `8.3.0`, Prettier `3.9.6`, and Oxlint `1.83.0` in [`package.json`](../package.json); `package-lock.json` supplies the installed resolution. Reproducible installation is `npm ci`; a developer's local Node version is not evidence of the CI runtime.

- two projects: `chromium-mobile` uses the Playwright `iPhone 13` device descriptor but still runs Chromium; `chromium-desktop` uses Chromium at `1440×900`, non-mobile, no touch;
- `locale: en-US` and `timezoneId: Asia/Tokyo` are set globally; individual specs explicitly exercise `/ja/` URL and `html.lang=ja` behavior;
- `fullyParallel: false`, `workers: 2`, test timeout `120s`, assertion timeout `30s`, and web-server timeout `120s`;
- CI retries once; local retries are zero. Screenshots are only captured on failure and traces are retained on failure;
- normal E2E starts `npm run dev`; `PWA_E2E=1` builds then serves a production preview; a11y CI downloads a single prebuilt `dist/` and serves preview without rebuilding; `E2E_AUTH_FIXTURE=1` uses the fake Supabase build configuration;
- the catalogue fixture fulfills `destinations-index.lite.json` and `destinations-index.json` from disk, avoiding a dev-server round trip and keeping the dataset deterministic;
- KAI-297 freezes a fixed Tokyo-time date and mocks `/v1/forecast`. Its auth handoff uses synthetic fixture data only.

The normal CI E2E topology is not Playwright's generic `--shard` mode. [`scripts/e2e-shards.mjs`](../scripts/e2e-shards.mjs) is the manifest: four weighted file bins × two Chromium projects = eight jobs. The weights are measured per-project execution estimates; PWA and a11y specs have zero weights in the normal bins because their dedicated jobs own them. `node scripts/e2e-shards.mjs --check` fails if a discovered spec is missing, duplicated, stale in the weight map, or assigned to more than one bin. Browser emulation and a preview build are reproducibility tools, not substitutes for physical iOS Safari, Android Chrome, or an installed PWA.

CI isolation is deliberate: the workflows use `npm ci`, fake/non-production auth fixtures, local/local-mock provider boundaries where required, and no real production user credentials or production data mutations. Optional provider credentials belong in owner-managed runtime/deployment bindings; they are not needed to run the fixture suites described here.

## 4. Pull-request quality gates: actual DAG and triggers

### PR Checks workflow

[`pr-checks.yml`](../.github/workflows/pr-checks.yml) runs on `pull_request` targeting `main` or `data/collections-*`. Independent jobs start from the same checkout; the only important job dependencies are:

```text
quality                         ─┐
tests                           ├─ independent PR checks
e2e-coverage                    │
e2e (chromium-mobile × 4)       │
e2e (chromium-desktop × 4)      │
pwa-e2e                         │
protected-routes                │
a11y-build → a11y-e2e × 2       │
catalogue-fast                  │
build                           │
changed-external                ─┘

(e2e, pwa-e2e, a11y-e2e × 2) → allure-report (always runs to aggregate evidence)
```

The compact job matrix below describes the implementation, not branch-protection policy:

| Workflow/job | Trigger | Command/source | Detects | Limit |
|---|---|---|---|---|
| `PR Checks / quality` | PR | `tsc -b --noEmit`, `npm run lint`, `npm run format:check`, `npm run validate:i18n` | Type, lint, formatting, EN/JA key/placeholder drift | No deployed runtime or translation-quality judgment. |
| `PR Checks / tests` | PR | `npm run test:run -- --maxWorkers=2` | Shared/service/component regressions | No browser, edge, or live-provider proof. |
| `PR Checks / e2e` × 8 | PR | `playwright test --project=… $(node scripts/e2e-shards.mjs --bin …)`; privacy scans before artifacts | Connected journeys, responsive Chromium paths, fixture auth/weather/catalogue behavior | Chromium emulation; mocked/fixture data; one CI retry can mask a transient failure. |
| `PR Checks / e2e-coverage` | PR | `node scripts/e2e-shards.mjs --check` | A spec silently omitted or assigned twice | Checks manifest membership, not test assertions. |
| `PR Checks / pwa-e2e` | PR | `npm run test:pwa` | Preview-build service worker, offline shell, cache exclusions, Build-A → Build-B retention, lazy catalogue runtime | Chromium preview, not installed mobile hardware. |
| `PR Checks / a11y-build` → `a11y-e2e` × 2 | PR | Build fake-auth `dist/` once; `A11Y_E2E=1 A11Y_PREBUILT=1 playwright test …kai-80…` | Automated axe subset, focus, keyboard, reflow, EN/JA, theme and auth-fixture surfaces | Automated subset and representative matrix, not manual/physical audit. |
| `PR Checks / protected-routes` | PR | `npm run build`; `node scripts/check-protected-routes.mjs`; `node scripts/check-allure-history.mjs` | Local Pages Function JWT/JWKS allow/deny paths, protected artifacts, Allure history fixture | Local keys/R2 mock; no production Access/R2 binding proof. |
| `PR Checks / catalogue-fast` | PR | `npm run validate:catalog-fast` | Fast data-quality profile | Not the full read-only audit or generated sync gate. |
| `PR Checks / build` | PR | `npm run build`, `npm run seo:check`, bundle budget/secrets, `npm run check:pwa` | Build, SEO freshness, budget, browser-bundle secrets, PWA policy | Does not call live production headers or all Pages Function routes. |
| `PR Checks / changed-external` | PR | `validate:images:changed`, `validate:links:changed` | Changed catalogue image/link failures | Scope is changed external assets, not an all-record refresh. |
| `PR Checks / allure-report` | PR, `always()` after E2E/PWA/a11y | Download results, `allure generate`, strip analytics, privacy scan, upload preview artifact | Aggregated, traceable test evidence and report privacy | Artifact preview is not a production release; it is public-repo artifact data after sanitization. |

The repository's current `main` branch-protection API lists only these required status contexts: `quality`, `tests`, `catalogue-fast`, `build`, and `validate-title` (strict status checks). The other PR Checks jobs still provide valuable evidence and can fail the workflow, but they must not be described as globally required branch-protection checks without re-reading repository settings.

### Other PR/push workflows

- [`pr-title.yml`](../.github/workflows/pr-title.yml) runs on PR open/edit/synchronize/reopen and requires the conventional prefix regex. `validate-title` is branch-protection-required.
- [`catalogue-integrity.yml`](../.github/workflows/catalogue-integrity.yml) runs on PRs to `main`/`data/collections-*` and manual dispatch. It runs `npm run check:catalog-ci`; it has no YAML path filter because [`changed-scope.ts`](../scripts/cli/changed-scope.ts) is the classifier.
- [`destination-checks.yml`](../.github/workflows/destination-checks.yml) runs only when selected destination/catalogue/validator paths change and runs `npm run validate:catalog-fast`.
- [`ci.yml`](../.github/workflows/ci.yml) runs on pushes to `main`, `dev`, or `release`, and PRs targeting those branches or `data/collections-*`; it runs `npm install`, Prettier check, and `npm run build`. Its `test-and-build` context is separate from the five currently required `main` contexts.
- [`validate.yml`](../.github/workflows/validate.yml) runs Fast Validation on push/PR and has a separate schedule/manual-only Full Remote Validation job, described next.

## 5. Fast PR versus nightly, manual, and release validation

`validate.yml` is intentionally conditional:

- **Fast Validation** runs only when `github.event_name` is `push` or `pull_request`: Node 22, `npm ci`, lint, `tsc --noEmit`, build, translation parity, and editorial-freshness report.
- **Full Remote Validation** runs only for the nightly schedule (`0 19 * * *`, 19:00 UTC) or `workflow_dispatch`: `npm run validate-all`, translation parity, editorial-freshness report, and report artifacts.
- On a normal PR, Full Remote Validation is **skipped by its job condition**. A skipped Full Remote Validation is not a pass and is not evidence that the full remote/data validation ran.

`npm run check:catalog-ci` has a second intentional conditional boundary. [`changed-scope.ts`](../scripts/cli/changed-scope.ts) treats `src/shared/data/`, `public/data/`, `scripts/`, `src/shared/types/`, workflow files, and package manifests as catalogue-affecting; otherwise its catalogue-audit stage prints a skip notice and exits zero. The top-level npm script then continues with its additional KAI-89, model, destination-completeness, and deprecated-field checks. A successful catalogue-stage skip means “this diff was classified as irrelevant,” not “every catalogue record was revalidated.” When relevant, the stage runs the read-only audit/warning-baseline and generated-file sync/idempotency checks.

The aggregate scripts in [`package.json`](../package.json) are useful local recipes but are not silently equivalent to workflow jobs:

- `npm run verify:pr` chains unit tests, TypeScript, KAI-256 typecheck, lint, formatting, i18n/localization, branding, fast catalogue, catalogue CI, build, SEO freshness, and Pages Function verification. The current PR workflow decomposes these concerns into jobs and does **not** invoke `verify:pr` as one command.
- `npm run release:verify` chains unit tests, dry-run pipeline, full validation, i18n/branding, TypeScript, lint, build, and formatting. [`release-verify.yml`](../.github/workflows/release-verify.yml) invokes it only for a `v*.*.*` tag after checking tag/package version equality; it is not an automatic PR or deployment gate.
- There is no repository evidence here that a Cloudflare deployment is automatically blocked by `verify:pr`, `release:verify`, or a green PR. Treat production release/deploy approval and secret/binding configuration as owner-managed unless a separate deployment workflow or branch rule proves otherwise.

Additional non-PR or owner-triggered evidence includes [`catalogue-health.yml`](../.github/workflows/catalogue-health.yml) (weekly/manual full catalogue validation), [`editorial-freshness.yml`](../.github/workflows/editorial-freshness.yml) (weekly/manual report), and [`security-smoke.yml`](../.github/workflows/security-smoke.yml) (daily/manual build, bundle scan, and live `https://meguruto.app` security-header/404 smoke). The security smoke classifies a Cloudflare challenge separately; it does not turn a challenge into an application pass.

## 6. Security, privacy, and public artifacts

- [`check-bundle-secrets.mjs`](../scripts/check-bundle-secrets.mjs) fails closed if `dist/` is missing and scans built JS/HTML/CSS/JSON/map files for service-role JWTs (including decoded JWT payloads), Supabase secret keys, server-key assignments, Resend keys, and generic long secret assignments. Publishable/anon client credentials are intentionally allowed by its pattern policy.
- [`check-security-headers.mjs`](../scripts/check-security-headers.mjs) discovers the live hashed asset and deployed version module, checks HSTS, frame/content/referrer/cross-origin policies, CSP, Permissions-Policy, Function and static 404 paths, and can compare the embedded deployed commit when `EXPECTED_DEPLOYMENT_SHA` is supplied. It is a daily/manual live smoke, not a normal PR Checks job; exit code `2` means a recognized Cloudflare challenge prevented application verification.
- `protected-routes` generates its own throwaway keys/JWKS and tests missing, malformed, expired, wrong-audience, wrong-issuer, bad-signature, and valid JWT paths against local `wrangler pages dev`. This proves the verification code path and fail-closed behavior, not production identity policy.
- `check-allure-privacy.mjs` scans test/report data for emails, JWTs, Supabase URLs/keys, auth headers, cookies, private keys, and secret-like values; it inspects text inside trace/ZIP entries and fails closed on unreadable/unparseable material. Before public Actions artifact upload, `--sanitize` removes binary screenshots/videos because a regex scanner cannot declare opaque media safe. Upload steps require a successful scan and do not upload when the scan fails.
- The PR Allure report strips the Allure analytics/GTM block and is uploaded as a short-retention preview artifact. [`allure-publish.yml`](../.github/workflows/allure-publish.yml) runs from trusted default-branch workflow code after a completed same-repository PR Checks run, re-scans downloaded result data, restores history, regenerates with analytics disabled, strips analytics, and privacy-scans again. The final R2 upload is conditional on repository variable `ALLURE_PUBLISH_READY=1`; otherwise it is staged and not published. The private R2/Pages binding and Cloudflare Access setup are owner-side configuration documented in [`kai-126-allure-dashboard.md`](kai-126-allure-dashboard.md).

No credentials, real auth tokens, production user data, or personal user information belong in this document or in committed test artifacts.

## 7. Data, localization, SEO, and PWA gates

### Catalogue and data quality

The committed warning ledger in [`scripts/audit/catalog-warnings-baseline.json`](../scripts/audit/catalog-warnings-baseline.json) is accepted pre-existing debt. Direct inspection of the current ledger at `origin/main` `d0160808976f25e3d07e338288373151c057f72e` found 1,602 stored warning fingerprints/instances. A measured `npm run check:catalog-warnings` run at `2026-09-20T12:28:12+09:00` on that source reported 0 errors, 533 current warnings, 2 info findings, 1,069 reduced fingerprints, and no new warning instances; it passed without rewriting the baseline. The older prose in [`scripts/README.md`](../scripts/README.md) says 396 instances and is stale relative to the executable baseline, so it is not used as the current count here. The baseline is fingerprinted per violation, shrinks only through a deliberate reviewed update, and new warning instances fail the warning check. These counts are debt/audit evidence, not a claim of catalogue correctness or freshness.

`check-catalog-sync.ts` regenerates detail files, metadata, lite index, and relationship projection in memory from the canonical index, then byte-compares committed outputs and repeats the generation for idempotency. The command is read-only. `check:catalog-ci` may skip it for a non-catalogue diff as described above. Detailed semantic ownership and maintenance rules are in [`docs/data-quality.md`](data-quality.md); this document links to them rather than duplicating them.

### Localization

`check-translation-parity.cjs` compares EN/JA leaf keys and the set of `{{placeholder}}` names. `validate:localization` adds targeted Vitest coverage for localized catalogue labels/projections. Playwright KAI-80/KAI-297 checks URL locale, `html.lang`, locale switching, selected Japanese accessible names, and representative EN/JA route surfaces. These are complementary: resource parity does not prove idiomatic translation, and browser route coverage does not enumerate every key.

### SEO and response paths

`npm run build` generates locale-specific destination HTML, sitemap, and public-destination manifest through [`generate-seo-outputs.ts`](../scripts/generate-seo-outputs.ts). `npm run seo:check` regenerates in memory and byte-compares the `dist/` outputs; missing/incomplete canonical destination content fails generation rather than silently producing an empty prerender. [`verify-pages-functions.mjs`](../scripts/verify-pages-functions.mjs) checks the built Pages runtime, including published and unknown destination paths, EN/JA metadata, real 404/noindex behavior, private SPA routes, static assets, `_routes.json`, and static-vs-Function header policy. This is a local workerd/preview boundary check, not proof of search-engine indexing or an automatically deployed production commit.

### PWA and lazy catalogue

`check:pwa` statically checks manifest fields, icons, worker exclusions for auth/dynamic data, fingerprinted production cache identity, `skipWaiting`, and the open-tab-safe absence of `clients.claim`. `test:pwa` runs the PWA, Build-A → Build-B upgrade, and KAI-121 runtime-lazy catalogue specs against the production preview. They check app-shell/offline reload, dynamic data exclusion from Cache Storage, retention of an old lazy chunk during an upgrade, no eager full/lite catalogue fetch on cold routes, and explicit lazy-load error/retry behavior. These checks are strong preview/browser evidence but not physical installed-PWA evidence.

## 8. Evidence snapshot and limitations

The only numeric suite snapshot intentionally carried forward here is historical and pinned to the KAI-297 report:

- **Date:** 2026-09-19 JST;
- **Source/report:** [`qa/kai-297/recruiter-golden-path.md`](../qa/kai-297/recruiter-golden-path.md);
- **reported commands/evidence:** 385 Vitest files, 5,319 passed, 2 skipped; 34 E2E specs assigned exactly once across four bins; 853 translation keys with zero placeholder mismatches; and the report's recorded exact-head PR checks;
- **historical source context:** the report identifies its local validation source SHA separately from its published PR head and records production observations against an older main source.

These figures are not a current-main guarantee and were not silently rerun for this documentation change. The current branch's authoritative evidence is its own exact-head CI run; pending, cancelled, failed, or skipped jobs must be reported with those states. In particular, the skipped Full Remote Validation job must never be relabelled as a pass. No uptime, performance, coverage percentage, defect-prevention, conversion, or reliability metric is inferred from these tests.

Known unverified or owner-managed areas include:

- physical iOS Safari and Android Chrome, installed Home Screen PWA lifecycle, device cache inspection, and real-device upgrade behavior;
- real production authenticated login/logout, account creation, account switching, and saved-data mutation;
- live external provider availability, quotas, response drift, and nationwide route/fare accuracy;
- complete editorial correctness or source freshness of every catalogue fact;
- Cloudflare production bindings, Access policy, private R2 readiness, deployment identity, and automatic deployment gating;
- manual accessibility review, assistive technology combinations, and all possible browser/viewport/locale combinations.

## 9. How an engineer validates a change

Use the smallest relevant deterministic proof first, then rely on exact-head CI for the repository-wide gate. Targeted Vitest files can be run with `npx vitest run <path> --maxWorkers=2`; targeted Playwright runs use either `npx playwright test --project=chromium-mobile <spec>` or `npx playwright test --project=chromium-desktop <spec>`. If Chromium is not installed locally, `npx playwright install chromium` is sufficient; CI deliberately does **not** use `--with-deps`.

| Change type | Targeted evidence | Additional checks / manual boundary |
|---|---|---|
| React UI or route | Relevant component/service tests; focused Playwright spec; `npm run test:a11y` for a11y-sensitive surfaces | `npm run lint`, `npm run format:check`, typecheck; inspect desktop/mobile and EN/JA behavior. |
| Recommendation or transport logic | Relevant recommendation tests plus [`OriginAwareTransportService.test.ts`](../src/shared/services/transport/__tests__/OriginAwareTransportService.test.ts), duration/policy tests, and a representative KAI-297/detail journey | Read [`docs/recommendation-engine.md`](recommendation-engine.md) and [`docs/transport-estimation.md`](transport-estimation.md); live provider accuracy remains separately unverified. |
| Budget/admission/fare semantics | [`tripCostEngine.test.ts`](../src/shared/services/budget/__tests__/tripCostEngine.test.ts), [`kai-285-admission-semantics.test.ts`](../src/shared/services/budget/__tests__/kai285-admission-semantics.test.ts) | Verify unknown/N/A/free/provenance states; do not replace a failing semantic test with a numeric-zero fixture. |
| Catalogue data or relationships | `npm run validate:catalog-fast`; `npm run check:catalog-ci`; relevant `npm run validate:images:changed`/`validate:links:changed`; relationship/depth audit as applicable | Review canonical and generated diffs together; a non-catalogue skip is not a full audit. |
| EN/JA translations or localized catalogue content | `npm run validate:i18n`; `npm run validate:localization`; relevant KAI-80/KAI-297 locale spec | Check accessible names and route `html.lang`; parity does not replace language review. |
| Pages Function or privileged boundary | Function/core tests; `npm run build`; `npm run verify:pages-functions`; `node scripts/check-protected-routes.mjs` for auth/Allure boundaries | Use local mock bindings/JWKS. Production secrets or Supabase are not required for fixture validation; live binding/deployment smoke is owner-managed. |
| SEO, 404, headers, or generated HTML | `npm run build`; `npm run seo:check`; `npm run verify:pages-functions` | `npm run check:security-headers` is a live daily/manual smoke and may hit a Cloudflare challenge; do not call it a local PR proof. |
| PWA, service worker, or cache | `npm run build`; `npm run check:pwa`; `npm run test:pwa` | Inspect production preview behavior; physical installed-device validation remains required when the change depends on device lifecycle. |
| Auth/persistence | [`PendingPersistenceIntent.test.ts`](../src/shared/services/auth/__tests__/PendingPersistenceIntent.test.ts), [`TripRepository.test.ts`](../src/shared/services/trips/__tests__/TripRepository.test.ts), fixture-gated KAI-297/KAI-80 auth journeys | Do not connect to production Supabase merely to run fixtures; use a dedicated non-production fixture or owner-provided manual environment. |

A lightweight normal sequence is:

1. Inspect the diff and identify the failure contract and source of truth.
2. Run the targeted unit/browser/domain checks above.
3. Run `npx tsc -b --noEmit`, `npm run lint`, `npm run format:check`, and `git diff --check` as applicable.
4. Run relevant catalogue, i18n, SEO, PWA, Function, privacy, or security checks.
5. Push the focused branch and wait for exact-head PR checks; verify the head SHA, base, and every relevant job state.
6. Review the evidence and limitations, then merge only with explicit authorization and fresh required checks.
7. Add production/manual verification when the change crosses live provider, Cloudflare binding, real account, physical-device, or deployed-HTML boundaries.

## 10. Documentation limits and related references

- Unit/service tests establish code and fixture contracts, not deployed behavior.
- CI browser tests establish Chromium emulation and the configured preview/dev server, not physical installed-PWA behavior.
- Mocks prove deterministic failure/contract handling, not external provider availability or current provider data.
- A successful build proves buildability and selected generated-output policies, not complete catalogue accuracy.
- Conditional scripts and workflow jobs can skip; the reason and condition must be read before interpreting a green or skipped result.
- The dated KAI-297 report is valuable evidence of what was tested on 2026-09-19 and what was observed then. Its production observations and test counts are historical, not proof that production is currently broken or fixed.

For subsystem detail, use the existing focused references:

- [`docs/architecture.md`](architecture.md) — runtime/build boundaries, data flow, persistence, Pages Functions, and provider seams;
- [`docs/recommendation-engine.md`](recommendation-engine.md) — eligibility, scoring, seasonality, budget, and diversity;
- [`docs/transport-estimation.md`](transport-estimation.md) — topology, evidence hierarchy, uncertainty, and pilot boundaries;
- [`docs/data-quality.md`](data-quality.md) — catalogue semantics, provenance, relationships, audits, and safe maintenance;
- [`docs/kai-126-allure-dashboard.md`](kai-126-allure-dashboard.md) — protected Allure/QA surfaces, history, privacy, and owner-side R2 setup; and
- [`qa/kai-297/recruiter-golden-path.md`](../qa/kai-297/recruiter-golden-path.md) — dated recruiter golden-path QA baseline and its explicit limitations.
