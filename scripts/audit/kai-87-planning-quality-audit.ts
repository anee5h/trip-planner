#!/usr/bin/env tsx
/**
 * KAI-87: deterministic, read-only planning-critical catalogue audit.
 *
 * This script audits the current canonical index and the already-generated
 * detail/route assets. It never writes catalogue data, changes recommendation
 * semantics, or feeds the quality score into ranking. Reports are written only
 * when --output-dir is supplied (or to stdout in JSON mode).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Destination } from "../../src/shared/types/destination.js";
import { normalizeBudgetState } from "../../src/shared/services/budget/budgetState.js";
import { calculateTripEstimate } from "../../src/shared/services/budget/tripEstimateEngine.js";
import { getCanonicalTransportCost } from "../../src/shared/services/transport/transportCostV2.js";
import { getOriginAwareTransportEstimate } from "../../src/shared/services/transport/OriginAwareTransportService.js";
import {
  getTravelDurationEvidence,
  getVisitBand,
  matchesVisitDuration,
} from "../../src/shared/services/recommendation/TripDurationService.js";
import { getValidModes } from "../../src/shared/services/recommendation/RecommendationScorer.js";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "../../src/shared/services/transport/TransportTopologyService.js";
import type { TripDuration } from "../../src/shared/types/tripDuration.js";

type JsonRecord = Record<string, unknown>;
export type SemanticState =
  | "verified"
  | "derived"
  | "explicit_free"
  | "unknown"
  | "unavailable"
  | "not_applicable"
  | "suspicious";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type QualityGrade = SemanticState | "complete" | "partial";

const PUBLIC_MODES = ["train", "shinkansen", "bus", "flight", "ferry"] as const;
const ORIGIN_MATRIX = [
  {
    key: "nakayama",
    label: "Nakayama Station, Kanagawa",
    lat: 35.5147,
    lng: 139.5393,
  },
  { key: "tokyo", label: "Tokyo", lat: 35.6812, lng: 139.7671 },
  { key: "osaka", label: "Osaka", lat: 34.7025, lng: 135.4959 },
  { key: "hakata", label: "Hakata", lat: 33.5902, lng: 130.4017 },
  { key: "naha", label: "Naha", lat: 26.2124, lng: 127.6809 },
] as const;
const QUALITY_WEIGHTS = {
  transport: 30,
  budget: 25,
  seasonality: 15,
  logistics: 15,
  contentIntegrity: 10,
  provenance: 5,
} as const;
const DETAIL_DIR = "public/data/destinations";
const INDEX_PATH = "src/shared/data/destinations-index.json";
const ROUTE_FILES = [
  "ground-routes.json",
  "bus-routes.json",
  "flight-estimates.json",
  "ferry-routes.json",
  "ferry-estimates.json",
] as const;

export interface AuditOptions {
  readonly generatedDetails?: ReadonlyMap<string, unknown>;
  readonly routeRegistries?: Readonly<Record<string, unknown>>;
  readonly origins?: readonly (typeof ORIGIN_MATRIX)[number][];
}

interface Metric {
  count: number;
  ids: string[];
}

interface ModeEvidence {
  state: SemanticState;
  staticState: SemanticState;
  originKeys: string[];
  validOriginKeys: string[];
  sources: string[];
}

interface DestinationTransportAudit {
  supportedPublicTransportModes: string[];
  modeEvidence: Record<string, ModeEvidence>;
  personalCar: ModeEvidence;
  rentalCar: ModeEvidence;
  originAwareRouteEvidence: SemanticState;
  nearestUsefulStation: SemanticState;
  busLocalAvailability: SemanticState;
  localTransportCost: SemanticState;
  parkingAvailability: SemanticState;
  parkingCost: SemanticState;
  tollFuelAssumptions: SemanticState;
  rentalCarFacts: SemanticState;
  contradictions: string[];
  unreachableDueMissingData: boolean;
  criticalGap: boolean;
  issueCodes: string[];
}

interface DestinationBudgetAudit {
  intercityTransport: SemanticState;
  localTransport: SemanticState;
  food: SemanticState;
  admissions: SemanticState;
  parking: SemanticState;
  tollsFuel: SemanticState;
  rentalCarInputs: SemanticState;
  accommodationRanges: SemanticState;
  verifiedFreeFacts: SemanticState;
  estimateProbe: {
    fullDay: string;
    twoDayOneNight: string;
    threeDayTwoNight: string;
    partyNightMultiplicationConsistent: boolean;
  };
  state: "complete" | "partial" | "unknown-critical" | "suspicious";
  suspiciousCodes: string[];
  criticalGap: boolean;
}

interface DestinationSeasonalityAudit {
  state: SemanticState;
  structured: boolean;
  bestSeason: string | null;
  bestMonths: number[];
  likelyProfiles: string[];
  declaredAllYear: boolean;
  verifiedAllYear: boolean;
  enJaParity: SemanticState;
  provenance: SemanticState;
  issueCodes: string[];
}

interface DestinationLogisticsAudit {
  state: "complete" | "partial" | "critical-gap";
  recommendedVisitDuration: SemanticState;
  suitability: {
    shortOuting: boolean | null;
    halfDay: boolean | null;
    fullDay: boolean | null;
    twoDayOneNight: boolean;
    threeDayTwoNight: boolean;
  };
  reservation: SemanticState;
  openingCaveat: SemanticState;
  weatherSensitivity: SemanticState;
  accessCaveat: SemanticState;
  accessibility: SemanticState;
  relationships: SemanticState;
  issueCodes: string[];
}

interface DestinationContentAudit {
  state: QualityGrade;
  enJaParity: SemanticState;
  relationships: SemanticState;
  issueCodes: string[];
}

interface DestinationProvenanceAudit {
  state: SemanticState;
  sourceCount: number;
  fieldSourceCount: number;
  freshness: string | null;
}

interface DestinationAudit {
  id: string;
  name: string;
  recommendationVisible: boolean;
  importance: string | null;
  transport: DestinationTransportAudit;
  budget: DestinationBudgetAudit;
  seasonality: DestinationSeasonalityAudit;
  logistics: DestinationLogisticsAudit;
  contentIntegrity: DestinationContentAudit;
  provenance: DestinationProvenanceAudit;
  qualityScore: number;
  priority: Priority;
  priorityReasons: string[];
  issues: string[];
}

export interface PlanningAuditReport {
  schemaVersion: 1;
  ticket: "KAI-87";
  scope: {
    canonicalSource: string;
    representativeOrigins: readonly {
      key: string;
      label: string;
      coordinates: { lat: number; lng: number };
    }[];
    semanticStates: SemanticState[];
    auditOnly: true;
  };
  inputs: {
    canonicalSha256?: string;
    generatedDetailCount: number;
    routeFileSha256?: Record<string, string>;
    generatedSynchronization: {
      missingDetailIds: string[];
      orphanDetailIds: string[];
      mismatchedDetailIds: string[];
      synchronized: boolean;
    };
  };
  catalogue: {
    canonicalCount: number;
    canonicalUniqueCount: number;
    recommendationVisibleCount: number;
    recommendationHiddenCount: number;
    duplicateIds: string[];
    recommendationVisibleIds: string[];
    recommendationHiddenIds: string[];
  };
  transport: {
    summary: Record<string, Metric>;
    routeRegistry: Record<string, unknown>;
    destinations: Record<string, DestinationTransportAudit>;
  };
  budget: {
    summary: Record<string, Metric>;
    destinations: Record<string, DestinationBudgetAudit>;
  };
  seasonality: {
    summary: Record<string, Metric>;
    destinations: Record<string, DestinationSeasonalityAudit>;
  };
  logistics: {
    summary: Record<string, Metric>;
    destinations: Record<string, DestinationLogisticsAudit>;
  };
  priority: Record<Priority, string[]>;
  qualityScore: {
    weights: typeof QUALITY_WEIGHTS;
    scoresByDestination: Record<string, number>;
    median: number;
    p10: number;
    p25: number;
    below60: string[];
    below70: string[];
    below80: string[];
    distributionBuckets: Record<string, Metric>;
    lowestScoringRecommendationVisible: string[];
  };
  systemicRootCauses: Array<{
    category: string;
    determination: string;
    ids: string[];
  }>;
  residualLedger: Record<string, { priority: Priority; issues: string[] }>;
  destinations: Record<string, DestinationAudit>;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function nonNegative(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function metric(ids: Iterable<string>): Metric {
  const stable = sorted(ids);
  return { count: stable.length, ids: stable };
}

function idsWhere(
  records: ReadonlyMap<string, DestinationAudit>,
  predicate: (record: DestinationAudit) => boolean,
): Metric {
  return metric(
    [...records.values()].filter(predicate).map((record) => record.id),
  );
}

function fieldSources(raw: JsonRecord, field: string): JsonRecord[] {
  const editorial = asRecord(raw.editorial);
  return asArray(asRecord(editorial.fieldSources)[field]).map(asRecord);
}

function hasAuthoritativeSource(raw: JsonRecord, field: string): boolean {
  const sourceTypes = new Set(["official", "government", "tourism_board"]);
  return fieldSources(raw, field).some((source) => {
    const url = text(source.url);
    return Boolean(url && sourceTypes.has(text(source.type) ?? ""));
  });
}

function sourceCount(raw: JsonRecord): number {
  const editorial = asRecord(raw.editorial);
  const direct = asArray(editorial.sources).length;
  const fields = Object.values(asRecord(editorial.fieldSources)).reduce(
    (total, value) => total + asArray(value).length,
    0,
  );
  return direct + fields;
}

function sourceState(
  raw: JsonRecord,
  field: string,
  fallback: SemanticState = "unknown",
): SemanticState {
  if (hasAuthoritativeSource(raw, field)) return "verified";
  return fallback;
}

function staticModeState(raw: JsonRecord, mode: string): SemanticState {
  const options = asRecord(raw.transportOptions);
  const value = options[mode];
  if (value === undefined) return "unknown";
  if (nonNegative(value) === undefined || (value === 0 && mode !== "train"))
    return "suspicious";
  const metadata = asRecord(raw.transportMetadata);
  const method = text(metadata.method);
  if (method === "source-verified") return "verified";
  if (method === "calculated" || method === "legacy-fallback") return "derived";
  return "unknown";
}

function strongestState(states: SemanticState[]): SemanticState {
  if (states.includes("suspicious")) return "suspicious";
  if (states.includes("verified")) return "verified";
  if (states.includes("explicit_free")) return "explicit_free";
  if (states.includes("derived")) return "derived";
  if (states.includes("unknown")) return "unknown";
  if (states.includes("unavailable")) return "unavailable";
  return "not_applicable";
}

function classifyAdmission(
  destination: Destination | JsonRecord,
): SemanticState {
  const raw = asRecord(destination);
  const admission = asRecord(raw.admission);
  const state =
    text(admission.state) ?? text(asRecord(raw.budgetMetadata).state);
  if (state === "verified_free") return "explicit_free";
  if (state === "verified_paid") return "verified";
  if (state === "documented_estimate" || state === "variable_price")
    return "derived";
  if (state === "not_applicable") return "not_applicable";
  if (state === "unavailable" || state === "legacy_unverified")
    return "unavailable";
  const budget = normalizeBudgetState(raw as unknown as Destination);
  if (budget.state === "verified_free") return "explicit_free";
  if (budget.state === "verified_paid") return "verified";
  if (budget.state === "documented_estimate") return "derived";
  if (budget.state === "not_applicable") return "not_applicable";
  return "unknown";
}

export { classifyAdmission };

function validSeasonVector(raw: JsonRecord): boolean {
  const season = asRecord(raw.season);
  return ["spring", "summer", "autumn", "winter"].every((key) => {
    const value = finiteNumber(season[key]);
    return value !== undefined && value >= 0 && value <= 10;
  });
}

function validMonths(raw: JsonRecord): number[] {
  return asArray(raw.bestMonths)
    .map(finiteNumber)
    .filter((month): month is number => month !== undefined)
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
}

function likelySeasonProfiles(raw: JsonRecord): string[] {
  const haystack = JSON.stringify({
    id: raw.id,
    name: raw.name,
    nameJa: raw.nameJa,
    categories: raw.categories,
    tags: raw.tags,
    description: raw.description,
    highlights: raw.highlights,
  }).toLowerCase();
  const profiles: string[] = [];
  if (/sakura|cherry|桜|花見/.test(haystack)) profiles.push("sakura");
  if (/autumn|fall foliage|momiji|紅葉/.test(haystack))
    profiles.push("autumn_foliage");
  if (/snow|ski|winter|雪|スキー/.test(haystack)) profiles.push("snow_winter");
  if (/alpine|mount|mountain|highland|山岳|高原/.test(haystack))
    profiles.push("alpine_mountain");
  if (/beach|coast|island|sea|summer|浜|海|島/.test(haystack))
    profiles.push("beach_summer");
  return profiles;
}

function classifySeasonality(
  destination: Destination | JsonRecord,
): SemanticState {
  const raw = asRecord(destination);
  const seasonText = text(raw.bestSeason)
    ?.toLowerCase()
    .replace(/[\s-]+/g, "");
  const months = validMonths(raw);
  const monthValues = asArray(raw.bestMonths);
  const metadata = asRecord(raw.seasonMetadata);
  const method = text(metadata.method);
  if (
    monthValues.some((value) => finiteNumber(value) === undefined) ||
    months.length !== monthValues.length ||
    (Object.keys(asRecord(raw.season)).length > 0 && !validSeasonVector(raw))
  ) {
    return "suspicious";
  }
  if (seasonText === "allyear" && !hasAuthoritativeSource(raw, "bestSeason")) {
    return "suspicious";
  }
  if (!validSeasonVector(raw) && months.length === 0 && !text(raw.bestSeason))
    return "unknown";
  if (method === "manual" || method === "assisted") return "verified";
  if (method === "model") return "derived";
  if (method === "unknown") return "unknown";
  return "unknown";
}

export { classifySeasonality };

function classifyLocalTransport(raw: JsonRecord): SemanticState {
  const local = raw.localTransport;
  if (local === undefined) return "unknown";
  const kind = text(asRecord(local).kind);
  if (kind === "verified_required_access" || kind === "verified_walking") {
    const sourceUrls = asArray(asRecord(local).sourceUrls).filter((value) =>
      Boolean(text(value)),
    );
    return sourceUrls.length > 0 ? "verified" : "suspicious";
  }
  if (kind === "bounded_defensible_access") return "derived";
  if (kind === "not_applicable") return "not_applicable";
  if (kind === "unavailable") return "unavailable";
  return "suspicious";
}

function routeEvidenceForMode(
  destination: Destination,
  mode: string,
  origins: readonly (typeof ORIGIN_MATRIX)[number][],
): ModeEvidence {
  const staticState = staticModeState(
    asRecord(destination),
    mode === "car" || mode === "my_car" ? "car" : mode,
  );
  const originKeys: string[] = [];
  const validOriginKeys: string[] = [];
  const sources: string[] = [];
  const states: SemanticState[] = [];
  for (const origin of origins) {
    const coordinates = { lat: origin.lat, lng: origin.lng };
    const originZoneId = resolveOriginTransportZone({ coordinates });
    try {
      const validModes = getValidModes(
        destination,
        mode === "my_car" ? "my_car" : mode === "car" ? "rental" : "none",
        PUBLIC_MODES.includes(mode as (typeof PUBLIC_MODES)[number])
          ? [mode]
          : [],
        coordinates,
        undefined,
        originZoneId,
      );
      if (
        validModes.includes(
          mode === "my_car" ? "my_car" : mode === "car" ? "car" : mode,
        )
      ) {
        validOriginKeys.push(origin.key);
      }
      const estimate = PUBLIC_MODES.includes(
        mode as (typeof PUBLIC_MODES)[number],
      )
        ? getOriginAwareTransportEstimate(
            destination,
            {
              homeStationCoords: coordinates,
              originZoneId,
            },
            [mode as never],
          )
        : undefined;
      const carEvidence =
        mode === "my_car" || mode === "car"
          ? getTravelDurationEvidence(
              destination,
              { homeStationCoords: coordinates, originZoneId },
              [mode],
              [mode],
            )
          : undefined;
      if (
        estimate ||
        carEvidence?.evidence === "verified" ||
        carEvidence?.evidence === "estimated"
      ) {
        originKeys.push(origin.key);
        const evidence = estimate?.evidence ?? carEvidence?.evidence;
        states.push(evidence === "verified" ? "verified" : "derived");
        if (estimate?.source) sources.push(estimate.source);
        if (estimate?.sourceUrl) sources.push(estimate.sourceUrl);
      }
    } catch {
      states.push("unknown");
    }
  }
  if (
    states.length === 0 &&
    staticState !== "unknown" &&
    staticState !== "suspicious"
  ) {
    states.push(staticState);
  }
  return {
    state: strongestState(states.length > 0 ? states : [staticState]),
    staticState,
    originKeys: sorted(originKeys),
    validOriginKeys: sorted(validOriginKeys),
    sources: sorted(sources),
  };
}

function auditParking(raw: JsonRecord): SemanticState {
  if (raw.parking === undefined) return "unknown";
  if (typeof raw.parking !== "string") return "suspicious";
  if (!raw.parking.trim()) return "unknown";
  return hasAuthoritativeSource(raw, "parking") ? "verified" : "unknown";
}

function auditTransport(
  destination: Destination,
  origins: readonly (typeof ORIGIN_MATRIX)[number][],
): DestinationTransportAudit {
  const raw = asRecord(destination);
  const modeEvidence: Record<string, ModeEvidence> = {};
  for (const mode of PUBLIC_MODES)
    modeEvidence[mode] = routeEvidenceForMode(destination, mode, origins);
  modeEvidence.my_car = routeEvidenceForMode(destination, "my_car", origins);
  modeEvidence.car = routeEvidenceForMode(destination, "car", origins);

  const localModes = asArray(raw.localAccessModes)
    .map(text)
    .filter((value): value is string => Boolean(value));
  const staticModes = Object.keys(asRecord(raw.transportOptions)).filter(
    (mode) => [...PUBLIC_MODES, "car", "my_car"].includes(mode),
  );
  const supportedPublicTransportModes = sorted([
    ...staticModes.filter((mode) =>
      PUBLIC_MODES.includes(mode as (typeof PUBLIC_MODES)[number]),
    ),
    ...localModes.filter((mode) =>
      PUBLIC_MODES.includes(mode as (typeof PUBLIC_MODES)[number]),
    ),
    ...PUBLIC_MODES.filter(
      (mode) =>
        modeEvidence[mode].state === "verified" ||
        modeEvidence[mode].state === "derived",
    ),
  ]);
  const publicState = strongestState(
    PUBLIC_MODES.map((mode) => modeEvidence[mode].state),
  );
  const localModesDeclared = localModes.length > 0;
  const contradictionCodes: string[] = [];
  if (
    raw.transportOptions !== undefined &&
    typeof raw.transportOptions !== "object"
  ) {
    contradictionCodes.push("transport_options_wrong_shape");
  }
  if (localModesDeclared && raw.localAccessUnestimated !== true) {
    for (const mode of localModes) {
      if (
        !staticModes.includes(mode) &&
        !PUBLIC_MODES.includes(mode as (typeof PUBLIC_MODES)[number])
      ) {
        contradictionCodes.push(`local_mode_without_static_support:${mode}`);
      }
    }
  }
  const destinationZone = (() => {
    try {
      return resolveDestinationTransportZone(destination);
    } catch {
      return "unknown";
    }
  })();
  if (
    destinationZone === "unknown" &&
    supportedPublicTransportModes.length === 0 &&
    modeEvidence.my_car.state === "unknown" &&
    modeEvidence.car.state === "unknown"
  ) {
    contradictionCodes.push("unmapped_transport_zone");
  }
  const transportFares = asRecord(raw.transportFares);
  const fareKeys = Object.keys(transportFares);
  if (
    fareKeys.some((mode) => nonNegative(transportFares[mode]) === undefined)
  ) {
    contradictionCodes.push("invalid_transport_fare");
  }
  const routeState = publicState === "not_applicable" ? "unknown" : publicState;
  const noUsable = [
    routeState,
    modeEvidence.my_car.state,
    modeEvidence.car.state,
  ].every((state) => state === "unknown" || state === "unavailable");
  const unreachableDueMissingData = noUsable && contradictionCodes.length === 0;
  const issueCodes = [...contradictionCodes];
  if (unreachableDueMissingData)
    issueCodes.push("unreachable_due_missing_transport_data");
  if (modeEvidence.my_car.state === "unknown")
    issueCodes.push("personal_car_viability_unknown");
  if (modeEvidence.car.state === "unknown")
    issueCodes.push("rental_car_viability_unknown");
  if (supportedPublicTransportModes.length === 0)
    issueCodes.push("public_transport_support_unknown");
  return {
    supportedPublicTransportModes,
    modeEvidence,
    personalCar: modeEvidence.my_car,
    rentalCar: modeEvidence.car,
    originAwareRouteEvidence: routeState,
    nearestUsefulStation: text(raw.nearestStation)
      ? sourceState(raw, "nearestStation", "derived")
      : "unknown",
    busLocalAvailability: modeEvidence.bus.state,
    localTransportCost: classifyLocalTransport(raw),
    parkingAvailability: auditParking(raw),
    parkingCost: "unavailable",
    tollFuelAssumptions: fareKeys.some(
      (mode) => mode === "car" || mode === "my_car",
    )
      ? "derived"
      : "unavailable",
    rentalCarFacts: fareKeys.some((mode) => mode === "car")
      ? "derived"
      : "unavailable",
    contradictions: sorted(contradictionCodes),
    unreachableDueMissingData,
    criticalGap: contradictionCodes.length > 0 || unreachableDueMissingData,
    issueCodes: sorted(issueCodes),
  };
}

function admissionHasSuspiciousZero(
  raw: JsonRecord,
  admission: SemanticState,
): boolean {
  const budget = asRecord(raw.budgetBreakdown);
  return (
    budget.tickets === 0 &&
    admission !== "explicit_free" &&
    admission !== "not_applicable"
  );
}

function estimateKind(
  destination: Destination,
  mode: string | undefined,
  duration: TripDuration,
  partySize: number,
  coordinates?: { lat: number; lng: number },
): string {
  try {
    return calculateTripEstimate({
      dest: destination,
      mode,
      duration,
      partySize,
      homeCoords: coordinates,
      includeOriginTravel: Boolean(mode && coordinates),
      budgetTier: "standard",
    }).completeness;
  } catch {
    return "error";
  }
}

function accommodationRange(
  result: ReturnType<typeof calculateTripEstimate>,
): [number, number] | null {
  const component = result.components.find(
    (item) => item.evidence.scope === "accommodation",
  );
  return component?.cost.kind === "bounded"
    ? [component.cost.min, component.cost.max]
    : null;
}

function auditBudget(
  destination: Destination,
  transport: DestinationTransportAudit,
  origins: readonly (typeof ORIGIN_MATRIX)[number][],
): DestinationBudgetAudit {
  const raw = asRecord(destination);
  const admission = classifyAdmission(destination);
  const local = transport.localTransportCost;
  const transportStates: SemanticState[] = [];
  for (const origin of origins) {
    const coordinates = { lat: origin.lat, lng: origin.lng };
    const originZoneId = resolveOriginTransportZone({ coordinates });
    for (const mode of PUBLIC_MODES) {
      try {
        const result = getCanonicalTransportCost(
          destination,
          mode,
          2,
          coordinates,
        );
        if (
          result.cost.kind === "bounded" ||
          result.cost.kind === "open_ended"
        ) {
          transportStates.push(
            result.evidence.derivation === "source_fact"
              ? "verified"
              : "derived",
          );
        }
      } catch {
        transportStates.push("unknown");
      }
    }
    if (originZoneId === "unknown") transportStates.push("unknown");
  }
  const intercityTransport = strongestState(
    transportStates.length > 0 ? transportStates : ["unknown"],
  );
  const suspiciousCodes: string[] = [];
  if (admissionHasSuspiciousZero(raw, admission))
    suspiciousCodes.push("zero_ticket_without_verified_free");
  const budgetMetadata = asRecord(raw.budgetMetadata);
  const legacyNumbers = [
    raw.budgetMin,
    raw.budgetMax,
    raw.budgetRecommended,
    ...Object.values(asRecord(raw.budgetBreakdown)),
  ];
  if (
    (text(budgetMetadata.method) === "unknown" ||
      text(budgetMetadata.method) === "legacy") &&
    legacyNumbers.some((value) => finiteNumber(value) !== undefined)
  ) {
    suspiciousCodes.push("numeric_budget_with_unknown_or_legacy_provenance");
  }
  if (
    raw.budgetMin !== undefined &&
    raw.budgetMax !== undefined &&
    (nonNegative(raw.budgetMin) === undefined ||
      nonNegative(raw.budgetMax) === undefined ||
      Number(raw.budgetMin) > Number(raw.budgetMax))
  ) {
    suspiciousCodes.push("invalid_budget_range");
  }
  const fullDay = estimateKind(destination, undefined, "fullDay", 2);
  const twoDayOneNight = estimateKind(destination, undefined, "2d1n", 2);
  const threeDayTwoNight = estimateKind(destination, undefined, "3d2n", 2);
  let partyNightMultiplicationConsistent = true;
  try {
    const one = calculateTripEstimate({
      dest: destination,
      duration: "2d1n",
      partySize: 1,
      budgetTier: "standard",
    });
    const two = calculateTripEstimate({
      dest: destination,
      duration: "2d1n",
      partySize: 2,
      budgetTier: "standard",
    });
    const oneRange = accommodationRange(one);
    const twoRange = accommodationRange(two);
    partyNightMultiplicationConsistent =
      JSON.stringify(oneRange) === JSON.stringify(twoRange);
    if (!partyNightMultiplicationConsistent)
      suspiciousCodes.push("accommodation_party_multiplication_drift");
  } catch {
    suspiciousCodes.push("estimate_probe_error");
    partyNightMultiplicationConsistent = false;
  }
  const food: SemanticState = "derived";
  const accommodationRanges: SemanticState = "derived";
  const verifiedFreeFacts =
    admission === "explicit_free" ? "explicit_free" : admission;
  const state =
    suspiciousCodes.length > 0
      ? "suspicious"
      : admission === "unknown" ||
          admission === "unavailable" ||
          local === "unknown" ||
          local === "unavailable" ||
          intercityTransport === "unknown"
        ? "unknown-critical"
        : admission === "verified" ||
            admission === "explicit_free" ||
            admission === "not_applicable"
          ? "partial"
          : "partial";
  return {
    intercityTransport,
    localTransport: local,
    food,
    admissions: admission,
    parking: "unavailable",
    tollsFuel: "unavailable",
    rentalCarInputs: "unavailable",
    accommodationRanges,
    verifiedFreeFacts,
    estimateProbe: {
      fullDay,
      twoDayOneNight,
      threeDayTwoNight,
      partyNightMultiplicationConsistent,
    },
    state,
    suspiciousCodes: sorted(suspiciousCodes),
    criticalGap: state === "unknown-critical" || state === "suspicious",
  };
}

function classifyEnJa(raw: JsonRecord): SemanticState {
  const content = asRecord(raw.content);
  const ja = asRecord(content.ja);
  if (Object.keys(ja).length === 0 && !text(raw.nameJa)) return "unknown";
  const en = asRecord(content.en);
  const fields = ["name", "description", "highlights"];
  const drift = fields.some((field) => {
    const enValue = en[field];
    const jaValue = ja[field];
    return enValue !== undefined && jaValue === undefined;
  });
  return drift ? "suspicious" : "verified";
}

function auditSeasonality(raw: JsonRecord): DestinationSeasonalityAudit {
  const state = classifySeasonality(raw);
  const months = validMonths(raw);
  const season = asRecord(raw.season);
  const structured = validSeasonVector(raw) || months.length > 0;
  const bestSeason = text(raw.bestSeason) ?? null;
  const declaredAllYear = Boolean(
    bestSeason && bestSeason.toLowerCase().replace(/[\s-]+/g, "") === "allyear",
  );
  const verifiedAllYear =
    declaredAllYear &&
    (text(asRecord(raw.seasonMetadata).method) === "manual" ||
      text(asRecord(raw.seasonMetadata).method) === "assisted") &&
    hasAuthoritativeSource(raw, "bestSeason");
  const metadataMethod = text(asRecord(raw.seasonMetadata).method);
  const provenance: SemanticState =
    metadataMethod === "manual" || metadataMethod === "assisted"
      ? "verified"
      : metadataMethod === "model"
        ? "derived"
        : metadataMethod === "unknown"
          ? "unknown"
          : "unknown";
  const issueCodes: string[] = [];
  if (state === "suspicious")
    issueCodes.push("invalid_or_placeholder_seasonality");
  if (declaredAllYear && !verifiedAllYear)
    issueCodes.push("unverified_all_year_placeholder");
  if (Object.keys(season).length > 0 && !validSeasonVector(raw))
    issueCodes.push("invalid_season_vector");
  return {
    state,
    structured,
    bestSeason,
    bestMonths: months,
    likelyProfiles: likelySeasonProfiles(raw),
    declaredAllYear,
    verifiedAllYear,
    enJaParity: classifyEnJa(raw),
    provenance,
    issueCodes: sorted(issueCodes),
  };
}

function visitDurationState(raw: JsonRecord): SemanticState {
  const visit = asRecord(raw.recommendedVisitHours);
  if (Object.keys(visit).length === 0) return "unknown";
  const min = nonNegative(visit.min);
  const max = nonNegative(visit.max);
  return min !== undefined && max !== undefined && max >= min && max <= 48
    ? "derived"
    : "suspicious";
}

function caveatState(raw: JsonRecord, field: string): SemanticState {
  if (text(raw[field])) return sourceState(raw, field, "derived");
  const content = asRecord(raw.content);
  if (text(asRecord(content.en)[field]))
    return sourceState(raw, field, "derived");
  return "unknown";
}

function auditLogistics(raw: JsonRecord): DestinationLogisticsAudit {
  const duration = visitDurationState(raw);
  let visitBand: "shortOuting" | "halfDay" | "fullDay" | null = null;
  try {
    visitBand = getVisitBand(raw as unknown as Destination);
  } catch {
    visitBand = null;
  }
  const suitability = {
    shortOuting: visitBand === null ? null : visitBand === "shortOuting",
    halfDay: visitBand === null ? null : visitBand === "halfDay",
    fullDay: visitBand === null ? null : visitBand === "fullDay",
    twoDayOneNight: matchesVisitDuration(raw as unknown as Destination, "2d1n"),
    threeDayTwoNight: matchesVisitDuration(
      raw as unknown as Destination,
      "3d2n",
    ),
  };
  const issueCodes: string[] = [];
  if (duration === "unknown")
    issueCodes.push("recommended_visit_duration_missing");
  if (duration === "suspicious")
    issueCodes.push("recommended_visit_duration_invalid");
  const reservation = caveatState(raw, "reservation");
  const openingCaveat = caveatState(raw, "openingHours");
  const weatherSensitivity = text(raw.weatherDependence)
    ? "derived"
    : "unknown";
  const accessCaveat =
    text(raw.accessNotes) || text(raw.access) || text(raw.notes)
      ? "derived"
      : "unknown";
  const accessibility =
    raw.accessibility === undefined ? "unavailable" : "verified";
  const relationships =
    Object.keys(asRecord(raw.relationships)).length > 0 ? "derived" : "unknown";
  if (reservation === "unknown")
    issueCodes.push("reservation_requirement_missing");
  if (openingCaveat === "unknown") issueCodes.push("opening_caveat_missing");
  if (weatherSensitivity === "unknown")
    issueCodes.push("weather_sensitivity_missing");
  if (accessCaveat === "unknown") issueCodes.push("access_caveat_missing");
  if (relationships === "unknown")
    issueCodes.push("destination_relationships_missing");
  const critical = duration === "unknown" || duration === "suspicious";
  const state = critical
    ? "critical-gap"
    : issueCodes.length > 0
      ? "partial"
      : "complete";
  return {
    state,
    recommendedVisitDuration: duration,
    suitability,
    reservation,
    openingCaveat,
    weatherSensitivity,
    accessCaveat,
    accessibility,
    relationships,
    issueCodes: sorted(issueCodes),
  };
}

function auditContent(raw: JsonRecord): DestinationContentAudit {
  const enJaParity = classifyEnJa(raw);
  const relationships =
    Object.keys(asRecord(raw.relationships)).length > 0 ? "derived" : "unknown";
  const issues: string[] = [];
  if (enJaParity === "unknown") issues.push("ja_content_missing");
  if (enJaParity === "suspicious") issues.push("en_ja_structure_drift");
  if (relationships === "unknown") issues.push("relationships_missing");
  return {
    state: issues.length === 0 ? "complete" : "partial",
    enJaParity,
    relationships,
    issueCodes: sorted(issues),
  };
}

function auditProvenance(raw: JsonRecord): DestinationProvenanceAudit {
  const editorial = asRecord(raw.editorial);
  const freshness = text(editorial.freshness) ?? null;
  const count = sourceCount(raw);
  const state =
    freshness === "conflicting" || freshness === "stale"
      ? "suspicious"
      : count > 0
        ? "verified"
        : "unknown";
  return {
    state,
    sourceCount: asArray(editorial.sources).length,
    fieldSourceCount: count - asArray(editorial.sources).length,
    freshness,
  };
}

const GRADE_FRACTIONS: Record<QualityGrade, number> = {
  verified: 1,
  complete: 1,
  explicit_free: 1,
  derived: 0.75,
  partial: 0.55,
  unknown: 0.2,
  unavailable: 0,
  not_applicable: 1,
  suspicious: 0,
};

export function calculatePlanningQualityScore(parts: {
  transport: QualityGrade;
  budget: QualityGrade;
  seasonality: QualityGrade;
  logistics: QualityGrade;
  contentIntegrity: QualityGrade;
  provenance: QualityGrade;
}): number {
  return Math.round(
    QUALITY_WEIGHTS.transport * GRADE_FRACTIONS[parts.transport] +
      QUALITY_WEIGHTS.budget * GRADE_FRACTIONS[parts.budget] +
      QUALITY_WEIGHTS.seasonality * GRADE_FRACTIONS[parts.seasonality] +
      QUALITY_WEIGHTS.logistics * GRADE_FRACTIONS[parts.logistics] +
      QUALITY_WEIGHTS.contentIntegrity *
        GRADE_FRACTIONS[parts.contentIntegrity] +
      QUALITY_WEIGHTS.provenance * GRADE_FRACTIONS[parts.provenance],
  );
}

function gradeForBudget(state: DestinationBudgetAudit["state"]): QualityGrade {
  if (state === "complete") return "complete";
  if (state === "partial") return "partial";
  if (state === "suspicious") return "suspicious";
  return "unknown";
}

function gradeForLogistics(
  state: DestinationLogisticsAudit["state"],
): QualityGrade {
  return state === "complete"
    ? "complete"
    : state === "partial"
      ? "partial"
      : "unknown";
}

function gradeForTransport(transport: DestinationTransportAudit): QualityGrade {
  if (transport.contradictions.length > 0) return "suspicious";
  return strongestState([
    transport.originAwareRouteEvidence,
    transport.personalCar.state,
    transport.rentalCar.state,
  ]);
}

export function classifyPriority(input: {
  recommendationVisible: boolean;
  criticalTransportOrBudget: boolean;
  importantPlanningGap: boolean;
  lowerImpact: boolean;
}): Priority {
  if (!input.recommendationVisible) return "P3";
  if (input.criticalTransportOrBudget) return "P0";
  if (input.importantPlanningGap) return "P1";
  if (input.lowerImpact) return "P2";
  return "P2";
}

function routeRegistryAudit(
  registries: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(registries)) {
    const rawEntries = Array.isArray(value)
      ? value
      : (Object.values(asRecord(value)).find((candidate) =>
          Array.isArray(candidate),
        ) ?? []);
    const entries = asArray(rawEntries).map(asRecord);
    const sourceBacked = entries
      .filter((entry) => Boolean(text(entry.sourceUrl)))
      .map(
        (entry) =>
          text(entry.id) ??
          `${text(entry.from) ?? "?"}->${text(entry.to) ?? "?"}`,
      );
    const checked = entries
      .filter((entry) => Boolean(text(entry.checkedAt)))
      .map(
        (entry) =>
          text(entry.id) ??
          `${text(entry.from) ?? "?"}->${text(entry.to) ?? "?"}`,
      );
    const suspicious = entries
      .filter((entry) => {
        const ranges = [
          entry.timeRange,
          entry.durationMinutes,
          entry.flightTime,
          entry.fare,
        ].filter((v) => v !== undefined);
        return ranges.some((range) => {
          const values = asArray(range).map(finiteNumber);
          return (
            (values.length > 0 &&
              values.some((v) => v === undefined || v < 0)) ||
            (values.length === 2 &&
              values[1] !== undefined &&
              values[0] !== undefined &&
              values[1] < values[0])
          );
        });
      })
      .map(
        (entry) =>
          text(entry.id) ??
          `${text(entry.from) ?? "?"}->${text(entry.to) ?? "?"}`,
      );
    result[name] = {
      total: entries.length,
      sourceBacked: metric(sourceBacked),
      checkedAt: metric(checked),
      unknownEvidence: metric(
        entries
          .filter((entry) => !text(entry.sourceUrl))
          .map(
            (entry) =>
              text(entry.id) ??
              `${text(entry.from) ?? "?"}->${text(entry.to) ?? "?"}`,
          ),
      ),
      suspicious: metric(suspicious),
    };
  }
  return result;
}

function compareGenerated(
  destinations: readonly JsonRecord[],
  details: ReadonlyMap<string, unknown> | undefined,
): PlanningAuditReport["inputs"]["generatedSynchronization"] {
  if (!details)
    return {
      missingDetailIds: [],
      orphanDetailIds: [],
      mismatchedDetailIds: [],
      synchronized: true,
    };
  const canonicalIds = new Set(
    destinations
      .map((destination) => text(destination.id))
      .filter((id): id is string => Boolean(id)),
  );
  const detailIds = new Set(details.keys());
  const missingDetailIds = sorted(
    [...canonicalIds].filter((id) => !detailIds.has(id)),
  );
  const orphanDetailIds = sorted(
    [...detailIds].filter((id) => !canonicalIds.has(id)),
  );
  const mismatchedDetailIds = destinations
    .filter((destination) => {
      const id = text(destination.id);
      return Boolean(
        id &&
        details.has(id) &&
        JSON.stringify(destination) !== JSON.stringify(details.get(id)),
      );
    })
    .map((destination) => text(destination.id) as string);
  return {
    missingDetailIds,
    orphanDetailIds,
    mismatchedDetailIds: sorted(mismatchedDetailIds),
    synchronized:
      missingDetailIds.length === 0 &&
      orphanDetailIds.length === 0 &&
      mismatchedDetailIds.length === 0,
  };
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index];
}

function buildSystemicCauses(
  records: ReadonlyMap<string, DestinationAudit>,
): PlanningAuditReport["systemicRootCauses"] {
  const visible = [...records.values()].filter(
    (record) => record.recommendationVisible,
  );
  const causes: PlanningAuditReport["systemicRootCauses"] = [];
  const noTransportCost = visible
    .filter((record) => record.budget.intercityTransport === "unknown")
    .map((record) => record.id);
  if (noTransportCost.length > 0)
    causes.push({
      category: "canonical-source-or-schema-gap",
      determination:
        "No verified or documented intercity fare was available for the affected records; Budget v2 intentionally fails closed rather than deriving fares from duration.",
      ids: sorted(noTransportCost),
    });
  const localTransportGap = visible
    .filter((record) => record.budget.localTransport === "unavailable")
    .map((record) => record.id);
  if (localTransportGap.length > 0)
    causes.push({
      category: "canonical-local-transport-source-gap",
      determination:
        "The canonical localTransport fact explicitly says the required access fare cannot be established. This is a source/evidence backlog, not a reason to insert ¥0.",
      ids: sorted(localTransportGap),
    });
  const intentionalCarPolicy = visible
    .filter((record) => record.transport.tollFuelAssumptions === "unavailable")
    .map((record) => record.id);
  if (intentionalCarPolicy.length > 0)
    causes.push({
      category: "intentional-budget-fail-closed-policy",
      determination:
        "Parking, toll/fuel, and rental-car cost inputs are not destination facts in the current schema. KAI-216/TripEstimateEngine intentionally report these as unavailable rather than fabricating distance-derived prices; this is not a repair defect.",
      ids: sorted(intentionalCarPolicy),
    });
  const noJa = visible
    .filter((record) => record.contentIntegrity.enJaParity === "unknown")
    .map((record) => record.id);
  if (noJa.length > 0)
    causes.push({
      category: "localization-completeness",
      determination:
        "Japanese content is absent or not represented for the affected records; this is a canonical content gap unless generated synchronization also reports drift.",
      ids: sorted(noJa),
    });
  const seasonGaps = visible
    .filter(
      (record) =>
        record.seasonality.state === "unknown" ||
        record.seasonality.state === "suspicious",
    )
    .map((record) => record.id);
  if (seasonGaps.length > 0)
    causes.push({
      category: "seasonality-source-or-migration-gap",
      determination:
        "Season fields or provenance are missing/invalid; All year is not accepted as a fill value.",
      ids: sorted(seasonGaps),
    });
  const generatedDrift = visible
    .filter((record) =>
      record.issues.includes("generated_canonical_divergence"),
    )
    .map((record) => record.id);
  if (generatedDrift.length > 0)
    causes.push({
      category: "generated-canonical-divergence",
      determination:
        "Generated detail output differs from the canonical index and should be repaired in the generator/import path before record edits.",
      ids: sorted(generatedDrift),
    });
  return causes;
}

export function buildPlanningAudit(
  destinations: readonly Destination[],
  options: AuditOptions = {},
): PlanningAuditReport {
  const origins = options.origins ?? ORIGIN_MATRIX;
  const rawDestinations = destinations.map((destination) =>
    asRecord(destination),
  );
  const idOccurrences = new Map<string, number>();
  for (const destination of rawDestinations) {
    const id = text(destination.id) ?? "<missing-id>";
    idOccurrences.set(id, (idOccurrences.get(id) ?? 0) + 1);
  }
  const duplicateIds = sorted(
    [...idOccurrences.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
  );
  const detailAudits = new Map<string, DestinationAudit>();
  for (const raw of rawDestinations) {
    const id = text(raw.id);
    if (!id || detailAudits.has(id)) continue;
    const destination = raw as unknown as Destination;
    const recommendationVisible = raw.recommendationEligible !== false;
    const transport = auditTransport(destination, origins);
    const budget = auditBudget(destination, transport, origins);
    const seasonality = auditSeasonality(raw);
    const logistics = auditLogistics(raw);
    const contentIntegrity = auditContent(raw);
    const provenance = auditProvenance(raw);
    const qualityScore = calculatePlanningQualityScore({
      transport: gradeForTransport(transport),
      budget: gradeForBudget(budget.state),
      seasonality: seasonality.state,
      logistics: gradeForLogistics(logistics.state),
      contentIntegrity: contentIntegrity.state,
      provenance: provenance.state,
    });
    const priorityReasons: string[] = [];
    if (transport.criticalGap) priorityReasons.push(...transport.issueCodes);
    if (budget.criticalGap)
      priorityReasons.push(...budget.suspiciousCodes, budget.state);
    if (seasonality.issueCodes.length > 0)
      priorityReasons.push(...seasonality.issueCodes);
    if (logistics.issueCodes.length > 0)
      priorityReasons.push(...logistics.issueCodes);
    const priority = classifyPriority({
      recommendationVisible,
      criticalTransportOrBudget:
        recommendationVisible && (transport.criticalGap || budget.criticalGap),
      importantPlanningGap:
        seasonality.state === "unknown" ||
        seasonality.state === "suspicious" ||
        logistics.state !== "complete",
      lowerImpact:
        contentIntegrity.issueCodes.length > 0 ||
        provenance.state === "unknown",
    });
    const issues = sorted([
      ...transport.issueCodes,
      ...budget.suspiciousCodes,
      ...seasonality.issueCodes,
      ...logistics.issueCodes,
      ...contentIntegrity.issueCodes,
    ]);
    detailAudits.set(id, {
      id,
      name: text(raw.name) ?? id,
      recommendationVisible,
      importance: text(raw.importance) ?? null,
      transport,
      budget,
      seasonality,
      logistics,
      contentIntegrity,
      provenance,
      qualityScore,
      priority,
      priorityReasons: sorted(priorityReasons),
      issues,
    });
  }

  const auditEntries = [...detailAudits.values()];
  const destinationRecord = Object.fromEntries(
    auditEntries
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((record) => [record.id, record]),
  );
  const byId = new Map(Object.entries(destinationRecord));
  const publicTransport = (record: DestinationAudit) =>
    record.transport.originAwareRouteEvidence;
  const transportSummary: Record<string, Metric> = {
    usableVerified: idsWhere(
      byId,
      (record) => publicTransport(record) === "verified",
    ),
    derived: idsWhere(byId, (record) => publicTransport(record) === "derived"),
    unknown: idsWhere(byId, (record) => publicTransport(record) === "unknown"),
    unavailable: idsWhere(
      byId,
      (record) => publicTransport(record) === "unavailable",
    ),
    suspicious: idsWhere(
      byId,
      (record) => record.transport.contradictions.length > 0,
    ),
    publicTrainVerified: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.train.state === "verified",
    ),
    publicTrainDerived: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.train.state === "derived",
    ),
    publicShinkansenVerified: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.shinkansen.state === "verified",
    ),
    publicShinkansenDerived: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.shinkansen.state === "derived",
    ),
    publicBusVerified: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.bus.state === "verified",
    ),
    publicBusDerived: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.bus.state === "derived",
    ),
    publicFlightVerified: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.flight.state === "verified",
    ),
    publicFerryVerified: idsWhere(
      byId,
      (record) => record.transport.modeEvidence.ferry.state === "verified",
    ),
    personalCarDerived: idsWhere(
      byId,
      (record) => record.transport.personalCar.state === "derived",
    ),
    rentalCarDerived: idsWhere(
      byId,
      (record) => record.transport.rentalCar.state === "derived",
    ),
    personalCarUnknown: idsWhere(
      byId,
      (record) => record.transport.personalCar.state === "unknown",
    ),
    rentalCarUnknown: idsWhere(
      byId,
      (record) => record.transport.rentalCar.state === "unknown",
    ),
    nearestStationUnknown: idsWhere(
      byId,
      (record) => record.transport.nearestUsefulStation === "unknown",
    ),
    busLocalUnknown: idsWhere(
      byId,
      (record) => record.transport.busLocalAvailability === "unknown",
    ),
    localTransportUnknown: idsWhere(
      byId,
      (record) => record.transport.localTransportCost === "unknown",
    ),
    parkingUnknown: idsWhere(
      byId,
      (record) => record.transport.parkingAvailability === "unknown",
    ),
    parkingSuspicious: idsWhere(
      byId,
      (record) => record.transport.parkingAvailability === "suspicious",
    ),
    parkingCostUnavailable: idsWhere(
      byId,
      (record) => record.transport.parkingCost === "unavailable",
    ),
    tollFuelUnavailable: idsWhere(
      byId,
      (record) => record.transport.tollFuelAssumptions === "unavailable",
    ),
    rentalFactsUnavailable: idsWhere(
      byId,
      (record) => record.transport.rentalCarFacts === "unavailable",
    ),
    unreachableDueMissingData: idsWhere(
      byId,
      (record) => record.transport.unreachableDueMissingData,
    ),
  };
  const budgetSummary: Record<string, Metric> = {
    complete: idsWhere(byId, (record) => record.budget.state === "complete"),
    partial: idsWhere(byId, (record) => record.budget.state === "partial"),
    unknownCritical: idsWhere(
      byId,
      (record) => record.budget.state === "unknown-critical",
    ),
    suspicious: idsWhere(
      byId,
      (record) => record.budget.state === "suspicious",
    ),
    verifiedFree: idsWhere(
      byId,
      (record) => record.budget.verifiedFreeFacts === "explicit_free",
    ),
    intercityTransportUnknown: idsWhere(
      byId,
      (record) => record.budget.intercityTransport === "unknown",
    ),
    localTransportUnknown: idsWhere(
      byId,
      (record) => record.budget.localTransport === "unknown",
    ),
    parkingUnavailable: idsWhere(
      byId,
      (record) => record.budget.parking === "unavailable",
    ),
    tollsFuelUnavailable: idsWhere(
      byId,
      (record) => record.budget.tollsFuel === "unavailable",
    ),
    rentalInputsUnavailable: idsWhere(
      byId,
      (record) => record.budget.rentalCarInputs === "unavailable",
    ),
    partyNightMultiplicationDrift: idsWhere(
      byId,
      (record) =>
        !record.budget.estimateProbe.partyNightMultiplicationConsistent,
    ),
  };
  const seasonSummary: Record<string, Metric> = {
    structured: idsWhere(byId, (record) => record.seasonality.structured),
    verifiedAllYear: idsWhere(
      byId,
      (record) => record.seasonality.verifiedAllYear,
    ),
    missingOrUnknown: idsWhere(
      byId,
      (record) => record.seasonality.state === "unknown",
    ),
    suspicious: idsWhere(
      byId,
      (record) => record.seasonality.state === "suspicious",
    ),
    derived: idsWhere(byId, (record) => record.seasonality.state === "derived"),
    enJaParityUnknown: idsWhere(
      byId,
      (record) => record.seasonality.enJaParity === "unknown",
    ),
    enJaParitySuspicious: idsWhere(
      byId,
      (record) => record.seasonality.enJaParity === "suspicious",
    ),
    sakura: idsWhere(byId, (record) =>
      record.seasonality.likelyProfiles.includes("sakura"),
    ),
    autumnFoliage: idsWhere(byId, (record) =>
      record.seasonality.likelyProfiles.includes("autumn_foliage"),
    ),
    snowWinter: idsWhere(byId, (record) =>
      record.seasonality.likelyProfiles.includes("snow_winter"),
    ),
    alpine: idsWhere(byId, (record) =>
      record.seasonality.likelyProfiles.includes("alpine_mountain"),
    ),
    beachSummer: idsWhere(byId, (record) =>
      record.seasonality.likelyProfiles.includes("beach_summer"),
    ),
    unverifiedAllYear: idsWhere(
      byId,
      (record) =>
        record.seasonality.declaredAllYear &&
        !record.seasonality.verifiedAllYear,
    ),
  };
  const logisticsSummary: Record<string, Metric> = {
    completeEnough: idsWhere(
      byId,
      (record) => record.logistics.state === "complete",
    ),
    partial: idsWhere(byId, (record) => record.logistics.state === "partial"),
    criticalGaps: idsWhere(
      byId,
      (record) => record.logistics.state === "critical-gap",
    ),
    durationUnknown: idsWhere(
      byId,
      (record) => record.logistics.recommendedVisitDuration === "unknown",
    ),
    reservationUnknown: idsWhere(
      byId,
      (record) => record.logistics.reservation === "unknown",
    ),
    openingCaveatUnknown: idsWhere(
      byId,
      (record) => record.logistics.openingCaveat === "unknown",
    ),
    weatherUnknown: idsWhere(
      byId,
      (record) => record.logistics.weatherSensitivity === "unknown",
    ),
    relationshipsUnknown: idsWhere(
      byId,
      (record) => record.logistics.relationships === "unknown",
    ),
  };
  const priority = {} as Record<Priority, string[]>;
  for (const level of ["P0", "P1", "P2", "P3"] as const) {
    priority[level] = auditEntries
      .filter((record) => record.priority === level)
      .sort(
        (left, right) =>
          right.issues.length - left.issues.length ||
          left.qualityScore - right.qualityScore ||
          (left.id < right.id ? -1 : 1),
      )
      .map((record) => record.id);
  }
  const visible = auditEntries.filter((record) => record.recommendationVisible);
  const scoresByDestination = Object.fromEntries(
    auditEntries.map((record) => [record.id, record.qualityScore]),
  );
  const buckets: Record<string, Metric> = {};
  for (const bucket of ["0-39", "40-59", "60-69", "70-79", "80-89", "90-100"]) {
    const [min, max] = bucket.split("-").map(Number);
    buckets[bucket] = metric(
      auditEntries
        .filter(
          (record) => record.qualityScore >= min && record.qualityScore <= max,
        )
        .map((record) => record.id),
    );
  }
  const scoreValues = visible.map((record) => record.qualityScore);
  const qualityScore = {
    weights: QUALITY_WEIGHTS,
    scoresByDestination,
    median: percentile(scoreValues, 0.5),
    p10: percentile(scoreValues, 0.1),
    p25: percentile(scoreValues, 0.25),
    below60: metric(
      visible
        .filter((record) => record.qualityScore < 60)
        .map((record) => record.id),
    ).ids,
    below70: metric(
      visible
        .filter((record) => record.qualityScore < 70)
        .map((record) => record.id),
    ).ids,
    below80: metric(
      visible
        .filter((record) => record.qualityScore < 80)
        .map((record) => record.id),
    ).ids,
    distributionBuckets: buckets,
    lowestScoringRecommendationVisible: visible
      .sort(
        (left, right) =>
          left.qualityScore - right.qualityScore ||
          (left.id < right.id ? -1 : 1),
      )
      .slice(0, 50)
      .map((record) => record.id),
  };
  const routeRegistries = options.routeRegistries ?? {};
  const catalogueRecords = rawDestinations.filter((raw) => text(raw.id));
  return {
    schemaVersion: 1,
    ticket: "KAI-87",
    scope: {
      canonicalSource: INDEX_PATH,
      representativeOrigins: origins.map((origin) => ({
        key: origin.key,
        label: origin.label,
        coordinates: { lat: origin.lat, lng: origin.lng },
      })),
      semanticStates: [
        "verified",
        "derived",
        "explicit_free",
        "unknown",
        "unavailable",
        "not_applicable",
        "suspicious",
      ],
      auditOnly: true,
    },
    inputs: {
      generatedDetailCount: options.generatedDetails?.size ?? 0,
      generatedSynchronization: compareGenerated(
        catalogueRecords,
        options.generatedDetails,
      ),
    },
    catalogue: {
      canonicalCount: destinations.length,
      canonicalUniqueCount: new Set(catalogueRecords.map((raw) => text(raw.id)))
        .size,
      recommendationVisibleCount: visible.length,
      recommendationHiddenCount: auditEntries.length - visible.length,
      duplicateIds,
      recommendationVisibleIds: sorted(visible.map((record) => record.id)),
      recommendationHiddenIds: sorted(
        auditEntries
          .filter((record) => !record.recommendationVisible)
          .map((record) => record.id),
      ),
    },
    transport: {
      summary: transportSummary,
      routeRegistry: routeRegistryAudit(routeRegistries),
      destinations: Object.fromEntries(
        auditEntries.map((record) => [record.id, record.transport]),
      ),
    },
    budget: {
      summary: budgetSummary,
      destinations: Object.fromEntries(
        auditEntries.map((record) => [record.id, record.budget]),
      ),
    },
    seasonality: {
      summary: seasonSummary,
      destinations: Object.fromEntries(
        auditEntries.map((record) => [record.id, record.seasonality]),
      ),
    },
    logistics: {
      summary: logisticsSummary,
      destinations: Object.fromEntries(
        auditEntries.map((record) => [record.id, record.logistics]),
      ),
    },
    priority,
    qualityScore,
    systemicRootCauses: buildSystemicCauses(byId),
    residualLedger: Object.fromEntries(
      auditEntries.map((record) => [
        record.id,
        { priority: record.priority, issues: record.issues },
      ]),
    ),
    destinations: destinationRecord,
  };
}

function loadJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function loadDetails(root: string): Map<string, unknown> {
  const details = new Map<string, unknown>();
  const directory = path.join(root, DETAIL_DIR);
  if (!fs.existsSync(directory)) return details;
  for (const name of fs
    .readdirSync(directory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()) {
    const id = name.slice(0, -5);
    details.set(id, loadJson(path.join(directory, name)));
  }
  return details;
}

function markdownMetric(name: string, value: Metric): string {
  return `- ${name}: **${value.count}**${value.count > 0 ? ` — ${value.ids.join(", ")}` : ""}`;
}

export function renderPlanningAuditMarkdown(
  report: PlanningAuditReport,
): string {
  const lines: string[] = [];
  lines.push("# KAI-87 planning-critical catalogue baseline");
  lines.push("");
  lines.push(
    "Read-only deterministic audit. The quality score is reporting-only and is not an input to recommendation ranking.",
  );
  lines.push("");
  lines.push("## Scope");
  lines.push(
    `- Canonical destinations: **${report.catalogue.canonicalCount}**`,
  );
  lines.push(
    `- Recommendation-visible: **${report.catalogue.recommendationVisibleCount}**`,
  );
  lines.push(
    `- Recommendation-hidden: **${report.catalogue.recommendationHiddenCount}**`,
  );
  lines.push(
    `- Representative origin matrix: ${report.scope.representativeOrigins.map((origin) => origin.key).join(", ")}`,
  );
  lines.push("");
  lines.push("## TRANSPORT");
  for (const [name, value] of Object.entries(report.transport.summary))
    lines.push(markdownMetric(name, value));
  lines.push("");
  lines.push("### Stored route registries");
  for (const [name, value] of Object.entries(report.transport.routeRegistry)) {
    const registry = value as {
      total: number;
      sourceBacked: Metric;
      checkedAt: Metric;
      unknownEvidence: Metric;
      suspicious: Metric;
    };
    lines.push(
      `- ${name}: total ${registry.total}; source-backed ${registry.sourceBacked.count}; checkedAt ${registry.checkedAt.count}; unknown evidence ${registry.unknownEvidence.count}; suspicious ${registry.suspicious.count}`,
    );
  }
  lines.push("");
  lines.push("## BUDGET / TRIP ESTIMATE INPUTS");
  for (const [name, value] of Object.entries(report.budget.summary))
    lines.push(markdownMetric(name, value));
  lines.push("");
  lines.push("## SEASONALITY");
  for (const [name, value] of Object.entries(report.seasonality.summary))
    lines.push(markdownMetric(name, value));
  lines.push("");
  lines.push("## LOGISTICS");
  for (const [name, value] of Object.entries(report.logistics.summary))
    lines.push(markdownMetric(name, value));
  lines.push("");
  lines.push("## PRIORITY QUEUE");
  for (const level of ["P0", "P1", "P2", "P3"] as const)
    lines.push(
      `- ${level}: **${report.priority[level].length}**${report.priority[level].length ? ` — ${report.priority[level].join(", ")}` : ""}`,
    );
  lines.push("");
  lines.push("## QUALITY SCORE");
  lines.push(
    `- Weights: transport ${report.qualityScore.weights.transport}, budget ${report.qualityScore.weights.budget}, seasonality ${report.qualityScore.weights.seasonality}, logistics ${report.qualityScore.weights.logistics}, content/relationships ${report.qualityScore.weights.contentIntegrity}, provenance ${report.qualityScore.weights.provenance}`,
  );
  lines.push(`- Median: **${report.qualityScore.median}**`);
  lines.push(`- p10: **${report.qualityScore.p10}**`);
  lines.push(`- p25: **${report.qualityScore.p25}**`);
  lines.push(
    `- Below 60: **${report.qualityScore.below60.length}**${report.qualityScore.below60.length ? ` — ${report.qualityScore.below60.join(", ")}` : ""}`,
  );
  lines.push(
    `- Below 70: **${report.qualityScore.below70.length}**${report.qualityScore.below70.length ? ` — ${report.qualityScore.below70.join(", ")}` : ""}`,
  );
  lines.push(
    `- Below 80: **${report.qualityScore.below80.length}**${report.qualityScore.below80.length ? ` — ${report.qualityScore.below80.join(", ")}` : ""}`,
  );
  lines.push("");
  lines.push("## SYSTEMIC ROOT-CAUSE SIGNALS");
  for (const cause of report.systemicRootCauses)
    lines.push(
      `- ${cause.category}: ${cause.determination} Affected IDs: ${cause.ids.join(", ") || "none"}`,
    );
  lines.push("");
  lines.push("## GENERATED/CANONICAL SYNC");
  lines.push(
    `- Synchronized: **${report.inputs.generatedSynchronization.synchronized ? "yes" : "no"}**`,
  );
  lines.push(
    `- Missing detail IDs: ${report.inputs.generatedSynchronization.missingDetailIds.join(", ") || "none"}`,
  );
  lines.push(
    `- Orphan detail IDs: ${report.inputs.generatedSynchronization.orphanDetailIds.join(", ") || "none"}`,
  );
  lines.push(
    `- Mismatched detail IDs: ${report.inputs.generatedSynchronization.mismatchedDetailIds.join(", ") || "none"}`,
  );
  lines.push("");
  lines.push("## RESIDUAL LEDGER");
  lines.push(
    "The complete per-destination ledger, including every issue code and score, is in the adjacent JSON report.",
  );
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): { outputDir?: string; json: boolean } {
  const outputIndex = argv.indexOf("--output-dir");
  return {
    outputDir: outputIndex >= 0 ? argv[outputIndex + 1] : undefined,
    json: argv.includes("--json"),
  };
}

function main(): void {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const indexPath = path.join(root, INDEX_PATH);
  const destinations = loadJson(indexPath) as Destination[];
  const routeRegistries: Record<string, unknown> = {};
  const routeFileSha256: Record<string, string> = {};
  for (const file of ROUTE_FILES) {
    const filePath = path.join(root, "src/shared/data", file);
    if (fs.existsSync(filePath)) {
      routeRegistries[file] = loadJson(filePath);
      routeFileSha256[file] = sha256(filePath);
    }
  }
  const report = buildPlanningAudit(destinations, {
    generatedDetails: loadDetails(root),
    routeRegistries,
  });
  report.inputs.canonicalSha256 = sha256(indexPath);
  report.inputs.routeFileSha256 = routeFileSha256;
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderPlanningAuditMarkdown(report);
  if (args.outputDir) {
    const outputDir = path.resolve(root, args.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "planning-quality-audit.json"), json);
    fs.writeFileSync(
      path.join(outputDir, "planning-quality-audit.md"),
      markdown,
    );
  }
  process.stdout.write(args.json ? json : markdown);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname)
)
  main();
