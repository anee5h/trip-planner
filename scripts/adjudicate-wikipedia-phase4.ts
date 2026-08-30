import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPhase3Identity,
  classifyPhase3Destination,
  hashStable,
  type Phase2EvidenceSnapshot,
  type Phase3Candidate,
  type Phase3CandidateEvidence,
  type Phase3Destination,
  type Phase3Identity,
  type Phase3ParentChildResult,
  type Phase3RedirectEvidence,
  type Phase3WikidataSearchEvidence,
} from "./lib/wikipediaPhase3Enrichment";
import {
  parseWikipediaUrl,
  type WikipediaLanguage,
} from "../src/shared/services/wikipedia/WikipediaIdentity";

const ROOT = process.cwd();
const SCOPE = "kai-256-wikipedia-phase4" as const;
const PHASE4_SCHEMA_VERSION = 2 as const;
const INDEX_PATH = resolve(ROOT, "src/shared/data/destinations-index.json");
const PHASE1_REPORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-legacy-report.json",
);
const PHASE3_COHORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase3-cohort.json",
);
const PHASE3_REPORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase3-report.json",
);
const PHASE3_CACHE_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase3-api-cache.json",
);
const MANIFEST_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase4-tail.json",
);
const CACHE_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase4-api-cache.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "scripts/audit/kai-256-wikipedia-phase4-report.json",
);

export const PHASE4_IDENTITY_FIELDS = [
  "wikipediaTitle",
  "wikipediaLanguage",
  "wikipediaUrl",
  "wikipediaPageId",
  "wikidataId",
] as const;

type Phase4IdentityField = (typeof PHASE4_IDENTITY_FIELDS)[number];

/**
 * Catalogue fields consumed by Phase 4 adjudication. Wikipedia identity fields
 * are intentionally excluded because Stage B is allowed to mutate only those
 * five fields; the identity snapshot is bound separately.
 */
export const PHASE4_ADJUDICATION_FIELDS = [
  "id",
  "name",
  "nameJa",
  "aliases",
  "description",
  "kind",
  "role",
  "prefecture",
  "region",
  "coordinates",
  "categories",
  "tags",
  "municipalityId",
  "placeType",
  "relationships",
  "status",
] as const;

type Phase4AdjudicationSource = Phase3Destination & {
  description?: string;
};

export function phase4AdjudicationSnapshot(
  source: Phase4AdjudicationSource,
): Record<(typeof PHASE4_ADJUDICATION_FIELDS)[number], unknown> {
  return {
    id: source.id,
    name: source.name,
    nameJa: source.nameJa ?? null,
    aliases: source.aliases ?? null,
    description: source.description ?? null,
    kind: source.kind ?? null,
    role: source.role ?? null,
    prefecture: source.prefecture ?? null,
    region: source.region ?? null,
    coordinates: source.coordinates ?? null,
    categories: source.categories ?? null,
    tags: source.tags ?? null,
    municipalityId: source.municipalityId ?? null,
    placeType: source.placeType ?? null,
    relationships: source.relationships ?? null,
    status: source.status ?? null,
  };
}

export function phase4AdjudicationFingerprint(
  source: Phase4AdjudicationSource,
): string {
  return hashStable(phase4AdjudicationSnapshot(source));
}

export type Phase4FinalDecision =
  | "canonical"
  | "no-standalone-article"
  | "catalogue-relationship-issue"
  | "permanent-unresolved"
  | "needs-human-review";
export type Phase4ApprovalStatus =
  "ACCEPT" | "REJECT" | "NEEDS_REVIEW" | "NOT_APPLICABLE";

interface Phase1ReportFile {
  reviewLedger: Array<{ id: string }>;
}

interface Phase3PriorRecord {
  id: string;
  state: string;
  reason: string;
  candidates: Phase3CandidateEvidence[];
}

interface Phase3ReportFile {
  schemaVersion: number;
  scope: string;
  baseline: Record<string, number>;
  summary: Record<string, number>;
  safety: Record<string, boolean | number>;
  records: Phase3PriorRecord[];
}

interface Phase3CohortFile {
  wholeCohortFingerprint: string;
}

interface Phase3CacheEntry {
  status: "ok" | "transient-failure";
  inputFingerprint: string;
  phase2?: Phase2EvidenceSnapshot;
  redirects: Phase3RedirectEvidence[];
  wikidataSearches: Phase3WikidataSearchEvidence[];
  candidates: Phase3Candidate[];
  transientFailure?: string;
}

interface Phase3CacheFile {
  entries: Record<string, Phase3CacheEntry>;
}

export interface Phase4Manifest {
  schemaVersion: typeof PHASE4_SCHEMA_VERSION;
  scope: typeof SCOPE;
  baseline: {
    publishedDestinations: number;
    startingCanonicalWikipediaIdentity: number;
    phase1ReviewRecords: number;
    phase3HighConfidenceAwaitingApply: number;
    phase3AmbiguousCandidate: number;
    phase3Unresolved: number;
    phase3NoStandaloneArticleExpected: number;
    tailPopulation: number;
  };
  ids: string[];
  phase4AdjudicationFingerprints: Record<string, string>;
  sourceIdentityFingerprints: Record<string, string>;
  outsideTailPublishedIdentityFingerprint: string;
  phase1ReviewLedgerFingerprint: string;
  phase1ReviewInputFingerprints: Record<string, string>;
  phase1ReviewIdentityFingerprints: Record<string, string>;
  phase3CohortFingerprint: string;
  phase3CohortWholeFingerprint: string;
  phase3ReportFingerprint: string;
  phase3CacheFingerprint: string;
  priorPhase3: Record<string, { state: string; reason: string }>;
  proposedIdentityFingerprints: Record<string, string>;
  wholeTailFingerprint: string;
}

interface TargetedRetrievalEvidence {
  id: string;
  question: string;
  status: "not-run";
  reason: string;
}

export interface Phase4CacheFile {
  schemaVersion: typeof PHASE4_SCHEMA_VERSION;
  scope: typeof SCOPE;
  source: "phase3-cache";
  retrievalMode: "offline-existing-evidence-only";
  manifestFingerprint: string;
  phase3CacheFingerprint: string;
  targetedRetrievals: TargetedRetrievalEvidence[];
  entries: Record<
    string,
    {
      adjudicationFingerprint: string;
      phase3EntryFingerprint: string;
      targetedRetrievals: TargetedRetrievalEvidence[];
    }
  >;
}

interface CanonicalSelector {
  language: WikipediaLanguage;
  title: string;
  qid: string;
  manualReason?: string;
}

const HIGH_CONFIDENCE_IDS = [
  "ibaraki-fukuroda-falls",
  "iki-tsushima",
  "inasa-beach-izumo",
  "nachi-falls-wakayama",
  "nippo-kaigan",
  "oarai-marine-tower",
  "sarakurayama",
  "shibuya-sky-shibuya",
  "shokanbetsu-teuri-yagishiri",
  "wakakusayama",
] as const;

const CANONICAL_SELECTORS: Record<string, CanonicalSelector> = {
  "ibaraki-fukuroda-falls": {
    language: "en",
    title: "Fukuroda Falls",
    qid: "Q37321",
  },
  "iki-tsushima": {
    language: "en",
    title: "Iki-Tsushima Quasi-National Park",
    qid: "Q1072765",
  },
  "inasa-beach-izumo": {
    language: "ja",
    title: "稲佐の浜",
    qid: "Q11596453",
  },
  "nachi-falls-wakayama": {
    language: "en",
    title: "Nachi Falls",
    qid: "Q1365882",
  },
  "nippo-kaigan": {
    language: "en",
    title: "Nippō Kaigan Quasi-National Park",
    qid: "Q1072867",
  },
  "oarai-marine-tower": {
    language: "ja",
    title: "大洗マリンタワー",
    qid: "Q11437225",
  },
  sarakurayama: {
    language: "en",
    title: "Mount Sarakura",
    qid: "Q11581132",
  },
  "shibuya-sky-shibuya": {
    language: "ja",
    title: "SHIBUYA SKY",
    qid: "Q116281743",
  },
  "shokanbetsu-teuri-yagishiri": {
    language: "en",
    title: "Shokanbetsu-Teuri-Yagishiri Quasi-National Park",
    qid: "Q986874",
  },
  wakakusayama: {
    language: "en",
    title: "Mount Wakakusa",
    qid: "Q2428328",
  },
  "asakusa-taito": {
    language: "en",
    title: "Asakusa",
    qid: "Q720644",
  },
  "chiba-nokogiriyama": {
    language: "en",
    title: "Mount Nokogiri (Chiba)",
    qid: "Q5120896",
  },
  disneysea: {
    language: "en",
    title: "Tokyo DisneySea",
    qid: "Q1202341",
  },
  "fukuyama-castle": {
    language: "en",
    title: "Fukuyama Castle",
    qid: "Q1071869",
  },
  "gessho-ji-temple-matsue": {
    language: "en",
    title: "Gesshō-ji",
    qid: "Q3517478",
  },
  "hakone-town": {
    language: "en",
    title: "Hakone",
    qid: "Q671040",
  },
  "hokki-ji-pagoda": {
    language: "en",
    title: "Hokki-ji",
    qid: "Q1351209",
  },
  "kamakura-city": {
    language: "en",
    title: "Kamakura",
    qid: "Q200267",
  },
  "kanayama-castle": {
    language: "en",
    title: "Kanayama Castle",
    qid: "Q1038062",
  },
  "kawasaki-city": {
    language: "en",
    title: "Kawasaki, Kanagawa",
    qid: "Q164234",
  },
  "kibitsu-shrine": {
    language: "en",
    title: "Kibitsu Shrine (Bitchū)",
    qid: "Q712824",
  },
  "koto-city": {
    language: "en",
    title: "Kōtō",
    qid: "Q215175",
  },
  "koya-town": {
    language: "en",
    title: "Kōya, Wakayama",
    qid: "Q1346907",
  },
  "kubota-castle": {
    language: "en",
    title: "Kubota Castle",
    qid: "Q6133648",
  },
  "kusatsu-town": {
    language: "en",
    title: "Kusatsu, Gunma",
    qid: "Q1358949",
  },
  "matsushiro-castle": {
    language: "en",
    title: "Matsushiro Castle",
    qid: "Q11104236",
  },
  "minato-city": {
    language: "en",
    title: "Minato, Tokyo",
    qid: "Q190088",
  },
  "mito-city": {
    language: "en",
    title: "Mito, Ibaraki",
    qid: "Q204249",
  },
  "miyakojima-city": {
    language: "en",
    title: "Miyakojima, Okinawa",
    qid: "Q714636",
  },
  "nanao-castle": {
    language: "en",
    title: "Nanao Castle",
    qid: "Q8011662",
  },
  "ne-castle-hachinohe": {
    language: "en",
    title: "Ne Castle",
    qid: "Q8140388",
  },
  "nikko-city": {
    language: "en",
    title: "Nikkō",
    qid: "Q235753",
  },
  "odani-castle": {
    language: "en",
    title: "Odani Castle",
    qid: "Q2436937",
  },
  "oka-castle-oita": {
    language: "en",
    title: "Oka Castle",
    qid: "Q8010033",
  },
  "okinawa-senseki": {
    language: "en",
    title: "Okinawa Senseki Quasi-National Park",
    qid: "Q794334",
  },
  "ota-city": {
    language: "en",
    title: "Ōta, Tokyo",
    qid: "Q217234",
  },
  "rainbow-bridge": {
    language: "en",
    title: "Rainbow Bridge (Tokyo)",
    qid: "Q1046736",
  },
  "shiraito-falls": {
    language: "en",
    title: "Shiraito Falls",
    qid: "Q38411",
  },
  shitennoji: {
    language: "en",
    title: "Shitennō-ji",
    qid: "Q339859",
  },
  "soji-ji-yokohama": {
    language: "en",
    title: "Sōji-ji",
    qid: "Q1250321",
  },
  "takaoka-castle": {
    language: "en",
    title: "Takaoka Castle",
    qid: "Q8011764",
  },
  "takatori-castle": {
    language: "en",
    title: "Takatori Castle",
    qid: "Q5369622",
  },
  "takeda-castle-ruins-hyogo": {
    language: "en",
    title: "Takeda Castle",
    qid: "Q8013060",
  },
  "tokyo-mt-mitake": {
    language: "en",
    title: "Mount Mitake (Tokyo)",
    qid: "Q1432565",
  },
  "wakayama-castle": {
    language: "en",
    title: "Wakayama Castle",
    qid: "Q1151269",
  },
  "yokohama-city": {
    language: "en",
    title: "Yokohama",
    qid: "Q38283",
  },
  "yoshida-koriyama-castle": {
    language: "en",
    title: "Yoshida-Kōriyama Castle",
    qid: "Q1036410",
  },
  "cup-noodles-museum-yokohama": {
    language: "ja",
    title: "安藤百福発明記念館 横浜",
    qid: "Q11257362",
  },
};

const NO_STANDALONE_EVIDENCE: Record<string, string> = {
  "abeno-harukas-300-osaka":
    "The catalogue description identifies a three-story glass observatory within the Abeno Harukas skyscraper; this record is an internal observatory subfeature rather than an independently represented POI.",
  "fukuoka-yatai":
    "The catalogue description says more than 100 food stalls open around Fukuoka; this is a dispersed collective/mobile-stall concept, not one independently named physical POI.",
  "harajuku-takeshita-street":
    "The catalogue name explicitly combines Harajuku and Takeshita Street and the record is a destination-hub grouping; the two named urban areas are not one independently named POI.",
  "hiei-zan-driveway-observatory":
    "The catalogue name and description explicitly combine a scenic toll road with the Yumemi-ga-oka observatory; the observatory is a feature of the road experience, not the combined record's standalone entity.",
  jogashima:
    "The catalogue name combines the Miura Peninsula and Jogashima, while the description presents a regional island/peninsula experience; it is a synthetic area grouping.",
  "kataonami-beach-wakanoura":
    "The catalogue name combines Kataonami Beach and Wakanoura Bay, two named coastal features, so the record does not correspond to one independently named POI.",
  "kawagoe-castle-saitama":
    "The catalogue description explicitly identifies Honmaru Goten as the surviving main palace building within Kawagoe Castle; this is an internal castle sub-building.",
  "kokusai-dori-naha":
    "The catalogue name explicitly combines Kokusai-dori and Makishi Public Market, separate named street and market destinations, so the record is synthetic.",
  "kouri-island-okinawa":
    "The catalogue name combines Kouri Island and Heart Rock beach; the record groups an island with a separate rock feature rather than naming one standalone POI.",
  "kuroshio-market-marina-city":
    "The catalogue name pairs Kuroshio Market with Wakayama Marina City and the description identifies the market as a feature of that complex; this is an internal/complex grouping.",
  "kyoto-historic":
    "The catalogue description explicitly calls this a legacy area page for the distributed Historic Monuments of Ancient Kyoto heritage group and directs users to individual destination records; it is a synthetic heritage grouping.",
  "naminoue-shrine-naha":
    "The catalogue name combines Naminoue Shrine and Naminoue Beach, distinct shrine and beach entities, so the record is not one independently named POI.",
  "nara-park-todaiji":
    "The catalogue name combines Nara Park and Tōdai-ji and the description describes the park housing the temple; these are distinct physical entities in one synthetic record.",
  "okage-yokocho-oharai-machi":
    "The catalogue name combines Okage Yokocho and Oharai-machi, two named historic merchant streets/districts, rather than one standalone entity.",
  "roppongi-hills-tokyo-city-view":
    "The catalogue description identifies an indoor/outdoor observation deck on the 52nd floor of Roppongi Hills; this is an internal deck subfeature of the complex.",
  "ryogoku-kokugikan-sumo-museum":
    "The catalogue description explicitly combines the Ryogoku Kokugikan arena with its on-site Sumo Museum; the record groups two physical entities.",
  "saigoku-33":
    "The catalogue description identifies a 33-temple pilgrimage spanning Wakayama to Shiga; a multi-temple route is not one standalone POI.",
  senjokaku:
    "The catalogue name identifies Senjokaku with Toyokuni Shrine and the description identifies it as a hall managed by the nearby shrine; this is a sub-building/complex relationship.",
  "shikoku-henro":
    "The catalogue description explicitly identifies a 1,400 km circuit of 88 temples; this is a pilgrimage route, not one standalone POI.",
  "shuri-castle-okinawa":
    "The catalogue name combines Shuri Castle with the Ryukyu Gusuku Sites group and the description identifies the UNESCO group; it is a heritage grouping, not one entity.",
  "sumida-river-walk":
    "The catalogue description explicitly identifies the walkway as attached to the Tobu railway bridge; it is an internal bridge/walkway subfeature.",
  "sunshine-60-observatory-ikebukuro":
    "The catalogue description identifies an indoor sky park/observatory within Sunshine 60; this record is an internal building subfeature.",
  "tokyo-metropolitan-government-building-shinjuku":
    "The catalogue description identifies twin observation decks on the 45th floor of the Tokyo Metropolitan Government Building; these are internal building features.",
  "uji-tea-culture-center":
    "The catalogue name combines the Uji Tea Culture Center and Ujigami Shrine, separate named cultural destinations, so the record is synthetic.",
  "utsunomiya-oya":
    "The catalogue name and description combine Utsunomiya and Oya with the Oya History Museum, Oya Kannon, and food experience; this is an area/attraction grouping.",
  zushi:
    "The catalogue name combines Zushi and Yokosuka and the description spans Zushi Beach, Hayama, and Yokosuka Verny Park; this is a synthetic regional grouping.",
};

interface CatalogueRelationshipIssue {
  issueType: string;
  evidence: string;
  recommendedAction: string;
}

const CATALOGUE_RELATIONSHIP_ISSUES: Record<
  string,
  CatalogueRelationshipIssue
> = {
  "akasaka-minato": {
    issueType: "municipality-or-district-kind-mismatch",
    evidence:
      "The catalogue description calls Akasaka a Minato district, but categories include City and no structured kind distinguishes the district; the candidate evidence therefore rejects the neighborhood entity on type.",
    recommendedAction:
      "Review the catalogue kind/relationship model for Tokyo districts before a later identity pass.",
  },
  "chiba-sawara": {
    issueType: "historic-district-versus-municipality",
    evidence:
      "The catalogue describes Sawara's preserved historic canal district, while the only type-compatible candidate is the dissolved municipality 佐原町; the historic-streets candidate has insufficient type evidence.",
    recommendedAction:
      "Model the historic district separately from the dissolved municipality, then re-adjudicate the identity.",
  },
  hondori: {
    issueType: "catalogue-kind-taxonomy-mismatch",
    evidence:
      "The catalogue describes a covered shopping arcade, while the preserved candidate is explicitly a shopping street/arcade and the current type gate does not recognize the record's district modelling.",
    recommendedAction:
      "Add or review a shopping-arcade/district catalogue type before retrying identity mapping.",
  },
  "ikebukuro-toshima": {
    issueType: "neighborhood-record-labelled-as-city",
    evidence:
      "The catalogue record is a Toshima neighborhood but its categories include City and it has no structured kind; the neighborhood candidate is rejected by the independent type gate.",
    recommendedAction:
      "Correct the catalogue type/relationship modelling in a later catalogue ticket.",
  },
  "kannai-yokohama": {
    issueType: "historic-district-kind-missing",
    evidence:
      "The catalogue description explicitly calls Kannai a historic downtown district, but no structured district kind is present and the preserved candidate has insufficient type/geography evidence for a safe mapping.",
    recommendedAction:
      "Review district modelling and parent relationship to Yokohama before re-adjudication.",
  },
  "minato-mirai-yokohama": {
    issueType: "waterfront-district-kind-missing",
    evidence:
      "The catalogue describes Minato Mirai 21 as a waterfront redevelopment district, while the candidates are a human settlement and neighborhood with insufficient type evidence for the current record.",
    recommendedAction:
      "Model the redevelopment district explicitly and keep attraction records separate.",
  },
  "saitama-nagatoro": {
    issueType: "nature-area-composite",
    evidence:
      "The catalogue description combines Arakawa boat cruises, Iwadatami rock formations, and Mount Hodo ropeway; the preserved candidates are the municipality or separate valley, not the whole composite record.",
    recommendedAction:
      "Split the area experience into separately modelled records or retain it as an explicit region grouping.",
  },
  "takanawa-gateway-minato": {
    issueType: "station-complex-versus-city-record",
    evidence:
      "The catalogue describes a station complex but categories include City and no structured kind; the preserved candidate is Takanawa Gateway Station and is rejected by the type gate.",
    recommendedAction:
      "Model the station/complex as a station-type child of Minato before retrying identity mapping.",
  },
  "tokyo-hinohara": {
    issueType: "nature-area-versus-municipality",
    evidence:
      "The catalogue uses a nature record for Hinohara while the preserved candidates are the Tokyo village or a dissolved municipality; the source modelling does not state which entity is intended.",
    recommendedAction:
      "Choose a municipality or nature-area model explicitly and preserve the other as a relationship.",
  },
  "tokyo-okutama": {
    issueType: "nature-area-versus-municipality",
    evidence:
      "The catalogue describes the Okutama mountainous escape, while the preserved candidates are the municipality and Okutama Mountains; the current record does not distinguish them.",
    recommendedAction:
      "Separate the Okutama area from Okutama town before a later identity pass.",
  },
  "ueno-taito": {
    issueType: "district-hub-kind-missing",
    evidence:
      "The catalogue describes Ueno as a cultural hub spanning a park, zoo, museums, and market, but has no structured district/hub kind and the neighborhood candidate fails the current type gate.",
    recommendedAction:
      "Model Ueno as a hub/district and keep its component attractions as children or featured records.",
  },
  "yokohama-marine-tower": {
    issueType: "tower-kind-missing",
    evidence:
      "The catalogue description identifies the Yokohama Marine Tower and its categories identify a tower/observation deck, but no structured kind is present; the exact Q1207989 candidate is rejected by the current independent type gate.",
    recommendedAction:
      "Add the appropriate tower/landmark kind in a later catalogue-only change, then re-run the unchanged safety gate.",
  },
};

const EXPECTED_BASELINE = {
  publishedDestinations: 732,
  startingCanonicalWikipediaIdentity: 444,
  phase1ReviewRecords: 98,
  phase3HighConfidenceAwaitingApply: 10,
  phase3AmbiguousCandidate: 62,
  phase3Unresolved: 118,
  phase3NoStandaloneArticleExpected: 0,
  tailPopulation: 190,
} as const;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function formatGeneratedJson(paths: string[]): void {
  execFileSync("npx", ["prettier", "--write", ...paths], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

function fileFingerprint(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function hasExplicitIdentity(destination: Phase3Destination): boolean {
  return Boolean(
    destination.wikipediaTitle ||
    destination.wikipediaUrl ||
    destination.wikipediaPageId !== undefined ||
    destination.wikidataId,
  );
}

export function identitySnapshot(
  source: Phase3Destination | Phase3Identity,
): Record<Phase4IdentityField, string | number | null> {
  return {
    wikipediaTitle: source.wikipediaTitle ?? null,
    wikipediaLanguage: source.wikipediaLanguage ?? null,
    wikipediaUrl: source.wikipediaUrl ?? null,
    wikipediaPageId: source.wikipediaPageId ?? null,
    wikidataId: source.wikidataId ?? null,
  };
}

export function identityFingerprint(
  source: Phase3Destination | Phase3Identity,
): string {
  return hashStable(identitySnapshot(source));
}

function phase1ReviewInputFingerprints(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): Record<string, string> {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  return Object.fromEntries(
    phase1.reviewLedger
      .map((record) => {
        const destination = byId.get(record.id);
        if (!destination)
          throw new Error(`Phase 1 review ID is missing: ${record.id}`);
        return [record.id, phase4AdjudicationFingerprint(destination)];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function phase1ReviewIdentityFingerprints(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): Record<string, string> {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  return Object.fromEntries(
    phase1.reviewLedger
      .map((record) => {
        const destination = byId.get(record.id);
        if (!destination)
          throw new Error(`Phase 1 review ID is missing: ${record.id}`);
        return [record.id, identityFingerprint(destination)];
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function derivePhase4Tail(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): Phase3Destination[] {
  const reviewIds = new Set(phase1.reviewLedger.map((record) => record.id));
  return destinations
    .filter(
      (destination) =>
        destination.status === "published" &&
        !hasExplicitIdentity(destination) &&
        !reviewIds.has(destination.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function relationshipParentId(
  destination: Phase3Destination,
): string | undefined {
  for (const key of ["parentDestinationId", "parentId"]) {
    const value = destination.relationships?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function requiresParentCheck(destination: Phase3Destination): boolean {
  const role = destination.role?.toLocaleLowerCase();
  const placeType = destination.placeType?.toLocaleLowerCase();
  return Boolean(
    relationshipParentId(destination) ||
    role === "poi" ||
    role === "subfeature" ||
    placeType === "poi" ||
    placeType === "subfeature",
  );
}

function currentOutsideTailFingerprint(
  destinations: Phase3Destination[],
  frozenTailIds: Set<string>,
): string {
  return hashStable(
    Object.fromEntries(
      destinations
        .filter(
          (destination) =>
            destination.status === "published" &&
            !frozenTailIds.has(destination.id),
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((destination) => [
          destination.id,
          identityFingerprint(destination),
        ]),
    ),
  );
}

function phase3CandidateIdentity(candidate: Phase3Candidate): Phase3Identity {
  const qid = candidate.qid?.trim();
  const pageId = candidate.page.pageId;
  if (!qid || !/^Q\d+$/i.test(qid)) {
    throw new Error(
      `Candidate ${candidate.page.title} has no strict Wikidata QID.`,
    );
  }
  if (!Number.isInteger(pageId) || (pageId ?? 0) <= 0) {
    throw new Error(
      `Candidate ${candidate.page.title} has no valid Wikipedia page ID.`,
    );
  }
  return {
    wikipediaTitle: candidate.page.title,
    wikipediaLanguage: candidate.page.language,
    wikipediaUrl: candidate.page.url,
    wikipediaPageId: pageId!,
    wikidataId: qid,
  };
}

export function frozenTailFingerprint(
  manifest: Phase4Manifest | Omit<Phase4Manifest, "wholeTailFingerprint">,
): string {
  // Hash the complete emitted manifest payload, excluding only this
  // self-referential hash field.
  const { wholeTailFingerprint: _ignored, ...payload } =
    manifest as Phase4Manifest;
  return hashStable(payload);
}

function selectedCandidate(
  entry: Phase3CacheEntry,
  selector: CanonicalSelector,
  id: string,
): Phase3Candidate {
  const matches = entry.candidates.filter(
    (candidate) =>
      candidate.page.language === selector.language &&
      candidate.page.title === selector.title &&
      candidate.qid?.toLocaleUpperCase() === selector.qid.toLocaleUpperCase(),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${id}: selector matched ${matches.length} cached candidates; refusing to guess.`,
    );
  }
  return matches[0];
}

function buildPhase4Cache(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
  phase3Cache: Phase3CacheFile,
): Phase4CacheFile {
  const tail = derivePhase4Tail(destinations, phase1);
  const phase3Fingerprint = fileFingerprint(PHASE3_CACHE_PATH);
  return {
    schemaVersion: PHASE4_SCHEMA_VERSION,
    scope: SCOPE,
    source: "phase3-cache",
    retrievalMode: "offline-existing-evidence-only",
    manifestFingerprint: "",
    phase3CacheFingerprint: phase3Fingerprint,
    targetedRetrievals: [],
    entries: Object.fromEntries(
      tail.map((destination) => {
        const entry = phase3Cache.entries[destination.id];
        if (!entry)
          throw new Error(`Phase 3 cache entry is missing: ${destination.id}`);
        return [
          destination.id,
          {
            adjudicationFingerprint: phase4AdjudicationFingerprint(destination),
            phase3EntryFingerprint: hashStable(entry),
            targetedRetrievals: [],
          },
        ];
      }),
    ),
  };
}

function buildPhase4Manifest(
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
  phase3Cohort: Phase3CohortFile,
  phase3Report: Phase3ReportFile,
  phase3Cache: Phase3CacheFile,
): Phase4Manifest {
  const tail = derivePhase4Tail(destinations, phase1);
  const tailIds = tail.map((destination) => destination.id);
  const tailIdSet = new Set(tailIds);
  const reportById = new Map(
    phase3Report.records.map((record) => [record.id, record]),
  );
  const phase3StateCounts = Object.fromEntries(
    [
      "high-confidence-awaiting-apply",
      "ambiguous-candidate",
      "unresolved",
      "no-standalone-article-expected",
    ].map((state) => [
      state,
      tail.filter(
        (destination) => reportById.get(destination.id)?.state === state,
      ).length,
    ]),
  );
  const phase1Ids = phase1.reviewLedger
    .map((record) => record.id)
    .sort((left, right) => left.localeCompare(right));
  if (new Set(phase1Ids).size !== phase1Ids.length) {
    throw new Error("Phase 1 review ledger contains duplicate IDs.");
  }
  const published = destinations.filter(
    (destination) => destination.status === "published",
  );
  const baseline: Phase4Manifest["baseline"] = {
    publishedDestinations: published.length,
    startingCanonicalWikipediaIdentity:
      published.filter(hasExplicitIdentity).length,
    phase1ReviewRecords: phase1Ids.length,
    phase3HighConfidenceAwaitingApply:
      phase3StateCounts["high-confidence-awaiting-apply"],
    phase3AmbiguousCandidate: phase3StateCounts["ambiguous-candidate"],
    phase3Unresolved: phase3StateCounts.unresolved,
    phase3NoStandaloneArticleExpected:
      phase3StateCounts["no-standalone-article-expected"],
    tailPopulation: tail.length,
  };
  for (const [key, expected] of Object.entries(EXPECTED_BASELINE)) {
    if (baseline[key as keyof typeof baseline] !== expected) {
      throw new Error(
        `Phase 4 baseline drift for ${key}: expected ${expected}, got ${baseline[key as keyof typeof baseline]}.`,
      );
    }
  }
  if (phase3Report.safety.transientFailures !== 0) {
    throw new Error(
      "Phase 3 has transient failures; Phase 4 is closed on uncertainty.",
    );
  }
  for (const destination of tail) {
    const record = reportById.get(destination.id);
    if (!record)
      throw new Error(`Phase 3 report record is missing: ${destination.id}`);
  }
  if (phase3Report.records.length !== 340) {
    throw new Error(
      `Unexpected Phase 3 report population: ${phase3Report.records.length}`,
    );
  }
  const highConfidenceIds = tail
    .filter(
      (destination) =>
        reportById.get(destination.id)?.state ===
        "high-confidence-awaiting-apply",
    )
    .map((destination) => destination.id);
  if (
    hashStable(highConfidenceIds) !==
    hashStable(
      [...HIGH_CONFIDENCE_IDS].sort((left, right) => left.localeCompare(right)),
    )
  ) {
    throw new Error("Phase 3 high-confidence ledger IDs drifted.");
  }
  const phase4AdjudicationFingerprints = Object.fromEntries(
    tail.map((destination) => [
      destination.id,
      phase4AdjudicationFingerprint(destination),
    ]),
  );
  const sourceIdentityFingerprints = Object.fromEntries(
    tail.map((destination) => [
      destination.id,
      identityFingerprint(destination),
    ]),
  );
  const priorPhase3 = Object.fromEntries(
    tail.map((destination) => {
      const record = reportById.get(destination.id)!;
      return [destination.id, { state: record.state, reason: record.reason }];
    }),
  );
  const proposedIdentityFingerprints = Object.fromEntries(
    tail.map((destination) => {
      const selector = CANONICAL_SELECTORS[destination.id];
      if (!selector)
        return [destination.id, sourceIdentityFingerprints[destination.id]];
      const entry = phase3Cache.entries[destination.id];
      if (!entry)
        throw new Error(`Phase 3 cache entry is missing: ${destination.id}`);
      return [
        destination.id,
        identityFingerprint(
          phase3CandidateIdentity(
            selectedCandidate(entry, selector, destination.id),
          ),
        ),
      ];
    }),
  );
  const phase3CohortFingerprint = fileFingerprint(PHASE3_COHORT_PATH);
  const phase3ReportFingerprint = fileFingerprint(PHASE3_REPORT_PATH);
  const phase3CacheFingerprint = fileFingerprint(PHASE3_CACHE_PATH);
  const phase1ReviewInput = phase1ReviewInputFingerprints(destinations, phase1);
  const phase1ReviewIdentity = phase1ReviewIdentityFingerprints(
    destinations,
    phase1,
  );
  const phase1ReviewLedgerFingerprint = hashStable(phase1Ids);
  const manifestWithoutFingerprint = {
    schemaVersion: PHASE4_SCHEMA_VERSION,
    scope: SCOPE,
    baseline,
    ids: tailIds,
    phase4AdjudicationFingerprints,
    sourceIdentityFingerprints,
    outsideTailPublishedIdentityFingerprint: currentOutsideTailFingerprint(
      destinations,
      tailIdSet,
    ),
    phase1ReviewLedgerFingerprint,
    phase1ReviewInputFingerprints: phase1ReviewInput,
    phase1ReviewIdentityFingerprints: phase1ReviewIdentity,
    phase3CohortFingerprint,
    phase3CohortWholeFingerprint: phase3Cohort.wholeCohortFingerprint,
    phase3ReportFingerprint,
    phase3CacheFingerprint,
    priorPhase3,
    proposedIdentityFingerprints,
  } satisfies Omit<Phase4Manifest, "wholeTailFingerprint">;
  return {
    ...manifestWithoutFingerprint,
    wholeTailFingerprint: frozenTailFingerprint(manifestWithoutFingerprint),
  };
}

export function validateFrozenTail(
  manifest: Phase4Manifest,
  destinations: Phase3Destination[],
  phase1: Phase1ReportFile,
): void {
  if (
    manifest.schemaVersion !== PHASE4_SCHEMA_VERSION ||
    manifest.scope !== SCOPE
  ) {
    throw new Error("Invalid KAI-256 Phase 4 tail manifest metadata.");
  }
  if (frozenTailFingerprint(manifest) !== manifest.wholeTailFingerprint) {
    throw new Error("Phase 4 whole-tail fingerprint is invalid.");
  }
  const manifestIds = new Set(manifest.ids);
  if (manifestIds.size !== manifest.ids.length) {
    throw new Error("Phase 4 tail manifest contains duplicate IDs.");
  }
  const manifestIdHash = hashStable([...manifestIds].sort());
  for (const [label, value] of [
    [
      "Phase 4 adjudication fingerprints",
      manifest.phase4AdjudicationFingerprints,
    ],
    ["source identity fingerprints", manifest.sourceIdentityFingerprints],
    ["prior Phase 3 records", manifest.priorPhase3],
    ["proposed identity fingerprints", manifest.proposedIdentityFingerprints],
  ] as const) {
    if (hashStable(Object.keys(value).sort()) !== manifestIdHash) {
      throw new Error(`Phase 4 ${label} do not cover the frozen tail exactly.`);
    }
  }
  const phase1Ids = phase1.reviewLedger
    .map((record) => record.id)
    .sort((left, right) => left.localeCompare(right));
  if (new Set(phase1Ids).size !== phase1Ids.length) {
    throw new Error("Phase 1 review ledger contains duplicate IDs.");
  }
  const currentPublishedCount = destinations.filter(
    (destination) => destination.status === "published",
  ).length;
  const currentPhase3StateCounts = Object.fromEntries(
    [
      "high-confidence-awaiting-apply",
      "ambiguous-candidate",
      "unresolved",
      "no-standalone-article-expected",
    ].map((state) => [
      state,
      Object.values(manifest.priorPhase3).filter(
        (record) => record.state === state,
      ).length,
    ]),
  );
  const expectedBaseline = {
    publishedDestinations: currentPublishedCount,
    // This is the immutable starting baseline, not the post-apply count.
    startingCanonicalWikipediaIdentity:
      EXPECTED_BASELINE.startingCanonicalWikipediaIdentity,
    phase1ReviewRecords: phase1Ids.length,
    phase3HighConfidenceAwaitingApply:
      currentPhase3StateCounts["high-confidence-awaiting-apply"],
    phase3AmbiguousCandidate: currentPhase3StateCounts["ambiguous-candidate"],
    phase3Unresolved: currentPhase3StateCounts.unresolved,
    phase3NoStandaloneArticleExpected:
      currentPhase3StateCounts["no-standalone-article-expected"],
    tailPopulation: manifest.ids.length,
  };
  if (hashStable(manifest.baseline) !== hashStable(expectedBaseline)) {
    throw new Error("Phase 4 frozen baseline drifted.");
  }
  const currentTail = derivePhase4Tail(destinations, phase1);
  const expandedIds = currentTail
    .filter((destination) => !manifestIds.has(destination.id))
    .map((destination) => destination.id);
  if (expandedIds.length > 0) {
    throw new Error(
      `Phase 4 tail drift: new eligible IDs: ${expandedIds.join(", ")}`,
    );
  }
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  for (const id of manifest.ids) {
    const destination = byId.get(id);
    if (!destination || destination.status !== "published") {
      throw new Error(
        `Phase 4 frozen tail ID is missing or unpublished: ${id}`,
      );
    }
    if (
      phase4AdjudicationFingerprint(destination) !==
      manifest.phase4AdjudicationFingerprints[id]
    ) {
      throw new Error(`Phase 4 adjudication fingerprint drift: ${id}`);
    }
    const currentIdentity = identityFingerprint(destination);
    if (
      currentIdentity !== manifest.sourceIdentityFingerprints[id] &&
      currentIdentity !== manifest.proposedIdentityFingerprints[id]
    ) {
      throw new Error(`Phase 4 source identity drift: ${id}`);
    }
  }
  if (phase1Ids.some((id) => manifestIds.has(id))) {
    throw new Error(
      "Phase 4 frozen tail intersects the Phase 1 review ledger.",
    );
  }
  if (hashStable(phase1Ids) !== manifest.phase1ReviewLedgerFingerprint) {
    throw new Error("Phase 1 review ledger drift detected.");
  }
  if (
    hashStable(phase1ReviewInputFingerprints(destinations, phase1)) !==
    hashStable(manifest.phase1ReviewInputFingerprints)
  ) {
    throw new Error("Phase 1 review input fingerprint drift detected.");
  }
  if (
    hashStable(phase1ReviewIdentityFingerprints(destinations, phase1)) !==
    hashStable(manifest.phase1ReviewIdentityFingerprints)
  ) {
    throw new Error("Phase 1 review identity fingerprint drift detected.");
  }
  if (
    currentOutsideTailFingerprint(destinations, manifestIds) !==
    manifest.outsideTailPublishedIdentityFingerprint
  ) {
    throw new Error(
      "Published identity outside the frozen Phase 4 tail drifted.",
    );
  }
  const publishedCount = destinations.filter(
    (destination) => destination.status === "published",
  ).length;
  if (publishedCount !== manifest.baseline.publishedDestinations) {
    throw new Error(`Published destination count drifted: ${publishedCount}`);
  }
}

function loadInputs(): {
  destinations: Phase3Destination[];
  phase1: Phase1ReportFile;
  phase3Cohort: Phase3CohortFile;
  phase3Report: Phase3ReportFile;
  phase3Cache: Phase3CacheFile;
} {
  return {
    destinations: readJson<Phase3Destination[]>(INDEX_PATH),
    phase1: readJson<Phase1ReportFile>(PHASE1_REPORT_PATH),
    phase3Cohort: readJson<Phase3CohortFile>(PHASE3_COHORT_PATH),
    phase3Report: readJson<Phase3ReportFile>(PHASE3_REPORT_PATH),
    phase3Cache: readJson<Phase3CacheFile>(PHASE3_CACHE_PATH),
  };
}

function validatePhase4Inputs(
  manifest: Phase4Manifest,
  cache: Phase4CacheFile,
  inputs: ReturnType<typeof loadInputs>,
): void {
  validateFrozenTail(manifest, inputs.destinations, inputs.phase1);
  if (
    inputs.phase3Cohort.wholeCohortFingerprint !==
    manifest.phase3CohortWholeFingerprint
  ) {
    throw new Error("Phase 3 whole-cohort fingerprint drift detected.");
  }
  if (
    fileFingerprint(PHASE3_COHORT_PATH) !== manifest.phase3CohortFingerprint
  ) {
    throw new Error("Phase 3 cohort artifact drift detected.");
  }
  if (
    fileFingerprint(PHASE3_REPORT_PATH) !== manifest.phase3ReportFingerprint
  ) {
    throw new Error("Phase 3 report artifact drift detected.");
  }
  if (fileFingerprint(PHASE3_CACHE_PATH) !== manifest.phase3CacheFingerprint) {
    throw new Error("Phase 3 cache artifact drift detected.");
  }
  const unsafePhase3Flags = [
    "similarityOnlyAcceptance",
    "geographyBypassed",
    "entityValidationBypassed",
    "enJaEquivalenceGuessed",
    "parentArticleSubstitution",
    "phase1ReviewModified",
  ].filter((key) => inputs.phase3Report.safety[key] === true);
  if (unsafePhase3Flags.length > 0) {
    throw new Error(
      `Phase 3 safety flags are active: ${unsafePhase3Flags.join(", ")}`,
    );
  }
  if (cache.schemaVersion !== PHASE4_SCHEMA_VERSION || cache.scope !== SCOPE) {
    throw new Error("Invalid Phase 4 offline cache metadata.");
  }
  if (cache.manifestFingerprint !== manifest.wholeTailFingerprint) {
    throw new Error("Phase 4 cache is not bound to the frozen manifest.");
  }
  if (cache.phase3CacheFingerprint !== manifest.phase3CacheFingerprint) {
    throw new Error("Phase 4 cache is bound to a different Phase 3 cache.");
  }
  if (cache.targetedRetrievals.length !== 0) {
    throw new Error(
      "Phase 4 targeted retrieval cache is non-empty; stop closed.",
    );
  }
  const cacheIds = Object.keys(cache.entries).sort();
  if (hashStable(cacheIds) !== hashStable([...manifest.ids].sort())) {
    throw new Error("Phase 4 cache IDs drifted from the frozen tail.");
  }
  for (const id of manifest.ids) {
    const entry = inputs.phase3Cache.entries[id];
    const cached = cache.entries[id];
    if (!entry || !cached)
      throw new Error(`Phase 3/4 cache entry is missing: ${id}`);
    if (
      cached.adjudicationFingerprint !==
      manifest.phase4AdjudicationFingerprints[id]
    ) {
      throw new Error(`Phase 4 cache adjudication fingerprint drift: ${id}`);
    }
    if (cached.phase3EntryFingerprint !== hashStable(entry)) {
      throw new Error(`Phase 4 cached Phase 3 evidence drift: ${id}`);
    }
    if (cached.targetedRetrievals.length !== 0) {
      throw new Error(
        `Targeted retrieval evidence exists for ${id}; stop closed.`,
      );
    }
  }
}

function knownParent(
  destination: Phase3Destination,
  destinationsById: Map<string, Phase3Destination>,
): Phase3Destination | undefined {
  const parentId = relationshipParentId(destination);
  return parentId ? destinationsById.get(parentId) : undefined;
}

function discoveryFor(
  destination: Phase3Destination,
  entry: Phase3CacheEntry,
  destinationsById: Map<string, Phase3Destination>,
) {
  return {
    phase2: entry.phase2,
    candidates: entry.candidates,
    redirects: entry.redirects,
    wikidataSearches: entry.wikidataSearches,
    knownParent: knownParent(destination, destinationsById),
    ...(entry.status === "transient-failure"
      ? {
          transientFailure:
            entry.transientFailure ?? "cached transient failure",
        }
      : {}),
  };
}

function safeCandidateQids(candidates: Phase3CandidateEvidence[]): string[] {
  return sortedUnique(
    candidates
      .filter(
        (candidate) =>
          candidate.qid &&
          /^Q\d+$/i.test(candidate.qid) &&
          candidate.rejectionReasons.length === 0 &&
          candidate.entityTypeResult === "compatible" &&
          [
            "coordinates-compatible",
            "administrative-location-compatible",
          ].includes(candidate.geographyResult) &&
          candidate.wikipediaAgreement,
      )
      .map((candidate) => candidate.qid!.toLocaleUpperCase()),
  );
}

function urlTitleAgreement(identity: Phase3Identity): boolean {
  const parsed = parseWikipediaUrl(identity.wikipediaUrl);
  if (!parsed) return false;
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/_/g, " ").trim().toLocaleLowerCase();
  return (
    parsed.language === identity.wikipediaLanguage &&
    normalize(parsed.title) === normalize(identity.wikipediaTitle)
  );
}

interface FinalGateChecks {
  correctDestinationEntity: boolean;
  validPageIdTitleUrl: boolean;
  validQid: boolean;
  wikipediaWikidataAgreement: boolean;
  entityTypeCompatible: boolean;
  geographyCompatible: boolean;
  noUnresolvedCompetingQid: boolean;
  enJaRulePreserved: boolean;
  notDisambiguationPage: boolean;
  notParentChildSubstitution: boolean;
  parentCheckEvaluated: boolean;
  sourceEvidenceStillValid: boolean;
}

export interface Phase4Evaluation {
  id: string;
  phase3State: string;
  phase3Reason: string;
  finalDecision: Phase4FinalDecision;
  decisionReason: string;
  approvalStatus: Phase4ApprovalStatus;
  selectedIdentity: Phase3Identity | null;
  selectedCandidateEvidence: Phase3CandidateEvidence | null;
  candidateEvidence: Phase3CandidateEvidence[];
  parentChildResult: Phase3ParentChildResult | "mixed";
  duplicateIdentityResult: unknown;
  targetedRetrievalUsed: false;
  targetedRetrievalEvidence: TargetedRetrievalEvidence[];
  sourceModified: boolean;
  followUpRequired: boolean;
  inspectedAllCandidates: true;
  finalGate: FinalGateChecks | null;
  manualAdjudication?: string;
}

function aggregateParentChildResult(
  candidates: Phase3CandidateEvidence[],
): Phase3ParentChildResult | "mixed" {
  const results = sortedUnique(
    candidates.map((candidate) => candidate.parentChildResult),
  );
  if (results.length === 0) return "not-evaluated";
  return results.length === 1
    ? (results[0] as Phase3ParentChildResult)
    : "mixed";
}

function candidateSummary(candidates: Phase3CandidateEvidence[]): string {
  if (candidates.length === 0) return "no cached candidate was preserved";
  return candidates
    .map(
      (candidate) =>
        `${candidate.language}:${candidate.title} (${candidate.qid ?? "no-QID"}; ${candidate.rejectionReasons.join(", ") || "no rejection"})`,
    )
    .join("; ");
}

function noStandaloneDecisionReason(
  id: string,
  destination: Phase3Destination,
  manifest: Phase4Manifest,
  evidence: string,
): string {
  const frozenAdjudicationFingerprint =
    manifest.phase4AdjudicationFingerprints[id];
  if (!frozenAdjudicationFingerprint) {
    throw new Error(
      `${id}: no-standalone evidence has no frozen adjudication source.`,
    );
  }
  if (
    phase4AdjudicationFingerprint(destination) !== frozenAdjudicationFingerprint
  ) {
    throw new Error(`${id}: no-standalone adjudication evidence drifted.`);
  }
  return `AFFIRMATIVE CATALOGUE-SOURCE EVIDENCE (frozen Phase 4 adjudication fingerprint ${frozenAdjudicationFingerprint}; source fields: ${PHASE4_ADJUDICATION_FIELDS.join(", ")}): ${evidence}`;
}

function makeFinalGate(
  destination: Phase3Destination,
  identity: Phase3Identity,
  selected: Phase3CandidateEvidence,
  classificationCandidates: Phase3CandidateEvidence[],
): FinalGateChecks {
  const safeQids = safeCandidateQids(classificationCandidates);
  const pageIdentityValid =
    Number.isInteger(selected.pageId) &&
    (selected.pageId ?? 0) > 0 &&
    urlTitleAgreement(identity);
  const parentCheckEvaluated =
    !requiresParentCheck(destination) ||
    selected.parentChildResult !== "not-evaluated";
  const checks: FinalGateChecks = {
    correctDestinationEntity: selected.identitySignals.length > 0,
    validPageIdTitleUrl: pageIdentityValid,
    validQid: /^Q\d+$/i.test(selected.qid ?? ""),
    wikipediaWikidataAgreement: selected.wikipediaAgreement,
    entityTypeCompatible: selected.entityTypeResult === "compatible",
    geographyCompatible: [
      "coordinates-compatible",
      "administrative-location-compatible",
    ].includes(selected.geographyResult),
    noUnresolvedCompetingQid: safeQids.length === 1,
    enJaRulePreserved: safeQids.length === 1,
    notDisambiguationPage: !selected.rejectionReasons.includes(
      "disambiguation-page",
    ),
    notParentChildSubstitution:
      selected.parentChildResult !== "parent-child-conflict",
    parentCheckEvaluated,
    sourceEvidenceStillValid: selected.rejectionReasons.length === 0,
  };
  if (Object.values(checks).some((value) => !value)) {
    throw new Error(
      `${destination.id}: final Phase 3 safety gate failed: ${Object.entries(
        checks,
      )
        .filter(([, value]) => !value)
        .map(([key]) => key)
        .join(", ")}`,
    );
  }
  return checks;
}

function evaluateTail(
  manifest: Phase4Manifest,
  inputs: ReturnType<typeof loadInputs>,
): Phase4Evaluation[] {
  const destinationsById = new Map(
    inputs.destinations.map((destination) => [destination.id, destination]),
  );
  const phase3ReportById = new Map(
    inputs.phase3Report.records.map((record) => [record.id, record]),
  );
  const evaluations: Phase4Evaluation[] = [];
  for (const id of manifest.ids) {
    const destination = destinationsById.get(id);
    const phase3Entry = inputs.phase3Cache.entries[id];
    const prior = manifest.priorPhase3[id];
    if (!destination || !phase3Entry || !prior)
      throw new Error(`Phase 4 evidence is incomplete: ${id}`);
    const classification = classifyPhase3Destination(
      destination,
      discoveryFor(destination, phase3Entry, destinationsById),
    );
    if (
      classification.state !== prior.state ||
      classification.reason !== prior.reason
    ) {
      throw new Error(
        `${id}: Phase 3 classification drifted from frozen state/reason (${prior.state}/${prior.reason} -> ${classification.state}/${classification.reason}).`,
      );
    }
    const phase3ReportRecord = phase3ReportById.get(id);
    if (
      !phase3ReportRecord ||
      phase3ReportRecord.state !== prior.state ||
      phase3ReportRecord.reason !== prior.reason
    ) {
      throw new Error(`${id}: Phase 3 report state/reason drifted.`);
    }
    const selector = CANONICAL_SELECTORS[id];
    const baseParentChildResult = aggregateParentChildResult(
      classification.candidates,
    );
    if (selector) {
      const candidate = selectedCandidate(phase3Entry, selector, id);
      const selectedEvidence = classification.candidates.find(
        (evidence) =>
          evidence.language === candidate.page.language &&
          evidence.title === candidate.page.title &&
          evidence.qid?.toLocaleUpperCase() ===
            candidate.qid?.toLocaleUpperCase(),
      );
      if (!selectedEvidence) {
        throw new Error(
          `${id}: selected candidate is absent from the full preserved evidence set.`,
        );
      }
      const identity = phase3CandidateIdentity(candidate);
      if (
        identity.wikidataId.toLocaleUpperCase() !==
          selector.qid.toLocaleUpperCase() ||
        identity.wikipediaLanguage !== selector.language ||
        identity.wikipediaTitle !== selector.title
      ) {
        throw new Error(
          `${id}: selected identity differs from the pinned selector.`,
        );
      }
      const finalGate = makeFinalGate(
        destination,
        identity,
        selectedEvidence,
        classification.candidates,
      );
      evaluations.push({
        id,
        phase3State: prior.state,
        phase3Reason: prior.reason,
        finalDecision: "canonical",
        decisionReason:
          selector.manualReason ??
          "All preserved candidates were inspected; the selected candidate passed the unchanged Phase 3 final safety gate with one verified identity.",
        approvalStatus: "ACCEPT",
        selectedIdentity: identity,
        selectedCandidateEvidence: selectedEvidence,
        candidateEvidence: classification.candidates,
        parentChildResult: selectedEvidence.parentChildResult,
        duplicateIdentityResult: null,
        targetedRetrievalUsed: false,
        targetedRetrievalEvidence: [],
        sourceModified:
          identityFingerprint(destination) !==
          manifest.sourceIdentityFingerprints[id],
        followUpRequired: false,
        inspectedAllCandidates: true,
        finalGate,
        ...(selector.manualReason
          ? { manualAdjudication: selector.manualReason }
          : {}),
      });
      continue;
    }
    const noStandaloneReason = NO_STANDALONE_EVIDENCE[id];
    const relationshipIssue = CATALOGUE_RELATIONSHIP_ISSUES[id];
    const isTransient = phase3Entry.status === "transient-failure";
    const finalDecision: Phase4FinalDecision = noStandaloneReason
      ? "no-standalone-article"
      : relationshipIssue
        ? "catalogue-relationship-issue"
        : "needs-human-review";
    const decisionReason = noStandaloneReason
      ? noStandaloneDecisionReason(
          id,
          destination,
          manifest,
          noStandaloneReason,
        )
      : relationshipIssue
        ? relationshipIssue.evidence
        : isTransient
          ? "Cached Phase 3 evidence is transient/incomplete; no identity was guessed and the record remains closed for human review."
          : `All preserved Phase 2/3 evidence was inspected and no single approved identity was defensible. Candidates remain preserved: ${candidateSummary(classification.candidates)}.`;
    evaluations.push({
      id,
      phase3State: prior.state,
      phase3Reason: prior.reason,
      finalDecision,
      decisionReason,
      approvalStatus: "NOT_APPLICABLE",
      selectedIdentity: null,
      selectedCandidateEvidence: null,
      candidateEvidence: classification.candidates,
      parentChildResult: baseParentChildResult,
      duplicateIdentityResult: null,
      targetedRetrievalUsed: false,
      targetedRetrievalEvidence: [],
      sourceModified: false,
      followUpRequired: true,
      inspectedAllCandidates: true,
      finalGate: null,
    });
  }
  return evaluations;
}

type DuplicateClassification =
  | "intentional-same-entity"
  | "parent-child-conflict"
  | "duplicate-catalogue-record"
  | "suspicious-needs-review";

interface DuplicateIdentityGroup {
  identityType: "wikipediaPageId" | "wikidataId";
  identity: string;
  destinationIds: string[];
  classification: DuplicateClassification;
  reason: string;
}

export interface DuplicateIdentityAudit {
  wikipediaPageIdToDestinationIds: Record<string, string[]>;
  wikidataIdToDestinationIds: Record<string, string[]>;
  duplicateGroups: DuplicateIdentityGroup[];
  counts: Record<DuplicateClassification, number>;
}

function duplicateClassification(ids: string[]): {
  classification: DuplicateClassification;
  reason: string;
} {
  const set = new Set(ids);
  if (set.has("enoshima-island") && set.has("enoshima-iwaya-caves")) {
    return {
      classification: "parent-child-conflict",
      reason:
        "The cave record describes a feature on Enoshima but duplicates the island's identity; the child relationship is incomplete and must be repaired separately.",
    };
  }
  if (set.has("osaka-city") && set.has("osaka-museum-of-housing-and-living")) {
    return {
      classification: "parent-child-conflict",
      reason:
        "The museum explicitly has Osaka City as parent but currently duplicates the city's identity; preserve the conflict for a catalogue relationship fix.",
    };
  }
  return {
    classification: "suspicious-needs-review",
    reason:
      "A duplicate identity was introduced or found without an approved relationship explanation.",
  };
}

function identityMap(
  destinations: Phase3Destination[],
  field: "wikipediaPageId" | "wikidataId",
): Record<string, string[]> {
  const map = new Map<string, string[]>();
  for (const destination of destinations) {
    const value = destination[field];
    if (value === undefined || value === null || value === "") continue;
    const key =
      field === "wikidataId"
        ? String(value).trim().toLocaleUpperCase()
        : String(value);
    const ids = map.get(key) ?? [];
    ids.push(destination.id);
    map.set(key, ids);
  }
  return Object.fromEntries(
    [...map.entries()]
      .map(([key, ids]): [string, string[]] => [
        key,
        ids.sort((left, right) => left.localeCompare(right)),
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildDuplicateIdentityAudit(
  destinations: Phase3Destination[],
  evaluations: Phase4Evaluation[],
): DuplicateIdentityAudit {
  const proposed = destinations.map((destination) => ({ ...destination }));
  const proposedById = new Map(
    proposed.map((destination) => [destination.id, destination]),
  );
  for (const evaluation of evaluations) {
    if (
      evaluation.finalDecision !== "canonical" ||
      !evaluation.selectedIdentity
    )
      continue;
    const destination = proposedById.get(evaluation.id);
    if (!destination)
      throw new Error(
        `Duplicate audit destination is missing: ${evaluation.id}`,
      );
    applyPhase3Identity(destination, evaluation.selectedIdentity);
  }
  const pageMap = identityMap(proposed, "wikipediaPageId");
  const qidMap = identityMap(proposed, "wikidataId");
  const groups: DuplicateIdentityGroup[] = [];
  for (const [identity, ids] of Object.entries(pageMap)) {
    if (ids.length < 2) continue;
    const result = duplicateClassification(ids);
    groups.push({
      identityType: "wikipediaPageId",
      identity,
      destinationIds: ids,
      ...result,
    });
  }
  for (const [identity, ids] of Object.entries(qidMap)) {
    if (ids.length < 2) continue;
    const result = duplicateClassification(ids);
    groups.push({
      identityType: "wikidataId",
      identity,
      destinationIds: ids,
      ...result,
    });
  }
  groups.sort((left, right) =>
    `${left.identityType}:${left.identity}`.localeCompare(
      `${right.identityType}:${right.identity}`,
    ),
  );
  const counts: Record<DuplicateClassification, number> = {
    "intentional-same-entity": 0,
    "parent-child-conflict": 0,
    "duplicate-catalogue-record": 0,
    "suspicious-needs-review": 0,
  };
  for (const group of groups) counts[group.classification] += 1;
  return {
    wikipediaPageIdToDestinationIds: pageMap,
    wikidataIdToDestinationIds: qidMap,
    duplicateGroups: groups,
    counts,
  };
}

export function applyApprovedPhase4Identities(
  destinations: Phase3Destination[],
  evaluations: Phase4Evaluation[],
): string[] {
  const byId = new Map(
    destinations.map((destination) => [destination.id, destination]),
  );
  const changed: string[] = [];
  for (const evaluation of evaluations) {
    if (evaluation.finalDecision !== "canonical") continue;
    if (
      evaluation.approvalStatus !== "ACCEPT" ||
      !evaluation.selectedIdentity
    ) {
      throw new Error(
        `${evaluation.id}: canonical decision is not explicitly approved.`,
      );
    }
    const destination = byId.get(evaluation.id);
    if (!destination)
      throw new Error(`Approved destination is missing: ${evaluation.id}`);
    if (applyPhase3Identity(destination, evaluation.selectedIdentity))
      changed.push(evaluation.id);
  }
  return changed.sort((left, right) => left.localeCompare(right));
}

function nonIdentityFingerprint(destination: Phase3Destination): string {
  const copy = { ...destination } as Record<string, unknown>;
  for (const field of PHASE4_IDENTITY_FIELDS) delete copy[field];
  return hashStable(copy);
}

function changedTopLevelFields(
  before: Phase3Destination,
  after: Phase3Destination,
): string[] {
  return sortedUnique(
    [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (key) =>
        JSON.stringify(before[key as keyof Phase3Destination]) !==
        JSON.stringify(after[key as keyof Phase3Destination]),
    ),
  );
}

function catalogueIssueLedger(evaluations: Phase4Evaluation[]) {
  const byId = new Map(
    evaluations.map((evaluation) => [evaluation.id, evaluation]),
  );
  const ids = Object.keys(CATALOGUE_RELATIONSHIP_ISSUES).sort((left, right) =>
    left.localeCompare(right),
  );
  return ids.map((id) => {
    const evaluation = byId.get(id);
    if (!evaluation)
      throw new Error(`Catalogue issue is outside the frozen tail: ${id}`);
    const issue = CATALOGUE_RELATIONSHIP_ISSUES[id];
    if (evaluation.finalDecision !== "catalogue-relationship-issue") {
      throw new Error(
        `${id}: catalogue issue ledger decision drifted to ${evaluation.finalDecision}.`,
      );
    }
    return {
      id,
      issueType: issue.issueType,
      evidence: issue.evidence,
      recommendedAction: issue.recommendedAction,
      finalDecision: evaluation.finalDecision,
    };
  });
}

function reportFor(
  manifest: Phase4Manifest,
  cache: Phase4CacheFile,
  inputs: ReturnType<typeof loadInputs>,
  evaluations: Phase4Evaluation[],
  duplicateAudit: DuplicateIdentityAudit,
  invocationStage: "A" | "B",
) {
  const duplicateById = new Map<string, DuplicateIdentityGroup[]>();
  for (const group of duplicateAudit.duplicateGroups) {
    for (const id of group.destinationIds) {
      duplicateById.set(id, [...(duplicateById.get(id) ?? []), group]);
    }
  }
  const records = evaluations.map((evaluation) => ({
    ...evaluation,
    sourceModified: invocationStage === "B" ? evaluation.sourceModified : false,
    duplicateIdentityResult: duplicateById.get(evaluation.id) ?? null,
  }));
  const canonical = evaluations.filter(
    (evaluation) => evaluation.finalDecision === "canonical",
  );
  const noStandalone = evaluations.filter(
    (evaluation) => evaluation.finalDecision === "no-standalone-article",
  );
  const relationshipIssues = evaluations.filter(
    (evaluation) => evaluation.finalDecision === "catalogue-relationship-issue",
  );
  const permanent = evaluations.filter(
    (evaluation) => evaluation.finalDecision === "permanent-unresolved",
  );
  const humanReview = evaluations.filter(
    (evaluation) => evaluation.finalDecision === "needs-human-review",
  );
  const highConfidence = evaluations.filter(
    (evaluation) => evaluation.phase3State === "high-confidence-awaiting-apply",
  );
  const transientFailures = inputs.phase3Cache
    ? Object.values(inputs.phase3Cache.entries).filter(
        (entry) => entry.status === "transient-failure",
      ).length
    : 0;
  const proposedDestinations = inputs.destinations.map((destination) => ({
    ...destination,
  }));
  applyApprovedPhase4Identities(proposedDestinations, evaluations);
  const currentCanonical = inputs.destinations.filter(
    (destination) =>
      destination.status === "published" && hasExplicitIdentity(destination),
  ).length;
  const proposedCanonical = proposedDestinations.filter(
    (destination) =>
      destination.status === "published" && hasExplicitIdentity(destination),
  ).length;
  const sourceModifiedEvaluations =
    invocationStage === "B"
      ? evaluations.filter((evaluation) => evaluation.sourceModified)
      : [];
  const sourceModifiedCount = sourceModifiedEvaluations.length;
  const stage = invocationStage;
  const phase3StateCounts = Object.fromEntries(
    [
      "high-confidence-awaiting-apply",
      "ambiguous-candidate",
      "unresolved",
      "no-standalone-article-expected",
    ].map((state) => [
      state,
      evaluations.filter((evaluation) => evaluation.phase3State === state)
        .length,
    ]),
  );
  const safety = {
    similarityOnlyAcceptance: false,
    geographyBypassed: false,
    entityValidationBypassed: false,
    enJaEquivalenceGuessed: false,
    parentArticleSubstitution: false,
    allCandidatesSameNonEmptyQidRulePreserved: true,
    manualAdministrativeDisambiguations: Object.entries(CANONICAL_SELECTORS)
      .filter(([, selector]) => Boolean(selector.manualReason))
      .map(([id]) => id),
    phase3MinimumGatePreserved: true,
    phase1ReviewModified: false,
    transientFailures,
    targetedRetrievals: cache.targetedRetrievals.length,
    mutationFields: [...PHASE4_IDENTITY_FIELDS],
    duplicateAuditComplete: true,
    unclassifiedDuplicateGroups:
      duplicateAudit.counts["suspicious-needs-review"],
  };
  return {
    schemaVersion: PHASE4_SCHEMA_VERSION,
    scope: SCOPE,
    stage,
    manifestFingerprint: manifest.wholeTailFingerprint,
    phase4CacheFingerprint: fileFingerprint(CACHE_PATH),
    baseline: manifest.baseline,
    phase3StateCounts,
    counts: {
      tailPopulation: evaluations.length,
      canonicalApplied: invocationStage === "B" ? canonical.length : 0,
      noStandaloneArticleExpected: noStandalone.length,
      catalogueRelationshipIssue: relationshipIssues.length,
      permanentUnresolved: permanent.length,
      needsHumanReview: humanReview.length,
      highConfidenceAccepted: highConfidence.filter(
        (evaluation) => evaluation.approvalStatus === "ACCEPT",
      ).length,
      highConfidenceRejected: highConfidence.filter(
        (evaluation) => evaluation.approvalStatus === "REJECT",
      ).length,
      highConfidenceStillReview: highConfidence.filter(
        (evaluation) => evaluation.approvalStatus === "NEEDS_REVIEW",
      ).length,
      transientFailures,
    },
    finalCanonicalCoverage: {
      publishedDestinations: manifest.baseline.publishedDestinations,
      startingCanonical: manifest.baseline.startingCanonicalWikipediaIdentity,
      currentCanonical,
      proposedCanonical,
      proposedPercent: Number(
        (
          (proposedCanonical / manifest.baseline.publishedDestinations) *
          100
        ).toFixed(3),
      ),
    },
    execution: {
      sourceState:
        stage === "B" ? "approved-mappings-present" : "adjudication-only",
    },
    sourceMutation: {
      modifiedCount: sourceModifiedCount,
      modifiedIds: sourceModifiedEvaluations.map((evaluation) => evaluation.id),
      fields: sourceModifiedCount > 0 ? [...PHASE4_IDENTITY_FIELDS] : [],
    },
    highConfidenceReview: highConfidence.map((evaluation) => ({
      id: evaluation.id,
      inspectedAllCandidates: evaluation.inspectedAllCandidates,
      candidateCount: evaluation.candidateEvidence.length,
      outcome: evaluation.approvalStatus,
      selectedIdentity: evaluation.selectedIdentity,
      finalGate: evaluation.finalGate,
      decisionReason: evaluation.decisionReason,
    })),
    ambiguousAdjudication: evaluations
      .filter((evaluation) => evaluation.phase3State === "ambiguous-candidate")
      .map((evaluation) => ({
        id: evaluation.id,
        finalDecision: evaluation.finalDecision,
        selectedIdentity: evaluation.selectedIdentity,
        inspectedAllCandidates: evaluation.inspectedAllCandidates,
        decisionReason: evaluation.decisionReason,
      })),
    unresolvedAdjudication: evaluations
      .filter((evaluation) => evaluation.phase3State === "unresolved")
      .map((evaluation) => ({
        id: evaluation.id,
        finalDecision: evaluation.finalDecision,
        decisionReason: evaluation.decisionReason,
        candidateCount: evaluation.candidateEvidence.length,
      })),
    noStandaloneArticleLedger: evaluations
      .filter(
        (evaluation) => evaluation.finalDecision === "no-standalone-article",
      )
      .map((evaluation) => ({
        id: evaluation.id,
        evidence: evaluation.decisionReason,
        evidenceSource: "catalogue-source",
        adjudicationFingerprint:
          manifest.phase4AdjudicationFingerprints[evaluation.id],
      })),
    catalogueRelationshipIssues: catalogueIssueLedger(evaluations),
    newCanonicalMappings: canonical.map((evaluation) => ({
      id: evaluation.id,
      identity: evaluation.selectedIdentity,
    })),
    duplicateIdentityAudit: duplicateAudit,
    remainingHumanReview: humanReview.map((evaluation) => ({
      id: evaluation.id,
      phase3State: evaluation.phase3State,
      phase3Reason: evaluation.phase3Reason,
      decisionReason: evaluation.decisionReason,
    })),
    safety,
    artifactFingerprints: {
      tailManifest: fileFingerprint(MANIFEST_PATH),
      phase4Cache: fileFingerprint(CACHE_PATH),
      phase3Cohort: manifest.phase3CohortFingerprint,
      phase3Report: manifest.phase3ReportFingerprint,
      phase3Cache: manifest.phase3CacheFingerprint,
    },
    records,
  };
}

function validateExistingReport(manifest: Phase4Manifest): void {
  if (!existsSync(REPORT_PATH)) {
    throw new Error("Stage B requires the Stage A adjudication report.");
  }
  const report = readJson<{
    manifestFingerprint?: string;
    records?: Array<{ id: string }>;
  }>(REPORT_PATH);
  if (report.manifestFingerprint !== manifest.wholeTailFingerprint) {
    throw new Error(
      "Existing Phase 4 report is bound to a different manifest.",
    );
  }
  const ids = (report.records ?? []).map((record) => record.id).sort();
  if (hashStable(ids) !== hashStable([...manifest.ids].sort())) {
    throw new Error(
      "Existing Phase 4 report does not cover the frozen tail exactly.",
    );
  }
}

function parseOptions(): { apply: boolean } {
  const args = new Set(process.argv.slice(2));
  const unknown = [...args].filter(
    (arg) => arg !== "--offline" && arg !== "--apply",
  );
  if (unknown.length > 0)
    throw new Error(`Unsupported Phase 4 option: ${unknown.join(", ")}`);
  if (!args.has("--offline")) {
    throw new Error(
      "Phase 4 requires explicit --offline; broad or exploratory retrieval is disabled.",
    );
  }
  return { apply: args.has("--apply") };
}

function main(): void {
  const options = parseOptions();
  const inputsBefore = loadInputs();
  let manifest: Phase4Manifest;
  let phase4Cache: Phase4CacheFile;
  const manifestExists = existsSync(MANIFEST_PATH);
  const cacheExists = existsSync(CACHE_PATH);
  if (manifestExists !== cacheExists) {
    throw new Error(
      "Phase 4 manifest and offline cache must be created or present together.",
    );
  }
  if (!manifestExists) {
    phase4Cache = buildPhase4Cache(
      inputsBefore.destinations,
      inputsBefore.phase1,
      inputsBefore.phase3Cache,
    );
    manifest = buildPhase4Manifest(
      inputsBefore.destinations,
      inputsBefore.phase1,
      inputsBefore.phase3Cohort,
      inputsBefore.phase3Report,
      inputsBefore.phase3Cache,
    );
    phase4Cache.manifestFingerprint = manifest.wholeTailFingerprint;
    writeJson(MANIFEST_PATH, manifest);
    writeJson(CACHE_PATH, phase4Cache);
    formatGeneratedJson([MANIFEST_PATH, CACHE_PATH]);
  } else {
    manifest = readJson<Phase4Manifest>(MANIFEST_PATH);
    phase4Cache = readJson<Phase4CacheFile>(CACHE_PATH);
  }
  if (options.apply) validateExistingReport(manifest);
  const inputs = loadInputs();
  validatePhase4Inputs(manifest, phase4Cache, inputs);
  const evaluationsBefore = evaluateTail(manifest, inputs);
  if (evaluationsBefore.length !== manifest.baseline.tailPopulation) {
    throw new Error(
      "Phase 4 evaluation did not cover the frozen tail exactly.",
    );
  }
  const duplicateBefore = buildDuplicateIdentityAudit(
    inputs.destinations,
    evaluationsBefore,
  );
  if (duplicateBefore.counts["suspicious-needs-review"] > 0) {
    throw new Error(
      "Phase 4 duplicate identity audit found an unclassified duplicate.",
    );
  }
  const sourceBefore = inputs.destinations.map((destination) => ({
    ...destination,
  }));
  const phase1IdentityBefore = phase1ReviewIdentityFingerprints(
    inputs.destinations,
    inputs.phase1,
  );
  let applied = 0;
  let changedIds: string[] = [];
  if (options.apply) {
    if (
      Object.values(inputs.phase3Cache.entries).some(
        (entry) => entry.status === "transient-failure",
      )
    ) {
      throw new Error(
        "Phase 4 apply is closed because a Phase 3 transient failure exists.",
      );
    }
    changedIds = applyApprovedPhase4Identities(
      inputs.destinations,
      evaluationsBefore,
    );
    applied = changedIds.length;
    for (const before of sourceBefore) {
      const after = inputs.destinations.find(
        (destination) => destination.id === before.id,
      )!;
      if (nonIdentityFingerprint(before) !== nonIdentityFingerprint(after)) {
        throw new Error(
          `${before.id}: Phase 4 attempted a non-identity source mutation.`,
        );
      }
      const changedFields = changedTopLevelFields(before, after);
      if (
        changedFields.some(
          (field) =>
            !PHASE4_IDENTITY_FIELDS.includes(field as Phase4IdentityField),
        )
      ) {
        throw new Error(
          `${before.id}: mutation outside the five Wikipedia identity fields: ${changedFields.join(", ")}`,
        );
      }
    }
    if (
      hashStable(phase1IdentityBefore) !==
      hashStable(
        phase1ReviewIdentityFingerprints(inputs.destinations, inputs.phase1),
      )
    ) {
      throw new Error("Phase 4 changed a Phase 1 review identity.");
    }
    if (applied > 0) writeJson(INDEX_PATH, inputs.destinations);
  }
  const finalInputs = options.apply ? loadInputs() : inputs;
  validatePhase4Inputs(manifest, phase4Cache, finalInputs);
  const finalEvaluations = evaluateTail(manifest, finalInputs);
  const duplicateAudit = buildDuplicateIdentityAudit(
    finalInputs.destinations,
    finalEvaluations,
  );
  if (duplicateAudit.counts["suspicious-needs-review"] > 0) {
    throw new Error(
      "Phase 4 duplicate identity audit found an unclassified duplicate after apply.",
    );
  }
  const report = reportFor(
    manifest,
    phase4Cache,
    finalInputs,
    finalEvaluations,
    duplicateAudit,
    options.apply ? "B" : "A",
  );
  writeJson(REPORT_PATH, report);
  formatGeneratedJson([MANIFEST_PATH, CACHE_PATH, REPORT_PATH]);
  console.log(
    JSON.stringify(
      {
        scope: SCOPE,
        invocationStage: options.apply ? "B" : "A",
        reportStage: report.stage,
        offline: true,
        applyRequested: options.apply,
        applied,
        counts: report.counts,
        sourceMutation: report.sourceMutation,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
