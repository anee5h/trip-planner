# TabiMap Development, Pull Request, Branching, and Release Rules

## 1. Purpose

This document defines the required development workflow for TabiMap.

It covers:

- branch structure
- branch naming
- pull request rules
- pull request naming
- commit naming
- validation and CI
- catalogue-specific changes
- release preparation
- release versioning
- deployment
- hotfixes
- rollback
- release records
- branch cleanup

The goal is to keep development structured, reviewable, efficient, and safe without creating unnecessary process overhead.

---

## 2. Core Principles

1. `main` is the only permanent production branch.
2. Direct pushes to `main` are not allowed.
3. Every production change must enter through a pull request.
4. Feature branches must be short-lived and focused.
5. A pull request should contain one coherent change.
6. Releases are represented by Git tags, not a permanent `release` branch.
7. Temporary `release/*` branches are used only for coordinated releases.
8. The same commit must not be pushed independently to `main`, `dev`, and `release`.
9. CI checks should be proportional to the change.
10. Remote image and link validation should not block unrelated PRs.
11. Catalogue audits must report by default and must not mutate data.
12. Squash merge is the default merge strategy for normal PRs.
13. Every release must have a version bump, release notes, a Git tag, and a known deployed commit.
14. Hotfixes must be minimal and must include regression coverage when practical.
15. All merged working branches should be deleted.

---

## 3. Permanent Branches

### 3.1 `main`

`main` is the production source of truth.

It must always contain code that is:

- buildable
- deployable
- tested
- validated
- suitable for production
- associated with a clear commit history

Rules:

- no direct pushes
- no force pushes
- no history rewriting
- no unreviewed merges
- no unfinished feature work
- no partial catalogue migrations
- no manual synchronization with other permanent branches

Production deployment must run from `main`.

---

## 4. Temporary Branch Types

```text
main
├── feature/*
├── fix/*
├── data/*
├── refactor/*
├── test/*
├── docs/*
├── chore/*
├── release/*
└── hotfix/*
```

### 4.1 `feature/*`

Use for new user-facing or product functionality.

Examples:

```text
feature/audit-finding-schema
feature/planner-state-persistence
feature/rating-confidence-weighting
```

### 4.2 `fix/*`

Use for normal bug fixes.

Examples:

```text
fix/budget-tier-sync
fix/mobile-filter-overflow
fix/recommendation-area-penalty
```

### 4.3 `data/*`

Use for destination catalogue, metadata, source, rating, image, or relationship work.

Examples:

```text
data/kyoto-editorial-review
data/kanto-transport-corrections
data/sapporo-city-expansion
```

### 4.4 `refactor/*`

Use for internal restructuring that should not intentionally change behavior.

Examples:

```text
refactor/planner-state-model
refactor/audit-report-builder
```

### 4.5 `test/*`

Use for test-only work.

Examples:

```text
test/audit-idempotency
test/planner-navigation-persistence
```

### 4.6 `docs/*`

Use for documentation-only changes.

Examples:

```text
docs/development-workflow
docs/v1.9.5-requirements
```

### 4.7 `chore/*`

Use for tooling, dependency, configuration, CI, or maintenance work.

Examples:

```text
chore/split-validation-profiles
chore/update-vite
```

### 4.8 `release/*`

Use only as a temporary release integration branch.

Example:

```text
release/v1.9.5
```

A release branch must be deleted after release completion.

### 4.9 `hotfix/*`

Use for urgent production fixes created from `main`.

Example:

```text
hotfix/v1.9.6-destination-crash
```

---

## 5. Branch Naming Rules

Branch names must follow:

```text
<type>/<short-kebab-case-description>
```

Allowed types:

```text
feature
fix
data
refactor
test
docs
chore
release
hotfix
```

Rules:

- lowercase only
- use hyphens, not spaces or underscores
- keep the description clear and specific
- avoid version numbers except for `release/*` and `hotfix/*`
- avoid vague names
- do not reuse old merged branch names

Good:

```text
feature/structured-audit-findings
fix/planner-refresh-state
data/osaka-rating-review
release/v1.9.5
hotfix/v1.9.6-map-crash
```

Bad:

```text
updates
fixes
new-branch
v195-work
aneesh-changes
final-final
```

---

## 6. Starting Work

Always start from the latest `main`.

```bash
git checkout main
git pull origin main
```

Create a focused branch:

```bash
git checkout -b feature/structured-audit-findings
```

Push after the first meaningful commit:

```bash
git push -u origin feature/structured-audit-findings
```

Do not work directly on `main`.

---

## 7. Commit Naming Rules

Use this format:

```text
<type>: <clear imperative summary>
```

Allowed commit types:

```text
feat:
fix:
data:
refactor:
test:
docs:
chore:
release:
hotfix:
```

Examples:

```text
feat: add severity to expansion audit findings
fix: preserve planner state after refresh
data: correct Kyoto destination classifications
refactor: extract audit report aggregation
test: add repair idempotency coverage
docs: add release workflow rules
chore: split fast and remote validation jobs
release: prepare v1.9.5
hotfix: prevent empty destination crash
```

Commit rules:

- use lowercase type
- keep the first line concise
- use imperative wording
- describe the behavior changed
- do not use vague summaries
- do not add version numbers to normal commits
- do not combine unrelated work
- generated files may be included only when required by the source change

Bad examples:

```text
updates
more changes
fix stuff
final commit
v1.9.5 work
```

---

## 8. Pull Request Naming Rules

PR titles must follow:

```text
<type>: <clear outcome>
```

Allowed PR title types:

```text
feat:
fix:
data:
refactor:
test:
docs:
chore:
release:
hotfix:
```

Examples:

```text
feat: add structured expansion audit findings
fix: preserve planner state across navigation
data: review Osaka destination metadata
refactor: simplify recommendation pipeline stages
test: verify audit and repair idempotency
docs: document TabiMap release workflow
chore: split validation into fast and remote profiles
release: prepare v1.9.5
hotfix: prevent destination detail crash
```

PR title rules:

- keep the title under approximately 72 characters
- describe one coherent outcome
- do not use vague wording
- do not include issue IDs unless an issue tracker is actively used
- do not include version numbers in ordinary feature PRs
- use `release:` only for release preparation PRs
- use `hotfix:` only for urgent production corrections
- assume the PR title may become the squash-merge commit message

---

## 9. Pull Request Scope Rules

A PR should answer one question:

> What behavior or data set does this change, and how do we know it is correct?

Good PR scope:

```text
PR 1: add structured audit finding schema
PR 2: add duplicate rating-vector detection
PR 3: add safe scoped repair tooling
PR 4: add planner state integration tests
PR 5: prepare release v1.9.5
```

Avoid combining:

- hundreds of destination records
- recommendation scoring changes
- planner UI changes
- validation framework changes
- version bump
- release notes

in the same PR unless they are inseparable.

Catalogue work should normally be separated by city or region:

```text
data/kyoto-review
data/osaka-review
data/kanto-review
data/sapporo-review
```

---

## 10. Pull Request Description Template

```markdown
## Summary

Describe the change in 2–5 sentences.

## Why

Explain the problem being solved.

## Scope

### Included

- Item 1
- Item 2

### Not included

- Deferred item 1
- Deferred item 2

## Changes

- Change 1
- Change 2
- Change 3

## Validation

- [ ] Unit tests
- [ ] TypeScript
- [ ] Lint
- [ ] Format check
- [ ] Build
- [ ] Fast catalogue validation
- [ ] Translation parity
- [ ] Changed image validation, when applicable
- [ ] Changed link validation, when applicable
- [ ] Manual UI test, when applicable

## Screenshots

Add before/after screenshots for UI changes.

## Data impact

Describe affected destination IDs, source files, generated files, schemas, or relationships.

## Recommendation impact

Describe changes to eligibility, ranking, scoring, confidence, budget, transport, or diversification.

## Risks

List known risks and rollback considerations.

## Rollback

Explain how this PR can be reverted safely.

## Follow-up

List intentionally deferred work.
```

---

## 11. Review Rules

Before merge, review the PR as if it were authored by another developer.

Check:

- Is the purpose clear?
- Is the diff focused?
- Are unrelated files included?
- Are generated files expected?
- Are tests included?
- Is any script destructive?
- Is the script safe to run twice?
- Could recommendation behavior change unexpectedly?
- Does the PR alter eligibility or scoring?
- Are English and Japanese labels aligned?
- Are destination relationships plausible?
- Are remote image or link failures transient?
- Is the rollback path clear?

All unresolved review conversations must be resolved before merge.

---

## 12. Merge Strategy

### 12.1 Normal PRs

Use squash merge for:

- feature
- fix
- data
- refactor
- test
- docs
- chore

The squash commit should use the PR title.

Example:

```text
feat: add structured expansion audit findings
```

### 12.2 Release PRs

A release PR may use a merge commit to preserve the release boundary.

Example:

```text
Merge release/v1.9.5 into main
```

Squash merge is also acceptable if the release branch contains only release-preparation changes.

### 12.3 Hotfix PRs

Use squash merge unless multiple hotfix commits must remain distinct.

### 12.4 Forbidden merge behavior

Do not:

- force-push `main`
- manually copy the same commit to multiple permanent branches
- merge failing CI
- bypass branch protection
- leave a release branch permanently open
- merge generated changes that cannot be reproduced

---

## 13. Branch Protection Rules

Protect `main` with:

- require pull request before merge
- require required status checks
- require branch to be up to date
- require resolved conversations
- block force pushes
- block branch deletion
- restrict direct pushes
- automatically delete merged branches

Optional for solo development:

- one approval may remain optional
- self-review is acceptable
- CI checks remain mandatory

---

## 14. Validation Strategy

Not every validation should run on every PR.

Validation is divided into four profiles:

1. fast PR checks
2. changed-file checks
3. scheduled remote checks
4. full release checks

---

## 15. Fast PR Checks

Run on every PR.

Target duration: approximately 2–5 minutes.

Required:

```bash
npm run test:run
npx tsc -b --noEmit
npm run lint
npm run format:check
npm run validate:i18n
npm run validate:catalog-fast
npm run build
```

Fast catalogue validation should include only deterministic local checks:

- JSON parsing
- schema validation
- required fields
- duplicate IDs
- rating completeness
- parent-child relationships
- area references
- collection references
- destination detail/index consistency
- search metadata
- major-city minimum depth
- canonical enum values

Fast PR checks must not make external network requests.

---

## 16. Conditional Changed-File Validation

Run only when relevant files change.

### Destination data changes

Run:

```bash
npm run validate:destinations:changed
npm run validate:images:changed
npm run validate:links:changed
```

The changed-file scripts should inspect:

```bash
git diff --name-only origin/main...HEAD
```

Only changed destination records should be remotely validated.

### Planner changes

Run:

- planner serialization tests
- planner restoration tests
- reset behavior tests
- navigation persistence tests
- mobile manual QA

### Recommendation changes

Run:

- ranking regression tests
- eligibility tests
- confidence weighting tests
- diversification tests
- visited-destination exclusion tests

### Audit or repair changes

Run:

- non-mutation tests
- deterministic output tests
- two-run idempotency tests
- dry-run tests
- scoped repair tests

---

## 17. Image Validation Rules

Image validation must be split into local and remote checks.

### 17.1 Local image metadata validation

Run on every relevant PR.

Validate:

- `heroImage` exists
- URL syntax is valid
- HTTPS is used where required
- image host is allowed
- `imageMetadata` exists
- license exists
- attribution exists
- source URL exists

This check must not access the network.

### 17.2 Changed remote image validation

Run only for changed image URLs.

Validate:

- image URL resolves
- redirect chain is acceptable
- response is not 404 or 410
- content type is image-compatible
- host is not returning a permanent denial

Recommended behavior:

```text
concurrency: 5–10
timeout: 8–12 seconds
retries: 1–2
```

Temporary failures such as timeouts, 429, or 5xx should normally be warnings rather than merge-blocking errors.

### 17.3 Full image validation

Run:

- nightly or weekly
- before a coordinated release
- after a large destination import
- after image-provider changes

Do not run the full remote image catalogue on every ordinary PR.

---

## 18. Link Validation Rules

Link validation follows the same model as image validation.

### Every relevant PR

Check locally:

- URL syntax
- required official website fields
- allowed protocols
- source metadata

### Changed destination PRs

Check only changed remote links.

### Scheduled or release runs

Check the full catalogue.

Temporary external failures should not automatically block unrelated code PRs.

---

## 19. CI Job Structure

Recommended PR jobs:

```text
quality
├── typecheck
├── lint
├── format
└── translation parity

tests
├── unit tests
├── recommendation regression tests
└── planner tests

catalogue-fast
├── schema validation
├── relationship validation
├── enum validation
└── deterministic audits

changed-external
├── changed images
└── changed links

build
└── production build
```

Required on every PR:

```text
quality
tests
catalogue-fast
build
```

Conditionally required:

```text
changed-external
```

---

## 20. Scheduled Validation

Run nightly or weekly:

```text
full image availability
full external-link availability
editorial freshness
full catalogue audit
duplicate rating-vector audit
geographic consistency audit
stale source review
```

Scheduled failures should create an issue or report rather than block unrelated merges.

---

## 21. Catalogue Change Rules

Destination data affects:

- recommendation eligibility
- ranking
- budget
- transport
- weather suitability
- localization
- maps
- image attribution
- relationships
- user trust

Every catalogue PR must include:

- affected destination IDs
- parent hub
- affected region
- reason for the change
- source references
- editorial lifecycle
- validation summary
- audit summary
- generated-file command
- explicit confirmation that audits did not mutate files

Do not independently edit generated indexes.

The PR must identify:

- canonical source files
- generated files
- command used to regenerate output

---

## 22. Audit Rules

Audits must:

- report by default
- not modify destination files
- not modify the generated index
- not append duplicate editorial history
- produce deterministic ordering
- provide structured finding codes
- provide severity
- provide field paths
- provide suggested actions
- distinguish review status from actual defects

Any repair must use a separate explicit command.

---

## 23. Repair Script Rules

Repair scripts must:

- require `--id` or `--finding`
- support `--dry-run`
- show old and new values
- be safe to run twice
- avoid duplicated editorial history
- preserve source-backed data
- log method and rationale
- reject unscoped bulk execution
- write only intended files

A repair command without scope must exit with an error.

---

## 24. Versioning Rules

Use:

```text
MAJOR.MINOR.PATCH
```

Examples:

```text
1.9.5
1.10.0
2.0.0
```

Guidance:

### PATCH

Use for:

- bug fixes
- reliability improvements
- validation improvements
- small data corrections
- internal workflow improvements

Example:

```text
1.9.4 → 1.9.5
```

### MINOR

Use for:

- meaningful new features
- major catalogue expansion
- significant planner capability
- new recommendation behavior
- substantial UI additions

Example:

```text
1.9.5 → 1.10.0
```

### MAJOR

Use for:

- breaking data model changes
- major architecture changes
- incompatible URL or API changes
- large product repositioning

Example:

```text
1.x → 2.0.0
```

Version bumps happen during release preparation, not in ordinary feature PRs.

---

## 25. Small Release Workflow

Use for a small patch release with a limited number of PRs.

Process:

```text
feature/fix/data branch
        ↓
PR into main
        ↓
required checks
        ↓
squash merge
        ↓
release preparation PR
        ↓
tag and deploy
```

Release preparation includes:

- package version bump
- release notes
- final validation
- release verification
- final build
- deployment confirmation

---

## 26. Coordinated Release Workflow

Use a temporary release branch for a larger release.

### Step 1: Create the release branch

```bash
git checkout main
git pull origin main
git checkout -b release/v1.9.5
git push -u origin release/v1.9.5
```

### Step 2: Define release scope

The release branch may accept PRs for:

- release-scoped features
- release-scoped fixes
- release-scoped data changes
- tests
- final documentation

Once release freeze begins, only allow:

- release-blocking fixes
- version bump
- release notes
- validation fixes
- documentation corrections
- safe data corrections

Do not add unrelated features after freeze.

### Step 3: Run full release verification

```bash
npm run test:run
npx tsc -b --noEmit
npm run lint
npm run format:check
npm run validate:i18n
npm run validate-all
npm run audit:major-city-coverage
npm run audit:v192-expansion-data
npm run validate:images:full
npm run validate:links:full
npm run build
npm run release:verify
```

Full remote validation may run in parallel CI jobs rather than one long serial command.

### Step 4: Open the release PR

```text
release/v1.9.5 → main
```

Title:

```text
release: prepare v1.9.5
```

The release PR must include:

- release summary
- included PRs
- version number
- release notes
- full validation result
- known limitations
- migration or script instructions
- deployment plan
- rollback plan

### Step 5: Merge

Merge only after:

- required checks pass
- release preview is tested
- known blocking issues are resolved
- release notes are complete
- deployed commit is identifiable

### Step 6: Tag

```bash
git checkout main
git pull origin main
git tag -a v1.9.5 -m "TabiMap v1.9.5"
git push origin v1.9.5
```

### Step 7: Deploy

Production deployment must use the tagged `main` commit.

### Step 8: Delete the release branch

```bash
git push origin --delete release/v1.9.5
```

---

## 27. Release PR Template

```markdown
## Release

v1.9.5

## Summary

Describe the release outcome.

## Included PRs

- #123 feat: ...
- #124 fix: ...
- #125 data: ...

## User-facing changes

- Change 1
- Change 2

## Internal changes

- Change 1
- Change 2

## Data changes

- Affected hubs:
- Added destinations:
- Corrected destinations:

## Validation

- [ ] Unit tests
- [ ] TypeScript
- [ ] Lint
- [ ] Format check
- [ ] Build
- [ ] Translation parity
- [ ] Full catalogue validation
- [ ] Full image validation
- [ ] Full link validation
- [ ] Recommendation regression tests
- [ ] Planner integration tests
- [ ] Release preview manual QA

## Known limitations

- Limitation 1
- Limitation 2

## Deployment

Describe deployment source and environment.

## Rollback

Identify the previous production tag and rollback steps.

## Post-release checks

- [ ] Production loads
- [ ] Destination pages load
- [ ] Planner works
- [ ] Recommendations work
- [ ] Images render
- [ ] No new console errors
```

---

## 28. Release Notes Rules

Every release must include:

- version number
- release date
- summary
- user-facing changes
- important data changes
- known limitations
- upgrade or migration notes when applicable

Release notes should be written for users, not as raw commit logs.

Good:

```text
Improved planner state persistence and made catalogue audits safer and easier to review.
```

Bad:

```text
Changed 37 files and updated validators.
```

---

## 29. Git Tag Rules

Every production release must have an annotated tag.

Format:

```text
v<MAJOR>.<MINOR>.<PATCH>
```

Examples:

```text
v1.9.5
v1.10.0
v2.0.0
```

Tag rules:

- tag only production releases
- tag the exact deployed `main` commit
- do not move existing release tags
- do not reuse version tags
- do not tag failed or abandoned release candidates

Optional release-candidate tags:

```text
v1.9.5-rc.1
v1.9.5-rc.2
```

---

## 30. Deployment Environments

Recommended mapping:

| Source | Environment | Purpose |
|---|---|---|
| Pull request | Preview | Review and manual QA |
| `release/*` | Release candidate preview | Final coordinated testing |
| `main` | Production | Public deployment |
| Git tag | Release record | Immutable deployed version |

Every UI PR should use a preview deployment before merge when practical.

---

## 31. Hotfix Workflow

Use only for urgent production issues.

### Step 1: Branch from `main`

```bash
git checkout main
git pull origin main
git checkout -b hotfix/v1.9.6-critical-fix
```

### Step 2: Make the smallest safe change

Do not include unrelated cleanup or refactoring.

### Step 3: Add regression coverage

Add a test when technically practical.

### Step 4: Open a PR

Target:

```text
hotfix/v1.9.6-critical-fix → main
```

Title:

```text
hotfix: prevent destination detail crash
```

### Step 5: Validate

Run all fast checks and the checks relevant to the defect.

### Step 6: Merge and tag

```bash
git tag -a v1.9.6 -m "TabiMap v1.9.6"
git push origin v1.9.6
```

### Step 7: Update active release branch

If a temporary release branch exists, bring the hotfix into it through a PR or controlled cherry-pick.

Do not manually push the same commit to multiple branches.

---

## 32. Rollback Rules

Before each release, record:

- release commit SHA
- previous production tag
- scripts executed
- data migrations performed
- generated files changed
- deployment identifier

Rollback options:

1. redeploy the previous production tag
2. revert the release PR
3. revert a specific squash commit
4. create a focused hotfix
5. restore a backed-up generated catalogue if required

Do not force-push `main` backward.

---

## 33. Post-Release Verification

After deployment, verify:

- homepage loads
- planner loads
- destination catalogue loads
- destination details load
- recommendation results appear
- budget filtering works
- transport filtering works
- English and Japanese interfaces render
- maps render
- images load
- authentication works
- no new critical console errors
- deployed commit matches the release tag

Record any production issue in an issue or hotfix PR.

---

## 34. Release Completion Checklist

A release is complete only when:

- [ ] all release PRs are merged
- [ ] package version is correct
- [ ] release notes are complete
- [ ] required CI passes
- [ ] release preview is tested
- [ ] production build succeeds
- [ ] Git tag is created
- [ ] production deploy succeeds
- [ ] post-release checks pass
- [ ] release branch is deleted
- [ ] merged working branches are deleted
- [ ] known follow-up work is recorded

---

## 35. Recommended Validation Commands

Suggested script structure:

```json
{
  "verify:pr": "npm run test:run && npx tsc -b --noEmit && npm run lint && npm run format:check && npm run validate:i18n && npm run validate:catalog-fast && npm run build",
  "validate:catalog-fast": "tsx scripts/validate-all.ts --profile fast --no-report",
  "validate:images:changed": "tsx scripts/cli/validate-images.ts --changed",
  "validate:images:full": "tsx scripts/cli/validate-images.ts --all",
  "validate:links:changed": "tsx scripts/cli/validate-links.ts --changed",
  "validate:links:full": "tsx scripts/cli/validate-links.ts --all",
  "verify:release": "npm run verify:pr && npm run validate-all && npm run validate:images:full && npm run validate:links:full && npm run release:verify"
}
```

Remote validation should run in parallel CI jobs when possible.

---

## 36. Final Workflow Summary

### Normal change

```text
main
  ↓
feature/fix/data branch
  ↓
pull request
  ↓
fast CI + relevant changed-file checks
  ↓
review
  ↓
squash merge
  ↓
delete branch
```

### Coordinated release

```text
feature/fix/data PRs
        ↓
release/v1.9.5
        ↓
release freeze
        ↓
full validation
        ↓
release PR into main
        ↓
tag v1.9.5
        ↓
production deploy
        ↓
post-release verification
        ↓
delete release branch
```

### Hotfix

```text
main
  ↓
hotfix/v1.9.6-...
  ↓
PR into main
  ↓
focused validation
  ↓
merge
  ↓
tag
  ↓
deploy
```

---

## 37. Non-Negotiable Rules

1. No direct pushes to `main`.
2. No force pushes to `main`.
3. Every production change uses a PR.
4. Every PR has a valid typed title.
5. Every branch follows the branch naming rules.
6. Every release has a Git tag.
7. A permanent release branch is not used.
8. The same commit is not manually pushed to multiple branches.
9. Fast deterministic checks run on every PR.
10. Full remote image and link validation does not run on every unrelated PR.
11. Catalogue audits do not mutate by default.
12. Repair scripts require explicit scope and dry-run support.
13. Normal PRs use squash merge.
14. Release branches are deleted after release.
15. Production deployment must map to an identifiable tagged commit.
