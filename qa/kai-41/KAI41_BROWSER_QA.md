# KAI-41 Account-Origin Persistence and Recovery QA

Run on 2026-08-13 against `https://meguruto.app` in the Codex in-app Chromium browser and the user's signed-in Chrome session. Automated checks ran against `origin/main` plus the linked KAI-88 resolver fix.

| Browser/account state  | Origin                                            | Expected                                                                           | Actual                                                                            | Result |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| In-app Chromium, guest | Nakayama Station, Kanagawa                        | Home uses origin-adjusted travel time                                              | Shin-Yokohama Ramen Museum showed `~19–24 min`; raw catalogue value was not shown | Pass   |
| In-app Chromium, guest | Nakayama Station, Kanagawa                        | Guest origin survives refresh                                                      | Reload restored Nakayama                                                          | Pass   |
| In-app Chromium, guest | Nakayama Station, Kanagawa                        | Home and detail agree                                                              | Both showed `~19–24 min`                                                          | Pass   |
| Chrome, signed in      | Existing Nakayama account origin                  | Cloud origin loads on a fresh tab                                                  | Nakayama loaded with account bucket-list data                                     | Pass   |
| Chrome, signed in      | Shinyokohama Station, Kanagawa                    | Selection persists and Home/detail agree                                           | Fresh tab restored Shinyokohama; both surfaces showed `~14–19 min`                | Pass   |
| Automated integration  | Guest Nakayama → Account A Shin-Yokohama → logout | Logout restores guest origin                                                       | Guest Nakayama restored                                                           | Pass   |
| Automated integration  | Account A pending → Account B                     | Late A hydration cannot leak into B                                                | Stale A response ignored                                                          | Pass   |
| Automated integration  | Unresolvable cloud origin                         | Enter recoverable `origin_error`; picker remains usable; corrected origin persists | Corrected Nakayama upsert returns status to `ready`                               | Pass   |
| Automated integration  | Generic profile-load error                        | Profile mutations remain blocked                                                   | Mutation guard stays false until hydration is ready                               | Pass   |

## Finding

KAI-88 was opened for a production-data mismatch hidden by simplified tests: account hydration compared raw cloud labels with localized station catalogue entries. Production-shaped fixtures reproduced the failure; the shared resolver now canonicalizes names while retaining unique-match safety.

## Constraint

The live Sign Out control was not clicked because the current implementation calls Supabase `signOut()` with its default global scope, which would revoke the user's sessions on all devices. Logout restoration and account-switch isolation were verified through focused integration tests instead.
