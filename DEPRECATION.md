# DEPRECATION — generic destination budget fields (KAI-218)

This document is the retirement contract for the generic destination budget
fields, per KAI-218 ("introduce scoped destination cost facts and retire
generic budget fields"). It is binding: new/changed production data must
follow it, and CI enforces it (see the no-new-debt ratchet below).

## Deprecated fields

The following fields are DEPRECATED (new/changed destinations must not
author them):

| Field                       | Replacement                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `budgetMin`                 | scoped cost facts (`admission` / `localTransport`); legacy range derived by one-way projection if still needed |
| `budgetRecommended`         | scoped cost facts; projection-derived midpoint if still needed                                                 |
| `budgetMax`                 | scoped cost facts; projection-derived ceiling if still needed                                                  |
| `budgetBreakdown.transport` | `localTransport` cost fact (required local transport)                                                          |
| `budgetBreakdown.food`      | none — food is NOT canonical affordability (KAI-217)                                                           |
| `budgetBreakdown.cafe`      | none — cafe is NOT canonical affordability (KAI-217)                                                           |

`budgetBreakdown.tickets` is NOT deprecated as a storage field: it is the
legacy admission value. It may be migrated into the explicit `admission`
fact where defensible; legacy ticket values are NOT presumed trustworthy
(see the mapping table in `.hermes/plans/kai-218a-admission-schema-design.md`
— only the 38 manual records carry verified provenance).

## The new facts

- `admission?: AdmissionCostFact` — explicit on-site admission truth,
  KAI-214 state/provenance/reasonCode, per-person.
- `localTransport?: LocalTransportAccess` — explicit required local
  transport, NEVER a generic city allowance, per-person.

Invariants are enforced by the KAI-218* PREVENTIVE_CODES validators
(`scripts/audit/data-quality-rules.ts`).

## Retirement path (one-way projection, never a second editable truth)

1. **V2 facts are the single source.** New/changed destinations author
   `admission` / `localTransport` (and, when the destination-level state is
   explicit, `budgetMetadata.state`).
2. **One-way compatibility projection.** Any legacy consumer that still
   needs `budgetMin/budgetRecommended/budgetMax/budgetBreakdown` reads them
   through a projection computed FROM the v2 facts at read time. The
   projection is DERIVED, never independently edited.
3. **Never write the projection back.** No generator/script may emit the
   deprecated fields for new/changed records. Existing writer scripts are
   scheduled for conversion or deletion.
4. **Scheduled deletion.** When every reader is on the projection and the
   projection output matches the current legacy values across the catalogue
   (or a documented per-record delta list is accepted), the deprecated
   fields are stripped from the JSON, the projection is deleted, and the
   `Destination` type fields are removed.

## No-new-debt ratchet (CI-enforced)

`scripts/check-deprecated-fields.ts` (wired into `check:catalog-ci`):

- counts catalogue records still AUTHORING the deprecated fields
  (range writers / breakdown writers / transport-or-food-or-cafe writers);
- compares against `scripts/audit/deprecated-fields-baseline.json`
  (current baseline: 493 / 477 / 477);
- SHRINK-ONLY: the counts may only stay flat or decrease. Any growth is a
  CI failure. `--update` refuses when a count grew.

## Freshness / review cadence

Verified source-backed cost facts carry `sourceUrls` + `checkedAt`. The
12-month review cadence follows the collections precedent
(`reviewIntervalMonths`, default 12): a fact whose `checkedAt` is older than
`reviewIntervalMonths` becomes review-due (never silently refreshed or
discarded). Date/product-variable prices are authored `variable_price` with
an open-ended/variable cost shape — never a fabricated bounded range.

## Status

- Schema + validators + ratchet: LANDED (KAI-218A).
- Mass backfill of 1,057 destinations: NOT started (explicitly out of
  KAI-218A scope; do not bulk-promote legacy values).
- Projection layer + reader migration + field strip: FUTURE work.
