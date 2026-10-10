import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import auditManifest from "../../../../qa/kai-306/destination-sample-audit.json";
import destinationIndex from "../destinations-index.json";
import destinationIndexLite from "../destinations-index.lite.json";
import { JAPAN_PREFECTURES } from "../../../../scripts/config/prefectures";
import { JAPAN_REGIONS } from "../../../../scripts/config/regions";
import type {
  Destination,
  DestinationKind,
  PlaceType,
} from "../../types/destination";
import { getLocalizedOpeningHours } from "../../../features/destinations/destinationOpeningHours";
import {
  getOpeningHoursAssessment,
  isValidIsoDate,
} from "../../services/recommendation/OpeningHoursPolicy";
import {
  getLocalizedPlace,
  toCanonicalPlace,
} from "../../services/place/PlaceCatalog";
import { resolveAdmissionApplicability } from "../../services/budget/admissionApplicability";
import { calculateTripEstimate } from "../../services/budget/tripEstimateEngine";
import { validateAdmissionFact } from "../../services/budget/factValidation";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);
const SAMPLE_SIZE = 20;
type RuntimeSummaryRecord = Pick<Destination, "id">;
const FALLBACK_POLICY_INSTANT = "2026-10-09T12:00:00.000Z";
const destinations = destinationIndex as unknown as Destination[];
const liteDestinations =
  destinationIndexLite as unknown as RuntimeSummaryRecord[];
const sampleIds = auditManifest.sampleIds;
const auditRecords = auditManifest.records;

const VALID_KINDS = new Set<DestinationKind>([
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
  "shopping",
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
  "cemetery",
  "cliff",
  "rock_formation",
  "amusement_park",
  "cape",
  "observation",
  "event",
  "entertainment",
  "cultural",
]);
const VALID_ROLES = new Set<string>([
  "hub",
  "poi",
  "standalone",
  // Existing canonical rows use this alias; the production place resolver
  // maps it to the valid `destination` place type.
  "destination",
]);
const VALID_PLACE_TYPES = new Set<PlaceType>(["hub", "destination"]);
const PLACEHOLDER_COPY =
  /^(?:n\/a|unknown|tbd|todo|placeholder|undefined|null|lorem ipsum)[.!… ]*$/i;
const MALFORMED_SEPARATOR = /(?:\|\s*\||,,|;;)/;
const FIXED_HOURS = /\b\d{1,2}(?::\d{2})?\s*[-–—~〜～]\s*\d{1,2}(?::\d{2})?\b/;

function policyNowFor(destination: Destination): Date {
  const verifiedAt = destination.openingHoursMetadata?.verifiedAt;
  if (verifiedAt === undefined) return new Date(FALLBACK_POLICY_INSTANT);
  if (!isValidIsoDate(verifiedAt)) {
    throw new Error(
      `${destination.id}: opening-hours verifiedAt is not a valid ISO date`,
    );
  }
  const now = new Date(`${verifiedAt}T12:00:00.000Z`);
  now.setUTCDate(now.getUTCDate() + 1);
  return now;
}

function countId(records: readonly { id?: unknown }[], id: string): number {
  return records.filter((record) => record.id === id).length;
}

function duplicateIds(ids: readonly unknown[]): string[] {
  const seen = new Set<unknown>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) && typeof id === "string") duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

function collectCohortIssues(
  ids: readonly unknown[],
  rows: readonly { id?: unknown }[],
  canonical: readonly Destination[],
  lite: readonly RuntimeSummaryRecord[],
): string[] {
  const issues: string[] = [];
  if (ids.length !== SAMPLE_SIZE) {
    issues.push(
      `manifest: expected ${SAMPLE_SIZE} sample IDs; received ${ids.length}`,
    );
  }
  for (const id of duplicateIds(ids)) {
    issues.push(`${id}: duplicate manifest sample ID`);
  }
  for (const id of duplicateIds(rows.map((row) => row.id))) {
    issues.push(`${id}: duplicate KAI-306 manifest record`);
  }

  const rowIds = rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
  const idSet = new Set(
    ids.filter((id): id is string => typeof id === "string"),
  );
  const rowIdSet = new Set(rowIds);
  for (const id of ids) {
    if (typeof id !== "string") {
      issues.push("manifest: sample ID is not a string");
      continue;
    }
    if (!rowIdSet.has(id))
      issues.push(`${id}: missing from KAI-306 manifest records`);
    if (countId(canonical, id) !== 1) {
      issues.push(`${id}: missing or duplicate in canonical catalogue`);
    }
    if (countId(lite, id) !== 1) {
      issues.push(`${id}: missing or duplicate in runtime summary catalogue`);
    }
  }
  for (const id of rowIdSet) {
    if (!idSet.has(id))
      issues.push(`${id}: manifest record is not in sampleIds`);
  }
  return issues;
}

function isMalformedCopy(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const text = value.trim();
  return (
    text.length === 0 ||
    PLACEHOLDER_COPY.test(text) ||
    /\b(?:undefined|null|lorem ipsum)\b/i.test(text)
  );
}

function collectHighlightIssues(
  id: string,
  locale: "en" | "ja",
  highlights: unknown,
): string[] {
  if (highlights === undefined) return [];
  if (!Array.isArray(highlights)) {
    return [`${id}: ${locale} highlights are not an array`];
  }
  return highlights.flatMap((highlight, index) => {
    if (
      isMalformedCopy(highlight) ||
      (typeof highlight === "string" && MALFORMED_SEPARATOR.test(highlight))
    ) {
      return [`${id}: ${locale} highlight ${index} is empty or malformed`];
    }
    return [];
  });
}

function collectDestinationIssues(destination: Destination): string[] {
  const id = destination.id || "(missing id)";
  const issues: string[] = [];
  if (!destination.id.trim()) issues.push(`${id}: canonical ID is empty`);
  if (!destination.name?.trim()) issues.push(`${id}: canonical name is empty`);

  if (destination.kind !== undefined && !VALID_KINDS.has(destination.kind)) {
    issues.push(`${id}: invalid kind '${String(destination.kind)}'`);
  }
  if (destination.role !== undefined && !VALID_ROLES.has(destination.role)) {
    issues.push(`${id}: invalid role '${String(destination.role)}'`);
  }

  const place = toCanonicalPlace(destination);
  if (!VALID_PLACE_TYPES.has(place.placeType)) {
    issues.push(`${id}: unresolved or invalid place type`);
  }
  const english = getLocalizedPlace(place, "en");
  const japanese = getLocalizedPlace(place, "ja");
  if (isMalformedCopy(english.name))
    issues.push(`${id}: English name is empty or malformed`);
  if (
    isMalformedCopy(english.description) ||
    english.description.trim().length < 20
  ) {
    issues.push(`${id}: English description is empty or malformed`);
  }
  if (isMalformedCopy(japanese.name)) {
    issues.push(`${id}: Japanese display name is empty or malformed`);
  }
  if (
    japanese.description.trim() !== "" &&
    isMalformedCopy(japanese.description)
  ) {
    issues.push(`${id}: Japanese description is malformed`);
  }
  issues.push(
    ...collectHighlightIssues(id, "en", english.highlights),
    ...collectHighlightIssues(id, "ja", japanese.highlights),
  );

  if (
    !JAPAN_PREFECTURES.some(
      (prefecture) => prefecture === destination.prefecture,
    )
  ) {
    issues.push(`${id}: invalid or missing prefecture`);
  }
  if (!JAPAN_REGIONS.some((region) => region === destination.region)) {
    issues.push(`${id}: invalid or missing region`);
  }
  const { lat, lng } = destination.coordinates ?? {};
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 24 ||
    lat > 46 ||
    lng < 122 ||
    lng > 146
  ) {
    issues.push(`${id}: coordinates must be finite and within Japan bounds`);
  }

  const imageReference = destination.heroImage;
  let imageIsUsable = false;
  if (typeof imageReference === "string" && imageReference.trim()) {
    try {
      const imageUrl = new URL(imageReference);
      imageIsUsable =
        (imageUrl.protocol === "https:" || imageUrl.protocol === "http:") &&
        imageUrl.hostname.length > 0;
    } catch {
      if (imageReference.startsWith("/")) {
        const publicRoot = path.resolve(ROOT, "public");
        const localImagePath = path.resolve(
          publicRoot,
          imageReference.replace(/^\/+/, ""),
        );
        imageIsUsable =
          localImagePath.startsWith(`${publicRoot}${path.sep}`) &&
          /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(localImagePath) &&
          existsSync(localImagePath);
      }
    }
  }
  if (!imageIsUsable) issues.push(`${id}: hero image reference is unusable`);

  for (const locale of ["en", "ja"] as const) {
    const route =
      locale === "ja"
        ? `/ja/destinations/${encodeURIComponent(id)}`
        : `/destinations/${encodeURIComponent(id)}`;
    if (!/^\/(?:ja\/)?destinations\/[a-z0-9-]+$/.test(route)) {
      issues.push(`${id}: ${locale} detail route cannot be constructed`);
    }
  }
  return issues;
}

function collectOpeningHoursPolicyIssues(
  destination: Destination,
  now = policyNowFor(destination),
): string[] {
  const id = destination.id;
  const assessment = getOpeningHoursAssessment(destination, now);
  const issues: string[] = [];
  if (
    destination.openingHoursMetadata?.verifiedAt &&
    assessment.status !== "verified"
  ) {
    issues.push(
      `${id}: source-verified opening hours did not resolve as verified`,
    );
  }
  if (
    (assessment.status === "unverified" || assessment.status === "stale") &&
    !assessment.requiresWarning
  ) {
    issues.push(
      `${id}: ${assessment.status} opening hours must require a warning`,
    );
  }
  if (assessment.status === "verified") {
    if (assessment.requiresWarning) {
      issues.push(`${id}: verified opening hours must not require a warning`);
    }
    if (!assessment.sourceUrl || !assessment.verifiedAt) {
      issues.push(`${id}: verified opening hours lack source metadata`);
    }
    if (
      !assessment.verifiedAt ||
      !isValidIsoDate(assessment.verifiedAt) ||
      new Date(`${assessment.verifiedAt}T00:00:00.000Z`).getTime() >
        now.getTime()
    ) {
      issues.push(
        `${id}: verified opening-hours date is invalid or in the future`,
      );
    }
  }
  if (assessment.status === "not_required" && assessment.requiresWarning) {
    issues.push(`${id}: not-required opening hours must not require a warning`);
  }
  return issues;
}

function collectDateVariableHoursIssues(destination: Destination): string[] {
  const english = getLocalizedOpeningHours(destination, "en") ?? "";
  const japanese = getLocalizedOpeningHours(destination, "ja") ?? "";
  const resolved = `${english} ${japanese}`;
  const issues: string[] = [];
  if (!/vary by date|日付により異なります/i.test(resolved)) {
    issues.push(
      `${destination.id}: date-variable opening-hours copy is missing`,
    );
  }
  if (FIXED_HOURS.test(resolved)) {
    issues.push(
      `${destination.id}: unsupported fixed schedule replaced variable hours`,
    );
  }
  return issues;
}

function admissionComponent(destination: Destination) {
  const result = calculateTripEstimate({
    dest: destination,
    duration: "fullDay",
    partySize: 1,
    includeOriginTravel: false,
  });
  return result.components.find(
    (component) => component.evidence.scope === "admission",
  );
}

function collectAdmissionIssues(destination: Destination): string[] {
  const id = destination.id;
  const fact = destination.admission;
  const component = admissionComponent(destination);
  if (!component)
    return [`${id}: admission component is missing from estimate`];
  if (!fact) {
    if (
      resolveAdmissionApplicability(destination) === "applicable" &&
      component.cost.kind === "bounded" &&
      component.cost.min === 0 &&
      component.cost.max === 0
    ) {
      return [`${id}: unknown admission was represented as free or zero`];
    }
    return [];
  }

  const validation = validateAdmissionFact(fact);
  if (!validation.valid) {
    return [`${id}: admission fact is invalid (${validation.reason})`];
  }
  if (component.evidence.state !== fact.state) {
    return [`${id}: admission state changed in the estimate`];
  }
  const issues: string[] = [];
  switch (fact.state) {
    case "verified_paid":
      if (
        component.cost.kind !== "bounded" ||
        component.cost.min <= 0 ||
        component.cost.max < component.cost.min
      ) {
        issues.push(
          `${id}: verified paid admission is not a positive bounded value`,
        );
      }
      break;
    case "variable_price":
      if (
        component.cost.kind === "bounded" &&
        component.cost.max <= component.cost.min
      ) {
        issues.push(`${id}: variable admission became a fixed price`);
      } else if (
        component.cost.kind !== "bounded" &&
        component.cost.kind !== "open_ended" &&
        component.cost.kind !== "variable"
      ) {
        issues.push(`${id}: variable admission has an invalid estimate shape`);
      }
      break;
    case "not_applicable":
      if (component.cost.kind !== "not_applicable") {
        issues.push(`${id}: not-applicable admission became a numeric price`);
      }
      if (component.evidence.state === "verified_free") {
        issues.push(`${id}: not-applicable admission was treated as free`);
      }
      break;
    case "unavailable":
      if (component.cost.kind !== "unavailable") {
        issues.push(`${id}: unknown admission was presented as a price`);
      }
      break;
    default:
      break;
  }
  return issues;
}

function readGeneratedDetail(id: string): Destination | null {
  const detailPath = path.join(ROOT, "public/data/destinations", `${id}.json`);
  if (!existsSync(detailPath)) return null;
  return JSON.parse(readFileSync(detailPath, "utf8")) as Destination;
}

function collectGeneratedDetailIssues(
  source: Destination,
  generated: Destination | null,
): string[] {
  const id = source.id;
  if (!generated) return [`${id}: generated destination detail is missing`];
  const issues: string[] = [];
  if (generated.id !== id)
    issues.push(`${id}: generated detail ID differs from catalogue`);
  if (generated.admission?.state !== source.admission?.state) {
    issues.push(
      `${id}: generated admission state differs from canonical catalogue`,
    );
  }
  if (generated.admission?.cost.kind !== source.admission?.cost.kind) {
    issues.push(
      `${id}: generated admission cost state differs from canonical catalogue`,
    );
  }
  return issues;
}

function recordFor(id: string): Destination {
  const record = destinations.find((destination) => destination.id === id);
  if (!record) throw new Error(`${id}: missing from canonical catalogue`);
  return record;
}

describe("KAI-307 golden destination release smoke", () => {
  it("resolves the complete unique KAI-306 cohort through runtime catalogues", () => {
    const issues = collectCohortIssues(
      sampleIds,
      auditRecords,
      destinations,
      liteDestinations,
    );
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("rejects a missing sample ID, duplicate ID, or unavailable destination", () => {
    const missingId = collectCohortIssues(
      sampleIds.slice(1),
      auditRecords,
      destinations,
      liteDestinations,
    );
    expect(missingId).toContain(
      "manifest: expected 20 sample IDs; received 19",
    );

    const duplicateIds = [...sampleIds];
    duplicateIds[duplicateIds.length - 1] = duplicateIds[0];
    expect(
      collectCohortIssues(
        duplicateIds,
        auditRecords,
        destinations,
        liteDestinations,
      ),
    ).toContain(`${duplicateIds[0]}: duplicate manifest sample ID`);

    const withoutKinkaku = destinations.filter(
      (destination) => destination.id !== "kinkaku-ji",
    );
    expect(
      collectCohortIssues(
        sampleIds,
        auditRecords,
        withoutKinkaku,
        liteDestinations,
      ),
    ).toContain("kinkaku-ji: missing or duplicate in canonical catalogue");
  });

  it("rejects malformed localized presentation with destination-specific diagnostics", () => {
    const original = recordFor("kinkaku-ji");
    const malformed = {
      ...original,
      name: " ",
      nameJa: " ",
      description: "lorem ipsum",
      content: {
        en: { name: " ", description: "undefined", highlights: ["||"] },
        ja: { name: " ", description: "null", highlights: [";;"] },
      },
    } as Destination;
    const issues = collectDestinationIssues(malformed);
    expect(issues).toContain("kinkaku-ji: canonical name is empty");
    expect(issues).toContain("kinkaku-ji: English name is empty or malformed");
    expect(issues).toContain(
      "kinkaku-ji: English description is empty or malformed",
    );
    expect(issues).toContain(
      "kinkaku-ji: Japanese display name is empty or malformed",
    );
    expect(issues).toContain(
      "kinkaku-ji: en highlight 0 is empty or malformed",
    );
    expect(issues).toContain(
      "kinkaku-ji: ja highlight 0 is empty or malformed",
    );
  });

  it("rejects invalid classification values with destination-specific diagnostics", () => {
    const invalid = {
      ...recordFor("kinkaku-ji"),
      kind: "unknown-kind",
      role: "unknown-role",
      placeType: "unknown-place-type",
    } as unknown as Destination;
    const issues = collectDestinationIssues(invalid);
    expect(issues).toContain("kinkaku-ji: invalid kind 'unknown-kind'");
    expect(issues).toContain("kinkaku-ji: invalid role 'unknown-role'");
    expect(issues).toContain("kinkaku-ji: unresolved or invalid place type");
  });

  it("validates stable fundamentals and generated admission semantics for every sample record", () => {
    const issues = sampleIds.flatMap((id) => {
      const source = recordFor(id);
      const generated = readGeneratedDetail(id);
      return [
        ...collectDestinationIssues(source),
        ...collectOpeningHoursPolicyIssues(source),
        ...collectAdmissionIssues(source),
        ...collectGeneratedDetailIssues(source, generated),
      ];
    });
    expect(issues, issues.join("\n")).toEqual([]);
  });

  it("rejects a generated detail whose admission state diverges from canonical data", () => {
    const source = recordFor("kinkaku-ji");
    const generated = readGeneratedDetail("kinkaku-ji");
    expect(generated).not.toBeNull();
    const divergent = {
      ...generated!,
      admission: {
        ...source.admission!,
        state: "verified_free",
        cost: { kind: "unavailable", reason: "source_missing" },
      },
    } as unknown as Destination;
    expect(collectGeneratedDetailIssues(source, divergent)).toContain(
      "kinkaku-ji: generated admission state differs from canonical catalogue",
    );
    expect(collectGeneratedDetailIssues(source, divergent)).toContain(
      "kinkaku-ji: generated admission cost state differs from canonical catalogue",
    );
  });

  it("derives verified-hours checks from each destination verification date", () => {
    const kinkaku = recordFor("kinkaku-ji");
    const refreshedAt = "2035-11-15";
    const refreshed = {
      ...kinkaku,
      openingHoursMetadata: {
        ...kinkaku.openingHoursMetadata,
        verifiedAt: refreshedAt,
      },
    } as Destination;

    expect(
      collectOpeningHoursPolicyIssues(
        refreshed,
        new Date(FALLBACK_POLICY_INSTANT),
      ),
    ).toContain(
      "kinkaku-ji: source-verified opening hours did not resolve as verified",
    );
    expect(collectOpeningHoursPolicyIssues(refreshed)).toEqual([]);
    const expectedPolicyNow = new Date(`${refreshedAt}T12:00:00.000Z`);
    expectedPolicyNow.setUTCDate(expectedPolicyNow.getUTCDate() + 1);
    expect(policyNowFor(refreshed).getTime()).toBe(expectedPolicyNow.getTime());
  });

  it("keeps Kinkaku-ji hours on the verified canonical path", () => {
    const kinkaku = recordFor("kinkaku-ji");
    const metadata = kinkaku.openingHoursMetadata;
    const verifiedAt = metadata?.verifiedAt;
    expect(
      metadata?.sourceUrl,
      "kinkaku-ji: verified opening-hours metadata missing",
    ).toBe("https://www.shokoku-ji.jp/kinkakuji/access/");
    expect(
      isValidIsoDate(verifiedAt),
      "kinkaku-ji: verification date must be valid ISO metadata",
    ).toBe(true);
    const assessment = getOpeningHoursAssessment(
      kinkaku,
      policyNowFor(kinkaku),
    );
    expect(
      assessment,
      "kinkaku-ji: verified hours must not show a warning",
    ).toMatchObject({
      status: "verified",
      requiresWarning: false,
      sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/access/",
    });
    expect(assessment.verifiedAt).toBe(verifiedAt);
    expect(getLocalizedOpeningHours(kinkaku, "en")).toMatch(/09:00–17:00/);
    expect(getLocalizedOpeningHours(kinkaku, "ja")).toMatch(/09:00〜17:00/);
    expect(
      `${getLocalizedOpeningHours(kinkaku, "en")} ${getLocalizedOpeningHours(kinkaku, "ja")}`,
    ).not.toMatch(/16:30|last admission/i);

    const withoutMetadata = {
      ...kinkaku,
      openingHoursMetadata: undefined,
    } as Destination;
    expect(
      getOpeningHoursAssessment(withoutMetadata, policyNowFor(withoutMetadata)),
      "kinkaku-ji: removing verified metadata must restore the warning",
    ).toMatchObject({
      status: "unverified",
      requiresWarning: true,
    });
  });

  it("does not let stale localized copy override canonical verified hours", () => {
    const kinkaku = recordFor("kinkaku-ji");
    const staleLocalizedCopy = {
      ...kinkaku,
      content: {
        ...kinkaku.content,
        en: {
          ...kinkaku.content?.en,
          openingHours: "08:00 - 16:30 (old schedule)",
        },
        ja: {
          ...kinkaku.content?.ja,
          openingHours: "08:00〜16:30（古い時間）",
        },
      },
    } as Destination;
    expect(getLocalizedOpeningHours(staleLocalizedCopy, "en")).toBe(
      kinkaku.businessHours || kinkaku.openingHours,
    );
    expect(getLocalizedOpeningHours(staleLocalizedCopy, "ja")).toBe(
      kinkaku.openingHoursJa,
    );
  });

  it("keeps Kaiyukan date-variable hours from collapsing into a fixed schedule", () => {
    const kaiyukan = recordFor("osaka-aquarium-kaiyukan");
    const verifiedAt = kaiyukan.openingHoursMetadata?.verifiedAt;
    expect(
      isValidIsoDate(verifiedAt),
      "osaka-aquarium-kaiyukan: verification date must be valid ISO metadata",
    ).toBe(true);
    const assessment = getOpeningHoursAssessment(
      kaiyukan,
      policyNowFor(kaiyukan),
    );
    const englishHours = getLocalizedOpeningHours(kaiyukan, "en") ?? "";
    const japaneseHours = getLocalizedOpeningHours(kaiyukan, "ja") ?? "";
    expect(
      assessment,
      "osaka-aquarium-kaiyukan: date-variable hours must remain verified without a warning",
    ).toMatchObject({
      status: "verified",
      requiresWarning: false,
      sourceUrl: "https://www.kaiyukan.com/info/hours/",
    });
    expect(englishHours).toMatch(/vary by date/i);
    expect(japaneseHours).toMatch(/日付により異なります/);
    expect(`${englishHours} ${japaneseHours}`).not.toMatch(FIXED_HOURS);
    expect(collectDateVariableHoursIssues(kaiyukan)).toEqual([]);

    const fixedRegression = {
      ...kaiyukan,
      businessHours: "09:00 - 17:00",
      openingHours: "09:00 - 17:00",
      openingHoursJa: "09:00〜17:00",
    } as Destination;
    expect(collectDateVariableHoursIssues(fixedRegression)).toContain(
      "osaka-aquarium-kaiyukan: unsupported fixed schedule replaced variable hours",
    );
  });

  it("preserves hub, verified, and unknown opening-hours trust states", () => {
    for (const id of ["shinjuku-city", "kyoto-city", "osaka-city"]) {
      const destination = recordFor(id);
      const assessment = getOpeningHoursAssessment(
        destination,
        policyNowFor(destination),
      );
      const localizedHours = `${getLocalizedOpeningHours(destination, "en") ?? ""} ${getLocalizedOpeningHours(destination, "ja") ?? ""}`;
      expect(
        assessment,
        `${id}: aggregate hours are venue-dependent, not a city-wide schedule`,
      ).toMatchObject({
        status: "not_required",
        requiresWarning: false,
      });
      expect(
        localizedHours,
        `${id}: aggregate hours became a fixed schedule`,
      ).not.toMatch(FIXED_HOURS);
      expect(
        localizedHours,
        `${id}: venue-dependent hours copy missing`,
      ).toMatch(/vary|separate|facility|venue|施設|時間|異な/i);
    }

    const ueno = recordFor("ueno-park");
    const uenoMetadata = ueno.openingHoursMetadata;
    expect(
      uenoMetadata?.sourceUrl,
      "ueno-park: verified opening-hours metadata missing",
    ).toBe("https://www.tokyo-park.or.jp/park/ueno/index.html");
    expect(
      isValidIsoDate(uenoMetadata?.verifiedAt),
      "ueno-park: verification date must be valid ISO metadata",
    ).toBe(true);
    const uenoAssessment = getOpeningHoursAssessment(ueno, policyNowFor(ueno));
    expect(
      uenoAssessment,
      "ueno-park: valid verified metadata must not show a warning",
    ).toMatchObject({
      status: "verified",
      requiresWarning: false,
      sourceUrl: "https://www.tokyo-park.or.jp/park/ueno/index.html",
    });
    expect(uenoAssessment.verifiedAt).toBe(uenoMetadata?.verifiedAt);

    const unknownDestination = recordFor("tokyo-tower-minato");
    const unknown = getOpeningHoursAssessment(
      unknownDestination,
      policyNowFor(unknownDestination),
    );
    expect(
      unknown,
      "tokyo-tower-minato: unverified hours must retain a warning",
    ).toMatchObject({
      status: "unverified",
      requiresWarning: true,
    });
  });

  it("does not convert unknown admission into free or zero", () => {
    const source = recordFor("kinkaku-ji");
    const unknown = {
      ...source,
      admission: undefined,
      admissionApplicability: "applicable",
      budgetMetadata: undefined,
      budgetBreakdown: undefined,
      budgetMin: undefined,
      budgetRecommended: undefined,
      budgetMax: undefined,
    } as Destination;
    const unknownAdmission = admissionComponent(unknown);
    expect(
      unknownAdmission?.cost.kind,
      "kinkaku-ji: unknown admission must remain unavailable",
    ).toBe("unavailable");
    expect(unknownAdmission?.evidence.state).toBe("unavailable");
    expect(unknownAdmission?.cost).not.toEqual({
      kind: "bounded",
      min: 0,
      max: 0,
    });

    const malformedUnavailable = {
      ...unknown,
      admission: {
        state: "unavailable",
        provenance: "none",
        reasonCode: "source_missing",
        cost: { kind: "bounded", min: 0, max: 0 },
        scope: "general_entry",
      },
    } as unknown as Destination;
    expect(
      validateAdmissionFact(malformedUnavailable.admission!),
    ).toMatchObject({
      valid: false,
    });
    const failedClosed = admissionComponent(malformedUnavailable);
    expect(
      failedClosed?.cost.kind,
      "kinkaku-ji: malformed unknown admission must fail closed",
    ).toBe("unavailable");
    expect(failedClosed?.cost).not.toEqual({ kind: "bounded", min: 0, max: 0 });
  });
});
