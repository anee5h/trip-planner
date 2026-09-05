/**
 * v1.2.1 destination-depth scorer — post-expansion audit reimplementation.
 *
 * READ-ONLY AUDIT TOOLING. Implements the frozen v1.2.1-final model exactly
 * as approved 2026-08-24 (weights 27/22/21/18/12; sufficiency multiplier
 * 1 - 0.25*exp(-eff/12); 5km coordinate cells; opportunity-gated experience
 * families; opportunity-aware transport denominator; season on the Evidence
 * axis only). The prototype (/tmp/opencode/v121_final.py) was lost in tmpfs
 * cleanup, so this is a faithful documented reimplementation.
 *
 * NOTE: the committed scripts/audit/destination-depth.ts is the OLDER v1.x
 * model (weights 25/20/20/15/10/10 with municipality buckets + season inside
 * depth). It was never updated to v1.2.1; this file is the audit-only
 * comparator. No production behaviour is changed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Destination } from "../../src/shared/types/destination.js";

export const DEPTH_V121_REPORT_VERSION = "1.2.1";

export const DEPTH_V121_WEIGHTS = {
  geographicSpread: 0.27,
  travelAreaCoverage: 0.22,
  experienceBreadth: 0.21,
  tripUtility: 0.18,
  accessDiversity: 0.12,
} as const;

export const SUFFICIENCY = (effectiveDestinations: number): number =>
  1 - 0.25 * Math.exp(-effectiveDestinations / 12);

// Lat cell ≈ 5 km (111.32 km/deg). Lng cell ≈ 5 km at 36°N (90.0 km/deg).
const LAT_CELL_DEG = 0.045;
const LNG_CELL_DEG = 0.06;

/** Prefecture areas (km², rounded; Geospatial Information Authority figures). */
export const PREFECTURE_AREA_KM2: Record<string, number> = {
  Hokkaido: 83424,
  Aomori: 9646,
  Iwate: 15275,
  Miyagi: 7282,
  Akita: 11638,
  Yamagata: 9323,
  Fukushima: 13784,
  Ibaraki: 6097,
  Tochigi: 6408,
  Gunma: 6362,
  Saitama: 3798,
  Chiba: 5158,
  Tokyo: 2194,
  Kanagawa: 2416,
  Niigata: 12584,
  Toyama: 4248,
  Ishikawa: 4186,
  Fukui: 4190,
  Yamanashi: 4465,
  Nagano: 13562,
  Gifu: 10621,
  Shizuoka: 7777,
  Aichi: 5174,
  Mie: 5774,
  Shiga: 4017,
  Kyoto: 4612,
  Osaka: 1905,
  Hyogo: 8401,
  Nara: 3691,
  Wakayama: 4725,
  Tottori: 3507,
  Shimane: 6708,
  Okayama: 7115,
  Hiroshima: 8479,
  Yamaguchi: 6112,
  Tokushima: 4147,
  Kagawa: 1877,
  Ehime: 5676,
  Kochi: 7103,
  Fukuoka: 4986,
  Saga: 2440,
  Nagasaki: 4131,
  Kumamoto: 7409,
  Oita: 6340,
  Miyazaki: 7735,
  Kagoshima: 9187,
  Okinawa: 2281,
};

/** Coastal prefectures (have a coastline; used to gate island/beach families). */
const COASTAL_PREFECTURES = new Set([
  "Hokkaido",
  "Aomori",
  "Iwate",
  "Miyagi",
  "Fukushima",
  "Ibaraki",
  "Chiba",
  "Tokyo",
  "Kanagawa",
  "Niigata",
  "Toyama",
  "Ishikawa",
  "Fukui",
  "Shizuoka",
  "Aichi",
  "Mie",
  "Wakayama",
  "Osaka",
  "Hyogo",
  "Tottori",
  "Shimane",
  "Yamaguchi",
  "Hiroshima",
  "Okayama",
  "Tokushima",
  "Kagawa",
  "Ehime",
  "Kochi",
  "Fukuoka",
  "Saga",
  "Nagasaki",
  "Oita",
  "Miyazaki",
  "Kagoshima",
  "Okinawa",
]);

/** Scheduled-commercial-airport prefectures (2026 transport matrix, stable). */
export const PREFECTURE_AIRPORT: Record<string, boolean> = {
  Hokkaido: true,
  Aomori: true,
  Iwate: true,
  Miyagi: true,
  Akita: true,
  Yamagata: true,
  Fukushima: true,
  Ibaraki: true,
  Tochigi: false,
  Gunma: false,
  Saitama: false,
  Chiba: true,
  Tokyo: true,
  Kanagawa: false,
  Niigata: true,
  Toyama: true,
  Ishikawa: true,
  Fukui: false,
  Yamanashi: false,
  Nagano: true,
  Gifu: false,
  Shizuoka: true,
  Aichi: true,
  Mie: false,
  Shiga: false,
  Kyoto: false,
  Osaka: true,
  Hyogo: true,
  Nara: false,
  Wakayama: false,
  Tottori: true,
  Shimane: true,
  Okayama: true,
  Hiroshima: true,
  Yamaguchi: true,
  Tokushima: true,
  Kagawa: true,
  Ehime: true,
  Kochi: true,
  Fukuoka: true,
  Saga: true,
  Nagasaki: true,
  Kumamoto: true,
  Oita: true,
  Miyazaki: true,
  Kagoshima: true,
  Okinawa: true,
};

/** Shinkansen-served prefectures (2026 completed network). */
export const PREFECTURE_SHINKANSEN: Record<string, boolean> = {
  Hokkaido: true,
  Aomori: true,
  Iwate: true,
  Miyagi: true,
  Akita: true,
  Yamagata: true,
  Fukushima: true,
  Ibaraki: true,
  Tochigi: true,
  Gunma: true,
  Saitama: true,
  Chiba: false,
  Tokyo: true,
  Kanagawa: true,
  Niigata: true,
  Toyama: true,
  Ishikawa: true,
  Fukui: true,
  Yamanashi: true,
  Nagano: true,
  Gifu: true,
  Shizuoka: true,
  Aichi: true,
  Mie: true,
  Shiga: true,
  Kyoto: true,
  Osaka: true,
  Hyogo: true,
  Nara: false,
  Wakayama: false,
  Tottori: false,
  Shimane: false,
  Okayama: true,
  Hiroshima: true,
  Yamaguchi: true,
  Tokushima: false,
  Kagawa: false,
  Ehime: false,
  Kochi: false,
  Fukuoka: true,
  Saga: true,
  Nagasaki: true,
  Kumamoto: true,
  Oita: false,
  Miyazaki: false,
  Kagoshima: true,
  Okinawa: false,
};

/** Material scheduled passenger ferry prefectures (36 TRUE / 11 FALSE, MLIT-audited 2026-08). */
export const PREFECTURE_FERRY: Record<string, boolean> = {
  Hokkaido: true,
  Aomori: true,
  Iwate: false,
  Miyagi: true,
  Akita: true,
  Yamagata: true,
  Fukushima: false,
  Ibaraki: true,
  Tochigi: false,
  Gunma: false,
  Saitama: false,
  Chiba: true,
  Tokyo: true,
  Kanagawa: true,
  Niigata: true,
  Toyama: false,
  Ishikawa: true,
  Fukui: true,
  Yamanashi: false,
  Nagano: false,
  Gifu: false,
  Shizuoka: true,
  Aichi: true,
  Mie: true,
  Shiga: false,
  Kyoto: true,
  Osaka: true,
  Hyogo: true,
  Nara: false,
  Wakayama: true,
  Tottori: true,
  Shimane: true,
  Okayama: true,
  Hiroshima: true,
  Yamaguchi: true,
  Tokushima: true,
  Kagawa: true,
  Ehime: true,
  Kochi: true,
  Fukuoka: true,
  Saga: true,
  Nagasaki: true,
  Kumamoto: true,
  Oita: true,
  Miyazaki: true,
  Kagoshima: true,
  Okinawa: true,
};

const ARCHETYPE_KINDS: Record<string, string[]> = {
  templeShrine: ["temple", "shrine"],
  castle: ["castle", "palace"],
  museumArt: ["museum", "memorial", "monument", "cemetery"],
  natureScenery: [
    "nature",
    "natural",
    "park",
    "garden",
    "lake",
    "waterfall",
    "viewpoint",
    "cliff",
    "rock_formation",
    "cave",
    "gorge",
  ],
  mountainHiking: ["mountain"],
  coastBeach: ["beach"],
  island: ["island"],
  onsen: ["onsen"],
  foodMarket: ["market"],
  shoppingEntertainment: ["shopping", "street"],
  themeFamily: ["theme_park", "amusement_park", "zoo", "aquarium", "cruise"],
  historicDistrict: ["historic", "historic_town", "village", "town"],
  towerLandmark: ["tower", "bridge", "observation"],
  cityHub: ["city", "ward", "district"],
  eventNightlife: ["event", "entertainment"],
};

export const FAMILY_KEYS = Object.keys(ARCHETYPE_KINDS);
const DURATION_BANDS = ["short", "half", "full", "overnight"] as const;

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / LAT_CELL_DEG)}:${Math.floor(lng / LNG_CELL_DEG)}`;
}

function familyOpportunity(family: string, coastal: boolean): boolean {
  if (family === "island" || family === "coastBeach") return coastal;
  return true;
}

function durationBand(d: Destination): (typeof DURATION_BANDS)[number] | null {
  const h = d.recommendedVisitHours;
  if (!h || typeof h.min !== "number") return null;
  const max = h.max ?? h.min;
  if (max < 3) return "short";
  if (max < 6) return "half";
  if (max < 10) return "full";
  return "overnight";
}

function familiesOf(d: Destination): Set<string> {
  const out = new Set<string>();
  const kind = (d.kind ?? "").toLowerCase();
  const cats = (d.categories ?? []).map((c) => c.toLowerCase());
  for (const [family, kinds] of Object.entries(ARCHETYPE_KINDS)) {
    if (kinds.includes(kind)) out.add(family);
    else if (
      cats.some((c) => kinds.some((k) => c.includes(k) || k.includes(c)))
    )
      out.add(family);
  }
  return out;
}

export interface PrefectureV121Report {
  prefecture: string;
  region: string;
  rawCount: number;
  effectiveDestinations: number;
  occupiedCells: number;
  expectedCells: number;
  travelAreas: number;
  expectedAreas: number;
  largestCellShare: number;
  top3CellShare: number;
  familyCovered: number;
  familyOpportunities: number;
  durationCoverage: number;
  durationBands: number;
  accessCovered: number;
  accessOpportunities: number;
  evidencePct: number;
  sufficiency: number;
  components: Record<keyof typeof DEPTH_V121_WEIGHTS, number>;
  depthScore: number;
}

const ROUND2 = (n: number) => Math.round(n * 100) / 100;

export function scorePrefectureV121(
  prefecture: string,
  records: Destination[],
): PrefectureV121Report {
  const region = records[0]?.region ?? "unknown";
  const area = PREFECTURE_AREA_KM2[prefecture] ?? 5000;
  const expectedCells = Math.min(42, Math.max(6, Math.round(area / 2500)));
  const expectedAreas = Math.min(18, Math.max(3, Math.round(area / 8000)));

  // Cells + effective (clone-diminished) destination counts.
  const cells = new Map<string, number>();
  let noCoords = 0;
  for (const d of records) {
    const c = d.coordinates;
    if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") {
      noCoords += 1;
      continue;
    }
    const key = cellKey(c.lat, c.lng);
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  const counts = [...cells.values()].sort((a, b) => b - a);
  const occupiedCells = counts.length;
  const largestCellShare = counts.length
    ? ROUND2(counts[0] / Math.max(1, records.length - noCoords))
    : 0;
  const top3Share = ROUND2(
    counts.slice(0, 3).reduce((a, b) => a + b, 0) /
      Math.max(1, records.length - noCoords),
  );
  let effectiveDestinations = 0;
  for (const n of counts) {
    // Micro-POI cloning is merge-neutral: 1st POI counts 1.0, further POIs
    // in the same cell add 0.4 each, capped at +0.8 (cell max 1.8).
    effectiveDestinations += 1 + 0.4 * Math.min(n - 1, 2);
  }

  // Travel areas: 8-neighbour connected components of occupied cells.
  const keys = [...cells.keys()];
  const keySet = new Set(keys);
  const parsed = keys.map((k) => k.split(":").map(Number));
  let travelAreas = 0;
  const visited = new Set<string>();
  for (const [lc, lngc] of parsed) {
    const start = `${lc}:${lngc}`;
    if (visited.has(start)) continue;
    travelAreas += 1;
    const queue = [[lc, lngc]];
    visited.add(start);
    while (queue.length) {
      const [r, c] = queue.pop()!;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          const nk = `${r + dr}:${c + dc}`;
          if (keySet.has(nk) && !visited.has(nk)) {
            visited.add(nk);
            queue.push([r + dr, c + dc]);
          }
        }
      }
    }
  }
  const coastal = COASTAL_PREFECTURES.has(prefecture);

  // Experience breadth: opportunity-gated families.
  const familyOpportunities = FAMILY_KEYS.filter((f) =>
    familyOpportunity(f, coastal),
  ).length;
  const covered = new Set<string>();
  for (const d of records) for (const f of familiesOf(d)) covered.add(f);
  const familyCovered = [...covered].filter((f) =>
    familyOpportunity(f, coastal),
  ).length;

  // Trip utility from recommendedVisitHours evidence.
  const bands = new Set<(typeof DURATION_BANDS)[number]>();
  let withDuration = 0;
  for (const d of records) {
    const b = durationBand(d);
    if (b) {
      bands.add(b);
      withDuration += 1;
    }
  }
  const durationCoverage = ROUND2(
    Math.min(1, withDuration / Math.max(1, effectiveDestinations)),
  );
  const durationBands = bands.size;

  // Access diversity: opportunity-aware denominator. The catalogue carries
  // no per-record mode evidence (localTransport kind is unavailable on 955
  // records; travelEstimate holds minutes+confidence only), so ground modes
  // are covered wherever a travel estimate exists; flight/shinkansen/ferry
  // have no catalogue-side evidence and score 0 until mode data lands.
  const oppModes: string[] = ["train", "bus", "car"];
  if (PREFECTURE_AIRPORT[prefecture]) oppModes.push("flight");
  if (PREFECTURE_SHINKANSEN[prefecture]) oppModes.push("shinkansen");
  if (PREFECTURE_FERRY[prefecture]) oppModes.push("ferry");
  const accessCovered =
    3 - (records.some((d) => d.travelEstimate?.confidence) ? 0 : 3);

  const geographicSpread = Math.min(1, occupiedCells / expectedCells);
  const travelAreaCoverage = Math.min(1, travelAreas / expectedAreas);
  const experienceBreadth = familyCovered / familyOpportunities;
  const tripUtility =
    0.5 * durationCoverage + 0.5 * (durationBands / DURATION_BANDS.length);
  const accessDiversity = accessCovered / oppModes.length;

  const components = {
    geographicSpread: ROUND2(geographicSpread),
    travelAreaCoverage: ROUND2(travelAreaCoverage),
    experienceBreadth: ROUND2(experienceBreadth),
    tripUtility: ROUND2(tripUtility),
    accessDiversity: ROUND2(accessDiversity),
  };
  const sufficiency = SUFFICIENCY(effectiveDestinations);
  const weighted =
    Object.entries(DEPTH_V121_WEIGHTS).reduce(
      (acc, [k, w]) =>
        acc + w * components[k as keyof typeof DEPTH_V121_WEIGHTS],
      0,
    ) * 100;
  const depthScore = ROUND2(weighted * sufficiency);

  // Evidence %: season + duration + transport + municipality + coordinates
  // + status. Season is evidence-axis only (never feeds depth).
  let evidence = 0;
  for (const d of records) {
    let e = 0;
    if (d.season || d.bestMonths || d.bestSeason) e += 1;
    if (d.recommendedVisitHours) e += 1;
    if (d.travelEstimate || d.transportOptions) e += 1;
    if (d.municipalityId) e += 1;
    if (d.coordinates?.lat != null) e += 1;
    if (d.status) e += 1;
    evidence += e / 6;
  }
  const evidencePct = ROUND2((evidence / Math.max(1, records.length)) * 100);

  return {
    prefecture,
    region,
    rawCount: records.length,
    effectiveDestinations: ROUND2(effectiveDestinations),
    occupiedCells,
    expectedCells,
    travelAreas,
    expectedAreas,
    largestCellShare,
    top3CellShare: top3Share,
    familyCovered,
    familyOpportunities,
    durationCoverage,
    durationBands,
    accessCovered,
    accessOpportunities: oppModes.length,
    evidencePct,
    sufficiency: ROUND2(sufficiency),
    components,
    depthScore,
  };
}

export function buildV121Report(destinations: Destination[]) {
  const prefectures = [
    ...new Set(destinations.map((d) => d.prefecture)),
  ].sort();
  const byPref = new Map<string, Destination[]>();
  const regionOf = new Map<string, string>();
  for (const d of destinations) {
    const p = d.prefecture;
    if (!byPref.has(p)) byPref.set(p, []);
    byPref.get(p)!.push(d);
    regionOf.set(p, d.region ?? "unknown");
  }
  const rows = prefectures
    .map((p) => scorePrefectureV121(p, byPref.get(p) ?? []))
    .sort((a, b) => a.prefecture.localeCompare(b.prefecture));
  const regions = [...new Set(rows.map((r) => r.region))].sort();
  const regionRows = regions.map((region) => {
    const rr = rows.filter((r) => r.region === region);
    return {
      region,
      records: rr.reduce((a, r) => a + r.rawCount, 0),
      effective: ROUND2(rr.reduce((a, r) => a + r.effectiveDestinations, 0)),
      avgDepth: ROUND2(rr.reduce((a, r) => a + r.depthScore, 0) / rr.length),
      avgEvidence: ROUND2(
        rr.reduce((a, r) => a + r.evidencePct, 0) / rr.length,
      ),
      count: rr.length,
    };
  });
  return { prefectures: rows, regions: regionRows };
}

// CLI runner: reports/destination-depth-v121-audit.json + .md
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const indexPath = path.join(root, "src/shared/data/destinations-index.json");
  const destinations = JSON.parse(
    fs.readFileSync(indexPath, "utf8"),
  ) as Destination[];
  const report = buildV121Report(destinations);
  const outDir = path.join(root, "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "destination-depth-v121-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `depth-v121: catalog=${destinations.length} prefectures=${report.prefectures.length} regions=${report.regions.length}`,
  );
  console.log(
    `regions: ${report.regions.map((r) => `${r.region}=${r.avgDepth}`).join(" ")}`,
  );
}
