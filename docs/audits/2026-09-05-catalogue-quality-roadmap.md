# Catalogue quality roadmap — 2026-09-05

This roadmap is the post-#346 continuation of the destination-depth work.

## Current sequence

1. **Coverage correctness — complete:** deterministic rental-car fallback (#347) and
   the P0 destination expansion (#346) are merged on `main`.
2. **Destination depth — complete:** the v1.2.1 audit and 1,130-record catalogue are
   merged; the post-#346 rental-car coverage audit remains `coverage_gap=0` and
   `resolver_failure=0`.
3. **Temporal quality — active:** KAI-151 P1-A is the castle/temple/shrine cohort
   selected from the merged catalogue by `kind ∈ {castle, temple, shrine}` and both
   `season` and `bestMonths` absent. The fresh cohort is 112 records (56/31/25),
   not the earlier stale estimate of 111.
4. **Small audit/cleanup — next:** refresh residual seasonality counts and verify
   generated parity after each cohort.
5. **Geographic breadth — later:** execute the hub-coverage programme only after the
   P1 season wave is complete and separately scoped.
6. **Opening-hours evidence — optional:** retain the R4 museum-tier queue and the
   Shigisan/Enoshima Shrine candidates for a later decision.

## Superseded queue

The old August “Set B” 130-record expansion remainder is **superseded** by the
post-audit sequence: merged P0 depth expansion (#346), KAI-151 P1 season evidence,
and the later hub-coverage programme. No canonical Set B manifest, issue, or PR
artifact was found in the repository or GitHub inventory, so it must not be revived
as an independent work queue.

## Parked

- Tokyo Station/default-location origin-flip investigation remains parked.
- Local transport/access-evidence expansion remains out of scope; preserve honest
  `unavailable` values.
- The ~150-POI hub expansion is not part of the P1 season PR.
