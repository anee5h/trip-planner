# KAI-218-A — Admission Cost-Fact Schema (design proposal)

**Branch:** `feat/kai-218a-budget-v2-cost-facts-schema` (HEAD 604b1ce2 = KAI-217B)
**Scope:** admission only. READ-ONLY proposal — no files committed.
**Parent:** KAI-218 (migrate catalogue to explicit KAI-214 state/provenance/reasonCode; target: both transitional baselines → 0).
**Converges with:** KAI-214 taxonomy (`BudgetValueState`/`BudgetProvenance`/`BudgetReasonCode`), KAI-215 `CostRepresentation`, KAI-217 `TripCostEngine.admissionComponent`.

---

## 1. The admission cost fact — TypeScript type

Proposed home: `src/shared/types/destination.ts` (next to `budgetMetadata`), additive optional field `admission` on `Destination`.

```ts
/**
 * KAI-218 — ADMISSION cost fact.
 *
 * The on-site admission/entry-price truth for ONE destination, as a
 * PERSISTED destination fact. Deliberately reuses the KAI-214
 * state/provenance/reasonCode taxonomy VERBATIM (this is NOT a second
 * trust taxonomy) and represents the value with the KAI-215
 * CostRepresentation shapes (bounded / open_ended / non-numeric).
 *
 * Invariants (enforced by CI, same spirit as KAI-214):
 *   - admission.state === "verified_free"  ⇒ cost kind "bounded" [0,0]
 *     AND explicit free evidence in evidence.basis (shared rule with
 *     freeEvidence.hasVerifiedFreeEvidence).
 *   - admission.state === "verified_paid"  ⇒ cost kind "bounded"
 *     [min,max] with min>=0, max>=min, AND provenance "verified_source",
 *     AND at least one sourceUrl + checkedAt.
 *   - admission.state === "documented_estimate" ⇒ cost bounded/open_ended
 *     with provenance "model" (KAI-214 contract).
 *   - admission.state === "variable_price" ⇒ cost kind "open_ended" (a
 *     truthful lower bound only) or "variable"; NEVER a fabricated
 *     bounded range; requires reasonCode.
 *   - admission.state === "not_applicable" ⇒ cost kind "not_applicable",
 *     reasonCode REQUIRED (hub_budget_not_applicable /
 *     no_single_admission_product / free_area_with_optional_paid_components
 *     when admission itself has no single product).
 *   - admission.state === "unavailable" ⇒ cost kind "unavailable",
 *     reasonCode REQUIRED (source_missing / insufficient_model_evidence…).
 *
 * RELATIONSHIP TO THE LEGACY `budgetBreakdown.tickets`:
 *   - The admission fact is the AUTHORITATIVE admission truth when
 *     present. budgetBreakdown.tickets is DOWNGraded to a legacy
 *     aggregate-lunch estimate (see §3 mapping table).
 *   - A legacy-only record (no admission fact) is NOT re-interpreted by
 *     this proposal; it keeps today's KAI-214 transitional semantics.
 *
 * SCALING: values are PER-PERSON. The engine multiplies by partySize
 * (TripCostEngine.admissionComponent) — never pre-scaled here.
 */

/** What the admission number/state covers, for honest scope reporting. */
export type AdmissionScope =
  | "general_entry"        // standard adult base admission
  | "adult"                // explicit adult ticket (when general == adult)
  | "combo_included"       // price is part of a combined pass (no standalone price)
  | "main_site_only"       // main building/grounds; annexes excluded
  | "grounds_only"         // grounds/garden only, interior charged separately
  | "per_activity"         // pay-per-activity venue (no single gate price)
  | "open_area"            // public open area: no gate, optional paid components
  | "whole_area"           // no single product (hub/city/district aggregate)

export interface AdmissionCostFact {
  /**
   * KAI-214 VALUE STATE of the admission (not the whole trip budget).
   * verified_paid / verified_free / documented_estimate / variable_price /
   * not_applicable / unavailable. legacy_unverified is NOT a forward
   * admission state — legacy admission facts must be authored as
   * unavailable (reason legacy_provenance_unrecovered) or re-verified.
   */
  readonly state: Exclude<BudgetValueState, "legacy_unverified">;

  /** KAI-214 PROVENANCE axis, verbatim. */
  readonly provenance: BudgetProvenance;

  /**
   * KAI-214 REASON CODE, REQUIRED for every non-numeric state
   * (not_applicable / unavailable / variable_price).
   */
  readonly reasonCode?: BudgetReasonCode;

  /**
   * KAI-215 cost representation. Reuses BoundedCost / OpenEndedCost /
   * NonNumericCost semantics — an open-ended "from ¥X" must NEVER
   * masquerade as a bounded fixed price.
   */
  readonly cost: CostRepresentation;

  /** What the number actually covers (admission scope honesty). */
  readonly scope: AdmissionScope;

  /** Human/ledger evidence string — free evidence REQUIRED for verified_free. */
  readonly basis?: string;

  /** Official source URLs. REQUIRED for verified_source provenance. */
  readonly sourceUrls?: readonly string[];

  /** ISO date the price was checked against the sources. REQUIRED for verified_*. */
  readonly checkedAt?: string;

  /**
   * For free + optional paid experiences (reasonCode
   * free_area_with_optional_paid_components): the OPTIONAL paid
   * components are listed here, never folded into a bounded [0,0].
   * A single optional component with a fixed price SHOULD be expressed
   * as cost kind "open_ended" with from = that price (e.g. onsen
   * ¥1,300) so the "from ¥X" is truthful.
   */
  readonly optionalPaidComponents?: readonly {
    name: string;
    price?: number;
    sourceUrl?: string;
  }[];
}

/** Optional additive field on Destination: */
admission?: AdmissionCostFact;
```

Notes:
- **Reuses, does not fork**: `state`/`provenance`/`reasonCode` are the same union types as `budgetMetadata` — the normalizer and CI keep ONE taxonomy.
- **`legacy_unverified` excluded**: a forward admission fact must be a real classification. KAI-218 migrates legacy records to `unavailable` + `legacy_provenance_unrecovered` (drop the numeric claim) or re-verifies (promote to `verified_paid`).
- **Cost shapes from KAI-215** (`BoundedCost`/`OpenEndedCost`/`NonNumericCost`) give us "free + optional paid" honesty: `open_ended` from a fixed optional price, or `not_applicable` for a free open area with paid extras.

---

## 2. Example JSON — one per variant

### 2.1 Verified fixed paid (e.g. Buaiso, museum, ¥1500, verified source)

```json
{
  "admission": {
    "state": "verified_paid",
    "provenance": "verified_source",
    "cost": { "kind": "bounded", "min": 1500, "max": 1500 },
    "scope": "general_entry",
    "basis": "Adult admission ¥1,500 (general entry); verified against official ticket page",
    "sourceUrls": ["https://buaiso.com/access_guide/new_ticket.html"],
    "checkedAt": "2026-08-02"
  }
}
```

### 2.2 Verified free (e.g. Farm Tomita — FREE_ENTRY ledger evidence)

```json
{
  "admission": {
    "state": "verified_free",
    "provenance": "verified_source",
    "cost": { "kind": "bounded", "min": 0, "max": 0 },
    "scope": "whole_area",
    "basis": "Free admission (ledger FREE_ENTRY); official site confirms no entry fee",
    "sourceUrls": ["https://www.farm-tomita.co.jp/en/"],
    "checkedAt": "2026-08-12"
  }
}
```

### 2.3 Free + optional paid experiences (e.g. free-entry onsen town with paid baths)

```json
{
  "admission": {
    "state": "not_applicable",
    "provenance": "verified_source",
    "reasonCode": "free_area_with_optional_paid_components",
    "cost": { "kind": "not_applicable" },
    "scope": "open_area",
    "basis": "Public area free to enter; individual baths charge admission",
    "sourceUrls": ["https://example-onsen.jp/facility/"],
    "checkedAt": "2026-08-15",
    "optionalPaidComponents": [
      { "name": "Day-use bath (onsen)", "price": 1300, "sourceUrl": "https://example-onsen.jp/bath/" }
    ]
  }
}
```

### 2.4 Bounded/variable official range (e.g. zoo with adult/child tiers, or seasonal pricing)

```json
{
  "admission": {
    "state": "variable_price",
    "provenance": "verified_source",
    "reasonCode": "price_variable_by_product",
    "cost": { "kind": "open_ended", "from": 700 },
    "scope": "general_entry",
    "basis": "Adult ¥700; child ¥200; seasonal event pricing applies",
    "sourceUrls": ["https://example-zoo.jp/admission/"],
    "checkedAt": "2026-08-02"
  }
}
```

(Bounded official range variant — same state, `cost: { "kind": "bounded", "min": 700, "max": 1400 }` — only when BOTH bounds are source-backed; otherwise open_ended is the honest shape.)

### 2.5 Not applicable — city/hub/no single product

```json
{
  "admission": {
    "state": "not_applicable",
    "provenance": "verified_source",
    "reasonCode": "hub_budget_not_applicable",
    "cost": { "kind": "not_applicable" },
    "scope": "whole_area",
    "basis": "City hub: no single admission product; sightseeing is distributed across public sites",
    "checkedAt": "2026-08-02"
  }
}
```

### 2.6 Unavailable — with reason

```json
{
  "admission": {
    "state": "unavailable",
    "provenance": "none",
    "reasonCode": "source_missing",
    "cost": { "kind": "unavailable", "reason": "source_missing" },
    "scope": "general_entry",
    "basis": "No official admission page located during KAI-218 audit",
    "checkedAt": "2026-08-02"
  }
}
```

---

## 3. Mapping table — `budgetBreakdown.tickets` → admission fact

Measured on the real catalogue (public/data/destinations, 1057 records).

| Legacy bucket | Count | Trust today (KAI-214 normalized) | Map to admission fact |
|---|---|---|---|
| **manual + tickets>0 + basis "verified ticket ¥X (ledger …); source: URL"** | 34 | `verified_paid` / verified_source / **trusted** | **TRUSTWORTHY** → `verified_paid` bounded [X,X], provenance verified_source, sourceUrl = basis URL, checkedAt = basis date. 33/34 already carry a source URL in basis. Caveats: a few point to non-official sources (japan-guide.com, gotokyo.org — still source-backed but not official); `jindai-botanical-gardens` cites Wikipedia. Ticket value itself is exact. |
| **manual + tickets==0 + free evidence (FREE_ENTRY / LEDGER_VERIFIED free)** | 3 | `verified_free` / verified_source / **trusted** | **TRUSTWORTHY** → `verified_free` bounded [0,0]. farm-tomita (official source in basis). Caveats: ikebukuro-toshima and odaiba-minato are district/hub records whose "free admission" basis has NO URL — ok as `not_applicable`-free-area or verified_free with no source; recommend `not_applicable` + `free_area_with_optional_paid_components` for these two aggregates, `verified_free` only for real POIs. |
| **manual + tickets==0 + NO free evidence** (kitaro-chaya: "verified ticket ¥0 preserved; peer cell … accepted debt") | 1 | (manual → not verified_free; transitional debt) | **NOT trustworthy** → `unavailable` + `source_missing` (drop the ¥0 claim) or re-verify. |
| **model + tickets==0 + role hub** (peer-cell hub class convention) | 106 | `documented_estimate` / model / trusted_estimate | **NOT a real admission fact** → `not_applicable` + `hub_budget_not_applicable` (+ provenance model, basis peer-cell). Never `verified_free` — the zero is a class convention, not evidence. |
| **model + tickets==0 + non-hub** (yokohama-cosmo-world) | 1 | `documented_estimate` | **NOT trustworthy as free** → peer-cell "tickets source-verified" with ¥0 — likely a free venue; re-verify; until then `unavailable` + `insufficient_model_evidence` (or `verified_free` only with real evidence). |
| **model + tickets>0 (UNESCO/World Heritage aggregates: NMWA, Hiraizumi, Oura, Sannai-Maruyama, Tomioka)** | 5 | `documented_estimate` / trusted_estimate | **Plausible but NOT verified-source** → keep `documented_estimate` bounded [X,X] provenance model (peer cell). NOT promoted to verified_paid without a source check. Note NMWA ¥500/Le Corbusier is a real published figure — high re-verification priority. |
| **legacy + tickets>0 (incl. 19 hubs/cities!)** | 239 | `legacy_unverified` / legacy / **untrusted** | **NOT trustworthy** → `unavailable` + `legacy_provenance_unrecovered` (drop the numeric claim) OR re-verify to `verified_paid`. 209/239 have an officialWebsite for re-verification; values include suspicious rounded hub aggregates (kyoto-city ¥2000, osaka-city ¥2125, sendai ¥3000) and odd numbers (nagoya ¥1813, roppongi ¥2357) — the odd ones look like peer-cell averages, NOT prices. Do NOT migrate 239 records by hand into verified_paid. |
| **legacy + tickets==0** | 88 | `legacy_unverified` / untrusted | **NOT trustworthy as free** → `unavailable` + `legacy_provenance_unrecovered`. Some are genuinely free (open streets/parks) but the zero is unsourced. |
| **unknown / absent + tickets** | 0 | — | nothing to map (no tickets in these records). |

**Key quantitative findings:**
- 477/1057 records have a breakdown; 477 have tickets; 0 have `budgetMetadata.state` authored (all 1057 transitional; forward-contract explicit-state = 0 — exactly the KAI-218 gap).
- Only **38 manual records are trusted today** (35 verified_paid + 3 verified_free normalized) — the ONLY trustworthy admission facts in the catalogue.
- **239 legacy ticket values (45% of all ticket records) are untrusted** and must not be re-labeled as verified.
- 63 legacy-paid records have non-round values (¥822, ¥1813, ¥2357, ¥3273…) — strong smell of peer-cell averages, definitely not source facts.
- 63 records carry "volatile or destination-dependent" basis text → today mapped conservatively to `transitional_unclassified`; KAI-218's variable_price/open_ended shape is the first honest home for these (see risks).

---

## 4. Risks

1. **Silent mass-promotion trap**: the biggest risk is bulk-migrating 239 legacy tickets>0 records into `verified_paid`. They carry no provenance (KAI-204 already says so). The schema must FORBID `verified_paid` without `sourceUrls` + `checkedAt` (CI invariant), which mechanically prevents this.
2. **"Free" from zeros**: hub tickets==0 (106 model records) MUST NOT become `verified_free` — the freeEvidence shared rule only accepts explicit basis evidence. `not_applicable` (hub) is the correct class, and it keeps TripCostEngine's `not_applicable` carve-out consistent.
3. **Open-ended vs bounded honesty**: an "adult from ¥X" or seasonally-varying price must use `open_ended` (or `variable`), never a bounded [min,max] unless BOTH bounds are source-backed. A bounded [0,0] is ONLY legal with verified_free evidence. This mirrors the KAI-216 transport lesson (open-ended must never masquerade as bounded-complete).
4. **TripCostEngine coupling**: `admissionComponent` currently reads `budgetBreakdown.tickets` from the normalized trust state. When `admission` facts land, the engine must prefer `dest.admission` and fail closed if a `verified_paid` fact has no numeric cost. BudgetService.getEffectiveBudgetBreakdown and hasDisplayableBudget semantics need a conscious migration path (admission fact authoritative; legacy tickets degrade to aggregate-lunch estimate at most).
5. **Source freshness**: `checkedAt` is required for verified_* but nothing re-checks it yet. Without a staleness policy (e.g. review_due after N months) verified_paid facts rot silently — same class of problem KAI-89 solved for editorial freshness, needs the same treatment.
6. **Non-official "sources"**: some manual basis URLs are japan-guide / gotokyo / Wikipedia. `verified_source` provenance currently accepts them. Decide whether verified_source requires an OFFICIAL source (recommended: yes for the schema's sourceUrls; keep basis URL as supporting).
7. **reasonCode overloading**: `free_area_with_optional_paid_components` / `optional_paid_experiences_only` / `no_single_admission_product` are currently UNUSED in the catalogue (0 records). The admission fact is their first consumer; validate the semantic boundaries with real records (onsen towns, markets) before mass application, and keep them optional — `not_applicable` + `hub_budget_not_applicable` covers most hubs without needing a new code.
8. **Variable-price records are currently parked as `unavailable`**: 63 "volatile/destination-dependent" records normalize to unavailable + transitional_unclassified today. KAI-218 should move them to `variable_price` + `open_ended`/`variable` — but ONLY after a source check; basis text alone ("volatile") is not an official range. This is a behavior change (unavailable → variable) that touches UI copy ("Cost unavailable" vs "Price varies") — coordinate with the KAI-214 UI fallback work.
9. **Two-ticket-truths**: with `admission` facts AND legacy `tickets` coexisting, any drift is a regression. The migration should DELETE tickets from the breakdown (or pin `budgetMetadata.basis` to "legacy aggregate estimate") for migrated records — one admission truth per destination, never two.
10. **CI ratchet interplay**: migrating a record from transitional to explicit state REMOVES its identity fingerprint (KAI-214 shrink-only baseline). Each migration must also update the audit expectations (kai-214-budget-state-audit.ts totals) and the catalog CI baselines — a migration that only adds `admission` without state/`reasonCode` on budgetMetadata would NOT satisfy KAI-218's "transitional → 0" target. The admission fact should carry its own state, but the destination-level budgetMetadata.state should be authored in the same pass to keep the two aligned (or the normalizer must learn to read the admission fact — see recommendation below).

**Recommendation (for the parent ticket):** author `admission` as the admission-specific fact AND have `normalizeBudgetState` prefer the admission fact for the admission dimension of the destination state (or document a strict one-pass migration where both are written together). Favor keeping the KAI-214 taxonomy as the single source of truth and making `admission.state` the admission projection of it, so the runtime helpers (isVerifiedFree etc.) keep working unchanged.
