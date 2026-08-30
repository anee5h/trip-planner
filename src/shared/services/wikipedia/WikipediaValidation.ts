import type { DestinationKind } from "@/shared/types/destination";
import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
  parseWikipediaUrl,
  type WikipediaIdentitySource,
  type WikipediaLanguage,
  type WikipediaMapping,
} from "./WikipediaIdentity";

export {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
  parseWikipediaUrl,
};
export type { WikipediaLanguage, WikipediaMapping } from "./WikipediaIdentity";

/** The catalogue fields used by the resolver. Kept smaller than Destination so
 * validation tests and build-time audits do not need to manufacture a full
 * recommendation record. */
export interface WikipediaDestination extends WikipediaIdentitySource {
  id?: string;
  name: string;
  nameJa?: string;
  aliases?: string[];
  prefecture?: string;
  region?: string;
  kind?: DestinationKind;
  role?: "hub" | "poi" | "standalone";
  categories?: string[];
  tags?: string[];
  coordinates?: { lat: number; lng: number };
}

export interface WikipediaCandidate {
  language: WikipediaLanguage;
  title: string;
  extract: string;
  description?: string;
  type?: string;
  pageId?: number;
  wikidataId?: string;
  url?: string;
  coordinates?: { lat: number; lng: number };
  leadImage?: string;
}

export interface WikipediaValidationOptions {
  locale: WikipediaLanguage;
  /** A mapping is an explicit identity, not a search guess. */
  mapping?: WikipediaMapping;
  /** Number of search candidates that passed the cheap title pre-filter. */
  searchCandidateCount?: number;
}

export interface WikipediaValidationResult {
  accepted: boolean;
  confidence: "high" | "low" | "none";
  reasons: string[];
  titleMatched: boolean;
  distanceKm?: number;
}

const GENERIC_TOPIC_PATTERNS = [
  /\bdisambiguation\b/i,
  /\bmay refer to\b/i,
  /\blist of\b/i,
  /\bdictionary\b/i,
  /\bgrammar\b/i,
  /\bconjugat(?:e|ion|ing)\b/i,
  /\bmorpholog(?:y|ical)\b/i,
  /\blinguistic(?:s)?\b/i,
  /\b日本語(?:の)?\b/i,
  /\belement of .* language\b/i,
  /(?:活用|文法|言語学|語学|動詞|形容詞|助動詞|曖昧さ回避|辞書|辞典|一覧)/,
];

const PERSON_OR_NON_PLACE_PATTERNS = [
  /\bpolitician\b/i,
  /\bactor\b/i,
  /\bactress\b/i,
  /\bsinger\b/i,
  /\bmusician\b/i,
  /\bwriter\b/i,
  /\bnovelist\b/i,
  /\bcompany\b/i,
  /\bfootball(?:er| club)?\b/i,
  /\bbaseball(?:er| club)?\b/i,
];

const NON_PLACE_TITLE_QUALIFIER_PATTERNS = [
  /\b(?:film|movie|song|novel|album|tv series|television series|video game|video-game|book|comic|manga|anime|character|band)\b/i,
  /(?:曲|歌謡曲|映画|小説|アルバム|テレビ(?:ドラマ|シリーズ)|ビデオゲーム|ゲーム|漫画|アニメ|人物|作品)/,
];

const NON_PLACE_DESCRIPTION_PATTERNS = [
  /\b(?:film|movie|song|novel|album|tv series|television series|video game|video-game|book|comic|manga|anime|character|band)\b/i,
  /\b(?:politician|actor|actress|singer|musician|writer|novelist|company|football(?:er| club)?|baseball(?:er| club)?)\b/i,
  /(?:楽曲|映画|小説|アルバム|テレビドラマ|テレビシリーズ|ゲーム|漫画|アニメ|政治家|俳優|歌手|作家|企業)/,
];

const PLACE_KINDS = new Set([
  "city",
  "ward",
  "town",
  "village",
  "district",
  "castle",
  "palace",
  "temple",
  "shrine",
  "museum",
  "park",
  "garden",
  "mountain",
  "lake",
  "waterfall",
  "island",
  "beach",
  "market",
  "street",
  "viewpoint",
  "tower",
  "bridge",
  "station",
  "onsen",
  "zoo",
  "aquarium",
  "nature",
  "historic_town",
  "historic",
  "natural",
  "mixed",
  "theme_park",
  "memorial",
  "monument",
  "cruise",
  "cliff",
  "rock_formation",
  "amusement_park",
  "cape",
  "observation",
  "cultural",
]);

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function withoutPlaceSuffix(value: string): string {
  return value
    .replace(
      /(?:\s|,|_|-)+(?:city|town|village|ward|prefecture|municipality)$/i,
      "",
    )
    .trim();
}

function titleCore(value: string): string {
  return value
    .replace(/\s*[（(][^（）()]*[）)]\s*$/, "")
    .split(",", 1)[0]
    .replace(/_/g, " ")
    .trim();
}

function titleQualifier(value: string): string | undefined {
  return value.match(/\s*[（(]([^（）()]*)[）)]\s*$/)?.[1]?.trim();
}

function normalizedTitle(value: string): string {
  return normalized(value.replace(/_/g, " "));
}

function exactTitleMatch(first: string, second: string): boolean {
  return normalizedTitle(first) === normalizedTitle(second);
}

function titleCoreMatchesDestination(
  destination: WikipediaDestination,
  title: string,
): boolean {
  const names = [
    destination.name,
    destination.nameJa,
    ...(destination.aliases ?? []),
  ].filter((name): name is string => Boolean(name));
  return names.some((name) => {
    const nameForms = [name, withoutPlaceSuffix(name), titleCore(name)];
    const titleForms = [title, withoutPlaceSuffix(title), titleCore(title)];
    return nameForms.some((nameForm) =>
      titleForms.some((titleForm) => exactTitleMatch(nameForm, titleForm)),
    );
  });
}

function hasNonPlaceTitleQualifier(title: string): boolean {
  const qualifier = titleQualifier(title);
  return Boolean(
    qualifier &&
    NON_PLACE_TITLE_QUALIFIER_PATTERNS.some((pattern) =>
      pattern.test(qualifier),
    ),
  );
}

/** Exact identity comparison with only punctuation and well-defined municipal
 * suffix normalization. This deliberately does not use fuzzy edit distance or
 * partial-token overlap. */
export function titleMatchesDestination(
  destination: WikipediaDestination,
  title: string,
): boolean {
  if (!titleCoreMatchesDestination(destination, title)) return false;
  return !hasNonPlaceTitleQualifier(title);
}

function coordinateIsValid(point?: { lat: number; lng: number }): boolean {
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

export function distanceBetweenCoordinatesKm(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
): number {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(second.lat - first.lat);
  const dLng = radians(second.lng - first.lng);
  const lat1 = radians(first.lat);
  const lat2 = radians(second.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function distanceLimitKm(destination: WikipediaDestination): number {
  const labels = [
    destination.kind,
    ...(destination.categories ?? []),
    ...(destination.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  // A ferry/river crossing can be associated with two terminals, so its
  // geography envelope is broader than a precise point-of-interest but much
  // tighter than a regional or island-wide record.
  if (/ferry|crossing|river|boat|port|harbor|harbour/.test(labels)) return 80;
  if (
    destination.kind === "island" ||
    destination.kind === "mountain" ||
    destination.kind === "natural" ||
    destination.kind === "nature" ||
    /region|peninsula|island|mountain range/.test(labels)
  ) {
    return 350;
  }
  if (
    destination.kind === "city" ||
    destination.kind === "ward" ||
    destination.kind === "town" ||
    destination.kind === "village" ||
    destination.kind === "district" ||
    destination.role === "hub"
  ) {
    return 200;
  }
  return 100;
}

function leadSentence(extract: string): string {
  return extract.split(/(?<=[.!?。！？])\s+/u, 1)[0] ?? extract;
}

function semanticMismatch(
  destination: WikipediaDestination,
  candidate: WikipediaCandidate,
  explicitMapping: boolean,
): string | undefined {
  const titleDescription = `${candidate.title} ${candidate.description ?? ""}`;
  const lead = leadSentence(candidate.extract);

  if (
    GENERIC_TOPIC_PATTERNS.some((pattern) => pattern.test(titleDescription))
  ) {
    return "generic-topic";
  }
  // The extract is only used for strong generic/disambiguation evidence. Do not
  // classify entity type from incidental words in later paragraphs.
  if (/\b(?:may refer to|disambiguation page|is a list of)\b/i.test(lead)) {
    return "generic-topic";
  }

  const titleIsDestination = titleCoreMatchesDestination(
    destination,
    candidate.title,
  );
  if (
    !explicitMapping &&
    titleIsDestination &&
    hasNonPlaceTitleQualifier(candidate.title)
  ) {
    return "non-place-title";
  }
  if (
    !explicitMapping &&
    NON_PLACE_DESCRIPTION_PATTERNS.some((pattern) =>
      pattern.test(candidate.description ?? ""),
    )
  ) {
    return "entity-type-mismatch";
  }

  const normalizedCategories = (destination.categories ?? []).map((label) =>
    label.toLocaleLowerCase().trim(),
  );
  // Categories are broad editorial facets (for example, a tower may sit in a
  // port district). Keep the Port category guarded, but distinguish a broad
  // contextual facet from an entity-specific transport label below.
  const waterTransportLabelPattern =
    /^(?:ferry|crossing|river|river crossing|boat|harbor|harbour|port)$/i;
  const waterTransportLabels = [
    destination.kind,
    ...(destination.tags ?? []).filter((label) =>
      waterTransportLabelPattern.test(label.trim()),
    ),
    ...(destination.categories ?? []).filter((label) =>
      waterTransportLabelPattern.test(label.trim()),
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const requiresTempleOrShrineSignal =
    destination.kind === "temple" ||
    destination.kind === "shrine" ||
    normalizedCategories.some((label) =>
      ["temple", "shrine", "buddhist temple", "shinto shrine"].includes(label),
    );
  const requiresCitySignal = ["city", "ward", "town", "village"].includes(
    destination.kind ?? "",
  );
  const isPlace = Boolean(
    destination.kind && PLACE_KINDS.has(destination.kind),
  );
  if (
    !explicitMapping &&
    isPlace &&
    PERSON_OR_NON_PLACE_PATTERNS.some((pattern) =>
      pattern.test(titleDescription),
    )
  ) {
    return "entity-type-mismatch";
  }

  // Prefer the title and description, using only the lead sentence as a
  // bounded fallback when REST does not provide a description.
  const entitySignals = `${titleDescription} ${lead}`;
  const hasMatchingNonTransportSignal =
    normalizedCategories.some((label) =>
      ["observation deck", "landmark", "modern"].includes(label),
    ) && /tower|skyscraper|building|landmark|observation/i.test(entitySignals);
  if (requiresTempleOrShrineSignal) {
    if (
      !/temple|shrine|buddhist|shinto|monastery|sanctuary|寺|神社|寺院|仏教|神道/i.test(
        entitySignals,
      )
    ) {
      return "entity-type-mismatch";
    }
  }
  if (
    /ferry|crossing|river|boat|port|harbor|harbour/.test(waterTransportLabels)
  ) {
    if (
      !/ferry|boat|river|crossing|port|harbor|harbour|waterway|transport|渡し|渡船|船|河川|川|港|水路|運航/i.test(
        entitySignals,
      ) &&
      !hasMatchingNonTransportSignal
    ) {
      return "entity-type-mismatch";
    }
  }
  if (requiresCitySignal) {
    if (
      !/city|ward|town|village|municipality|prefecture|district|市|区|町|村|自治体|都道府県|地区/i.test(
        entitySignals,
      )
    ) {
      return "entity-type-mismatch";
    }
  }
  return undefined;
}

function mappingMatches(
  mapping: WikipediaMapping,
  candidate: WikipediaCandidate,
): boolean {
  if (mapping.language !== candidate.language) return false;

  const hasStrongIdentity =
    mapping.pageId !== undefined ||
    mapping.wikidataId !== undefined ||
    Boolean(mapping.url);
  if (mapping.pageId !== undefined && mapping.pageId !== candidate.pageId) {
    return false;
  }
  if (
    mapping.wikidataId !== undefined &&
    mapping.wikidataId !== candidate.wikidataId
  ) {
    return false;
  }
  if (mapping.url) {
    const expectedUrl = canonicalWikipediaIdentity(mapping.url);
    const actualUrl = canonicalWikipediaIdentity(candidate.url);
    if (!expectedUrl || expectedUrl !== actualUrl) return false;
  }

  // Numeric identity or canonical URL is stronger than a stale title. A title
  // check is only used when no stronger identity is available.
  if (hasStrongIdentity) return true;
  return Boolean(
    mapping.title && exactTitleMatch(mapping.title, candidate.title),
  );
}

export function validateWikipediaCandidate(
  destination: WikipediaDestination,
  candidate: WikipediaCandidate,
  options: WikipediaValidationOptions,
): WikipediaValidationResult {
  const reasons: string[] = [];
  const titleMatched = titleMatchesDestination(destination, candidate.title);

  if (candidate.language !== options.locale) reasons.push("language-mismatch");
  if (!candidate.extract || candidate.extract.trim().length < 30) {
    reasons.push("missing-extract");
  }
  if (candidate.type === "disambiguation") reasons.push("disambiguation");
  const explicitMapping = Boolean(options.mapping);
  const semanticReason = semanticMismatch(
    destination,
    candidate,
    explicitMapping,
  );
  if (semanticReason) reasons.push(semanticReason);

  if (explicitMapping) {
    if (!mappingMatches(options.mapping!, candidate)) {
      reasons.push("mapping-identity-mismatch");
    }
  } else if (!titleMatched) {
    reasons.push("title-mismatch");
  }
  if (
    !explicitMapping &&
    options.searchCandidateCount !== undefined &&
    options.searchCandidateCount > 1
  ) {
    reasons.push("ambiguous-search");
  }

  let distanceKm: number | undefined;
  if (
    coordinateIsValid(destination.coordinates) &&
    coordinateIsValid(candidate.coordinates)
  ) {
    distanceKm = distanceBetweenCoordinatesKm(
      destination.coordinates!,
      candidate.coordinates!,
    );
    if (distanceKm > distanceLimitKm(destination)) {
      reasons.push("geographic-mismatch");
    }
  }

  return {
    accepted: reasons.length === 0,
    confidence:
      reasons.length > 0
        ? "none"
        : explicitMapping || titleMatched
          ? "high"
          : "low",
    reasons,
    titleMatched,
    ...(distanceKm === undefined ? {} : { distanceKm }),
  };
}
