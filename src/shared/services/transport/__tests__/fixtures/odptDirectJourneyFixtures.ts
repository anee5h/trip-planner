/**
 * KAI-290 PR 2C — sanitized fixtures for the direct-journey primitive.
 *
 * PROVENANCE — read this before quoting anything here as provider fact:
 *
 * These are HAND-AUTHORED, MINIMAL, CREDENTIAL-FREE fixtures. They are NORMALIZED
 * MEGURUTO ODPT SHAPES, not raw provider dumps, and they are NOT live provider
 * snapshots. Only identity/topology shapes are taken from measured evidence
 * (committed artifact `qa/kai-290/odpt-coverage.json`, plus the narrow PR 2C
 * live smoke through the deployed boundary):
 *
 * - `odpt.Train:TokyoMetro.Marunouchi.B427` -> **MEASURED**: 1 record, 18
 *   ordered stops, Shinjuku -> Ikebukuro, calendar `SaturdayHoliday`,
 *   05:00 -> 05:35. The 18-stop count and the endpoint pair are measured facts;
 *   the per-stop clock times below are illustrative.
 * - `odpt.Train:Toei.Mita.535T` -> **MEASURED**: TWO records for one exact train
 *   identity, and they are **CALENDAR VARIANTS of the same service**
 *   (`…535T.SaturdayHoliday` and `…535T.Weekday`), each with 25 ordered stops,
 *   the same first/last stations (ShirokaneTakanawa -> NishiTakashimadaira) and
 *   the same 05:00 -> 05:46 span, with **NEITHER declaring an
 *   `odpt:nextTrainTimetable` / `odpt:previousTrainTimetable` link**. This is
 *   the shape `MITA_CALENDAR_VARIANTS` reproduces. The intermediate stop list is
 *   illustrative (generated to the measured length of 25).
 *
 * A genuinely SPLIT service (two records explicitly linked as one continuation)
 * was NOT observed in any measured data. `MITA_PART_1` / `MITA_PART_2` are a
 * HYPOTHETICAL defensive shape, included because the provider contract defines
 * the links and the primitive must join ONLY on them — not because it was
 * measured. Do not cite them as provider observations.
 */

import type {
  OdptStation,
  OdptStationTimetable,
  OdptStationTimetableObject,
  OdptTrainTimetable,
  OdptTrainTimetableObject,
} from "../../OdptProvider";

export const TOKYO_METRO_OPERATOR = "odpt.Operator:TokyoMetro";
export const TOEI_OPERATOR = "odpt.Operator:Toei";
export const JR_EAST_OPERATOR = "odpt.Operator:JR-East";

export const MARUNOUCHI_RAILWAY = "odpt.Railway:TokyoMetro.Marunouchi";
export const MITA_RAILWAY = "odpt.Railway:Toei.Mita";

export const MARUNOUCHI_TRAIN = "odpt.Train:TokyoMetro.Marunouchi.B427";
export const MITA_TRAIN = "odpt.Train:Toei.Mita.535T";

const FETCHED_AT = "2026-09-11T00:00:00.000Z";

/** Credential-free by construction: the boundary strips `acl:consumerKey`. */
export function fixtureProvenance(sourceResource: string, sourceUrl: string) {
  return {
    provider: "odpt" as const,
    providerId: sourceUrl || null,
    ucode: null,
    generatedAt: "2026-09-01T00:00:00.000Z",
    issuedAt: "2026-04-01T00:00:00.000Z",
    validUntil: null,
    fetchedAt: FETCHED_AT,
    sourceResource,
    sourceUrl,
    coverage: "unknown" as const,
  };
}

export function marunouchiStationId(suffix: string): string {
  return `odpt.Station:TokyoMetro.Marunouchi.${suffix}`;
}

export function mitaStationId(suffix: string): string {
  return `odpt.Station:Toei.Mita.${suffix}`;
}

export function stationFixture(overrides: {
  readonly sameAs: string;
  readonly title: string;
  readonly operator: string;
  readonly railway: string;
  readonly coordinates?: { readonly lat: number; readonly lng: number } | null;
}): OdptStation {
  return {
    id: overrides.sameAs,
    sameAs: overrides.sameAs,
    ucode: null,
    title: overrides.title,
    stationTitle: { ja: overrides.title, en: overrides.title },
    operator: overrides.operator,
    operatorTitle: { ja: overrides.operator },
    railway: overrides.railway,
    railwayTitle: { ja: overrides.railway },
    stationCode: null,
    coordinates: overrides.coordinates ?? null,
    connectingRailway: [],
    connectingStation: [],
    date: "2026-09-01T00:00:00.000Z",
    validUntil: null,
    provenance: fixtureProvenance(
      "odpt:Station",
      "https://api.example.invalid/odpt/Station",
    ),
  };
}

export function trainTimetableObject(
  station: string | null,
  arrivalTime: string | null,
  departureTime: string | null,
): OdptTrainTimetableObject {
  return {
    arrivalTime,
    arrivalStation: station,
    departureTime,
    departureStation: station,
    platformNumber: null,
    platformName: null,
    note: null,
  };
}

export function trainTimetableFixture(overrides: {
  readonly sameAs: string;
  readonly train: string | null;
  readonly trainNumber: string;
  readonly operator: string;
  readonly railway: string;
  readonly objects: readonly OdptTrainTimetableObject[];
  readonly calendar?: string | null;
  readonly railDirection?: string | null;
  readonly previousTrainTimetable?: readonly string[];
  readonly nextTrainTimetable?: readonly string[];
}): OdptTrainTimetable {
  return {
    id: overrides.sameAs,
    sameAs: overrides.sameAs,
    ucode: null,
    operator: overrides.operator,
    operatorTitle: { ja: overrides.operator },
    railway: overrides.railway,
    railwayTitle: { ja: overrides.railway },
    railDirection: overrides.railDirection ?? null,
    // `null` must survive: an explicitly calendar-less timetable is a real case.
    calendar:
      overrides.calendar === undefined
        ? "odpt.Calendar:Weekday"
        : overrides.calendar,
    train: overrides.train,
    trainNumber: overrides.trainNumber,
    trainType: null,
    trainName: [],
    trainOwner: overrides.operator,
    originStation: [],
    destinationStation: [],
    viaStation: [],
    viaRailway: [],
    previousTrainTimetable: overrides.previousTrainTimetable ?? [],
    nextTrainTimetable: overrides.nextTrainTimetable ?? [],
    objects: overrides.objects,
    objectCount: overrides.objects.length,
    needExtraFee: null,
    note: null,
    date: "2026-09-01T00:00:00.000Z",
    issuedAt: null,
    validUntil: null,
    provenance: fixtureProvenance(
      "odpt:TrainTimetable",
      "https://api.example.invalid/odpt/TrainTimetable",
    ),
  };
}

/**
 * TokyoMetro Marunouchi direct service, single record, 18 ordered stops,
 * Shinjuku (dep 06:00) -> Ikebukuro (arr 06:41) = 41 minutes on-train.
 */
export const MARUNOUCHI_STOPS: readonly {
  readonly suffix: string;
  readonly title: string;
  readonly arrival: string | null;
  readonly departure: string | null;
  readonly coordinates: { readonly lat: number; readonly lng: number };
}[] = [
  {
    suffix: "Shinjuku",
    title: "新宿",
    arrival: null,
    departure: "06:00",
    coordinates: { lat: 35.6909, lng: 139.7003 },
  },
  {
    suffix: "ShinjukuSanchome",
    title: "新宿三丁目",
    arrival: "06:02",
    departure: "06:02",
    coordinates: { lat: 35.6906, lng: 139.7055 },
  },
  {
    suffix: "ShinjukuGyoemmae",
    title: "新宿御苑前",
    arrival: "06:04",
    departure: "06:04",
    coordinates: { lat: 35.6885, lng: 139.7106 },
  },
  {
    suffix: "YotsuyaSanchome",
    title: "四谷三丁目",
    arrival: "06:06",
    departure: "06:07",
    coordinates: { lat: 35.6881, lng: 139.7205 },
  },
  {
    suffix: "Yotsuya",
    title: "四谷",
    arrival: "06:09",
    departure: "06:10",
    coordinates: { lat: 35.686, lng: 139.73 },
  },
  {
    suffix: "AkasakaMitsuke",
    title: "赤坂見附",
    arrival: "06:12",
    departure: "06:13",
    coordinates: { lat: 35.6769, lng: 139.7375 },
  },
  {
    suffix: "KokkaiGijidomae",
    title: "国会議事堂前",
    arrival: "06:14",
    departure: "06:15",
    coordinates: { lat: 35.6737, lng: 139.745 },
  },
  {
    suffix: "Kasumigaseki",
    title: "霞ケ関",
    arrival: "06:16",
    departure: "06:17",
    coordinates: { lat: 35.674, lng: 139.7503 },
  },
  {
    suffix: "Ginza",
    title: "銀座",
    arrival: "06:19",
    departure: "06:20",
    coordinates: { lat: 35.6717, lng: 139.7639 },
  },
  {
    suffix: "Tokyo",
    title: "東京",
    arrival: "06:21",
    departure: "06:22",
    coordinates: { lat: 35.6812, lng: 139.7671 },
  },
  {
    suffix: "Otemachi",
    title: "大手町",
    arrival: "06:23",
    departure: "06:24",
    coordinates: { lat: 35.6847, lng: 139.766 },
  },
  {
    suffix: "Awajicho",
    title: "淡路町",
    arrival: "06:25",
    departure: "06:26",
    coordinates: { lat: 35.6952, lng: 139.7674 },
  },
  {
    suffix: "Ochanomizu",
    title: "御茶ノ水",
    arrival: "06:27",
    departure: "06:28",
    coordinates: { lat: 35.6993, lng: 139.7654 },
  },
  {
    suffix: "HongoSanchome",
    title: "本郷三丁目",
    arrival: "06:30",
    departure: "06:31",
    coordinates: { lat: 35.7063, lng: 139.7605 },
  },
  {
    suffix: "Korakuen",
    title: "後楽園",
    arrival: "06:32",
    departure: "06:33",
    coordinates: { lat: 35.7099, lng: 139.7517 },
  },
  {
    suffix: "Myogadani",
    title: "茗荷谷",
    arrival: "06:35",
    departure: "06:36",
    coordinates: { lat: 35.7174, lng: 139.7367 },
  },
  {
    suffix: "ShinOtsuka",
    title: "新大塚",
    arrival: "06:38",
    departure: "06:39",
    coordinates: { lat: 35.7256, lng: 139.73 },
  },
  {
    suffix: "Ikebukuro",
    title: "池袋",
    arrival: "06:41",
    departure: null,
    coordinates: { lat: 35.7295, lng: 139.7109 },
  },
];

export function marunouchiStation(suffix: string): OdptStation {
  const entry = MARUNOUCHI_STOPS.find((stop) => stop.suffix === suffix);
  if (entry === undefined) {
    return stationFixture({
      sameAs: marunouchiStationId(suffix),
      title: suffix,
      operator: TOKYO_METRO_OPERATOR,
      railway: MARUNOUCHI_RAILWAY,
    });
  }
  return stationFixture({
    sameAs: marunouchiStationId(entry.suffix),
    title: entry.title,
    operator: TOKYO_METRO_OPERATOR,
    railway: MARUNOUCHI_RAILWAY,
    coordinates: entry.coordinates,
  });
}

export const MARUNOUCHI_TRAIN_TIMETABLE: OdptTrainTimetable =
  trainTimetableFixture({
    sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427",
    train: MARUNOUCHI_TRAIN,
    trainNumber: "B427",
    operator: TOKYO_METRO_OPERATOR,
    railway: MARUNOUCHI_RAILWAY,
    railDirection: "odpt.RailDirection:TokyoMetro.Ikebukuro",
    calendar: "odpt.Calendar:Weekday",
    objects: MARUNOUCHI_STOPS.map((stop) =>
      trainTimetableObject(
        marunouchiStationId(stop.suffix),
        stop.arrival,
        stop.departure,
      ),
    ),
  });

/** 06:00 Shinjuku -> 06:41 Ikebukuro. */
export const MARUNOUCHI_EXPECTED_MINUTES = 41;

/**
 * Toei Mita split service: one exact train identity, TWO TrainTimetable
 * records, joined only by the provider's explicit next/previous links.
 * Part 1 ends at Mita, part 2 continues from Hibiya.
 */
export const MITA_PART_1_ID = "odpt.TrainTimetable:Toei.Mita.535T.1";
export const MITA_PART_2_ID = "odpt.TrainTimetable:Toei.Mita.535T.2";

export const MITA_PART_1: OdptTrainTimetable = trainTimetableFixture({
  sameAs: MITA_PART_1_ID,
  train: MITA_TRAIN,
  trainNumber: "535T",
  operator: TOEI_OPERATOR,
  railway: MITA_RAILWAY,
  railDirection: "odpt.RailDirection:Toei.NishiTakashimadaira",
  calendar: "odpt.Calendar:SaturdayHoliday",
  nextTrainTimetable: [MITA_PART_2_ID],
  objects: [
    trainTimetableObject(mitaStationId("Meguro"), null, "10:00"),
    trainTimetableObject(mitaStationId("ShirokaneTakanawa"), "10:03", "10:03"),
    trainTimetableObject(mitaStationId("ShibaKoen"), "10:08", "10:09"),
    trainTimetableObject(mitaStationId("Mita"), "10:11", "10:12"),
  ],
});

export const MITA_PART_2: OdptTrainTimetable = trainTimetableFixture({
  sameAs: MITA_PART_2_ID,
  train: MITA_TRAIN,
  trainNumber: "535T",
  operator: TOEI_OPERATOR,
  railway: MITA_RAILWAY,
  railDirection: "odpt.RailDirection:Toei.NishiTakashimadaira",
  calendar: "odpt.Calendar:SaturdayHoliday",
  previousTrainTimetable: [MITA_PART_1_ID],
  objects: [
    trainTimetableObject(mitaStationId("Hibiya"), "10:15", "10:16"),
    trainTimetableObject(mitaStationId("Otemachi"), "10:19", "10:19"),
    trainTimetableObject(mitaStationId("Takebashi"), "10:21", "10:22"),
    trainTimetableObject(mitaStationId("Jimbocho"), "10:24", "10:24"),
    trainTimetableObject(mitaStationId("Suidobashi"), "10:26", "10:27"),
    trainTimetableObject(mitaStationId("Korakuen"), "10:31", "10:31"),
    trainTimetableObject(mitaStationId("Sugamo"), "10:40", null),
  ],
});

export interface MitaStationSpec {
  readonly suffix: string;
  readonly title: string;
  readonly coordinates: { readonly lat: number; readonly lng: number };
}

export const MITA_STATIONS: readonly MitaStationSpec[] = [
  {
    suffix: "Meguro",
    title: "目黒",
    coordinates: { lat: 35.6339, lng: 139.7157 },
  },
  {
    suffix: "ShirokaneTakanawa",
    title: "白金高輪",
    coordinates: { lat: 35.6428, lng: 139.7345 },
  },
  {
    suffix: "ShibaKoen",
    title: "芝公園",
    coordinates: { lat: 35.6545, lng: 139.7503 },
  },
  {
    suffix: "Mita",
    title: "三田",
    coordinates: { lat: 35.6484, lng: 139.7404 },
  },
  {
    suffix: "Hibiya",
    title: "日比谷",
    coordinates: { lat: 35.6746, lng: 139.7598 },
  },
  {
    suffix: "Otemachi",
    title: "大手町",
    coordinates: { lat: 35.6847, lng: 139.766 },
  },
  {
    suffix: "Takebashi",
    title: "竹橋",
    coordinates: { lat: 35.6905, lng: 139.7576 },
  },
  {
    suffix: "Jimbocho",
    title: "神保町",
    coordinates: { lat: 35.6957, lng: 139.7578 },
  },
  {
    suffix: "Suidobashi",
    title: "水道橋",
    coordinates: { lat: 35.7025, lng: 139.7526 },
  },
  {
    suffix: "Korakuen",
    title: "後楽園",
    coordinates: { lat: 35.7099, lng: 139.7517 },
  },
  {
    suffix: "Sugamo",
    title: "巣鴨",
    coordinates: { lat: 35.7335, lng: 139.7394 },
  },
];

export function mitaStation(suffix: string): OdptStation {
  const entry = MITA_STATIONS.find((stop) => stop.suffix === suffix);
  if (entry === undefined) {
    return stationFixture({
      sameAs: mitaStationId(suffix),
      title: suffix,
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
    });
  }
  return stationFixture({
    sameAs: mitaStationId(entry.suffix),
    title: entry.title,
    operator: TOEI_OPERATOR,
    railway: MITA_RAILWAY,
    coordinates: entry.coordinates,
  });
}

/** 10:00 Meguro -> 10:40 Sugamo, only provable by joining both parts. */
export const MITA_EXPECTED_MINUTES = 40;

// ─── MEASURED SHAPE: two CALENDAR VARIANT records for one exact train ────────

/** On-train span of the measured 535T shape: 05:00 -> 05:46. */
export const MITA_VARIANT_MINUTES = 46;

/** The two measured record ids, in the order the provider returned them. */
export const MITA_CALENDAR_VARIANT_IDS = [
  "odpt.TrainTimetable:Toei.Mita.535T.SaturdayHoliday",
  "odpt.TrainTimetable:Toei.Mita.535T.Weekday",
] as const;

/** 25 stops. The first/last are measured; the intermediate list is illustrative. */
const MITA_VARIANT_STATIONS: readonly string[] = [
  "ShirokaneTakanawa",
  "Mita",
  "ShibaKoen",
  "Onarimon",
  "Uchisaiwaicho",
  "Hibiya",
  "Otemachi",
  "Takebashi",
  "Jimbocho",
  "Suidobashi",
  "Korakuen",
  "Kasuga",
  "Hakusan",
  "Sengoku",
  "Sugamo",
  "NishiSugamo",
  "SugamoShinden",
  "Otsuka",
  "ShinOtsuka",
  "Myogadani",
  "Koishikawa",
  "Iidabashi",
  "Kudanshita",
  "Takashimadaira",
  "NishiTakashimadaira",
];

/** 05:00 + `minuteOffset`, as `HH:MM`. */
function variantClock(minuteOffset: number): string {
  const total = 5 * 60 + minuteOffset;
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Stop objects for the measured 535T shape: 25 stops from ShirokaneTakanawa
 * (departure only) to NishiTakashimadaira (arrival only), monotonically
 * increasing, spanning exactly `MITA_VARIANT_MINUTES`.
 */
function mitaVariantObjects(): OdptTrainTimetableObject[] {
  const lastIndex = MITA_VARIANT_STATIONS.length - 1;
  return MITA_VARIANT_STATIONS.map((suffix, index) => {
    const minuteOffset = Math.round((index * MITA_VARIANT_MINUTES) / lastIndex);
    const clock = variantClock(minuteOffset);
    return trainTimetableObject(
      mitaStationId(suffix),
      index === 0 ? null : clock,
      index === lastIndex ? null : clock,
    );
  });
}

/**
 * TWO records for ONE exact train identity, differing ONLY by calendar, with no
 * split link between them (both `nextTrainTimetable` and
 * `previousTrainTimetable` are empty).
 *
 * This is the measured Toei shape, and it is the case that makes
 * "evaluate each record independently BEFORE attempting any chain join"
 * load-bearing: either record alone proves the origin -> destination pair, so
 * treating the group as a mandatory chain would wrongly report every such
 * service as inconclusive.
 */
export const MITA_CALENDAR_VARIANTS: readonly OdptTrainTimetable[] =
  MITA_CALENDAR_VARIANT_IDS.map((id, index) =>
    trainTimetableFixture({
      sameAs: id,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      railDirection: "odpt.RailDirection:Toei.NishiTakashimadaira",
      calendar:
        index === 0 ? "odpt.Calendar:SaturdayHoliday" : "odpt.Calendar:Weekday",
      objects: mitaVariantObjects(),
    }),
  );

export function stationTimetableObject(
  train: string | null,
  departureTime: string | null,
  overrides: Partial<OdptStationTimetableObject> = {},
): OdptStationTimetableObject {
  return {
    arrivalTime: overrides.arrivalTime ?? null,
    departureTime,
    originStation: overrides.originStation ?? [],
    destinationStation: overrides.destinationStation ?? [],
    viaStation: overrides.viaStation ?? [],
    viaRailway: overrides.viaRailway ?? [],
    train,
    trainNumber: overrides.trainNumber ?? null,
    trainType: overrides.trainType ?? null,
    trainName: overrides.trainName ?? [],
    trainOwner: overrides.trainOwner ?? null,
    isLast: overrides.isLast ?? false,
    isOrigin: overrides.isOrigin ?? false,
    platformNumber: null,
    platformName: null,
    carComposition: null,
    note: null,
  };
}

export function stationTimetableFixture(overrides: {
  readonly sameAs: string;
  readonly station: string;
  readonly operator: string;
  readonly railway: string;
  readonly objects: readonly OdptStationTimetableObject[];
  readonly calendar?: string | null;
  readonly railDirection?: string | null;
}): OdptStationTimetable {
  return {
    id: overrides.sameAs,
    sameAs: overrides.sameAs,
    ucode: null,
    operator: overrides.operator,
    operatorTitle: { ja: overrides.operator },
    railway: overrides.railway,
    railwayTitle: { ja: overrides.railway },
    station: overrides.station,
    stationTitle: null,
    railDirection: overrides.railDirection ?? null,
    railDirectionTitle: null,
    // `null` must survive: an explicitly calendar-less timetable is a real case.
    calendar:
      overrides.calendar === undefined
        ? "odpt.Calendar:Weekday"
        : overrides.calendar,
    objects: overrides.objects,
    objectCount: overrides.objects.length,
    note: null,
    date: "2026-09-01T00:00:00.000Z",
    issuedAt: null,
    validUntil: null,
    provenance: fixtureProvenance(
      "odpt:StationTimetable",
      "https://api.example.invalid/odpt/StationTimetable",
    ),
  };
}

/** Shinjuku's own StationTimetable: discovery evidence for Marunouchi trains. */
export const SHINJUKU_STATION_TIMETABLE: OdptStationTimetable =
  stationTimetableFixture({
    sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
    station: marunouchiStationId("Shinjuku"),
    operator: TOKYO_METRO_OPERATOR,
    railway: MARUNOUCHI_RAILWAY,
    railDirection: "odpt.RailDirection:TokyoMetro.Ikebukuro",
    calendar: "odpt.Calendar:Weekday",
    objects: [
      stationTimetableObject(MARUNOUCHI_TRAIN, "06:00", {
        trainNumber: "B427",
        destinationStation: [marunouchiStationId("Ikebukuro")],
      }),
      stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.B429", "06:04", {
        trainNumber: "B429",
      }),
      // In-window but without an exact train identity: cannot become a candidate.
      stationTimetableObject(null, "06:06", { trainNumber: "B431" }),
      // Outside the requested window: must be filtered out locally.
      stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.B500", "09:30", {
        trainNumber: "B500",
      }),
    ],
  });

/** Meguro's own StationTimetable: discovery evidence for the Mita split train. */
export const MEGURO_STATION_TIMETABLE: OdptStationTimetable =
  stationTimetableFixture({
    sameAs: "odpt.StationTimetable:Toei.Mita.Meguro",
    station: mitaStationId("Meguro"),
    operator: TOEI_OPERATOR,
    railway: MITA_RAILWAY,
    railDirection: "odpt.RailDirection:Toei.NishiTakashimadaira",
    calendar: "odpt.Calendar:SaturdayHoliday",
    objects: [
      stationTimetableObject(MITA_TRAIN, "10:00", {
        trainNumber: "535T",
        destinationStation: [mitaStationId("NishiTakashimadaira")],
      }),
    ],
  });

/** A 23:58 -> 00:03 rollover service: the only provider-proven crossing. */
export const ROLLOVER_TRAIN_TIMETABLE: OdptTrainTimetable =
  trainTimetableFixture({
    sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B901",
    train: "odpt.Train:TokyoMetro.Marunouchi.B901",
    trainNumber: "B901",
    operator: TOKYO_METRO_OPERATOR,
    railway: MARUNOUCHI_RAILWAY,
    objects: [
      trainTimetableObject(marunouchiStationId("Tokyo"), null, "23:58"),
      trainTimetableObject(marunouchiStationId("Otemachi"), "00:03", null),
    ],
  });
