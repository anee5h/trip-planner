/** Canonical car-mode type used across transport, settings, and onboarding. */
export type CarMode = "none" | "my_car" | "rental";

/**
 * Normalize legacy and user-input car-mode values to the canonical enum.
 *
 * - "own" → "my_car" (legacy Settings/Onboarding value)
 * - "my_car" → "my_car"
 * - "rental" → "rental"
 * - "none" / unknown / undefined → "none"
 */
export function normalizeCarMode(raw: string | undefined): CarMode {
  if (raw === "own" || raw === "my_car") return "my_car";
  if (raw === "rental") return "rental";
  return "none";
}
