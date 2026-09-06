import type { Destination } from "@/shared/types/destination";

export function getLocalizedOpeningHours(
  destination: Destination,
  locale: "en" | "ja",
): string | undefined {
  const canonicalEnglishHours =
    destination.businessHours || destination.openingHours;
  const canonicalJapaneseHours = destination.openingHoursJa;

  // Canonical verified hours must win over legacy localized prose. Keep the
  // localized content fallback only for older records that have no canonical
  // hours yet; it must never override a canonical source-of-truth value.
  if (canonicalEnglishHours || canonicalJapaneseHours) {
    if (locale === "ja") {
      return (
        canonicalJapaneseHours ||
        canonicalEnglishHours?.replace(
          /\(Last admission ([^)]+)\)/i,
          "（最終入場 $1）",
        )
      );
    }
    return canonicalEnglishHours;
  }

  return locale === "ja"
    ? destination.content?.ja?.openingHours
    : destination.content?.en?.openingHours;
}
