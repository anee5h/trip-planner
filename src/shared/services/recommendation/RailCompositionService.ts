import type { Destination } from "@/shared/types/destination";
import type { DestinationCombo } from "./DestinationCombinationService";

export interface RailCandidate {
  id: string;
}

/**
 * Selects the first unseen canonical IDs in an already-ranked candidate pool.
 * The input pool owns eligibility and ranking; this function only composes it
 * against IDs claimed by earlier visible sections.
 */
export function selectUniqueRail<T>(
  candidates: readonly T[],
  seenIds: ReadonlySet<string>,
  count = Number.POSITIVE_INFINITY,
  idOf: (candidate: T) => string = (candidate) =>
    (candidate as T & { id: string }).id,
): T[] {
  if (count <= 0) return [];
  const selected: T[] = [];
  const selectedIds = new Set<string>();
  for (const candidate of candidates) {
    const candidateId = idOf(candidate);
    if (seenIds.has(candidateId) || selectedIds.has(candidateId)) {
      continue;
    }
    selected.push(candidate);
    selectedIds.add(candidateId);
    if (selected.length >= count) break;
  }
  return selected;
}

export interface BoundedDiversityOptions<T> {
  count?: number;
  familyOf: (candidate: T) => string;
  scoreOf?: (candidate: T) => number;
  lookahead?: number;
  qualityMargin?: number;
  maxConsecutive?: number;
  /** Soft front-screen window; never a hard family quota. */
  diversityWindow?: number;
  /** Maximum family density before a close alternative is considered. */
  maxFamilyCount?: number;
}

function defaultScoreOf<T>(candidate: T): number {
  const score = (candidate as T & { score?: unknown }).score;
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

/**
 * Applies a bounded presentation-only diversity pass to an already-ranked
 * eligible pool. It can choose a nearby alternative only when it is within the
 * quality margin and lookahead window; a soft front-screen family-density
 * trigger supplements the consecutive-run guard, but never becomes a hard
 * family quota. It never reaches deep into the pool or changes scores.
 */
export function composeBoundedDiverseTopMatches<T extends RailCandidate>(
  rankedCandidates: readonly T[],
  options: BoundedDiversityOptions<T>,
): T[] {
  const count = Math.max(0, options.count ?? 10);
  const lookahead = Math.max(0, options.lookahead ?? 3);
  const qualityMargin = Math.max(0, options.qualityMargin ?? 8);
  const maxConsecutive = Math.max(1, options.maxConsecutive ?? 2);
  const diversityWindow = Math.max(0, options.diversityWindow ?? 5);
  const maxFamilyCount = Math.max(1, options.maxFamilyCount ?? 2);
  const scoreOf = options.scoreOf ?? defaultScoreOf;
  const queue = selectUniqueRail(
    rankedCandidates,
    new Set(),
    rankedCandidates.length,
  );
  const selected: T[] = [];

  while (queue.length > 0 && selected.length < count) {
    const rankedCandidate = queue.shift()!;
    let chosen = rankedCandidate;
    const currentFamily = options.familyOf(rankedCandidate);
    const lastFamily = selected.at(-1)
      ? options.familyOf(selected.at(-1)!)
      : undefined;
    let consecutiveCount = 0;
    for (let index = selected.length - 1; index >= 0; index -= 1) {
      if (options.familyOf(selected[index]) !== lastFamily) break;
      consecutiveCount += 1;
    }
    const window = diversityWindow > 0 ? selected.slice(-diversityWindow) : [];
    const familyCountInWindow = window.filter(
      (candidate) => options.familyOf(candidate) === currentFamily,
    ).length;
    const needsDiversity =
      (lastFamily === currentFamily && consecutiveCount >= maxConsecutive) ||
      (diversityWindow > 0 && familyCountInWindow >= maxFamilyCount);

    if (needsDiversity && lookahead > 0) {
      const alternativeIndex = queue
        .slice(0, lookahead)
        .findIndex(
          (candidate) =>
            options.familyOf(candidate) !== currentFamily &&
            scoreOf(rankedCandidate) - scoreOf(candidate) <= qualityMargin,
        );
      if (alternativeIndex >= 0) {
        chosen = queue.splice(alternativeIndex, 1)[0];
        queue.unshift(rankedCandidate);
      }
    }

    selected.push(chosen);
  }

  return selected;
}

export type ExperienceFamily =
  | "observation/viewpoint"
  | "nature/outdoors"
  | "culture/history"
  | "family/entertainment"
  | "onsen/relaxation"
  | "town/city exploration"
  | "other";

/** Composition-only broad family derived from existing destination metadata. */
export function getExperienceFamily(
  destination: Pick<Destination, "kind" | "categories" | "tags">,
): ExperienceFamily {
  const text = [
    destination.kind,
    ...(destination.categories ?? []),
    ...(destination.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (/observ|viewpoint|tower|skyline|panorama|skyscraper/.test(text)) {
    return "observation/viewpoint";
  }
  if (/family|entertainment|theme|aquarium|railway|zoo/.test(text)) {
    return "family/entertainment";
  }
  if (/onsen|spa|relax|resort|wellness/.test(text)) {
    return "onsen/relaxation";
  }
  if (
    /history|historic|temple|shrine|castle|museum|heritage|district/.test(text)
  ) {
    return "culture/history";
  }
  if (
    /nature|park|garden|mountain|lake|beach|coast|island|outdoor/.test(text)
  ) {
    return "nature/outdoors";
  }
  if (/city|town|ward|shopping|market|food|street/.test(text)) {
    return "town/city exploration";
  }
  return "other";
}

export interface DetailRailCompositionInput {
  destinationId: string;
  isHub: boolean;
  featuredChildSights: readonly Destination[];
  hubMoreDestinations: readonly Destination[];
  greatAdditions: readonly DestinationCombo[];
  nearbyHubs: readonly Destination[];
  nearbyPlaces: readonly Destination[];
  halfDaySiblings: readonly Destination[];
}

export interface DetailRailComposition {
  featuredChildSights: Destination[];
  hubMoreDestinations: Destination[];
  greatAdditions: DestinationCombo[];
  nearbyHubs: Destination[];
  nearbyPlaces: Destination[];
  halfDaySiblings: Destination[];
}

/**
 * Applies the visual priority order of the Detail page without changing any
 * relationship producer. Hub pages claim featured sights → hub additions →
 * combinations → nearby hubs; place pages claim combinations → nearby places
 * → half-day siblings.
 */
export function composeDetailRails(
  input: DetailRailCompositionInput,
): DetailRailComposition {
  const seenIds = new Set<string>();
  const claimDestinations = (
    candidates: readonly Destination[],
    count = Number.POSITIVE_INFINITY,
  ) => {
    const selected = selectUniqueRail(
      candidates.filter((candidate) => candidate.id !== input.destinationId),
      seenIds,
      count,
    );
    selected.forEach((candidate) => seenIds.add(candidate.id));
    return selected;
  };
  const claimCombinations = () => {
    const selected = selectUniqueRail(
      input.greatAdditions.filter(
        (combination) => combination.secondary.id !== input.destinationId,
      ),
      seenIds,
      3,
      (combination) => combination.secondary.id,
    );
    selected.forEach((combination) => seenIds.add(combination.secondary.id));
    return selected;
  };

  if (input.isHub) {
    return {
      featuredChildSights: claimDestinations(input.featuredChildSights),
      hubMoreDestinations: claimDestinations(input.hubMoreDestinations),
      greatAdditions: claimCombinations(),
      nearbyHubs: claimDestinations(input.nearbyHubs),
      nearbyPlaces: [],
      halfDaySiblings: [],
    };
  }

  return {
    featuredChildSights: [],
    hubMoreDestinations: [],
    greatAdditions: claimCombinations(),
    nearbyHubs: [],
    nearbyPlaces: claimDestinations(input.nearbyPlaces, 4),
    halfDaySiblings: claimDestinations(input.halfDaySiblings, 3),
  };
}
