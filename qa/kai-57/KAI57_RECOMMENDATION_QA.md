# KAI-57 Recommendation QA

Date: 2026-08-11
Runner: `scripts/qa/kai-57-recommendation-audit.ts` (deterministic; raw output
in `qa/kai-57/recommendation-qa-raw.txt`)

## Method

Drives the live recommendation engine (`getRecommendations`) for 6 origins × 3
durations (short outing, half day, full day), public transport only, standard
budget, 2026-08-15 travel date, and checks the Phase 17 anti-pattern list
against the Tohoku slice of results.

## Results summary

| Origin   | shortOuting | halfDay | fullDay | Tohoku results |
| -------- | ----------- | ------- | ------- | -------------- |
| Sendai   | 18          | 15      | —       | 18 / 15 (all)  |
| Tokyo    | 65          | 120     | —       | 0              |
| Yokohama | 79          | 101     | —       | 0              |
| Osaka    | 67          | 28      | —       | 0              |
| Fukuoka  | 21          | 11      | —       | 0              |
| Sapporo  | 7           | 6       | —       | 0              |

Findings: **0 errors, 40 warnings**. No duplicate cards. No one-municipality
monopoly in any Tohoku slice (Sendai-origin results span Miyagi, Yamagata,
Fukushima and Iwate).

## Key observations

1. **Far origins are correctly excluded.** Tokyo/Yokohama/Osaka/Fukuoka/Sapporo
   produce ZERO Tohoku recommendations in every day-trip duration — the
   transport-topology feasibility model does not fabricate Tohoku day trips
   from distant origins. This is the truthful behavior Phase 17 asks for.

2. **One systemic engine-level warning (documented, not fixed here):**
   `getOriginAwareTransportEstimate` returns no origin-aware route for every
   Tohoku destination from every origin, so the engine falls back to legacy
   `transportOptions` minutes. Consequence: `okama-crater-yamagata` ranks #1 in
   a Sendai short outing using the legacy ~80 min figure, which understates the
   real Sendai→Zao approach (~2 h). This is a pre-existing, engine-wide
   condition (identical for non-Tohoku regions; KAI-55 already flagged the
   fallback semantics) — belongs to the KAI-66 transport-engine overhaul, not
   KAI-57. No scores were manipulated to hide it.

3. **POIs ranking above their hub in short durations is expected origin-local
   behaviour**: from Sendai, sendai-city/matsushima-town hubs are filtered by
   duration (6–8 h visit hours) while their POIs fit; the origin area is
   already "home" so the hub is not recommended. The fullDay
   mount-zao/akiu-above-hub pairings both include the hub in the result set.

4. **No misleading "fast travel" for missing evidence at long range** — the
   fallback is what the legacy engine always did; nothing in the KAI-57 data
   makes it worse (no Tohoku record claims origin-aware routes it lacks).

## Verdict

Recommendation behavior is sane: no absurd day trips, no duplicate cards, no
monopolized slices, honest filtering of far origins. The single systemic
warning (origin-aware transport evidence) is a recorded engine issue for
KAI-66, unchanged by KAI-57.
