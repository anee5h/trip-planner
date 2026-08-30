import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
  type WikipediaLanguage,
  type WikipediaMapping,
} from "../../src/shared/services/wikipedia/WikipediaIdentity";
import {
  distanceBetweenCoordinatesKm,
  titleMatchesDestination,
  validateWikipediaCandidate,
  type WikipediaCandidate,
  type WikipediaDestination,
} from "../../src/shared/services/wikipedia/WikipediaValidation";
import { createHash } from "node:crypto";

export interface UnmappedDestination extends WikipediaDestination {
  id: string;
  status?: string;
  editorial?: WikipediaDestination["editorial"];
}

export interface UnmappedCandidate extends WikipediaCandidate {
  language: WikipediaLanguage;
  title: string;
  url: string;
  extract: string;
  pageId?: number;
  wikidataId?: string;
  source: "direct-title" | "search";
  searchQuery?: string;
}

export interface UnmappedDiscovery {
  candidates: UnmappedCandidate[];
  transientFailure?: string;
  parentOnlyEvidence?: string[];
  noArticleEvidence?: string[];
}

export interface CanonicalUnmappedIdentity {
  wikipediaTitle: string;
  wikipediaLanguage: WikipediaLanguage;
  wikipediaUrl: string;
  wikipediaPageId: number;
  wikidataId?: string;
}

export type UnmappedReason =
  | "validated-high-confidence"
  | "multiple-title-candidates"
  | "same-name-geographic-conflict"
  | "parent-landmark-only"
  | "entity-type-mismatch"
  | "coordinate-mismatch"
  | "coordinate-unavailable"
  | "no-page-found"
  | "insufficient-evidence"
  | "language-identity-conflict"
  | "transient-network-failure"
  | "disambiguation"
  | "no-usable-identity"
  | "no-article-evidence";

export interface UnmappedCandidateEvidence {
  language: WikipediaLanguage;
  title: string;
  url: string;
  pageId?: number;
  wikidataId?: string;
  source: UnmappedCandidate["source"];
  validationReasons: string[];
  matchSignals: string[];
  entityTypeResult: "compatible" | "incompatible";
  geographyResult:
    | "coordinates-compatible"
    | "coordinates-mismatch"
    | "coordinates-unavailable"
    | "not-evaluated";
  distanceKm?: number;
  sharesVerifiedWikidataIdentity: boolean;
}

export interface UnmappedClassification {
  state:
    | "high-confidence-candidate"
    | "ambiguous-candidate"
    | "no-article-expected"
    | "unresolved";
  reason: UnmappedReason;
  identity?: CanonicalUnmappedIdentity;
  candidate?: UnmappedCandidateEvidence;
  candidates: UnmappedCandidateEvidence[];
  matchSignals: string[];
  entityTypeResult: "compatible" | "incompatible" | "not-evaluated";
  geographyResult:
    | "coordinates-compatible"
    | "coordinates-mismatch"
    | "coordinates-unavailable"
    | "not-evaluated";
  ambiguityResult:
    | "no-competing-plausible-candidate"
    | "competing-candidates"
    | "parent-only"
    | "not-evaluated";
  details?: string[];
}

const MUNICIPAL_KINDS = new Set([
  "city",
  "ward",
  "town",
  "village",
  "district",
]);
const STATION_PATTERN =
  /^(?:railway|metro|subway|train)(?:\s+and\s+(?:railway|metro|subway|train))*\s+station\b/i;
const MUNICIPAL_PATTERN =
  /^(?:city|ward|town|village|municipality|prefecture|district)\b/i;
const TRANSPORT_PATTERN =
  /\b(?:ferry|boat|river|crossing|port|harbor|harbour|waterway|terminal)\b/i;
const STATION_SIGNAL =
  /\b(?:station|railway|metro|subway|train)\b|駅|鉄道|地下鉄/i;
const MUNICIPAL_SIGNAL =
  /\b(?:city|ward|town|village|municipality|prefecture|district)\b|市|区|町|村|自治体|都道府県|地区/i;

function normalized(value: string): string {
  return value
    .replace(/_/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function titleCore(value: string): string {
  return value
    .replace(/\s*[（(][^（）()]*[）)]\s*$/, "")
    .replace(/_/g, " ")
    .split(",", 1)[0]
    .trim();
}

function matchesName(destination: UnmappedDestination, title: string): boolean {
  const titleForms = [title, titleCore(title)].map(normalized);
  const canonicalNames = [
    destination.name,
    destination.nameJa,
    ...(destination.aliases ?? []),
  ]
    .filter((name): name is string => Boolean(name))
    .flatMap((name) => [name, titleCore(name)])
    .map(normalized);
  return titleForms.some((form) => canonicalNames.includes(form));
}

function matchSignals(
  destination: UnmappedDestination,
  title: string,
): string[] {
  const titleForms = [title, titleCore(title)].map(normalized);
  const canonicalNames = [destination.name, destination.nameJa]
    .filter((name): name is string => Boolean(name))
    .flatMap((name) => [name, titleCore(name)])
    .map(normalized);
  const aliases = (destination.aliases ?? [])
    .flatMap((name) => [name, titleCore(name)])
    .map(normalized);
  const signals: string[] = [];
  if (titleForms.some((form) => canonicalNames.includes(form))) {
    signals.push("canonical-name");
  }
  if (titleForms.some((form) => aliases.includes(form))) {
    signals.push("approved-alias");
  }
  if (
    normalized(title) !== normalized(titleCore(title)) &&
    titleForms.some((form) => form === normalized(titleCore(title)))
  ) {
    signals.push("geographic-parenthetical-normalization");
  }
  return signals;
}

function hasValidCoordinates(point?: { lat: number; lng: number }): boolean {
  return Boolean(
    point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180,
  );
}

function entityTypeMismatch(
  destination: UnmappedDestination,
  candidate: UnmappedCandidate,
): string | undefined {
  const descriptor =
    `${candidate.description ?? ""} ${candidate.extract}`.trim();
  const kind = destination.kind ?? "";
  const labels = [
    kind,
    ...(destination.categories ?? []),
    ...(destination.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  if (kind !== "station" && STATION_PATTERN.test(descriptor)) {
    return "entity-type-mismatch";
  }
  if (kind === "station" && !STATION_SIGNAL.test(descriptor)) {
    return "entity-type-mismatch";
  }
  if (MUNICIPAL_KINDS.has(kind) && !MUNICIPAL_SIGNAL.test(descriptor)) {
    return "entity-type-mismatch";
  }
  if (!MUNICIPAL_KINDS.has(kind) && MUNICIPAL_PATTERN.test(descriptor)) {
    return "entity-type-mismatch";
  }
  if (
    /\b(?:port|harbor|harbour)\b/.test(labels) &&
    !TRANSPORT_PATTERN.test(descriptor)
  ) {
    return "entity-type-mismatch";
  }
  return undefined;
}

function identityKey(candidate: UnmappedCandidate): string {
  if (candidate.pageId !== undefined) {
    return `${candidate.language}:page:${candidate.pageId}`;
  }
  return `${candidate.language}:url:${canonicalWikipediaIdentity(candidate.url) ?? candidate.url}`;
}

function allCandidatesShareWikidataIdentity(
  candidates: UnmappedCandidate[],
): boolean {
  if (candidates.length < 2) return false;

  const qids = candidates.map((candidate) =>
    candidate.wikidataId?.toLocaleUpperCase(),
  );

  return (
    qids.every((qid): qid is string => Boolean(qid)) && new Set(qids).size === 1
  );
}

function evidenceFor(
  destination: UnmappedDestination,
  candidate: UnmappedCandidate,
  exactCandidateCount: number,
): UnmappedCandidateEvidence {
  const validation = validateWikipediaCandidate(destination, candidate, {
    locale: candidate.language,
    searchCandidateCount: exactCandidateCount,
  });
  const reasons = [...validation.reasons];
  const entityMismatch = entityTypeMismatch(destination, candidate);
  if (entityMismatch && !reasons.includes(entityMismatch))
    reasons.push(entityMismatch);

  let geographyResult: UnmappedCandidateEvidence["geographyResult"] =
    "not-evaluated";
  if (hasValidCoordinates(destination.coordinates)) {
    if (!hasValidCoordinates(candidate.coordinates)) {
      geographyResult = "coordinates-unavailable";
      reasons.push("coordinate-unavailable");
    } else {
      geographyResult = reasons.includes("geographic-mismatch")
        ? "coordinates-mismatch"
        : "coordinates-compatible";
    }
  }

  return {
    language: candidate.language,
    title: candidate.title,
    url: candidate.url,
    pageId: candidate.pageId,
    wikidataId: candidate.wikidataId,
    source: candidate.source,
    validationReasons: Array.from(new Set(reasons)).sort(),
    matchSignals: matchSignals(destination, candidate.title),
    entityTypeResult: entityMismatch ? "incompatible" : "compatible",
    geographyResult,
    sharesVerifiedWikidataIdentity: false,
    ...(validation.distanceKm === undefined
      ? {}
      : { distanceKm: validation.distanceKm }),
  };
}

function reasonForEvidence(
  evidence: UnmappedCandidateEvidence,
): UnmappedReason {
  if (evidence.validationReasons.includes("entity-type-mismatch")) {
    return "entity-type-mismatch";
  }
  if (evidence.geographyResult === "coordinates-mismatch") {
    return "coordinate-mismatch";
  }
  if (evidence.geographyResult === "coordinates-unavailable") {
    return "coordinate-unavailable";
  }
  if (evidence.validationReasons.includes("disambiguation")) {
    return "disambiguation";
  }
  if (evidence.validationReasons.includes("no-usable-identity")) {
    return "no-usable-identity";
  }
  return "insufficient-evidence";
}

function canonicalIdentity(
  candidate: UnmappedCandidate,
): CanonicalUnmappedIdentity | undefined {
  if (
    typeof candidate.pageId !== "number" ||
    !Number.isInteger(candidate.pageId) ||
    candidate.pageId <= 0 ||
    !candidate.url
  ) {
    return undefined;
  }
  if (candidate.wikidataId && !/^Q\d+$/i.test(candidate.wikidataId)) {
    return undefined;
  }
  return {
    wikipediaTitle: candidate.title,
    wikipediaLanguage: candidate.language,
    wikipediaUrl: candidate.url,
    wikipediaPageId: candidate.pageId,
    ...(candidate.wikidataId ? { wikidataId: candidate.wikidataId } : {}),
  };
}

function baseResult(
  state: UnmappedClassification["state"],
  reason: UnmappedReason,
  candidates: UnmappedCandidateEvidence[],
): UnmappedClassification {
  return {
    state,
    reason,
    candidates,
    matchSignals: [],
    entityTypeResult: "not-evaluated",
    geographyResult: "not-evaluated",
    ambiguityResult: "not-evaluated",
  };
}

export function classifyUnmappedDestination(
  destination: UnmappedDestination,
  discovery: UnmappedDiscovery,
): UnmappedClassification {
  if (discovery.transientFailure) {
    return {
      ...baseResult("unresolved", "transient-network-failure", []),
      details: [discovery.transientFailure],
    };
  }

  const exactCandidates = discovery.candidates.filter(
    (candidate) =>
      Boolean(candidate.url) &&
      titleMatchesDestination(destination, candidate.title) &&
      matchesName(destination, candidate.title),
  );
  const uniqueCandidates = Array.from(
    new Map(
      exactCandidates.map((candidate) => [identityKey(candidate), candidate]),
    ).values(),
  ).sort((first, second) =>
    `${first.language}:${first.title}:${first.pageId ?? 0}`.localeCompare(
      `${second.language}:${second.title}:${second.pageId ?? 0}`,
    ),
  );
  const sameLinkedIdentity =
    uniqueCandidates.length > 1 &&
    allCandidatesShareWikidataIdentity(uniqueCandidates);
  let candidatesForEvaluation = uniqueCandidates;
  if (sameLinkedIdentity) {
    candidatesForEvaluation = [
      [...uniqueCandidates].sort((first, second) =>
        `${first.language === "en" ? 0 : 1}:${first.source === "direct-title" ? 0 : 1}:${first.title}`.localeCompare(
          `${second.language === "en" ? 0 : 1}:${second.source === "direct-title" ? 0 : 1}:${second.title}`,
        ),
      )[0],
    ];
  }
  const evidence = uniqueCandidates.map((candidate) => ({
    ...evidenceFor(
      destination,
      candidate,
      sameLinkedIdentity
        ? candidatesForEvaluation.length
        : uniqueCandidates.length,
    ),
    sharesVerifiedWikidataIdentity: sameLinkedIdentity,
  }));

  if (uniqueCandidates.length === 0) {
    if (discovery.parentOnlyEvidence?.length) {
      return {
        ...baseResult("ambiguous-candidate", "parent-landmark-only", evidence),
        ambiguityResult: "parent-only",
        details: discovery.parentOnlyEvidence,
      };
    }
    if (discovery.noArticleEvidence?.length) {
      return {
        ...baseResult("no-article-expected", "no-article-evidence", evidence),
        details: discovery.noArticleEvidence,
      };
    }
    return {
      ...baseResult("unresolved", "no-page-found", evidence),
      details: [
        "No exact canonical-name or approved-alias candidate was discovered.",
      ],
    };
  }

  if (uniqueCandidates.length > 1) {
    if (candidatesForEvaluation.length === 1) {
      // EN/JA pages with one shared Wikidata identity are one entity, not a
      // competing-title ambiguity. The preferred language is selected above.
    } else {
      const languages = new Set(
        uniqueCandidates.map((candidate) => candidate.language),
      );
      const sameLinkedIdentity =
        allCandidatesShareWikidataIdentity(uniqueCandidates);
      if (!sameLinkedIdentity) {
        const reason: UnmappedReason =
          languages.size > 1 &&
          uniqueCandidates.every((candidate) => Boolean(candidate.wikidataId))
            ? "language-identity-conflict"
            : uniqueCandidates.every((candidate) =>
                  Boolean(candidate.coordinates),
                )
              ? "same-name-geographic-conflict"
              : "multiple-title-candidates";
        return {
          ...baseResult("ambiguous-candidate", reason, evidence),
          ambiguityResult: "competing-candidates",
          details: [
            "More than one distinct exact or approved-alias Wikipedia identity was discovered.",
          ],
        };
      }
    }
  }

  const chosen = candidatesForEvaluation[0];
  const chosenEvidence = evidence[uniqueCandidates.indexOf(chosen)];
  const identity = canonicalIdentity(chosen);
  const accepted =
    identity !== undefined &&
    chosenEvidence.validationReasons.length === 0 &&
    chosenEvidence.matchSignals.length > 0 &&
    chosenEvidence.entityTypeResult === "compatible" &&
    (chosenEvidence.geographyResult === "coordinates-compatible" ||
      chosenEvidence.geographyResult === "not-evaluated");

  if (!accepted) {
    return {
      ...baseResult("unresolved", reasonForEvidence(chosenEvidence), evidence),
      candidate: chosenEvidence,
      matchSignals: chosenEvidence.matchSignals,
      entityTypeResult: chosenEvidence.entityTypeResult,
      geographyResult: chosenEvidence.geographyResult,
      ambiguityResult: "no-competing-plausible-candidate",
    };
  }

  return {
    state: "high-confidence-candidate",
    reason: "validated-high-confidence",
    identity,
    candidate: chosenEvidence,
    candidates: evidence,
    matchSignals: chosenEvidence.matchSignals,
    entityTypeResult: chosenEvidence.entityTypeResult,
    geographyResult: chosenEvidence.geographyResult,
    ambiguityResult: "no-competing-plausible-candidate",
  };
}

function sameIdentity(
  destination: UnmappedDestination,
  identity: CanonicalUnmappedIdentity,
): boolean {
  const mapping = extractWikipediaMapping(destination);
  if (!mapping) return false;
  return (
    mapping.language === identity.wikipediaLanguage &&
    mapping.title === identity.wikipediaTitle &&
    mapping.url === identity.wikipediaUrl &&
    mapping.pageId === identity.wikipediaPageId &&
    mapping.wikidataId === identity.wikidataId
  );
}

export function applyUnmappedIdentity(
  destination: UnmappedDestination,
  identity: CanonicalUnmappedIdentity,
): boolean {
  const existing = extractWikipediaMapping(destination);
  if (existing) {
    if (sameIdentity(destination, identity)) return false;
    throw new Error(
      `${destination.id}: refusing to overwrite an existing Wikipedia identity`,
    );
  }

  destination.wikipediaTitle = identity.wikipediaTitle;
  destination.wikipediaLanguage = identity.wikipediaLanguage;
  destination.wikipediaUrl = identity.wikipediaUrl;
  destination.wikipediaPageId = identity.wikipediaPageId;
  if (identity.wikidataId) destination.wikidataId = identity.wikidataId;
  return true;
}

export function candidateDistanceKm(
  destination: UnmappedDestination,
  candidate: UnmappedCandidate,
): number | undefined {
  return hasValidCoordinates(destination.coordinates) &&
    hasValidCoordinates(candidate.coordinates)
    ? distanceBetweenCoordinatesKm(
        destination.coordinates!,
        candidate.coordinates!,
      )
    : undefined;
}

export function unmappedInputProjection(
  destination: UnmappedDestination,
): Record<string, unknown> {
  return {
    id: destination.id,
    name: destination.name,
    nameJa: destination.nameJa,
    aliases: destination.aliases,
    prefecture: destination.prefecture,
    region: destination.region,
    kind: destination.kind,
    role: destination.role,
    categories: destination.categories,
    tags: destination.tags,
    coordinates: destination.coordinates,
    municipalityId: (
      destination as UnmappedDestination & { municipalityId?: string }
    ).municipalityId,
    placeType: (destination as UnmappedDestination & { placeType?: string })
      .placeType,
    relationships: (
      destination as UnmappedDestination & { relationships?: unknown }
    ).relationships,
  };
}

export function unmappedInputFingerprint(
  destination: UnmappedDestination,
): string {
  return createHash("sha256")
    .update(JSON.stringify(unmappedInputProjection(destination)))
    .digest("hex");
}

export type { WikipediaMapping };
