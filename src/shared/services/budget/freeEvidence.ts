/**
 * KAI-214 — shared verified-free evidence rule (single source of truth).
 *
 * Used by ALL THREE layers so they cannot drift:
 *   - budgetState.ts  (transitional normalizer + isVerifiedFree + runtime
 *     trust for explicit verified_free)
 *   - data-quality-rules.ts  (CI validator for explicit verified_free)
 *
 * Free is NEVER inferred from a zero numeric value, missing admission,
 * tags, kind, or absent data. It requires EXPLICIT free evidence in the
 * basis (EN: "free", "no admission", "no entry fee"; JA: 無料, 入場無料,
 * 無料開放), and NEGATIVE evidence ("not free", "admission applies",
 * "tickets required", "fee applies", "charges apply") rejects it.
 *
 * Dependency-neutral: pure function on primitives — importable from both
 * src runtime code and scripts/ CI validators.
 */

/** Positive free-evidence phrases (EN + JA). */
const FREE_POSITIVE =
  /\b(free|no admission|no entry fee)\b|無料|入場無料|無料開放/i;

/** Negative evidence that overrides any positive phrase. */
const FREE_NEGATIVE =
  /not free|not.*\bfree\b|no longer free|admission applies|tickets required|fee applies|charges apply|paid admission|entry fee applies/i;

/**
 * The single verified-free evidence predicate.
 *
 * @param basis   the budgetMetadata.basis text (human/ledger evidence)
 * @param tickets the budgetBreakdown.tickets value, if any (a positive
 *                ticket cost is decisive negative evidence)
 * @returns true ONLY when explicit positive free evidence exists and no
 *          negative evidence contradicts it.
 */
export function hasVerifiedFreeEvidence(
  basis: string | undefined,
  tickets: number | undefined,
): boolean {
  if (tickets !== undefined && tickets > 0) return false;
  if (!basis) return false;
  if (FREE_NEGATIVE.test(basis)) return false;
  return FREE_POSITIVE.test(basis);
}
