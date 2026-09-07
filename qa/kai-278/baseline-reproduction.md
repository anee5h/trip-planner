# KAI-278 baseline reproduction

- Base: `ff0eeed0c765a973537ed7c99c6ff0c902cdbd17`
- Worktree: `/home/aneesh/trip-kai278`
- Branch: `fix/kai-278-transport-handoff-scope`
- Capture: `before-reproduction.json`
- Canonical probe: `/tmp/kai278-repro.ts`, executed with `npx tsx --tsconfig ./tsconfig.app.json /tmp/kai278-repro.ts`

## Probe inputs

- Tokyo Station origin: `{ lat: 35.6812, lng: 139.7671 }`, zone `mainland-honshu`
- Yokohama Station origin: `{ lat: 35.4657, lng: 139.6222 }`, zone `mainland-honshu`
- Hakone: `hakone-town`
- Kyoto hub: `kyoto-city`; representative children are the first four featured relationship children
- Tokyo Station destination: `tokyo-station-chiyoda`
- Shodoshima: `shodoshima`
- Unsupported-car probe: first catalogue records with no eligible car access, including `abukuma-cave-fukushima`

## Findings before implementation

| Fixture                           | Exact baseline result                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — Hakone + personal car         | `my_car` is the only valid selected mode. Tokyo displays `[74,94]` minutes; Yokohama displays `[53,68]`. The journey result has origin coordinates, Hakone destination coordinates, `calculated_ground_display` provenance, and low-confidence estimated duration. The current Detail CTA independently emits `travelmode=transit`.                                                                          |
| B — Kyoto hub/local cards         | Kiyomizu-dera `[148,241]`, Arashiyama `[156,251]`, Tenryu-ji `[156,251]`, and Kinkaku-ji `[154,249]` all consume the Tokyo origin and are displayed as origin-level journeys. No local-scope label is present in the card contract. A direct Kyoto-hub local probe returns `[17,22]` for the Kinkaku-ji case where local topology supports it; other probes remain unavailable rather than being fabricated. |
| C — Tokyo Station → Tokyo Station | Origin is `Tokyo:chiyoda` at `{35.6812,139.7671}`. Destination is `tokyo-station-chiyoda` at `{35.681236,139.767125}`. Both resolve to `mainland-honshu`; deterministic local estimate is `[14,19]` minutes from `calculated_local_bounded_estimate`. The coordinate delta is approximately `0.000036° lat / 0.000025° lng`.                                                                                 |
| D — Shodoshima                    | Tokyo origin is `mainland-honshu`; destination is `shodoshima`. No ferry or ground estimate is returned; valid modes are `[]`. The destination declares `localAccessModes: ["bus"]` and `localAccessUnestimated: true`, so no complete journey is currently shown.                                                                                                                                           |
| E — mixed selections              | `publicModes: []` survives with `my_car` (`validModes: ["my_car"]`) and with rental (`validModes: ["car"]`). Rental remains internally distinct from `my_car`. The mixed `train + car` selection remains mode-authorized according to the existing resolver, although the selected display evidence must be traced through each surface.                                                                     |
| F — car-only unsupported          | A fail-closed unsupported record such as `abukuma-cave-fukushima` returns `validModes: []` for `my_car` and has no routable car anchors. The current Detail CTA source still generates a transit URL whenever a home station and destination exist, so the unsupported-car handoff requires an explicit guard.                                                                                               |

## CTA/source reproduction

`src/features/destinations/DestinationDetails.tsx` currently builds the sole Detail CTA as:

```ts
https://www.google.com/maps/dir/?api=1
  &origin=<homeStation>
  &destination=<destination.name, prefecture, Japan>
  &travelmode=transit
```

It does not consume the selected mode, canonical journey endpoint, completeness, or external-handoff capability from the displayed result. This is the direct source of the Hakone personal-car mismatch and the unsupported-car transit fallback.

## Browser limitation

A headless Playwright probe was attempted against the healthy local Vite server (`curl` returned HTTP 200). Chromium returned `ERR_INSUFFICIENT_RESOURCES` on navigation even with resource-constrained launch flags. The browser-use harness then requested a user remote-debugging approval. No rendered-browser result is claimed from that failed probe; the canonical service capture and source-level CTA reproduction above remain the baseline evidence.

No production source files were changed before this capture.
