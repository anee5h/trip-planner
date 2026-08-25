import type { Destination } from "@/shared/types/destination";

export const REQUIRED_JA_CONTENT_FIELDS = [
  "name",
  "description",
  "highlights",
] as const;

export type RequiredJapaneseContentField =
  (typeof REQUIRED_JA_CONTENT_FIELDS)[number];

export interface JapaneseCoverage {
  name: boolean;
  description: boolean;
  highlights: boolean;
}

export function getJapaneseCoverage(place: Destination): JapaneseCoverage {
  const japaneseName = place.content?.ja?.name || place.nameJa;
  return {
    name: Boolean(japaneseName?.trim()),
    description: Boolean(place.content?.ja?.description?.trim()),
    highlights: Boolean(place.content?.ja?.highlights?.length),
  };
}

/**
 * Checks a declared supported set, rather than silently declaring every
 * legacy catalogue record translated. New supported records must be added to
 * the set and provide all required Japanese content fields.
 */
export function findMissingJapaneseFields(
  places: readonly Destination[],
  supportedIds: readonly string[],
): Array<{ id: string; fields: RequiredJapaneseContentField[] }> {
  const byId = new Map(places.map((place) => [place.id, place]));
  return supportedIds.flatMap((id) => {
    const place = byId.get(id);
    if (!place) return [{ id, fields: [...REQUIRED_JA_CONTENT_FIELDS] }];
    const coverage = getJapaneseCoverage(place);
    const fields = REQUIRED_JA_CONTENT_FIELDS.filter(
      (field) => !coverage[field],
    );
    return fields.length > 0 ? [{ id, fields }] : [];
  });
}

export function summarizeJapaneseCoverage(
  places: readonly Destination[],
): Record<RequiredJapaneseContentField, number> {
  return places.reduce(
    (counts, place) => {
      const coverage = getJapaneseCoverage(place);
      for (const field of REQUIRED_JA_CONTENT_FIELDS) {
        if (coverage[field]) counts[field] += 1;
      }
      return counts;
    },
    { name: 0, description: 0, highlights: 0 },
  );
}
