# Signup conversion funnel

KAI-259 uses the existing `RecommendationAnalyticsService` event queue and telemetry pipeline. The four event names below are stable and are forwarded to the existing GA4 `gtag` integration when it is available.

| Event | When it fires | Safe dimensions |
| --- | --- | --- |
| `signup_cta_impression` | Once when the guest header presents the signup CTA. A component ref and the analytics deduplication window protect against ordinary rerenders. | `source: header`, `locale` |
| `signup_cta_click` | When the guest header signup CTA is activated. | `source: header`, `locale` |
| `signup_started` | When the existing auth modal reaches signup mode, either from the header CTA or the existing sign-in → sign-up switch. | `source: header\|auth_modal`, `locale` |
| `signup_completed` | After email signup returns without an error, or after a pending OAuth signup receives an authenticated session. | `source`, `locale`, `auth_provider` |

OAuth intent is represented only by a short-lived session-storage marker containing the provider and creation time. It is cleared on auth errors, when the user switches back to sign-in, or after it is consumed. No passwords, tokens, auth payloads, email addresses, form contents, or free-form user data are sent to analytics.

A failed or cancelled signup does not emit `signup_completed`. The service also forwards only the allowlisted dimensions above to GA4; the full internal event payload remains in the existing telemetry queue.
