/**
 * Centralized audit reference date for transport validators.
 *
 * KAI-12 hard gate 1 (TRANSPORT_MODEL_GAP_ANALYSIS.md §5): the reference
 * date used by future-date checks must be a single config value, never a
 * manually bumped constant. Mirroring the repository convention in
 * scripts/audit/catalog-integrity.ts (checkSync referenceDate), the
 * reference is the current JST date at runtime, so future-date checks are
 * enforced against the real clock and can never be silently bypassed by a
 * stale hard-coded constant. A checkedAt later than today is fabricated
 * provenance and is rejected by the transport validators.
 */
export function getAuditReferenceToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
