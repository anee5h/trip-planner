# KAI-279 budget-constraint audit

Baseline: `5e8d80aac43094611802893ffc6cc2bb13683298`

Preset ceilings: {"economy":50000,"standard":100000,"comfortable":200000,"luxury":null}

Cap scaling defects (party/duration): 0
Custom cap scaling defects: 0

## Classification (canonical classifiers, cap ¥80,000)
- completeBelow: estimate [40,000, 60,000] → detail=fits explore=fits
- completeStraddle: estimate [60,000, 100,000] → detail=may_exceed explore=exceeds
- completeAbove: estimate [90,000, 120,000] → detail=over explore=exceeds
- partialRequiredCost: estimate no total; known subtotal [40,000, 50,000] → detail=unknown explore=partial
- unavailable: estimate unavailable → detail=unknown explore=unknown

## Invariants
- capNeverScalesWithPartySize: PASS
- capNeverScalesWithDuration: PASS
- customCapNeverScales: PASS
- anyHasNoCap: PASS
- identicalContextGivesIdenticalCap: PASS
- incompleteNeverConfidentlyWithin: PASS
- customAndPresetShareOneAffordabilityPath: PASS
- overnightCapsStayFlat: PASS

## Context round-trips
- economyPreset: {"searchParamsMaxBudget":50000,"contextCap":50000,"constraintKey":"preset:economy"}
- custom80000: {"searchParamsMaxBudget":80000,"contextCap":80000,"constraintKey":"custom:80000"}
