/**
 * Shared rating validation utilities.
 */

/**
 * Returns true when the value is a valid explicit walkability rating
 * suitable for display in a visitor-facing detail page.
 *
 * A valid walkability score must be a finite integer or float between
 * 1 and 10 inclusive. Zero, null, undefined, NaN, and out-of-range
 * values are all rejected so the caller can decide whether to show a
 * "Not rated" state or omit the row entirely.
 */
export function isValidWalkability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 10
  );
}
