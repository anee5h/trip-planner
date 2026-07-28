import destinationsIndex from "../../data/destinations-index.json";
import {
  EDITORIAL_PILOT,
  EDITORIAL_PILOT_IDS,
} from "../../data/editorialPilot";
import type {
  Destination,
  LocalizedPlaceContent,
} from "../../types/destination";

export type CanonicalPlace = Destination &
  Required<Pick<Destination, "placeType" | "content" | "editorial">>;

const pilotIds = new Set<string>(EDITORIAL_PILOT_IDS);

function englishContent(destination: Destination): LocalizedPlaceContent {
  return {
    name: destination.name,
    description: destination.description,
    highlights: destination.highlights || [],
  };
}

export function toCanonicalPlace(destination: Destination): CanonicalPlace {
  const pilot = EDITORIAL_PILOT[destination.id];
  const en = destination.content?.en || englishContent(destination);
  const ja =
    pilot?.ja ||
    destination.content?.ja ||
    (destination.nameJa
      ? {
          name: destination.nameJa,
          description: destination.description,
          highlights: destination.highlights || [],
        }
      : undefined);
  const isPilot = pilotIds.has(destination.id);
  return {
    ...destination,
    placeType:
      destination.placeType ||
      (destination.role === "hub" ? "hub" : "destination"),
    content: { en, ...(ja ? { ja } : {}) },
    editorial:
      destination.editorial ||
      (isPilot
        ? {
            lifecycle: "published",
            sources: [pilot.source],
            reviewedAt: "2026-07-28",
            reviewedBy: "TabiMap editorial",
            changeSummary: "Phase 1 bilingual hub review",
          }
        : { lifecycle: "legacy", sources: [] }),
  };
}

export function getCanonicalPlaces(): CanonicalPlace[] {
  return (destinationsIndex as Destination[]).map(toCanonicalPlace);
}

export function getLocalizedPlace(
  place: Destination,
  locale: "en" | "ja",
): Destination {
  const canonical = toCanonicalPlace(place);
  const content =
    locale === "ja"
      ? canonical.content.ja || canonical.content.en
      : canonical.content.en;
  return {
    ...canonical,
    name: content.name,
    description: content.description,
    highlights: content.highlights,
  };
}
