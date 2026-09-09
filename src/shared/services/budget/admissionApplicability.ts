import type { Destination } from "@/shared/types/destination";

export type ResolvedAdmissionApplicability =
  "applicable" | "not_applicable" | "unknown";

const APPLICABLE_KINDS = new Set<string>([
  "aquarium",
  "castle",
  "entertainment_complex",
  "indoor_attraction",
  "museum",
  "theme_park",
  "zoo",
]);

const APPLICABLE_CATEGORY_LABELS = new Set([
  "aquarium",
  "castle",
  "indoor attraction",
  "museum",
  "theme park",
  "zoo",
]);

/**
 * Resolve the one admission-applicability boundary used by budget consumers.
 *
 * Precedence is intentionally explicit:
 * 1. A persisted admission fact is authoritative, including N/A.
 * 2. Explicit KAI-285 applicability metadata can classify a record before a
 *    fact is authored.
 * 3. The legacy destination-level N/A state is retained only as a migration
 *    compatibility path for existing hub fixtures.
 * 4. Known ticketed kinds/categories remain applicable when their fact is
 *    missing, so an attraction cannot silently become free or N/A.
 * 5. Everything else is unknown. Missing admission is never inferred as N/A.
 */
export function resolveAdmissionApplicability(
  destination: Destination,
): ResolvedAdmissionApplicability {
  const fact = destination.admission;
  if (fact) {
    return fact.state === "not_applicable" ||
      fact.cost.kind === "not_applicable"
      ? "not_applicable"
      : "applicable";
  }

  if (destination.admissionApplicability) {
    return destination.admissionApplicability;
  }

  // Compatibility for pre-KAI-285 hub records that stored the destination-level
  // N/A state in the shared budget metadata. New records should use the
  // admission-specific field or fact above.
  if (destination.budgetMetadata?.state === "not_applicable") {
    return "not_applicable";
  }

  if (
    destination.kind !== undefined &&
    APPLICABLE_KINDS.has(destination.kind)
  ) {
    return "applicable";
  }

  if (
    (destination.categories ?? []).some((category) =>
      APPLICABLE_CATEGORY_LABELS.has(category.trim().toLowerCase()),
    )
  ) {
    return "applicable";
  }

  return "unknown";
}
