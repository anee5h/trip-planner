import {
  canonicalWikipediaIdentity,
  parseWikipediaUrl,
  wikipediaProvenanceReferences,
  type WikipediaIdentitySource,
  type WikipediaLanguage,
  type WikipediaMapping,
  type WikipediaSourceReference,
} from "../../src/shared/services/wikipedia/WikipediaIdentity";
import {
  titleMatchesDestination,
  validateWikipediaCandidate,
  type WikipediaCandidate,
  type WikipediaDestination,
} from "../../src/shared/services/wikipedia/WikipediaValidation";

export interface LegacyDestination extends WikipediaDestination {
  id: string;
  status?: string;
  region?: string;
  editorial?: WikipediaIdentitySource["editorial"];
}

export interface LegacyCandidate extends WikipediaCandidate {
  language: WikipediaLanguage;
  title: string;
  url: string;
  extract: string;
  pageId?: number;
  wikidataId?: string;
  requestedIdentity?: string;
  redirectedFrom?: string;
}

export interface LegacyCandidateFailure {
  status: "missing" | "transient";
  message?: string;
}

export type LegacyReviewReason =
  | "invalid-provenance"
  | "conflicting-provenance"
  | "provenance-title-mismatch"
  | "shared-provenance-identity"
  | "missing-api-candidate"
  | "no-usable-identity"
  | "candidate-identity-mismatch"
  | "destination-title-mismatch"
  | "validator-rejected";

export interface CanonicalWikipediaFields {
  wikipediaTitle: string;
  wikipediaLanguage: WikipediaLanguage;
  wikipediaUrl: string;
  wikipediaPageId: number;
  wikidataId?: string;
}

export type LegacyClassification =
  | {
      state: "canonicalizable";
      reason: "validated-legacy-identity";
      identity: CanonicalWikipediaFields;
      sourceUrls: string[];
    }
  | {
      state: "review";
      reason: LegacyReviewReason;
      details?: string[];
      sourceUrls: string[];
    }
  | {
      state: "transient";
      reason: "transient-network-failure";
      details?: string[];
      sourceUrls: string[];
    };

export type CandidateLookup =
  | Map<string, LegacyCandidate | LegacyCandidateFailure | undefined>
  | Record<string, LegacyCandidate | LegacyCandidateFailure | undefined>;

const PLACEHOLDER_SOURCE_TITLES = new Set([
  "article",
  "wikipedia article",
  "wikipedia page",
]);

function allWikipediaReferences(
  destination: LegacyDestination,
): WikipediaSourceReference[] {
  const fieldSources = Object.values(destination.editorial?.fieldSources ?? {})
    .flat()
    .filter((reference): reference is WikipediaSourceReference =>
      Boolean(reference && reference.type === "wikipedia"),
    );
  return [
    ...(destination.editorial?.sources ?? []).filter(
      (reference) => reference.type === "wikipedia",
    ),
    ...fieldSources,
  ];
}

function normalizedTitle(value: string): string {
  return value
    .replace(/_/g, " ")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function sourceTitleMatchesUrl(reference: WikipediaSourceReference): boolean {
  if (
    !reference.title ||
    PLACEHOLDER_SOURCE_TITLES.has(normalizedTitle(reference.title))
  ) {
    return true;
  }
  const parsed = parseWikipediaUrl(reference.url);
  return Boolean(
    parsed &&
    normalizedTitle(reference.title) === normalizedTitle(parsed.title),
  );
}

function candidateFor(
  lookup: CandidateLookup,
  identity: string,
): LegacyCandidate | LegacyCandidateFailure | undefined {
  return lookup instanceof Map ? lookup.get(identity) : lookup[identity];
}

function review(
  reason: LegacyReviewReason,
  sourceUrls: string[],
  details?: string[],
): LegacyClassification {
  return {
    state: "review",
    reason,
    ...(details ? { details } : {}),
    sourceUrls,
  };
}

function transient(
  sourceUrls: string[],
  message?: string,
): LegacyClassification {
  return {
    state: "transient",
    reason: "transient-network-failure",
    ...(message ? { details: [message] } : {}),
    sourceUrls,
  };
}

function candidateMapping(candidate: LegacyCandidate): WikipediaMapping {
  return {
    language: candidate.language,
    title: candidate.title,
    url: candidate.url,
    ...(candidate.pageId !== undefined ? { pageId: candidate.pageId } : {}),
    ...(candidate.wikidataId ? { wikidataId: candidate.wikidataId } : {}),
  };
}

function candidateEntityTypeMismatch(
  destination: LegacyDestination,
  candidate: LegacyCandidate,
): string | undefined {
  const descriptor =
    `${candidate.description ?? ""} ${candidate.extract}`.trim();
  const kind = destination.kind ?? "";
  const stationKind = kind === "station";
  const municipalKind = new Set([
    "city",
    "ward",
    "town",
    "village",
    "district",
  ]).has(kind);

  if (
    !stationKind &&
    /^(?:railway|metro|subway|train)(?:\s+and\s+(?:railway|metro|subway|train))*\s+station\b/i.test(
      descriptor,
    )
  ) {
    return "entity-type-mismatch";
  }
  if (
    !municipalKind &&
    /^(?:city|ward|town|village|municipality|prefecture)\b/i.test(descriptor)
  ) {
    return "entity-type-mismatch";
  }
  return undefined;
}

export function classifyLegacyDestination(
  destination: LegacyDestination,
  candidates: CandidateLookup,
  sharedSourceIdentities: ReadonlySet<string> = new Set(),
): LegacyClassification {
  const rawReferences = allWikipediaReferences(destination);
  const sourceUrls = rawReferences
    .map((reference) => reference.url)
    .filter((url): url is string => Boolean(url));
  const validReferences = wikipediaProvenanceReferences(destination);

  if (rawReferences.length === 0 || validReferences.length === 0) {
    return review("invalid-provenance", sourceUrls);
  }
  if (rawReferences.some((reference) => !parseWikipediaUrl(reference.url))) {
    return review("invalid-provenance", sourceUrls);
  }
  if (validReferences.some((reference) => !sourceTitleMatchesUrl(reference))) {
    return review("provenance-title-mismatch", sourceUrls);
  }

  const sourceIdentities = new Set(
    validReferences
      .map((reference) => canonicalWikipediaIdentity(reference.url))
      .filter((identity): identity is string => Boolean(identity)),
  );
  if (sourceIdentities.size !== 1) {
    return review("conflicting-provenance", sourceUrls);
  }

  const sourceIdentity = [...sourceIdentities][0];
  if (sharedSourceIdentities.has(sourceIdentity)) {
    return review("shared-provenance-identity", sourceUrls);
  }

  const candidate = candidateFor(candidates, sourceIdentity);
  if (!candidate) {
    return review("missing-api-candidate", sourceUrls);
  }
  if ("status" in candidate) {
    return candidate.status === "transient"
      ? transient(sourceUrls, candidate.message)
      : review(
          "missing-api-candidate",
          sourceUrls,
          candidate.message ? [candidate.message] : undefined,
        );
  }

  const parsedCandidateUrl = parseWikipediaUrl(candidate.url);
  const candidateIdentity = canonicalWikipediaIdentity(candidate.url);
  const redirectedFromIdentity = candidate.redirectedFrom
    ? canonicalWikipediaIdentity(candidate.redirectedFrom)
    : undefined;
  if (
    !parsedCandidateUrl ||
    !candidateIdentity ||
    candidate.requestedIdentity !== sourceIdentity ||
    (candidateIdentity !== sourceIdentity &&
      redirectedFromIdentity !== sourceIdentity) ||
    parsedCandidateUrl.language !== candidate.language ||
    normalizedTitle(parsedCandidateUrl.title) !==
      normalizedTitle(candidate.title)
  ) {
    return review("candidate-identity-mismatch", sourceUrls);
  }
  const pageId = candidate.pageId;
  if (typeof pageId !== "number" || !Number.isInteger(pageId) || pageId <= 0) {
    return review("no-usable-identity", sourceUrls);
  }
  if (candidate.wikidataId && !/^Q\d+$/i.test(candidate.wikidataId)) {
    return review("no-usable-identity", sourceUrls);
  }
  if (!titleMatchesDestination(destination, candidate.title)) {
    return review("destination-title-mismatch", sourceUrls);
  }
  const entityMismatch = candidateEntityTypeMismatch(destination, candidate);
  if (entityMismatch) {
    return review("validator-rejected", sourceUrls, [entityMismatch]);
  }

  const validation = validateWikipediaCandidate(destination, candidate, {
    locale: candidate.language,
    mapping: candidateMapping(candidate),
  });
  if (!validation.accepted) {
    return review("validator-rejected", sourceUrls, validation.reasons);
  }

  return {
    state: "canonicalizable",
    reason: "validated-legacy-identity",
    identity: {
      wikipediaTitle: candidate.title,
      wikipediaLanguage: candidate.language,
      wikipediaUrl: candidate.url,
      wikipediaPageId: pageId,
      ...(candidate.wikidataId ? { wikidataId: candidate.wikidataId } : {}),
    },
    sourceUrls,
  };
}
