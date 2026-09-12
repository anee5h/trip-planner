# KAI-291B2 — ODPT Data Dump refresh, versioning and last-known-good

Controlled OFFLINE/ADMIN ingestion path for ODPT static Data Dumps.
Maintenance pipeline only — not a runtime API, not connected to the
browser, `/api/odpt`, Journey, TripDuration, or recommendation.

```
ODPT Data Dump endpoint (https://api.odpt.org/api/v4/<TYPE>.json)
    ↓  authenticated initial request (acl:consumerKey, key on first hop only)
validated manual redirect handling (exact-origin allow-list, HTTPS only)
    ↓
bounded raw snapshot download (byte cap + inline SHA-256 + timeout)
    ↓
dump schema / integrity validation (reject, never silently drop)
    ↓
pilot-scope extraction (TokyoMetro + Toei)
    ↓
B1 importOdptRailTopology() — the normalization gate, unweakened
    ↓
semantic validation + KAI-291A continuity + LKG comparison
    ↓
candidate snapshot → last-known-good promotion (local ignored store)
```

## B2 scope

Acquired families only: `odpt:Operator`, `odpt:Station`, `odpt:Railway`,
`odpt:Calendar` — via `/api/v4/<RDF_TYPE>.json` (Data Dump), never via
unfiltered search-API reconstruction. Timetables, fares, TrainType,
RailDirection, Bus, and GTFS belong to later slices.

## Acquisition flow

`scripts/transit/refresh-odpt-static.ts` (default: audit/dry-run; `--promote`
for local LKG promotion; `--offline-fixture` for a network-free pipeline
proof; `--output-dir` for the store root). No `--key`/`--url` flags exist.

1. Download each family with `odptDumpDownload.ts` (injected fetch).
2. Validate dump schema (`validateDumpFamily`): JSON array root, object
   records, exact `@type`, non-empty `owl:sameAs`, no duplicate identities.
3. Extract the pilot (`extractPilotScope`): exact pilot operators, railways
   by operator, stations by operator + in-scope railway, all calendars.
   Unknown references reject the candidate; no second ODPT query fills gaps.
4. Normalize with the merged B1 importer (`sourceType: data_dump`,
   `completeness: complete_provider_dump` only when every required family
   was obtained and validated this refresh).
5. Continuity gate: every KAI-291A production-ready anchor identity must
   exist in the candidate graph (exact `providerStopId`, no fuzzy fallback).
6. Compare against LKG (deltas, added/removed identities, hash change) and
   decide: `promote_local` / `requires_review` / `reject`.
7. Promotion (local ignored store only): snapshot files + atomic pointer
   swap (`last-known-good.json` via write-tmp-and-rename). Any prior failure
   leaves existing LKG bytes and pointer untouched.

## Redirect trust boundary

- Initial endpoint fixed: `https://api.odpt.org/api/v4/<allow-listed>.json`.
- `fetch(..., { redirect: "manual" })`; each 3xx Location is validated:
  absolute HTTPS URL, origin in the COMMITTED exact-origin allow-list
  (`APPROVED_DUMP_REDIRECT_ORIGINS`; currently exactly
  `https://dataodpt.blob.core.windows.net`, observed 2026-09-11 via
  one-request discovery as a 302 with signed-query Location and explicitly
  approved), no loops, bounded count, no HTTP downgrade, no merged query
  params, no forwarded key. There is no runtime override for normal
  audit/promote.
- First contact uses `--discover-redirect-origin`: exactly one authenticated
  initial request, reporting the sanitized target origin WITHOUT following
  it. The observed origin goes to review before anything is approved.
- The consumer key belongs ONLY on the initial ODPT request unless a
  documented provider flow proves otherwise. Records log origin + path;
  query/fragment presence is a boolean, values never recorded.
- Do NOT allow `*.amazonaws.com`, arbitrary HTTPS, or arbitrary Location
  hosts to resolve this.

## Secret handling

Key source: `process.env.ODPT_API_KEY` only, read at the CLI boundary.
Absent key → `provider_not_configured` before any fetch (zero network
calls). No key in argv, config, logs, manifests, errors, or
`sourceDescriptor`. Tests use a synthetic `TESTKEY` value and assert its
absence from every URL it must not reach and every serialized error.

## Raw vs semantic hash

- `rawSha256`: per-family downloaded bytes (observation: re-downloads differ).
- `contentHash`: B1 normalized semantic hash (observation metadata projected
  out). Raw change + same semantic hash → no LKG churn: checkedAt updated,
  stable snapshot retained.

## Candidate vs LKG

Candidates live in `<store>/staging/`; snapshots in `<store>/snapshots/`;
the pointer `<store>/last-known-good.json` selects the current LKG. The
pointer swap is the promotion — prior snapshot files remain for audit.

## Freshness

Pure helper with injected now: checked within 7 days → `fresh`; older →
`stale`; never/invalid/future → `unknown`. An internal safety threshold,
not an ODPT data-change guarantee. `Date.now()` never enters normalization;
the CLI supplies wall-clock time at the acquisition boundary. The
operational LKG freshness reads the pointer's `lastCheckedAt`: first
promotion sets `promotedAt = lastCheckedAt = now`; a semantic no-op keeps
the snapshot (no graph churn) and advances `lastCheckedAt` only.

## Licence gate

`unknown` (default) / `local_audit_only` / `restricted` /
`reviewed_allowed`, represented in code. Unknown or local-audit data may
land in ignored local storage; ONLY `reviewed_allowed` permits ordinary
production/public promotion — and B2 builds no production artifact at all.
Licence is never inferred from operator names. Challenge/restricted
datasets stay out of the public repo until explicitly allow-listed after
review. No full live dump, filtered dataset, full normalized graph, or
live-data LKG payload is committed in B2.

Reviewed licence evidence for this slice (recorded, NOT yet an
allow-listing):

- Tokyo Metro JSON Station/Route data: Public Transportation Open Data
  Basic License.
- Toei JSON Station/Route data: CC BY 4.0.
- The Tokyo Metro Basic License permits application/Deliverable use, but
  prohibits publishing or redistributing reusable underlying data or
  derivatives without prior written approval.
- The Challenge Limited License is a SEPARATE licence and must never be
  inferred as ordinary production permission.

The full B2 candidate therefore stays OFF `reviewed_allowed`: a complete
dump may contain other licensed scopes, calendar licence/scope is not yet
conclusively mapped, and B2 has no production/public artifact anyway.
`productionPromotionAllowed` remains `false`. Raw dumps live in ignored
local audit storage only; the normalized full graph is neither committed
nor exposed as downloadable reusable public data. A later
production-promotion slice may distinguish internal application use from
public reusable redistribution — those are NOT the same permission.

## Reviewed transport policy (2026-09-11 live evidence)

Four-family audit over the approved blob origin, 8 HTTP attempts
(4 × initial 302 + follow), all finals 200 `application/json`:

| Family | Bytes | Records | Reviewed cap |
|---|---|---:|---:|
| Operator | 14,195 | 42 | 1 MB |
| Station | 604,110 | 720 | 8 MB |
| Railway | 129,403 | 94 | 4 MB |
| Calendar | 217,469 | 174 | 4 MB |

Each cap is an order of magnitude or more above observed size — bounded,
yet comfortable for ordinary provider growth. Final Content-Types are
validated against the reviewed legitimate set (`application/json`,
parameters allowed); `application/octet-stream` stays rejected until a
live probe confirms it.

## Failure behavior

401/403/404/429/5xx/timeout map to explicit codes and fail closed — never
empty arrays, never silent retries of large dumps. One failed run preserves
LKG and exits non-zero with a safe reason.

## Why not runtime /api/odpt for full imports

The runtime boundary serves narrow allow-listed queries with a 1 MB guard;
whole-family topology acquisition needs bounded dump downloads with
redirect handling, caps, and promotion semantics — a maintenance concern,
not a request path. Truncated search results must never be mistaken for
complete network truth.

## Deferred

GTFS (KAI-291C), timetable/fares (KAI-291D), journey routing (KAI-292).

## Completed live evidence (2026-09-11)

- Redirect discovery complete: initial 302 from `api.odpt.org`, sanitized
  target origin `https://dataodpt.blob.core.windows.net` (signed-query
  Location, never logged), exactly 1 provider attempt, nothing followed.
- Four-family live audit complete over the approved origin: 8 HTTP attempts
  (4 × initial 302 + follow), all finals 200 `application/json` with
  matching Content-Length values.
- Operator 14,195 B / 42 records · Station 604,110 B / 720 records ·
  Railway 129,403 B / 94 records · Calendar 217,469 B / 174 records.
- Pilot filtered 2 / 335 / 16 / 174; normalized 2 / 335 / 16 / 336 / 174;
  KAI-291A continuity 7/7; both required operators exact.
- Live normalization proven (semantic hash recorded in the audit report).
- Production/public promotion still intentionally disabled by the licence
  gate (`productionPromotionAllowed=false`).
