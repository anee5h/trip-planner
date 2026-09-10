# KAI-290 — ODPT timetable-backed pilot constraints (measured)

Derived from the bounded **authenticated production** audit run against the deployed
Meguruto boundary `POST https://meguruto.app/api/odpt`
(`scripts/audit/kai-290-odpt-coverage.mjs`, committed artifact in `qa/kai-290/`).

This document records **what was measured**, so the pilot's scope rests on evidence rather
than assumption. It deliberately separates measured facts from provider capability claims.

---

## 1. Pilot scope

| Operator | Timetable-backed pilot |
|---|---|
| `odpt.Operator:TokyoMetro` | **Included** |
| `odpt.Operator:Toei` | **Included** |
| `odpt.Operator:JR-East` | **Excluded** |

### Scope is three-way and fail-closed

`derivePilotScope()` classifies each operator as **`included`**, **`excluded`**, or
**`inconclusive`**:

- **`included`** — at least one timetable probe actually returned records.
- **`excluded`** — the required **schedule-bearing** resources (`StationTimetable`, `TrainTimetable`)
  were *actually executed* **and every probe was conclusively empty**. Nothing else qualifies.
- **`inconclusive`** — anything else. Any `too_large`, `error`, `malformed`, `unavailable`,
  budget-exhausted/skipped probe, or a probe that could not be run at all (no station/railway scope
  derivable) blocks a conclusive exclusion.

The exclusion statement is **generated from the actual per-resource states** and names only the
resources observed empty. It therefore cannot claim that `TrainType` or `RailDirection` were absent
if those actually returned records.

This matters because `too_large` means *the response exceeded the boundary's size guard and the
record count is unknown*. Treating that as "no data" would turn a failure to inspect a response into
a false claim about the provider.

### Why JR-East is excluded

> In the bounded authenticated production audit, no usable JR-East TrainType,
> RailDirection, StationTimetable, or TrainTimetable data was returned across the sampled
> major stations and railways. JR-East therefore cannot participate in the current ODPT
> timetable-backed pilot.

**This is scoped to the audited corpus on purpose.** ODPT search completeness is not
guaranteed, and `[]` is a *successful* provider answer rather than a capability statement.
Do not restate this as "JR-East has no timetables" — the correct claim is *observed zero
coverage in our audited corpus*. Whether JR-East timetable data exists outside the bounded
corpus is **unknown**.

All JR-East probes returned **successful empty results**, not transport, auth or provider
failures — so the zeros are real answers, not a symptom of a broken query.

### Two attribution levels (kept separate deliberately)

1. **Committed artifact** — the script samples `--timetable-sample` (default 3) stations per
   operator and asks each sampled station's own railway for TrainTimetable. For JR-East every
   probe was `empty`.
2. **Supplementary manual production spot-check** — performed during investigation, *not*
   produced by the committed script: 8 JR-East hub stations (Tokyo, Shinjuku, Shibuya,
   Ikebukuro, Ueno, Akihabara, Omiya, Yokohama) and 4 railways (Yamanote, ChuoRapid,
   KeihinTohokuNegishi, SaikyoKawagoe). All 12 probes returned zero records.

The committed audit was **not** enlarged to chase more JR-East zeros; the existing sample was
sufficient to exclude JR-East from this pilot.

---

## 2. What static enrichment can and cannot do

Static enrichment may later help JR-East with:

- station geography
- stop ordering
- topology
- canonical mapping

**Static enrichment does NOT provide timetable-backed journey duration.** If
`TrainTimetable`/`StationTimetable` evidence remains unavailable for an operator, enriching
its geography or ordering does not create schedule evidence. **Verified schedule duration may
require a different authoritative source entirely.**

This distinction is load-bearing: coordinates and stop ordering describe *where* stations are
and *in what order* they are served, not *when* a specific service runs.

---

## 3. The 1 MB response guard (runtime design constraint)

Broad timetable queries can exceed the Meguruto boundary's **1 MB** response guard, which
fails closed:

| Query shape | Live result |
|---|---|
| `station_timetable` by `operator` (TokyoMetro, Toei) | `provider_response_too_large` |
| `train_timetable` by whole `railway` | `provider_response_too_large` |
| `train_timetable` by exact `train` identity | **1 record, 19 ordered stop objects** |

**The boundary is correctly failing closed, and the cap must not be raised to normalise broad
timetable requests.** The guard is doing useful work: it is an enforced expression of "broad
timetable queries must not become normal runtime behaviour".

### Correct runtime direction

```
identify service/train narrowly
  -> fetch TrainTimetable by exact train identity
  -> derive journey evidence
```

**Not:**

```
fetch an entire railway timetable at runtime
  -> filter client-side
```

Verified example (as recorded in the committed artifact `qa/kai-290/odpt-coverage.json`):

```
odpt.Train:TokyoMetro.Marunouchi.B427
  -> 1 TrainTimetable record
  -> 18 ordered stop objects
  -> odpt.Station:TokyoMetro.Marunouchi.Shinjuku -> odpt.Station:TokyoMetro.Marunouchi.Ikebukuro
```

Train identities are discoverable from provider data itself: a `StationTimetable` record's
stop objects carry `odpt:train` identities, which is how the audit derives its probe target
rather than hard-coding one.

---

## 4. Result classification — never turn failure to inspect into evidence of absence

| Class | States | Meaning |
|---|---|---|
| **Conclusive** | `records`, `empty` | The provider answered; coverage is known. |
| **Non-conclusive / unknown** | `too_large`, `error`, `unavailable`, `malformed` | We learned nothing about coverage. |

`empty` is a *successful zero-record answer* and is evidence. `too_large` means **the response
exceeded the boundary's configured maximum size and the record count is unknown** — it must
never be reported as `0 records`, because that converts a failure to inspect into a false
claim of zero provider data.

This is pinned in tests (`scripts/audit/__tests__/kai-290-coverage-tooling.test.ts`), including
the specific assertion that a `too_large` probe is never rendered with a record count.

---

## 5. Reproducing the audit

```bash
node scripts/audit/kai-290-odpt-coverage.mjs \
  --operators=odpt.Operator:JR-East,odpt.Operator:TokyoMetro,odpt.Operator:Toei
```

Guarantees: explicit invocation only (importing performs no I/O), bounded request budget
(`--max-requests`, default 40, ceiling 120), strictly sequential and rate-aware (honours 429),
production-boundary-only (never `api.odpt.org`), credential-safe (no credential is read,
stored or emitted; a credential-like string in a response aborts the run), atomic writes, and
deterministic ordering so re-runs are diffable.

Recorded per probe: operator, resource, narrowing mechanism, status classification, returned
record count **only when known**, timetable object counts where applicable, identity/calendar
metadata, and provenance via credential-free URLs.

---

## 6. Explicit unknowns

1. Whether any JR-East timetable data exists **outside** the bounded audited corpus.
2. How JR-East verified schedule duration will eventually be sourced (a different
   authoritative provider, a licensed feed, or not at all).
3. Nationwide ODPT timetable coverage — this audit covers three Kanto operators only.
4. Timetable availability for operators beyond these three, including other Kanto operators.

---

## 7. Out of scope for this PR

No timetable-backed Journey derivation, no ranking integration, no runtime timetable
consumption, no caching or provider-budget implementation, and no recommendation changes.
Existing runtime behaviour is unchanged.
