# PR #89 adversarial review

Reviewed against `docs/pr89-implementation-plan.md`, `docs/RELEASE_RULES.md`,
the PR description, PR #88 (`95ff5bc`), and the pre-#88 relationship suite
(`a464ad5`). This review was performed before local fixes were applied.

## Findings

### Critical — signed-in edits overwrite the guest snapshot

`src/shared/hooks/useTripStore.tsx:231-238` updated `guestOrigin` for every
`setOriginLocation` call, including an authenticated user. Reproduction: choose
Nakayama as a guest, sign in, choose Shin-Yokohama, then log out. The logout
path restores Shin-Yokohama from the mutated guest snapshot rather than the
original guest origin. The existing integration test passed a static
`guestOrigin` prop and therefore never exercised the provider setter.

Smallest correct fix: update and persist `guestOrigin` only for guest edits;
always update `activeOrigin`.

### High — atomic origin state is not enforced by the public API

`src/shared/hooks/useTripStore.tsx:53-59` continued to expose
`setHomeStation` and `setHomeStationCoords`. Either can commit a label and
coordinates from different selections. The test invoked both in one React act,
which hid the intermediate invalid state.

Smallest correct fix: expose only `setOriginLocation` and migrate callers.

### High — geographic bounds are not validated

`src/shared/hooks/useTripStore.tsx:114-125` accepted finite values outside the
valid latitude and longitude ranges. `{ lat: 91, lng: 181 }` was persisted as a
guest origin. Tests covered only malformed JSON and non-finite numbers.

Smallest correct fix: require latitude in `[-90, 90]` and longitude in
`[-180, 180]` during storage validation and before a commit.

### High — required location and profile UI behaviour is untested

There are no PR #89 tests for `StationInput`, `ProfileModal`, or the profile
page. `src/shared/hooks/__tests__/useTripStoreLocationPersistence.test.tsx`
directly writes and rereads localStorage, and its migration test reproduces the
implementation rather than using the provider. `useTripSync` coverage omits
logout, Account A to B, stale hydration, failed coordinate resolution, and
debounced persistence isolation.

Smallest correct fix: test the real provider/sync hook/component flows with
mocked dependencies.

### Medium — the gateway audit has no verifiable sources

`docs/audits/pr89-gateway-review.csv` labels every claim `editorial-review` but
does not provide a source URL. The 19 retained gateways cannot be independently
verified from the artifact.

Smallest correct fix: provide a specific source URL and destination-specific
access rationale for every retained conversion.

### Medium — the requested multi-municipality policy is absent

PR #89 does not modify `docs/RELEASE_RULES.md`; it adds no precedence policy
or cited canonical-entrance justification for Nokogiriyama and Yoro Valley.

Smallest correct fix: add the specified policy and evidence-backed applications
for both records.

## Relationship-validator assessment

Focused relationship test count: 12 before PR #88, 3 after PR #88, 20 in PR
#89. The 12 removed focused tests were restored and the added focused tests
assert error codes. Current-catalogue validation is additive, not the sole
negative-test coverage.

## Specification compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| Relationship tests restored | Pass | 12 → 3 → 20 focused tests; restored tests use validator error codes. |
| Guest origin atomic | Partial | Single storage object exists, but PR exposed split setters and accepted out-of-range values. |
| Account isolation | Fail before local fix | Signed-in edit replaced in-memory guest snapshot. |
| Logout restoration | Fail before local fix | Logout restored the overwritten guest snapshot. |
| Stale hydration protected | Partial | Version checks exist, but no focused A→B stale-response test. |
| Real location tests | Fail | No StationInput test; several tests reproduce storage logic. |
| Profile orchestration tested | Partial | Pure orchestration cases pass; no duplicate-submit or UI tests. |
| Gateway audit complete | Fail | 22 rows are present, but retained rows have no source URLs. |
| Multi-municipality policy applied | Fail | No release-rule policy or cited entrance analysis for Nokogiriyama/Yoro Valley. |
| Browser QA credible | Fail | Checklist only; no personally reproduced browser evidence. |

## Test quality

- Full suite: PR #88 reported 346 tests; PR #89 reported 386; this review run has 387 after the local regression test.
- Relationship suite: 12 before PR #88, 3 after it, 20 in PR #89.
- Production behaviour exercised: the relationship validator and clear-profile orchestration tests.
- Superficial/coupled: the legacy localStorage test directly writes/rereads storage; its migration test duplicated the migration algorithm. The origin-sync harness passes immutable `guestOrigin` props, so it cannot observe the provider ownership mutation.

## PR scope and history

`main...HEAD` comprises five focused commits and 17 changed files, with 1,321
additions and 261 deletions before local review changes. GitHub Actions reported
all required PR checks successful; those checks did not detect the ownership and
coverage gaps above.

## Pre-fix recommendation

`REQUEST CHANGES` — CI was green, but the claimed guest/account separation was
not implemented and the mandatory test/audit/policy scope was incomplete.

## Local follow-up

Local, uncommitted changes address the confirmed guest-snapshot mutation,
remove the remaining split origin setters, and add geographic-bound validation.
The validation results below are updated after the required commands complete.

## Validation

| Command | Result |
| --- | --- |
| `npm run test:run` | Pass — 84 files, 387 tests |
| `npx tsc -b --noEmit` | Pass |
| `npm run lint` | Pass with existing warnings |
| `npm run format:check` | Pass after formatting the edited test file |
| `npm run validate:i18n` | Pass — 338 keys |
| `npm run validate:catalog-fast` | Pass — 0 errors, 368 existing warnings |
| `npm run build` | Pass |
| `npm run apply-city-hub-relationships` | 0 managed records changed; its generated-index formatting rewrite was restored |
| `git diff --exit-code` | Expected non-zero while the review fixes remain intentionally uncommitted |
