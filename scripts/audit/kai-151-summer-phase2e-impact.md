# KAI-151 Phase 2E recommendation sensitivity

- Base commit: `4ed1bdff625037396810ca779b823a6a115b3d89`
- Scenarios: 3 representative origins × 5 planner durations × one in-season and one materially off-season date; existing recommendation pipeline only
- Target IDs: 6

## Classification counts

| Classification | Rows |
| --- | ---: |
| insufficient_evidence | 180 |

## Method

The report compares the existing recommendation pipeline before and after the authorized canonical seasonality mutations. It records rank, score, seasonal attribution, date position, origin, and planner duration. It does not modify ranking weights or production code.

## Review gate

A rank change is treated as expected only when it is attributable to the new structured seasonal fields and remains compatible with the selected date and duration. Missing or unavailable rows are retained as `insufficient_evidence`; no data was changed to force rank movement.
