# KAI-307 destination release smoke gate

KAI-307 adds a deterministic regression gate for stable destination presentation and admission/opening-hours semantics. It reuses the bounded KAI-306 cohort; it is not another factual-data audit and does not require audit rows to be marked PASS.

## Cohort and checks

The cohort comes from `sampleIds` and `records` in `qa/kai-306/destination-sample-audit.json`. The tests require 20 unique IDs, matching manifest records, and one matching destination in both the canonical and runtime summary catalogues. They do not maintain a second destination list.

For each cohort member, the focused suite exercises the production place resolver and checks canonical identity, resolved English/Japanese presentation, valid authored classification values and resolved place type, prefecture/region membership, finite in-range coordinates, a usable hero-image reference, and locale detail-route construction. The current `role: "destination"` compatibility value is accepted only when the resolver produces the supported `destination` place type. Localized copy and highlights are checked for empty, placeholder-only, or malformed values without snapshotting descriptions.

Admission checks call the trip-cost engine and preserve semantic states such as verified paid, variable, not applicable, and unavailable. Controlled negative cases prove that unknown admission does not become free or zero, not-applicable admission does not become a free claim, and an invalid generated admission state is detected. Generated detail files are checked for sample identity and admission-state parity. Exact generated-output freshness and idempotency remain owned by the existing `check:catalog-sync` implementation, invoked by `check:catalog-ci` for catalogue-affecting diffs; KAI-307 does not add a second generator or sync mechanism.

Opening-hours checks call the existing resolver and policy with a deterministic instant derived from each destination's valid `verifiedAt` metadata, advanced by one day. Destinations without verification metadata use the fixed fallback instant `2026-10-09T12:00:00.000Z`. This avoids coupling the regression gate to historical verification dates while keeping policy evaluation deterministic. The checks cover verified, date-variable, venue-dependent, and unverified states; stale localized text must not override canonical verified hours, and warnings must track the policy state. These tests use committed data and deterministic fixtures; they do not fetch or crawl official source pages.

The KAI-306 PASS/FAIL adjudication is not a release predicate. Known unresolved findings remain visible evidence and do not fail this gate solely because a row is not PASS.

## Runtime subset

The existing weighted Playwright E2E matrix covers five routes in its mobile and desktop projects:

- Shinjuku City (EN): hub, venue-dependent hours, and not-applicable admission.
- Kinkaku-ji (JA): verified hours and paid admission.
- Ueno Park (EN): verified hours and not-applicable admission.
- Osaka Aquarium Kaiyukan (JA): date-variable hours and variable admission.
- Tokyo Tower (EN): unverified-hours warning state.

Each case checks route loading, page errors, identity, overview, opening-hours presentation, admission rendering, and section navigation. The browser clock is deterministic per case, derived from verification metadata where available, with the fixed fallback used otherwise. Weather fixture dates are derived from that case clock; all other remote requests are blocked, and local catalogue/detail assets are used. Weather, mapping, and other external services are not test dependencies.

CI uses the existing PR Checks unit gate and the existing E2E shard manifest. The browser spec is assigned to weighted bin 2; no additional workflow was introduced.

## Limits

Passing this suite does not certify:

- factual accuracy of the entire catalogue;
- freshness of external facts;
- exact route accuracy;
- all image rights or subject correctness;
- complete planning or budget readiness.

The suite protects selected regressions in the current representative sample. It does not replace source review, broad catalogue audits, live-provider validation, or separate route-accuracy work.
