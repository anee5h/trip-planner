import {
  canonicalWikipediaIdentity,
  extractWikipediaMapping,
  parseWikipediaUrl,
  type WikipediaLanguage,
} from "../../src/shared/services/wikipedia/WikipediaIdentity";
import {
  distanceBetweenCoordinatesKm,
  titleMatchesDestination,
  type WikipediaDestination,
} from "../../src/shared/services/wikipedia/WikipediaValidation";
import { createHash } from "node:crypto";

export type Phase3State =
  | "canonicalized"
  | "high-confidence-awaiting-apply"
  | "ambiguous-candidate"
  | "no-standalone-article-expected"
  | "unresolved";

export type Phase3Source =
  "phase2" | "wikipedia-redirect" | "wikidata-search" | "wikidata-sitelink";

export interface Phase3Destination extends WikipediaDestination {
  id: string;
  status?: string;
  municipalityId?: string | null;
  placeType?: string | null;
  relationships?: Record<string, unknown>;
  editorial?: WikipediaDestination["editorial"];
}

export interface Phase3Page {
  language: WikipediaLanguage;
  title: string;
  url: string;
  pageId?: number;
  wikidataId?: string;
  extract: string;
  description?: string;
  type?: string;
  coordinates?: { lat: number; lng: number };
}

export interface Phase3Claim {
  id: string;
  label?: string;
}

export interface Phase3Sitelink {
  title: string;
  url?: string;
}

export interface Phase3WikidataEntity {
  qid: string;
  labels: Partial<Record<WikipediaLanguage, string>>;
  aliases: Partial<Record<WikipediaLanguage, string[]>>;
  descriptions: Partial<Record<WikipediaLanguage, string>>;
  p31: Phase3Claim[];
  p279: Phase3Claim[];
  p131: Phase3Claim[];
  p17: Phase3Claim[];
  coordinates?: { lat: number; lng: number };
  sitelinks: Partial<Record<WikipediaLanguage, Phase3Sitelink>>;
}

/** A page-level candidate is intentionally not collapsed by QID. */
export interface Phase3Candidate {
  page: Phase3Page;
  qid?: string;
  sources: Phase3Source[];
  queries: string[];
  redirectFromTitles?: string[];
  entity?: Phase3WikidataEntity;
}

export interface Phase2EvidenceSnapshot {
  state: string;
  reason: string;
  searches: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  apiCandidates?: Array<Record<string, unknown>>;
  details?: string[];
  reportRecord?: Record<string, unknown>;
  cacheEntry?: Record<string, unknown>;
}

export interface Phase3RedirectEvidence {
  language: WikipediaLanguage;
  fromTitle: string;
  toTitle: string;
  url?: string;
}

export interface Phase3WikidataSearchResult {
  qid: string;
  label?: string;
  description?: string;
  language: string;
  rank: number;
}

export interface Phase3WikidataSearchEvidence {
  language: string;
  query: string;
  results: Phase3WikidataSearchResult[];
}

export interface Phase3Discovery {
  phase2?: Phase2EvidenceSnapshot;
  candidates: Phase3Candidate[];
  redirects: Phase3RedirectEvidence[];
  wikidataSearches: Phase3WikidataSearchEvidence[];
  noStandaloneArticleEvidence?: string[];
  transientFailure?: string;
}

export interface Phase3CandidateEvidence {
  language: WikipediaLanguage;
  title: string;
  url: string;
  pageId?: number;
  qid?: string;
  sources: Phase3Source[];
  queries: string[];
  redirectFromTitles: string[];
  labels: Partial<Record<WikipediaLanguage, string>>;
  aliases: Partial<Record<WikipediaLanguage, string[]>>;
  descriptions: Partial<Record<WikipediaLanguage, string>>;
  p31: Phase3Claim[];
  p279: Phase3Claim[];
  p131: Phase3Claim[];
  p17: Phase3Claim[];
  coordinates?: { lat: number; lng: number };
  sitelinks: Partial<Record<WikipediaLanguage, Phase3Sitelink>>;
  identitySignals: string[];
  wikipediaAgreement: boolean;
  entityTypeResult: "compatible" | "incompatible" | "insufficient-evidence";
  entityTypeBasis: string[];
  geographyResult:
    | "coordinates-compatible"
    | "administrative-location-compatible"
    | "mismatch"
    | "insufficient-evidence";
  geographyBasis: string[];
  distanceKm?: number;
  rejectionReasons: string[];
  sharesVerifiedWikidataIdentity: boolean;
}

export interface Phase3Identity {
  wikipediaTitle: string;
  wikipediaLanguage: WikipediaLanguage;
  wikipediaUrl: string;
  wikipediaPageId: number;
  wikidataId: string;
}

export interface Phase3Classification {
  state: Exclude<Phase3State, "canonicalized">;
  reason:
    | "validated-high-confidence"
    | "multiple-qid-candidates"
    | "language-identity-conflict"
    | "parent-child-ambiguity"
    | "no-standalone-evidence"
    | "redirect-evidence-only"
    | "entity-type-mismatch"
    | "entity-type-insufficient"
    | "geography-mismatch"
    | "geography-insufficient"
    | "no-candidate"
    | "no-usable-identity"
    | "transient-network-failure"
    | "wikipedia-wikidata-disagreement"
    | "wikidata-sitelink-only"
    | "disambiguation-page";
  identity?: Phase3Identity;
  candidate?: Phase3CandidateEvidence;
  candidates: Phase3CandidateEvidence[];
  details?: string[];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function phase3InputFingerprint(destination: Phase3Destination): string {
  const relevant = {
    id: destination.id,
    name: destination.name,
    nameJa: destination.nameJa,
    aliases: destination.aliases,
    kind: destination.kind,
    role: destination.role,
    prefecture: destination.prefecture,
    region: destination.region,
    coordinates: destination.coordinates,
    categories: destination.categories,
    tags: destination.tags,
    municipalityId: destination.municipalityId,
    placeType: destination.placeType,
    relationships: destination.relationships,
    status: destination.status,
  };
  return createHash("sha256")
    .update(JSON.stringify(stableValue(relevant)))
    .digest("hex");
}

export function hashStable(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function allCandidatesShareWikidataIdentity(
  candidates: Phase3Candidate[],
): boolean {
  if (candidates.length < 2) return false;

  const qids = candidates.map((candidate) =>
    candidate.qid?.toLocaleUpperCase(),
  );

  return (
    qids.every((qid): qid is string => Boolean(qid && /^Q\d+$/i.test(qid))) &&
    new Set(qids).size === 1
  );
}

function validWikidataId(value?: string): value is string {
  return Boolean(value && /^Q\d+$/i.test(value.trim()));
}

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

function nameForms(destination: Phase3Destination): string[] {
  return [destination.name, destination.nameJa, ...(destination.aliases ?? [])]
    .filter((name): name is string => Boolean(name))
    .flatMap((name) => [name, titleCore(name)])
    .map(normalized);
}

function pageTitleMatchesName(
  destination: Phase3Destination,
  title: string,
): boolean {
  const forms = [title, titleCore(title)].map(normalized);
  return forms.some((form) => nameForms(destination).includes(form));
}

function entityLabelMatchesName(
  destination: Phase3Destination,
  entity: Phase3WikidataEntity | undefined,
): boolean {
  if (!entity) return false;
  const forms = [
    ...Object.values(entity.labels),
    ...Object.values(entity.aliases).flat(),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalized);
  return forms.some((form) => nameForms(destination).includes(form));
}

function identitySignals(
  destination: Phase3Destination,
  candidate: Phase3Candidate,
): string[] {
  const signals: string[] = [];
  if (titleMatchesDestination(destination, candidate.page.title)) {
    signals.push("wikipedia-title-match");
  }
  if (pageTitleMatchesName(destination, candidate.page.title)) {
    signals.push(
      nameForms(destination).includes(normalized(candidate.page.title))
        ? "canonical-name-or-approved-alias"
        : "geographic-parenthetical-normalization",
    );
  }
  if (
    candidate.redirectFromTitles?.some((title) =>
      pageTitleMatchesName(destination, title),
    )
  ) {
    signals.push("wikipedia-redirect");
  }
  if (entityLabelMatchesName(destination, candidate.entity)) {
    signals.push("wikidata-label-or-alias");
  }
  return Array.from(new Set(signals)).sort();
}

function claimBasis(entity: Phase3WikidataEntity | undefined): string[] {
  if (!entity) return [];
  return [
    ...entity.p31.map(
      (claim) => `P31=${claim.id}${claim.label ? ` (${claim.label})` : ""}`,
    ),
    ...entity.p279.map(
      (claim) => `P279=${claim.id}${claim.label ? ` (${claim.label})` : ""}`,
    ),
  ];
}

function typeText(entity: Phase3WikidataEntity | undefined): string {
  if (!entity) return "";
  return [...entity.p31, ...entity.p279]
    .map((claim) => `${claim.id} ${claim.label ?? ""}`)
    .join(" ")
    .toLocaleLowerCase();
}

function inferredKind(destination: Phase3Destination): string {
  const structuredKind = destination.kind?.trim().toLocaleLowerCase();
  if (structuredKind && structuredKind !== "generic") {
    if (/national park|quasi-national park|protected area/.test(structuredKind))
      return "protected-area";
    if (/museum/.test(structuredKind)) return "museum";
    if (/castle|fort/.test(structuredKind)) return "castle";
    if (/park|garden/.test(structuredKind)) return "park";
    if (/station/.test(structuredKind)) return "station";
    if (/bridge/.test(structuredKind)) return "bridge";
    if (/island/.test(structuredKind)) return "island";
    if (/temple/.test(structuredKind)) return "temple";
    if (/shrine/.test(structuredKind)) return "shrine";
    if (/onsen|hot spring|spa/.test(structuredKind)) return "onsen";
    if (/theme park|amusement|attraction/.test(structuredKind))
      return "attraction";
    if (/city|ward|town|village|district|municipality/.test(structuredKind))
      return "municipality";
    return structuredKind;
  }

  const labels = [
    destination.kind ?? "",
    ...(destination.categories ?? []),
    ...(destination.tags ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase();
  if (/national park|quasi-national park|protected area/.test(labels))
    return "protected-area";
  if (/museum/.test(labels)) return "museum";
  if (/castle|fort/.test(labels)) return "castle";
  if (/park|garden/.test(labels)) return "park";
  if (/station/.test(labels)) return "station";
  if (/bridge/.test(labels)) return "bridge";
  if (/island/.test(labels)) return "island";
  if (/temple/.test(labels)) return "temple";
  if (/shrine/.test(labels)) return "shrine";
  if (/onsen|hot spring|spa/.test(labels)) return "onsen";
  if (/theme park|amusement|attraction/.test(labels)) return "attraction";
  if (/city|ward|town|village|district/.test(labels)) return "municipality";
  return destination.kind ?? "generic";
}

function entityTypeResult(
  destination: Phase3Destination,
  candidate: Phase3Candidate,
): {
  result: Phase3CandidateEvidence["entityTypeResult"];
  basis: string[];
} {
  const basis = claimBasis(candidate.entity);
  const text = typeText(candidate.entity);
  if (!basis.length) return { result: "insufficient-evidence", basis };

  const kind = inferredKind(destination);
  const nonPlace =
    /person|politician|actor|company|organization|film|song|album|language|taxon|event/.test(
      text,
    );
  const municipalClaims = [
    ...(candidate.entity?.p31 ?? []),
    ...(candidate.entity?.p279 ?? []),
  ].filter((claim) => {
    const claimText = `${claim.id} ${claim.label ?? ""}`.toLocaleLowerCase();
    if (
      /prefecture|administrative territorial entity|district|county|province|state/.test(
        claimText,
      )
    ) {
      return false;
    }
    return (
      /\b(?:city|ward|town|village|municipality|human settlement)\b/.test(
        claimText,
      ) || /^(?:市|区|町|村)$/.test(claim.label?.trim() ?? "")
    );
  });
  const municipal = municipalClaims.length > 0;
  const station =
    /station|railway|metro|subway|train station|駅|鉄道|地下鉄/.test(text);
  const museum = /museum|art museum|博物館|美術館|資料館/.test(text);
  const castle = /castle|fortress|fortification|castle ruins|城|城跡|城址/.test(
    text,
  );
  const park =
    /park|garden|protected area|national park|nature reserve|公園|庭園|国立公園|自然公園/.test(
      text,
    );
  const bridge = /bridge|橋/.test(text);
  const island = /island|archipelago|島|諸島/.test(text);
  const religious = /temple|shrine|monastery|sanctuary|寺|神社|寺院/.test(text);
  const onsen = /hot spring|spa|onsen|温泉/.test(text);
  const attraction =
    /theme park|amusement park|attraction|observatory|facility|展望台|遊園地|施設/.test(
      text,
    );

  if (nonPlace && !["generic", "municipality"].includes(kind)) {
    return { result: "incompatible", basis };
  }
  if (
    ["city", "ward", "town", "village", "district", "municipality"].includes(
      kind,
    )
  ) {
    return {
      result: municipal && !station ? "compatible" : "incompatible",
      basis,
    };
  }
  if (kind === "station")
    return { result: station ? "compatible" : "incompatible", basis };
  if (kind === "museum")
    return {
      result: museum && !municipal && !station ? "compatible" : "incompatible",
      basis,
    };
  if (kind === "castle")
    return {
      result: castle && !municipal ? "compatible" : "incompatible",
      basis,
    };
  if (["park", "protected-area"].includes(kind))
    return { result: park ? "compatible" : "incompatible", basis };
  if (kind === "bridge")
    return { result: bridge ? "compatible" : "incompatible", basis };
  if (kind === "island")
    return { result: island ? "compatible" : "incompatible", basis };
  if (["temple", "shrine"].includes(kind))
    return { result: religious ? "compatible" : "incompatible", basis };
  if (kind === "onsen")
    return { result: onsen ? "compatible" : "incompatible", basis };
  if (kind === "attraction")
    return { result: attraction ? "compatible" : "incompatible", basis };

  if (station || nonPlace) return { result: "incompatible", basis };
  return {
    result:
      municipal ||
      museum ||
      castle ||
      park ||
      bridge ||
      island ||
      religious ||
      onsen ||
      attraction
        ? "compatible"
        : "insufficient-evidence",
    basis,
  };
}

function hasValidCoordinates(point?: {
  lat: number;
  lng: number;
}): point is { lat: number; lng: number } {
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

function geographyLimitKm(destination: Phase3Destination): number {
  const kind = inferredKind(destination);
  if (
    ["city", "ward", "town", "village", "district", "municipality"].includes(
      kind,
    )
  )
    return 45;
  if (["protected-area", "island"].includes(kind)) return 100;
  if (["mountain", "nature", "natural", "mixed"].includes(kind)) return 60;
  if (destination.role === "hub") return 30;
  return 18;
}

function destinationLocationTokens(destination: Phase3Destination): string[] {
  return [
    destination.prefecture,
    destination.region,
    destination.municipalityId?.split(":")[1],
    destination.municipalityId?.split(":")[0],
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalized)
    .filter(Boolean);
}

function geographyResult(
  destination: Phase3Destination,
  candidate: Phase3Candidate,
): {
  result: Phase3CandidateEvidence["geographyResult"];
  basis: string[];
  distanceKm?: number;
} {
  const destinationHasCoordinates = hasValidCoordinates(
    destination.coordinates,
  );
  const candidateCoordinates =
    candidate.entity?.coordinates ?? candidate.page.coordinates;
  if (destinationHasCoordinates && hasValidCoordinates(candidateCoordinates)) {
    const distanceKm = distanceBetweenCoordinatesKm(
      destination.coordinates!,
      candidateCoordinates,
    );
    return distanceKm <= geographyLimitKm(destination)
      ? {
          result: "coordinates-compatible",
          basis: [
            `distanceKm=${distanceKm.toFixed(3)}`,
            `limitKm=${geographyLimitKm(destination)}`,
          ],
          distanceKm,
        }
      : {
          result: "mismatch",
          basis: [
            `distanceKm=${distanceKm.toFixed(3)}`,
            `limitKm=${geographyLimitKm(destination)}`,
          ],
          distanceKm,
        };
  }

  const p17 = candidate.entity?.p17 ?? [];
  if (
    p17.length > 0 &&
    !p17.some((claim) =>
      /japan|日本|q17$/i.test(`${claim.id} ${claim.label ?? ""}`),
    )
  ) {
    return { result: "mismatch", basis: p17.map((claim) => `P17=${claim.id}`) };
  }
  const p131Text = (candidate.entity?.p131 ?? [])
    .map((claim) => `${claim.id} ${claim.label ?? ""}`)
    .map(normalized);
  const targetTokens = destinationLocationTokens(destination);
  const matching = targetTokens.filter((token) =>
    p131Text.some(
      (location) => location.includes(token) || token.includes(location),
    ),
  );
  if (matching.length > 0) {
    return {
      result: "administrative-location-compatible",
      basis: matching.map((token) => `P131 matches ${token}`),
    };
  }
  return {
    result: "insufficient-evidence",
    basis: [
      "Candidate coordinates unavailable or unusable.",
      "P131 does not provide a compatible prefecture or municipality.",
    ],
  };
}

function validPage(page: Phase3Page): boolean {
  if (!Number.isInteger(page.pageId) || (page.pageId ?? 0) <= 0) return false;
  const parsed = parseWikipediaUrl(page.url);
  const normalizedTitle = (value: string) =>
    value.normalize("NFKC").replace(/_/g, " ").trim().toLocaleLowerCase();
  return Boolean(
    parsed &&
    parsed.language === page.language &&
    canonicalWikipediaIdentity(page.url) &&
    normalizedTitle(parsed.title) === normalizedTitle(page.title) &&
    (!page.wikidataId || validWikidataId(page.wikidataId)),
  );
}

function preferredCandidate(candidates: Phase3Candidate[]): Phase3Candidate {
  return [...candidates].sort((left, right) => {
    const leftRank = `${left.page.language === "en" ? 0 : 1}:${left.sources.includes("wikidata-sitelink") ? 0 : 1}:${left.sources.includes("phase2") ? 0 : 1}:${left.page.title}`;
    const rightRank = `${right.page.language === "en" ? 0 : 1}:${right.sources.includes("wikidata-sitelink") ? 0 : 1}:${right.sources.includes("phase2") ? 0 : 1}:${right.page.title}`;
    return leftRank.localeCompare(rightRank);
  })[0];
}

function evidenceFor(
  destination: Phase3Destination,
  candidate: Phase3Candidate,
  sharesVerifiedWikidataIdentity: boolean,
): Phase3CandidateEvidence {
  const identity = identitySignals(destination, candidate);
  const type = entityTypeResult(destination, candidate);
  const geography = geographyResult(destination, candidate);
  const sitelink = candidate.entity?.sitelinks[candidate.page.language];
  const wikipediaAgreement = Boolean(
    validWikidataId(candidate.qid) &&
    validWikidataId(candidate.page.wikidataId) &&
    candidate.qid.toLocaleUpperCase() ===
      candidate.page.wikidataId.toLocaleUpperCase() &&
    sitelink &&
    normalized(sitelink.title) === normalized(candidate.page.title),
  );
  const rejectionReasons: string[] = [];
  if (!validPage(candidate.page))
    rejectionReasons.push("invalid-wikipedia-page-identity");
  if (!validWikidataId(candidate.qid))
    rejectionReasons.push("no-usable-identity");
  if (!identity.length) rejectionReasons.push("no-name-or-label-relationship");
  if (!wikipediaAgreement)
    rejectionReasons.push("wikipedia-wikidata-disagreement");
  if (type.result === "incompatible")
    rejectionReasons.push("entity-type-mismatch");
  if (type.result === "insufficient-evidence")
    rejectionReasons.push("entity-type-insufficient");
  if (geography.result === "mismatch")
    rejectionReasons.push("geography-mismatch");
  if (geography.result === "insufficient-evidence")
    rejectionReasons.push("geography-insufficient");
  if (
    candidate.sources.length > 0 &&
    candidate.sources.every((source) => source === "wikipedia-redirect")
  ) {
    // A redirect plus a matching Wikidata sitelink is accepted as two
    // independent links: the Wikipedia title redirect and the QID sitelink.
    rejectionReasons.push("redirect-evidence-only");
  }
  if (
    candidate.sources.length > 0 &&
    candidate.sources.every((source) => source === "wikidata-sitelink")
  ) {
    rejectionReasons.push("wikidata-sitelink-only");
  }
  if (candidate.page.type === "disambiguation") {
    rejectionReasons.push("disambiguation-page");
  }
  return {
    language: candidate.page.language,
    title: candidate.page.title,
    url: candidate.page.url,
    pageId: candidate.page.pageId,
    qid: candidate.qid,
    sources: [...candidate.sources].sort(),
    queries: [...new Set(candidate.queries)].sort(),
    redirectFromTitles: [...new Set(candidate.redirectFromTitles ?? [])].sort(),
    labels: candidate.entity?.labels ?? {},
    aliases: candidate.entity?.aliases ?? {},
    descriptions: candidate.entity?.descriptions ?? {},
    p31: candidate.entity?.p31 ?? [],
    p279: candidate.entity?.p279 ?? [],
    p131: candidate.entity?.p131 ?? [],
    p17: candidate.entity?.p17 ?? [],
    ...((candidate.entity?.coordinates ?? candidate.page.coordinates)
      ? {
          coordinates:
            candidate.entity?.coordinates ?? candidate.page.coordinates,
        }
      : {}),
    sitelinks: candidate.entity?.sitelinks ?? {},
    identitySignals: identity,
    wikipediaAgreement,
    entityTypeResult: type.result,
    entityTypeBasis: type.basis,
    geographyResult: geography.result,
    geographyBasis: geography.basis,
    ...(geography.distanceKm === undefined
      ? {}
      : { distanceKm: geography.distanceKm }),
    rejectionReasons: Array.from(new Set(rejectionReasons)).sort(),
    sharesVerifiedWikidataIdentity,
  };
}

function baseClassification(
  state: Exclude<
    Phase3State,
    "canonicalized" | "high-confidence-awaiting-apply"
  >,
  reason: Phase3Classification["reason"],
  candidates: Phase3CandidateEvidence[],
  details?: string[],
): Phase3Classification {
  return {
    state,
    reason,
    candidates,
    ...(candidates.length === 1 ? { candidate: candidates[0] } : {}),
    ...(details?.length ? { details } : {}),
  };
}

function identityFromCandidate(
  candidate: Phase3Candidate,
): Phase3Identity | undefined {
  if (!validWikidataId(candidate.qid) || !validPage(candidate.page))
    return undefined;
  return {
    wikipediaTitle: candidate.page.title,
    wikipediaLanguage: candidate.page.language,
    wikipediaUrl: candidate.page.url,
    wikipediaPageId: candidate.page.pageId!,
    wikidataId: candidate.qid,
  };
}

export function classifyPhase3Destination(
  destination: Phase3Destination,
  discovery: Phase3Discovery,
): Phase3Classification {
  if (discovery.transientFailure) {
    return baseClassification(
      "unresolved",
      "transient-network-failure",
      [],
      [discovery.transientFailure],
    );
  }

  const candidates = discovery.candidates.filter((candidate) =>
    Boolean(candidate.page.url),
  );
  const plausible = candidates.filter((candidate) => {
    const signals = identitySignals(destination, candidate);
    return signals.length > 0;
  });
  const sameLinkedIdentity = allCandidatesShareWikidataIdentity(plausible);
  const evidence = candidates.map((candidate) =>
    evidenceFor(destination, candidate, sameLinkedIdentity),
  );

  if (plausible.length === 0) {
    if (discovery.noStandaloneArticleEvidence?.length) {
      return baseClassification(
        "no-standalone-article-expected",
        "no-standalone-evidence",
        evidence,
        discovery.noStandaloneArticleEvidence,
      );
    }
    return baseClassification("unresolved", "no-candidate", evidence, [
      "No exact title, approved alias, redirect-origin, or Wikidata label/alias candidate was discovered.",
    ]);
  }

  if (plausible.length > 1 && !sameLinkedIdentity) {
    const languages = new Set(
      plausible.map((candidate) => candidate.page.language),
    );
    const qids = plausible.map((candidate) =>
      candidate.qid?.toLocaleUpperCase(),
    );
    const reason: Phase3Classification["reason"] =
      languages.size > 1 && qids.every(Boolean)
        ? "language-identity-conflict"
        : plausible.some((candidate) =>
              candidate.sources.includes("wikidata-sitelink"),
            )
          ? "multiple-qid-candidates"
          : "parent-child-ambiguity";
    return baseClassification("ambiguous-candidate", reason, evidence, [
      "Multiple plausible page/entity candidates remain and do not share one verified non-empty Wikidata identity.",
    ]);
  }

  const chosen = preferredCandidate(plausible);
  const chosenIndex = candidates.indexOf(chosen);
  const chosenEvidence = evidence[chosenIndex];
  if (!chosenEvidence) {
    return baseClassification("unresolved", "no-candidate", evidence);
  }
  if (chosenEvidence.rejectionReasons.includes("redirect-evidence-only")) {
    return baseClassification(
      "unresolved",
      "redirect-evidence-only",
      evidence,
      ["A redirect was discovered without independent cross-link evidence."],
    );
  }
  if (chosenEvidence.rejectionReasons.includes("wikidata-sitelink-only")) {
    return baseClassification(
      "unresolved",
      "wikidata-sitelink-only",
      evidence,
      ["A Wikidata sitelink requires independent discovery evidence."],
    );
  }
  if (chosenEvidence.rejectionReasons.includes("disambiguation-page")) {
    return baseClassification("unresolved", "disambiguation-page", evidence, [
      "A Wikipedia disambiguation page is not a destination identity.",
    ]);
  }
  if (
    chosenEvidence.rejectionReasons.includes("wikipedia-wikidata-disagreement")
  ) {
    return baseClassification(
      "unresolved",
      "wikipedia-wikidata-disagreement",
      evidence,
      ["Wikipedia page identity and Wikidata sitelink identity do not agree."],
    );
  }
  if (chosenEvidence.entityTypeResult === "incompatible") {
    return baseClassification("unresolved", "entity-type-mismatch", evidence);
  }
  if (chosenEvidence.entityTypeResult === "insufficient-evidence") {
    return baseClassification(
      "unresolved",
      "entity-type-insufficient",
      evidence,
    );
  }
  if (chosenEvidence.geographyResult === "mismatch") {
    return baseClassification("unresolved", "geography-mismatch", evidence);
  }
  if (chosenEvidence.geographyResult === "insufficient-evidence") {
    return baseClassification("unresolved", "geography-insufficient", evidence);
  }
  if (chosenEvidence.rejectionReasons.includes("no-usable-identity")) {
    return baseClassification("unresolved", "no-usable-identity", evidence);
  }
  if (!chosenEvidence.wikipediaAgreement) {
    return baseClassification(
      "unresolved",
      "wikipedia-wikidata-disagreement",
      evidence,
    );
  }

  const identity = identityFromCandidate(chosen);
  if (!identity) {
    return baseClassification("unresolved", "no-usable-identity", evidence);
  }
  return {
    state: "high-confidence-awaiting-apply",
    reason: "validated-high-confidence",
    identity,
    candidate: chosenEvidence,
    candidates: evidence,
    details: [
      "Deterministic validation passed; explicit --apply is required before source mutation.",
    ],
  };
}

export function phase3IdentityMatches(
  destination: Phase3Destination,
  identity: Phase3Identity,
): boolean {
  const mapping = extractWikipediaMapping(destination);
  return Boolean(
    mapping &&
    mapping.language === identity.wikipediaLanguage &&
    mapping.title === identity.wikipediaTitle &&
    mapping.url === identity.wikipediaUrl &&
    mapping.pageId === identity.wikipediaPageId &&
    mapping.wikidataId === identity.wikidataId,
  );
}

export function applyPhase3Identity(
  destination: Phase3Destination,
  identity: Phase3Identity,
): boolean {
  const existing = extractWikipediaMapping(destination);
  if (existing) {
    if (phase3IdentityMatches(destination, identity)) return false;
    throw new Error(
      `${destination.id}: refusing to overwrite an existing Wikipedia identity`,
    );
  }
  destination.wikipediaTitle = identity.wikipediaTitle;
  destination.wikipediaLanguage = identity.wikipediaLanguage;
  destination.wikipediaUrl = identity.wikipediaUrl;
  destination.wikipediaPageId = identity.wikipediaPageId;
  destination.wikidataId = identity.wikidataId;
  return true;
}
