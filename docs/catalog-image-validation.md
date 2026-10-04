# Catalogue image validation

The image validator separates remote verification from deterministic catalogue checks. A URL is never treated as verified merely because a provider could not be reached.

## Three remote outcomes

- **Verified** — the request completed successfully and the response used an allowed image MIME type.
- **Broken** — a definitive response or deterministic policy check shows the URL/resource is invalid (for example HTTP 404/410, disallowed URL, or non-image response). These are errors and block validation.
- **Inconclusive** — the validator could not establish validity (429/rate limit, timeout, transient 5xx, retry-budget exhaustion, or transient network/DNS failure). These are warnings, remain unverified, and do not make the remote monitor green by implication.

A mixed run fails when it contains any blocking deterministic or confirmed-broken finding, even if other URLs are inconclusive. With zero blocking findings and at least one inconclusive URL, the result is `INCOMPLETE`; only zero inconclusive URLs yields a remote `PASSED` result.

The JSON result contains `verifiedUrls`, `brokenUrls`, `inconclusiveUrls`, and per-cause counts. Each unresolved URL gets an `IMAGE_FETCH_INCONCLUSIVE` warning; confirmed HTTP failures use `IMAGE_FETCH_BROKEN`. Failure messages include the safe URL path (credentials, sensitive query keys, and fragments are omitted). The CLI writes `reports/image-validation-<mode>.json` and `.md` and appends a concise summary to `GITHUB_STEP_SUMMARY` when running in Actions.

## Probe controls

- Wikimedia subdomains share one provider limiter, are limited to one in-flight request, and have a one-second minimum request-start interval. Other providers are also limited to one in-flight request per provider.
- Global concurrency is controlled with `IMAGE_VALIDATION_MAX_CONCURRENT_REQUESTS` (default `3`, accepted range `1`–`5`); scheduled CI sets it to `2`.
- `Retry-After` is parsed and honored when it fits the 30-second retry budget. Longer provider pauses open a run-local circuit and mark the remaining URLs for that provider inconclusive rather than waiting or issuing another request.
- A 429 gets at most one retry; other transient failures get at most two retries with bounded exponential backoff. Repeated 429s for one URL or four transient 429/5xx responses from one provider open its run-local circuit; four accumulated DNS/request transport failures do the same. Eight exhausted inconclusive URLs from one provider are a final run-local safeguard. This prevents repeated provider outages from consuming the catalogue-wide budget. Request and DNS operations have timeouts; scheduled image monitoring has a 30-minute workflow timeout.
- The circuit exists only for the current run. No verification cache is used, so a past success cannot mask a newly broken URL.

## CI scope

- `npm run validate-all -- --profile deterministic` runs all catalogue validators, including local image requirements/URL policy, but does not make remote image requests. These errors remain blocking.
- `npm run validate:images:changed` is used by `PR Checks / changed-external` and by the push-only image gate in `validate.yml` (with `github.event.before` as `--base-ref`); it probes only changed destination image references when the diff can be classified and explicitly skips when no image changes are in scope. A changed URL confirmed broken is blocking; an inconclusive changed URL is reported but non-blocking.
- `npm run validate:images:full` is the nightly/manual full-catalogue monitor. Confirmed broken URLs fail the job. Inconclusive-only results exit successfully so provider throttling cannot make the entire workflow red, while the step summary/artifact state clearly says verification was incomplete.

No live Wikimedia or other provider response is used in unit tests; HTTP, DNS, timeout, and stream behavior are mocked.
