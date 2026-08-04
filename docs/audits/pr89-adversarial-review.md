# PR #89 Adversarial Review — Committed Fixes and Remaining Items

## Committed Fixes

### Travel time integrity

- **HomeMatchCard** now reads `homeStationCoords` from the trip store, passes each destination through `buildRecommendationCandidate(destination, { homeStationCoords })`, and calls `getFastestPreferredTransport` with the adjusted destination plus coordinates. The static `transportOptions` values are no longer displayed when a non-default origin is selected. Destination JSON transport values are unchanged.

- **Regression tests** (`HomeMatchCard.test.ts`) verify: raw Seiko + Yokohama does not display 14 minutes; raw Seiko without origin displays the static 14; changing Tokyo to Yokohama changes the card time; Bucket List cards and details calculations agree.

### Origin validation

- `setOriginLocation` now enforces `isValidOriginLocation` before changing state or storage. Rejects out-of-range coordinates, non-finite values, invalid sources, and whitespace-only labels. Setter-level tests prove invalid calls do not modify active or guest state.

### Coordinate resolution failure handling

- `useTripSync` no longer pairs a loaded station label with `DEFAULT_TOKYO_COORDS` when resolution fails. On failure, sets profile sync to `error`, does not mark hydration complete, does not upsert fallback data, and sets a safe Tokyo Station origin so the UI is usable. Retry is allowed.

- Resolved coordinate ranges are validated (lat -90..90, lng -180..180, finite).

### Legacy cloud station label resolution

- Labels without a prefecture suffix (e.g. `"Nakayama Station"`) are resolved by searching all prefecture station lists for an exact unique match. Ambiguous or missing matches are rejected safely, falling back to Tokyo with sync error.

### Integration tests

- Guest Nakayama → Account A Shin-Yokohama → logout restores Nakayama.
- Late Account A hydration after switching to Account B is ignored.
- Coordinate resolution failure never produces a mismatched label and coordinate pair.
- Failed resolution does not trigger an upsert.
- Retry succeeds after coordinate lookup recovers.

### StationInput component test

- Mocked station JSON; selecting Kanagawa + Nakayama or Shin-Yokohama produces one atomic `setOriginLocation` call containing label and matching coordinates.

### Test cleanup

- `useTripStoreLocationPersistence.test.tsx` deleted. Meaningful migration cases are covered by `useTripStoreOriginOwnership.test.tsx` provider tests.

## Remaining Deferred Items

- **Browser QA**: manual verification of Nakayama selection, Shin-Yokohama selection, guest refresh, Home/Destinations consistency, signed-in persistence, logout restoration, account-switch isolation, and stale-hydration race.
- **Gateway source verification**: the 19 retained gateway assignments are marked `retained_pending_source_verification` in the audit CSV. They have not been independently verified against official access guidance. The 3 unsupported gateways (Ghibli Museum, Ushiku Daibutsu, Yomiuriland) have been removed.
- **Multi-municipality policy**: the policy text is written but kept local (not committed to `RELEASE_RULES.md`).
- **Cloud coordinate persistence**: the cloud schema still stores only `home_station` (label). Coordinates are resolved on hydration. A database migration to persist coordinates was not included.

## Final Validation

- Unit tests: 400 passing (up from 346 before PR #89)
- TypeScript: clean
- Lint: clean (pre-existing warnings only)
- Format: clean
- Translation parity: clean
- Fast catalogue validation: clean
- Build: passing
- `apply-city-hub-relationships`: idempotent