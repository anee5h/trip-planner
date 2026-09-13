# KAI-292C4A — real Meguruto corridor identity audit

## Result

**Blocked: no real Meguruto origin → destination scheduled-transit corridor is
currently evidenced.** This slice preserves the blocker and does not promote the
Sakata pilot as product coverage.

The deterministic audit is:

```bash
npm run audit:kai-292c4a
```

It reads the canonical catalogue, the registered deployable normalized-transit
assets, and the explicit endpoint crosswalk. It performs no network calls and
never uses display names, coordinates, nearest-stop selection, parent-station
matching, route membership, or fuzzy matching.

## Audited evidence

| Evidence | Observed result |
| --- | --- |
| Canonical catalogue (`src/shared/data/destinations-index.json`) | 1,130 records; 1,130 unique stable destination IDs |
| Explicit catalogue destination crosswalk entries | 0 |
| Registered normalized scheduled-transit datasets | 1: `sakata-runrunbus` |
| Valid registered normalized assets | 1: `public/data/transit/sakata-runrunbus.json` |
| Sakata normalized graph | 252 stops, 6 routes, 49 scheduled services, 1,961 scheduled stop-time facts |
| Unregistered deployable transit assets | 0 |
| Crosswalk entries | 2, both non-catalogue boundary-pilot product IDs |
| Real corridors returned | 0 |

The two existing crosswalk entries are deliberately retained as C2 boundary
proof:

- `kai-292c2-pilot-origin-sakata-100-01` → GTFS `100_01`;
- `kai-292c2-pilot-destination-sakata-17-01` → GTFS `17_01`.

Neither product ID is a current catalogue destination ID. The valid Sakata graph
therefore proves normalized scheduled-transit data exists, but it does not prove
that a Meguruto catalogue destination or current user origin has been mapped to
that graph.

## Concrete blockers

1. **`missing_catalogue_destination_crosswalk`** — no exact crosswalk maps any of
   the 1,130 catalogue destination IDs to a normalized stop.
2. **`missing_canonical_origin_identity`** — the current origin flow in
   `src/shared/components/StationInput.tsx` stores a station label and
   coordinates. It does not expose a canonical Meguruto product identity or an
   exact normalized scheduled-transit stop ID.
3. **`pilot_only_normalized_evidence`** — the only valid registered normalized
   asset is the bounded Sakata RunRunBus pilot, and its two crosswalk product IDs
   are explicitly non-catalogue pilot identities.

A future corridor slice must first add reviewed, explicit endpoint identities: a
real catalogue destination product ID and a canonical origin product identity,
then map both to the same exact dataset/provider/identity namespace and provider
stop IDs. It must retain source evidence for each mapping. No route, duration,
feasibility, recommendation, planner, UI, or temporal-policy integration belongs
in that prerequisite.

## Identity safety proof

The focused C4A tests cover:

- the actual catalogue audit result and all three blockers;
- a real catalogue ID remaining `unmapped` when no explicit crosswalk exists,
  even though catalogue records have display and coordinate fields;
- wrong dataset, provider, and identity namespace remaining unmapped;
- unknown mappings remaining unmapped;
- conflicting explicit mappings returning `ambiguous` rather than selecting one;
- no name, coordinate, nearest, or fuzzy fallback path.

The existing endpoint resolver validates the exact loaded dataset/provider/
identity namespace and the normalized stop's provider provenance before returning
`resolved`. C4A does not weaken that boundary or alter the Sakata crosswalk.

## Validation

- `npm run audit:kai-292c4a` — passes; reports the blocked result above.
- `npx vitest run scripts/transit/__tests__/kai-292c4a-real-corridor.test.ts --no-file-parallelism --maxWorkers=1` — 6 tests passed.

This is an identity prerequisite/blocker result, not a claim of real Sakata
product coverage.
