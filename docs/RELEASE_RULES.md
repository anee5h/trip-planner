# TabiMap Standard Release Ruleset & Protocol

This document establishes the mandatory ruleset for preparing, validating, versioning, documenting, and releasing new versions of TabiMap.

---

## 📜 Core Release Principles

1. **Atomic Versioning Sync**: Every release **MUST** synchronize version strings across `package.json`, `Navbar.tsx`, and `ReleaseNotesModal.tsx`.
2. **Mandatory Release Notes**: Every release **MUST** add a new entry to the `RELEASES` array in `ReleaseNotesModal.tsx` with user-facing highlights and move `tag: "Current"` to the latest version.
3. **Clean Verification Pipeline**: A release **CANNOT** be committed or pushed until `test:run`, `pipeline --dry-run`, `tsc`, `lint`, `build`, and `format:check` all execute with 0 errors.
4. **Verification Never Mutates Data**: The release-verification chain **MUST NOT** write to `destinations-index.json`, `destinations-meta.json`, or any other source file. Verification checks; it does not fix. Data pipeline runs that intentionally enrich or rewrite data are a separate, explicit step (see "Data Pipeline: Dry-Run vs. Real Run" below) and must be committed on their own, before the version bump.
5. **Prettier Format Guarantee**: `npm run format` **MUST** run — and its result committed — any time a step in the verification chain (including a real, non-dry-run pipeline execution) touches a file. `format:check` is the release-gate check; `format` is the fix.
6. **Multi-Branch & Tag Synchronization**: Every release **MUST** push code and tags synchronously across `dev`, `main`, and `release` branches.

---

## ⚠️ Data Pipeline: Dry-Run vs. Real Run

`npm run pipeline` runs `scripts/pipeline.cjs`, which **writes** to `destinations-index.json` and `destinations-meta.json` by default (geocoding, budget normalization, re-serialization). It is not a pure validator — running it without `--dry-run` mutates source data as a side effect, including reformatting arrays that Prettier would otherwise format differently, which produces a large, mostly-cosmetic diff.

**Two distinct situations, two distinct commands:**

| Situation | Command | When |
| :--- | :--- | :--- |
| Release verification (no data changes intended) | `npm run pipeline -- --dry-run` | Every release, as part of `release:verify` |
| You added/edited destinations and want the pipeline to enrich, geocode, or normalize them | `npm run pipeline` (no flag) | Only when you deliberately want data written — run it, review the diff, `npm run format`, then commit the data change **as its own commit**, separately from the version bump |

Never run the mutating form of `pipeline` as part of the release-verification chain. If it's run for real mid-release-prep, run `npm run format` immediately after and re-check `git status` before continuing — otherwise the next `format:check` in CI will fail on files nobody edited by hand, and the failure will look unrelated to your actual change.

CI does **not** currently run `pipeline` in either form — see "CI Coverage" below. Its data-quality gate is `validate-all`, which is read-only.

---

## 🛠️ Step-by-Step Release Protocol

### Step 1: Version Bumping

Update the semantic version string `X.Y.Z` in the following 3 files:

| File | Target Location | Example |
| :--- | :--- | :--- |
| `package.json` | `"version": "X.Y.Z"` | `"version": "1.7.37"` |
| `src/shared/components/layout/Navbar.tsx` | `<span>TabiMap Japan vX.Y.Z</span>` | `<span>TabiMap Japan v1.7.37</span>` |
| `src/shared/components/ui/ReleaseNotesModal.tsx` | Top `RELEASES` entry `version: "vX.Y.Z"` | `version: "v1.7.37"` |

---

### Step 2: Release Notes Sync (`ReleaseNotesModal.tsx`)

In `src/shared/components/ui/ReleaseNotesModal.tsx`:

1. Add a new object at the top of the `RELEASES` array:
```ts
   {
     version: "vX.Y.Z",
     tag: "Current",
     date: "Month Year",
     title: "Feature / Fix Summary Title",
     highlights: [
       "Key change bullet 1",
       "Key change bullet 2",
     ],
   },
```
2. Remove `tag: "Current"` from the previous top entry so only the newest release has `tag: "Current"`.

---

### Step 3: Verification Suite

Run the single verification script — this is the corrected, non-mutating equivalent of chaining the individual commands by hand:

```bash
npm run release:verify
```

Which runs:

```bash
npm run test:run && npm run pipeline -- --dry-run && npx tsc -b --noEmit && npm run lint && npm run build && npm run format:check
```

> **CAUTION**
> If **ANY** step fails (Vitest failure, pipeline validation error, TypeScript error, lint error, build error, or `format:check` reporting unformatted files), **STOP IMMEDIATELY**. Resolve the error before proceeding.
>
> If `format:check` is what failed, run `npm run format` and commit the result as its own step — don't fold it silently into the release commit without looking at the diff first.

---

### Step 4: Git Commit & Tagging

1. Stage all changes:
```bash
   git add .
```
2. Commit with a standard conventional commit message:
```bash
   git commit -m "chore(release): bump version to X.Y.Z"
```
3. Create an annotated git tag:
```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z — Short release summary"
```

---

### Step 5: Multi-Branch & Tag Push

Push the commits and tag across all deployment branches (`dev`, `main`, `release`):

```bash
git push origin dev && \
git checkout main && git merge dev && git push origin main && \
git checkout release && git merge main && git push origin release && \
git push origin --tags && \
git checkout dev
```

---

## 🤖 CI Coverage: What GitHub Actions Actually Checks

The local `release:verify` chain is currently **more thorough than CI**. CI is a safety net, not the source of truth — don't rely on a green PR check alone as proof a release is ready.

| Check | Local `release:verify` | `ci.yml` | `validate.yml` |
| :--- | :---: | :---: | :---: |
| Unit tests (`test:run`) | ✅ | ❌ | ❌ |
| Data pipeline validation | ✅ (`pipeline --dry-run`) | ❌ | ✅ (`validate-all`, different check, read-only) |
| TypeScript | ✅ (`tsc -b --noEmit`) | ✅ (via `build`) | ✅ (`tsc --noEmit`, no `-b`) |
| Lint | ✅ | ❌ | ✅ |
| Build | ✅ | ✅ | ✅ |
| Format | ✅ (`format:check`) | ✅ (`format:check`) | ❌ |

Known gaps, in rough priority order:
- Neither workflow runs `test:run` — a broken test can be pushed and merged without CI catching it.
- Neither workflow runs the pipeline's own Stage 1/2 validation (schema completeness, referential integrity) — only `validate-all` runs in CI, and it's a separate script that may not check exactly the same things as `pipeline`'s validation stages. Worth auditing whether they overlap or diverge.

If you close these gaps in the workflows, update this table.

---

## 🔒 Enforcement

This document only works if it's actually run. Options, roughly in order of effort:

1. **`npm run release:verify`** (see `package.json`) — one command, the corrected verification chain, no manual step-chaining required.
2. **Pre-push hook** — a `husky` pre-push hook can run `release:verify` automatically before any push to `main` or `release`, blocking the push on failure. Not yet wired up; worth adding if steps start getting skipped in practice.
3. **CI parity** — closing the gaps in the table above would make the ruleset enforced server-side rather than relying on the local checklist alone.

---

## 📋 Release Checklist (Quick Reference)

- [ ] Version bumped in `package.json`
- [ ] Version label updated in `src/shared/components/layout/Navbar.tsx`
- [ ] New release entry with `tag: "Current"` added to `src/shared/components/ui/ReleaseNotesModal.tsx`; previous entry's `tag: "Current"` removed
- [ ] `npm run release:verify` passes clean (tests, pipeline dry-run, tsc, lint, build, format:check)
- [ ] If data was intentionally changed via a real (non-dry-run) `pipeline` run, it was formatted and committed **separately**, before the version bump
- [ ] Committed and tagged (`vX.Y.Z`)
- [ ] Pushed to `dev`, `main`, `release`, and `--tags`
