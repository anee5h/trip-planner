import { describe, expect, it } from "vitest";
import type {
  OdptProvider,
  OdptResult,
  OdptStation,
  OdptStationTimetable,
  OdptStationTimetableQuery,
  OdptTrainTimetable,
  OdptTrainTimetableQuery,
} from "../OdptProvider";
import {
  ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET,
  ODPT_DIRECT_JOURNEY_MAX_TRAIN_LOOKUPS,
  parseDepartureWindowBound,
  resolveOdptDirectJourney,
  type OdptDirectJourneyResolution,
} from "../OdptDirectJourneyService";
import { parseClockMinutes } from "../odptChronology";
import {
  JR_EAST_OPERATOR,
  MARUNOUCHI_TRAIN,
  MARUNOUCHI_TRAIN_TIMETABLE,
  MARUNOUCHI_EXPECTED_MINUTES,
  MEGURO_STATION_TIMETABLE,
  MITA_CALENDAR_VARIANTS,
  MITA_EXPECTED_MINUTES,
  MITA_PART_1,
  MITA_PART_1_ID,
  MITA_PART_2,
  MITA_PART_2_ID,
  MITA_RAILWAY,
  MITA_TRAIN,
  MITA_VARIANT_MINUTES,
  SHINJUKU_STATION_TIMETABLE,
  TOEI_OPERATOR,
  TOKYO_METRO_OPERATOR,
  marunouchiStation,
  marunouchiStationId,
  mitaStation,
  mitaStationId,
  stationTimetableFixture,
  stationTimetableObject,
  trainTimetableFixture,
  trainTimetableObject,
} from "./fixtures/odptDirectJourneyFixtures";

const SERVICE_DATE = "2026-09-11";
const WINDOW = { start: "06:00", end: "08:00" };

interface RecordedCall {
  readonly method: string;
  readonly input: Record<string, unknown>;
}

type StationTimetableHandler = (
  input: OdptStationTimetableQuery,
) => OdptResult<OdptStationTimetable>;
type TrainTimetableHandler = (
  input: OdptTrainTimetableQuery,
) => OdptResult<OdptTrainTimetable>;

/** Records every provider call so request shapes can be asserted exactly. */
function recordingProvider(handlers: {
  readonly stationTimetable?: StationTimetableHandler;
  readonly trainTimetable?: TrainTimetableHandler;
}): { readonly provider: OdptProvider; readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const unexpected = (method: string) => async () => {
    throw new Error(`unexpected provider method: ${method}`);
  };
  const provider: OdptProvider = {
    nearbyStations: unexpected("nearbyStations") as never,
    station: unexpected("station") as never,
    railway: unexpected("railway") as never,
    railwayFare: unexpected("railwayFare") as never,
    datapoint: unexpected("datapoint") as never,
    calendar: unexpected("calendar") as never,
    operator: unexpected("operator") as never,
    trainType: unexpected("trainType") as never,
    railDirection: unexpected("railDirection") as never,
    stationTimetable: async (input) => {
      calls.push({ method: "stationTimetable", input: { ...input } });
      return handlers.stationTimetable!(input);
    },
    trainTimetable: async (input) => {
      calls.push({ method: "trainTimetable", input: { ...input } });
      return handlers.trainTimetable!(input);
    },
  };
  return { provider, calls };
}

function records<T>(operation: string, items: readonly T[]): OdptResult<T> {
  return {
    provider: "odpt",
    operation,
    outcome: "records",
    records: items,
    recordCount: items.length,
    retrievedAt: "2026-09-11T00:00:00.000Z",
    sourceResource: "odpt:TrainTimetable",
    sourceUrl: "https://api.example.invalid/odpt/TrainTimetable",
    normalization: "odpt-api-v4.16",
  };
}

function failure<T>(
  operation: string,
  errorCode: string,
  outcome: "error" | "no_data" = "error",
): OdptResult<T> {
  return {
    provider: "odpt",
    operation,
    outcome,
    records: [],
    recordCount: 0,
    errorCode,
    retrievedAt: "2026-09-11T00:00:00.000Z",
    sourceResource: "unknown",
    sourceUrl: "",
    normalization: "odpt-api-v4.16",
  };
}

/**
 * A Marunouchi-style record for ONE requested train identity, departing at
 * `departure`. A stub must answer with the train that was actually asked for:
 * a response for a different train is now a scope violation rather than proof.
 */
function marunouchiRecordFor(
  trainIdentity: string,
  departure: string,
  durationMinutes = 41,
): OdptTrainTimetable {
  const [hours, minutes] = departure.split(":").map(Number);
  const total = hours * 60 + minutes + durationMinutes;
  const arrival = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
  return trainTimetableFixture({
    sameAs: `odpt.TrainTimetable:${trainIdentity}`,
    train: trainIdentity,
    trainNumber: trainIdentity.split(".").at(-1) ?? "X",
    operator: TOKYO_METRO_OPERATOR,
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    objects: [
      trainTimetableObject(marunouchiStationId("Shinjuku"), null, departure),
      trainTimetableObject(marunouchiStationId("Ikebukuro"), arrival, null),
    ],
  });
}

/** A record for ONE requested train that conclusively does NOT carry the pair. */
function marunouchiNoPairFor(trainIdentity: string): OdptTrainTimetable {
  return trainTimetableFixture({
    sameAs: `odpt.TrainTimetable:${trainIdentity}`,
    train: trainIdentity,
    trainNumber: trainIdentity.split(".").at(-1) ?? "X",
    operator: TOKYO_METRO_OPERATOR,
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    objects: [
      trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
    ],
  });
}

/** A StationTimetable at the Marunouchi origin listing `count` distinct trains. */
function shinjukuTimetableWithTrains(count: number): OdptStationTimetable {
  const objects = [];
  for (let index = 0; index < count; index += 1) {
    const minutes = 0 + index * 5;
    const departure = `06:${String(minutes).padStart(2, "0")}`;
    objects.push(
      stationTimetableObject(
        `odpt.Train:TokyoMetro.Marunouchi.T${String(index).padStart(3, "0")}`,
        departure,
        { trainNumber: `T${index}` },
      ),
    );
  }
  return stationTimetableFixture({
    sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
    station: marunouchiStationId("Shinjuku"),
    operator: TOKYO_METRO_OPERATOR,
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    objects,
  });
}

async function resolve(
  handlers: Parameters<typeof recordingProvider>[0],
  overrides: {
    readonly originStation?: OdptStation;
    readonly destinationStation?: OdptStation;
    readonly serviceDate?: string;
    readonly departureWindow?: { readonly start: string; readonly end: string };
  } = {},
): Promise<{
  readonly resolution: OdptDirectJourneyResolution;
  readonly calls: RecordedCall[];
}> {
  const { provider, calls } = recordingProvider(handlers);
  const resolution = await resolveOdptDirectJourney({
    provider,
    originStation: overrides.originStation ?? marunouchiStation("Shinjuku"),
    destinationStation:
      overrides.destinationStation ?? marunouchiStation("Ikebukuro"),
    serviceDate: overrides.serviceDate ?? SERVICE_DATE,
    departureWindow: overrides.departureWindow ?? WINDOW,
  });
  return { resolution, calls };
}

function trainCalls(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === "trainTimetable");
}

describe("resolveOdptDirectJourney — resolved path", () => {
  it("resolves a direct service discovered from the origin's own timetable", async () => {
    // The origin's own timetable lists B427 (06:00) and B429 (06:04), and each
    // exact lookup answers for the train that was requested.
    const departures: Record<string, string> = {
      [MARUNOUCHI_TRAIN]: "06:00",
      "odpt.Train:TokyoMetro.Marunouchi.B429": "06:04",
    };
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: (input) => {
        const train = String(input.train);
        return records("train_timetable", [
          marunouchiRecordFor(train, departures[train] ?? "06:00"),
        ]);
      },
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates).toHaveLength(2);
    expect(resolution.coverage).toBe("complete");
    expect(resolution.candidates[0].journey.legs[0].duration.minutes).toEqual([
      MARUNOUCHI_EXPECTED_MINUTES,
      MARUNOUCHI_EXPECTED_MINUTES,
    ]);
    expect(resolution.diagnostics.logicalLookups).toBe(3);
    // The in-window object without a train identity was counted, not used.
    expect(resolution.diagnostics.candidatesWithoutTrainIdentity).toBe(1);
    // The out-of-window train (09:30) was never looked up.
    expect(trainCalls(calls).map((call) => call.input.train)).toEqual([
      MARUNOUCHI_TRAIN,
      "odpt.Train:TokyoMetro.Marunouchi.B429",
    ]);
  });
});

describe("resolveOdptDirectJourney — request shapes", () => {
  it("queries StationTimetable by EXACT origin station and service date only", async () => {
    const { calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });

    const stationCalls = calls.filter(
      (call) => call.method === "stationTimetable",
    );
    expect(stationCalls).toHaveLength(1);
    expect(stationCalls[0].input).toEqual({
      station: marunouchiStationId("Shinjuku"),
      date: SERVICE_DATE,
    });
    // No operator-wide request, no railway-wide request, no calendar fetch just
    // to discover the applicable service, and no escape hatch.
    for (const forbidden of [
      "operator",
      "railway",
      "sameAs",
      "railDirection",
      "calendar",
    ]) {
      expect(stationCalls[0].input).not.toHaveProperty(forbidden);
    }
  });

  it("always includes an EXACT train identity on candidate lookups", async () => {
    const { calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });

    const exact = trainCalls(calls);
    expect(exact.length).toBeGreaterThan(0);
    for (const call of exact) {
      expect(typeof call.input.train).toBe("string");
      expect(String(call.input.train).length).toBeGreaterThan(0);
      // Never a whole-railway or operator-wide lookup.
      expect(call.input).not.toHaveProperty("railway");
      expect(call.input).not.toHaveProperty("operator");
      expect(call.input).not.toHaveProperty("trainNumber");
      expect(call.input).not.toHaveProperty("trainType");
      expect(call.input).not.toHaveProperty("sameAs");
    }
  });

  it("narrows the candidate lookup with the discovered calendar when present", async () => {
    const { calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(trainCalls(calls)[0].input).toEqual({
      train: MARUNOUCHI_TRAIN,
      calendar: "odpt.Calendar:Weekday",
    });
  });

  it("omits the calendar filter when the timetable did not declare one", async () => {
    const noCalendar = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: null,
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const { calls } = await resolve({
      stationTimetable: () => records("station_timetable", [noCalendar]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(trainCalls(calls)[0].input).toEqual({ train: MARUNOUCHI_TRAIN });
  });

  it("issues exactly one lookup for a duplicated train identity", async () => {
    const duplicated = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        stationTimetableObject(MARUNOUCHI_TRAIN, "06:00"),
        stationTimetableObject(MARUNOUCHI_TRAIN, "06:00"),
        stationTimetableObject(MARUNOUCHI_TRAIN, "06:00"),
      ],
    });
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [duplicated]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(resolution.diagnostics.candidatesDiscovered).toBe(1);
    expect(trainCalls(calls)).toHaveLength(1);
  });
});

describe("resolveOdptDirectJourney — departure window", () => {
  it("filters StationTimetable objects locally to the requested window", async () => {
    const timetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        stationTimetableObject(
          "odpt.Train:TokyoMetro.Marunouchi.EARLY",
          "05:59",
        ),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.IN1", "06:00"),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.IN2", "07:00"),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.IN3", "08:00"),
        stationTimetableObject(
          "odpt.Train:TokyoMetro.Marunouchi.LATE",
          "08:01",
        ),
      ],
    });
    const departures: Record<string, string> = {
      "odpt.Train:TokyoMetro.Marunouchi.IN1": "06:00",
      "odpt.Train:TokyoMetro.Marunouchi.IN2": "07:00",
      "odpt.Train:TokyoMetro.Marunouchi.IN3": "08:00",
    };
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [timetable]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(
            String(input.train),
            departures[String(input.train)] ?? "06:00",
          ),
        ]),
    });
    // Inclusive bounds: 06:00 and 08:00 are inside, 05:59 and 08:01 are not.
    expect(trainCalls(calls).map((call) => call.input.train)).toEqual([
      "odpt.Train:TokyoMetro.Marunouchi.IN1",
      "odpt.Train:TokyoMetro.Marunouchi.IN2",
      "odpt.Train:TokyoMetro.Marunouchi.IN3",
    ]);
    expect(resolution.diagnostics.candidatesDiscovered).toBe(3);
  });

  it("orders candidates by scheduled departure, then by stable identity", async () => {
    const timetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.ZZZ", "07:30"),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.BBB", "06:10"),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.AAA", "06:10"),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.CCC", "07:30"),
      ],
    });
    const { calls } = await resolve({
      stationTimetable: () => records("station_timetable", [timetable]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(trainCalls(calls).map((call) => call.input.train)).toEqual([
      "odpt.Train:TokyoMetro.Marunouchi.AAA",
      "odpt.Train:TokyoMetro.Marunouchi.BBB",
      "odpt.Train:TokyoMetro.Marunouchi.CCC",
      "odpt.Train:TokyoMetro.Marunouchi.ZZZ",
    ]);
  });

  it.each([
    ["cross-midnight window", { start: "23:00", end: "01:00" }],
    ["reversed window", { start: "08:00", end: "06:00" }],
    ["window wider than three hours", { start: "06:00", end: "09:01" }],
    ["malformed start", { start: "6:0x", end: "08:00" }],
    ["malformed end", { start: "06:00", end: "later" }],
  ])(
    "rejects an invalid departure window (%s) without any lookup",
    async (_label, window) => {
      const { resolution, calls } = await resolve(
        {
          stationTimetable: () =>
            records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
          trainTimetable: () =>
            records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
        },
        { departureWindow: window },
      );
      expect(resolution.status).toBe("inconclusive");
      if (resolution.status !== "inconclusive") return;
      expect(resolution.reason).toBe("invalid_departure_window");
      expect(calls).toHaveLength(0);
    },
  );

  it("allows a window exactly three hours wide", async () => {
    const { resolution } = await resolve(
      {
        stationTimetable: () =>
          records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
        trainTimetable: () =>
          records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
      },
      { departureWindow: { start: "06:00", end: "09:00" } },
    );
    expect(resolution.status).toBe("resolved");
  });
});

describe("resolveOdptDirectJourney — per-journey fan-out budget", () => {
  it("caps a resolution at eight logical lookups and never issues a ninth", async () => {
    // Every candidate conclusively lacks the pair, so the cap decides the result.
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(12)]),
      trainTimetable: (input) =>
        records("train_timetable", [marunouchiNoPairFor(String(input.train))]),
    });

    expect(ODPT_DIRECT_JOURNEY_BASE_LOOKUP_BUDGET).toBe(8);
    expect(resolution.diagnostics.stationTimetableLookups).toBe(1);
    expect(resolution.diagnostics.exactTrainLookups).toBe(
      ODPT_DIRECT_JOURNEY_MAX_TRAIN_LOOKUPS,
    );
    expect(resolution.diagnostics.logicalLookups).toBe(8);
    expect(calls).toHaveLength(8);
    expect(resolution.diagnostics.candidatesDiscovered).toBe(12);
    expect(resolution.diagnostics.candidatesInspected).toBe(7);
    expect(resolution.diagnostics.candidateLimitReached).toBe(true);
    // Uninspected evidence remains, so this can never read as an absence.
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("journey_budget_exhausted");
  });

  it("reports partial coverage when a proven journey coexists with uninspected candidates", async () => {
    let call = 0;
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(12)]),
      trainTimetable: (input) => {
        call += 1;
        // The first inspected candidate proves the pair; the rest conclusively do
        // not. Uninspected candidates remain, so coverage cannot be complete.
        return records("train_timetable", [
          call === 1
            ? marunouchiRecordFor(String(input.train), "06:00")
            : marunouchiNoPairFor(String(input.train)),
        ]);
      },
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.coverage).toBe("partial");
    expect(resolution.diagnostics.candidateLimitReached).toBe(true);
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.diagnostics.candidatesConclusive).toBe(
      ODPT_DIRECT_JOURNEY_MAX_TRAIN_LOOKUPS,
    );
  });

  it("uses complete coverage when every discovered candidate was inspected", async () => {
    const departures = ["06:00", "06:05", "06:10"];
    let call = 0;
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(3)]),
      trainTimetable: (input) => {
        const departure = departures[call] ?? "06:00";
        call += 1;
        return records("train_timetable", [
          marunouchiRecordFor(String(input.train), departure),
        ]);
      },
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.coverage).toBe("complete");
    expect(resolution.diagnostics.candidateLimitReached).toBe(false);
    expect(resolution.diagnostics.logicalLookups).toBe(4);
    expect(resolution.diagnostics.candidatesInconclusive).toBe(0);
    expect(resolution.diagnostics.candidatesConclusive).toBe(3);
  });

  it("keeps a server-side 503 retry invisible to the client-side fan-out budget", async () => {
    // PR 2B owns actual-attempt accounting; this resolver counts provider METHOD
    // calls only, so an internal retry must not consume a second budget slot.
    let attemptsIncludingRetry = 0;
    const singleTrain = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [singleTrain]),
      trainTimetable: () => {
        // Stands in for a boundary call that internally retried once on a 503:
        // from THIS resolver it is still one method call.
        attemptsIncludingRetry += 1;
        return records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]);
      },
    });
    expect(attemptsIncludingRetry).toBe(1);
    expect(resolution.diagnostics.exactTrainLookups).toBe(1);
    expect(resolution.diagnostics.logicalLookups).toBe(2);
    expect(trainCalls(calls)).toHaveLength(1);
  });
});

describe("resolveOdptDirectJourney — pilot operator guard", () => {
  it.each([
    ["JR-East origin", JR_EAST_OPERATOR, TOKYO_METRO_OPERATOR],
    ["JR-East destination", TOKYO_METRO_OPERATOR, JR_EAST_OPERATOR],
    ["unsupported origin", "odpt.Operator:Odakyu", TOKYO_METRO_OPERATOR],
  ])(
    "fails closed for %s",
    async (_label, originOperator, destinationOperator) => {
      const origin = marunouchiStation("Shinjuku");
      const destination = marunouchiStation("Ikebukuro");
      const { resolution, calls } = await resolve(
        {
          stationTimetable: () =>
            records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
          trainTimetable: () =>
            records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
        },
        {
          originStation: { ...origin, operator: originOperator },
          destinationStation: { ...destination, operator: destinationOperator },
        },
      );
      expect(resolution.status).toBe("inconclusive");
      if (resolution.status !== "inconclusive") return;
      expect(resolution.reason).toBe("operator_outside_timetable_pilot");
      // Scoped out before any provider traffic.
      expect(calls).toHaveLength(0);
    },
  );

  it("fails closed when a returned timetable belongs to another operator", async () => {
    const foreign = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:JR-East.Yamanote.1",
      train: "odpt.Train:JR-East.Yamanote.1",
      trainNumber: "1",
      operator: JR_EAST_OPERATOR,
      railway: "odpt.Railway:JR-East.Yamanote",
      objects: [],
    });
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: () => records("train_timetable", [foreign]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("operator_outside_timetable_pilot");
  });
});

describe("resolveOdptDirectJourney — split continuation", () => {
  it("resolves a measured split service end to end", async () => {
    const splitTimetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:Toei.Mita.Meguro",
      station: mitaStationId("Meguro"),
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: [stationTimetableObject(MITA_TRAIN, "10:00")],
    });
    const { resolution, calls } = await resolve(
      {
        stationTimetable: () => records("station_timetable", [splitTimetable]),
        trainTimetable: () =>
          records("train_timetable", [MITA_PART_1, MITA_PART_2]),
      },
      {
        originStation: mitaStation("Meguro"),
        destinationStation: mitaStation("Sugamo"),
        departureWindow: { start: "09:30", end: "11:30" },
      },
    );

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates[0].journey.legs[0].duration.minutes).toEqual([
      MITA_EXPECTED_MINUTES,
      MITA_EXPECTED_MINUTES,
    ]);
    expect(resolution.candidates[0].evidence.splitContinuation).toBe(true);
    expect(resolution.candidates[0].evidence.timetableRecordIds).toEqual([
      MITA_PART_1_ID,
      MITA_PART_2_ID,
    ]);
    expect(trainCalls(calls)[0].input.calendar).toBe(
      "odpt.Calendar:SaturdayHoliday",
    );
  });

  it("resolves the MEASURED calendar-variant shape without demanding a chain", async () => {
    // `odpt.Train:Toei.Mita.535T` returns two records that are calendar variants
    // of one service and declare no split link. Each alone proves the pair, so
    // the resolver must resolve rather than report a chain failure.
    const measuredTimetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:Toei.Mita.ShirokaneTakanawa",
      station: mitaStationId("ShirokaneTakanawa"),
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      calendar: "odpt.Calendar:Weekday",
      objects: [stationTimetableObject(MITA_TRAIN, "05:00")],
    });
    const { resolution } = await resolve(
      {
        stationTimetable: () =>
          records("station_timetable", [measuredTimetable]),
        trainTimetable: () =>
          records("train_timetable", [...MITA_CALENDAR_VARIANTS]),
      },
      {
        originStation: mitaStation("ShirokaneTakanawa"),
        destinationStation: mitaStation("NishiTakashimadaira"),
        departureWindow: { start: "04:30", end: "07:30" },
      },
    );

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.candidates[0].journey.legs[0].duration.minutes).toEqual([
      MITA_VARIANT_MINUTES,
      MITA_VARIANT_MINUTES,
    ]);
    expect(resolution.candidates[0].evidence.splitContinuation).toBe(false);
    expect(resolution.coverage).toBe("complete");
    expect(resolution.diagnostics.logicalLookups).toBe(2);
  });

  it("treats a declared but unretrieved continuation as inconclusive", async () => {
    const splitTimetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:Toei.Mita.Meguro",
      station: mitaStationId("Meguro"),
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: [stationTimetableObject(MITA_TRAIN, "10:00")],
    });
    const { resolution } = await resolve(
      {
        stationTimetable: () => records("station_timetable", [splitTimetable]),
        // Only part 1 comes back, yet it declares a continuation.
        trainTimetable: () => records("train_timetable", [MITA_PART_1]),
      },
      {
        originStation: mitaStation("Meguro"),
        destinationStation: mitaStation("Sugamo"),
        departureWindow: { start: "09:30", end: "11:30" },
      },
    );
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("split_continuation_not_retrieved");
  });
});

describe("resolveOdptDirectJourney — absence vs inconclusive matrix", () => {
  const resolvedStationTimetable = () =>
    records("station_timetable", [SHINJUKU_STATION_TIMETABLE]);

  it.each([
    [
      "successful empty records",
      {
        stationTimetable: () =>
          records("station_timetable", [] as OdptStationTimetable[]),
      },
      "no_direct_service_evidence",
    ],
    [
      "documented 404",
      {
        stationTimetable: () =>
          failure<OdptStationTimetable>(
            "station_timetable",
            "no_applicable_data",
            "no_data",
          ),
      },
      "no_direct_service_evidence",
    ],
  ])(
    "classifies StationTimetable %s as %s",
    async (_label, handlers, expected) => {
      const { resolution } = await resolve({
        ...handlers,
        trainTimetable: () =>
          records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
      });
      expect(resolution.status).toBe(expected);
    },
  );

  it.each([
    ["provider_unavailable", "station_timetable_provider_error"],
    ["rate_limited", "station_timetable_provider_error"],
    ["malformed_provider_record", "station_timetable_provider_error"],
    ["provider_response_too_large", "station_timetable_response_too_large"],
    ["budget_exhausted", "station_timetable_budget_exhausted"],
    ["budget_unavailable", "station_timetable_budget_unavailable"],
  ])("maps a StationTimetable error %s to %s", async (errorCode, expected) => {
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        failure<OdptStationTimetable>("station_timetable", errorCode),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe(expected);
    // One lookup was spent, and no candidate lookup was attempted.
    expect(calls).toHaveLength(1);
  });

  it("treats a window with no exact train identity as no direct evidence", async () => {
    const identityLess = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(null, "06:00")],
    });
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [identityLess]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(resolution.status).toBe("no_direct_service_evidence");
    expect(resolution.diagnostics.candidatesWithoutTrainIdentity).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it.each([
    [
      "successful empty records",
      records("train_timetable", [] as OdptTrainTimetable[]),
    ],
    [
      "documented 404",
      failure<OdptTrainTimetable>(
        "train_timetable",
        "no_applicable_data",
        "no_data",
      ),
    ],
  ])(
    "treats a TrainTimetable %s as no direct evidence",
    async (_label, result) => {
      const { resolution } = await resolve({
        stationTimetable: resolvedStationTimetable,
        trainTimetable: () => result,
      });
      expect(resolution.status).toBe("no_direct_service_evidence");
    },
  );

  it.each([
    ["provider_unavailable", "train_timetable_provider_error"],
    ["network_error", "train_timetable_provider_error"],
    ["provider_response_too_large", "train_timetable_response_too_large"],
    ["budget_exhausted", "train_timetable_budget_exhausted"],
    ["budget_unavailable", "train_timetable_budget_unavailable"],
  ])("maps a TrainTimetable error %s to %s", async (errorCode, expected) => {
    const { resolution } = await resolve({
      stationTimetable: resolvedStationTimetable,
      trainTimetable: () =>
        failure<OdptTrainTimetable>("train_timetable", errorCode),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe(expected);
  });

  it("keeps an invalid chronology inconclusive rather than absent", async () => {
    const backwards = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.BACK",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "BACK",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "02:00", null),
      ],
    });
    const { resolution } = await resolve({
      stationTimetable: resolvedStationTimetable,
      trainTimetable: () => records("train_timetable", [backwards]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("inspection_inconclusive");
  });

  it("never produces unavailable transport from lack of ODPT evidence", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [] as OdptStationTimetable[]),
      trainTimetable: () =>
        records("train_timetable", [] as OdptTrainTimetable[]),
    });
    const serialized = JSON.stringify(resolution);
    expect(serialized).not.toContain("unavailable_transport");
    expect(resolution.candidates).toHaveLength(0);
  });
});

describe("resolveOdptDirectJourney — input validation", () => {
  it.each([
    ["impossible date", "2017-02-29"],
    ["non-date", "2026-9-11"],
    ["datetime", "2026-09-11T00:00:00Z"],
  ])(
    "rejects serviceDate %s without any lookup",
    async (_label, serviceDate) => {
      const { resolution, calls } = await resolve(
        {
          stationTimetable: () =>
            records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
          trainTimetable: () =>
            records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
        },
        { serviceDate },
      );
      expect(resolution.status).toBe("inconclusive");
      if (resolution.status !== "inconclusive") return;
      expect(resolution.reason).toBe("invalid_service_date");
      expect(calls).toHaveLength(0);
    },
  );

  it("requires exact ODPT station identities", async () => {
    const { resolution, calls } = await resolve(
      {
        stationTimetable: () =>
          records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
        trainTimetable: () =>
          records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
      },
      {
        originStation: {
          ...marunouchiStation("Shinjuku"),
          sameAs: "",
        } as OdptStation,
      },
    );
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("unusable_station_identity");
    expect(calls).toHaveLength(0);
  });

  it("rejects a station-to-itself request early", async () => {
    const { resolution, calls } = await resolve(
      {
        stationTimetable: () =>
          records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
        trainTimetable: () =>
          records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
      },
      { destinationStation: marunouchiStation("Shinjuku") },
    );
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("origin_equals_destination");
    expect(calls).toHaveLength(0);
  });
});

describe("resolveOdptDirectJourney — never selects a winner", () => {
  it("returns every proven candidate in deterministic departure order", async () => {
    const timetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        stationTimetableObject(
          "odpt.Train:TokyoMetro.Marunouchi.SLOW",
          "06:30",
        ),
        stationTimetableObject(
          "odpt.Train:TokyoMetro.Marunouchi.FAST",
          "06:10",
        ),
        stationTimetableObject("odpt.Train:TokyoMetro.Marunouchi.MID", "06:20"),
      ],
    });
    // Distinct durations so a "fastest" policy would visibly pick a different one.
    const plan: Record<string, { departure: string; duration: number }> = {
      "odpt.Train:TokyoMetro.Marunouchi.FAST": {
        departure: "06:10",
        duration: 5,
      },
      "odpt.Train:TokyoMetro.Marunouchi.MID": {
        departure: "06:20",
        duration: 30,
      },
      "odpt.Train:TokyoMetro.Marunouchi.SLOW": {
        departure: "06:30",
        duration: 50,
      },
    };
    const { resolution } = await resolve({
      stationTimetable: () => records("station_timetable", [timetable]),
      trainTimetable: (input) => {
        const train = String(input.train);
        const entry = plan[train] ?? { departure: "06:00", duration: 10 };
        return records("train_timetable", [
          marunouchiRecordFor(train, entry.departure, entry.duration),
        ]);
      },
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates).toHaveLength(3);
    // Ordered by scheduled departure, NOT by duration or "best".
    expect(
      resolution.candidates.map(
        (candidate) => candidate.evidence.trainIdentity,
      ),
    ).toEqual([
      "odpt.Train:TokyoMetro.Marunouchi.FAST",
      "odpt.Train:TokyoMetro.Marunouchi.MID",
      "odpt.Train:TokyoMetro.Marunouchi.SLOW",
    ]);
    expect(
      resolution.candidates.map(
        (candidate) => candidate.journey.legs[0].duration.minutes?.[0],
      ),
    ).toEqual([5, 30, 50]);
  });
});

describe("resolveOdptDirectJourney — robustness", () => {
  it("never throws when the provider throws", async () => {
    const { provider } = recordingProvider({
      stationTimetable: () => {
        throw new Error("boom");
      },
      trainTimetable: () => records("train_timetable", []),
    });
    const resolution = await resolveOdptDirectJourney({
      provider,
      originStation: marunouchiStation("Shinjuku"),
      destinationStation: marunouchiStation("Ikebukuro"),
      serviceDate: SERVICE_DATE,
      departureWindow: WINDOW,
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("station_timetable_provider_error");
  });

  it("never throws when a candidate lookup throws", async () => {
    const { provider } = recordingProvider({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: () => {
        throw new Error("boom");
      },
    });
    const resolution = await resolveOdptDirectJourney({
      provider,
      originStation: marunouchiStation("Shinjuku"),
      destinationStation: marunouchiStation("Ikebukuro"),
      serviceDate: SERVICE_DATE,
      departureWindow: WINDOW,
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("train_timetable_provider_error");
  });

  it("keeps diagnostics free of credentials and raw payloads", async () => {
    const { resolution } = await resolve(
      {
        stationTimetable: () =>
          records("station_timetable", [MEGURO_STATION_TIMETABLE]),
        trainTimetable: () =>
          records("train_timetable", [MITA_PART_1, MITA_PART_2]),
      },
      {
        originStation: mitaStation("Meguro"),
        destinationStation: mitaStation("Sugamo"),
        departureWindow: { start: "09:30", end: "11:30" },
      },
    );
    const serialized = JSON.stringify(resolution.diagnostics);
    for (const forbidden of [
      "consumerKey",
      "acl:consumerKey",
      "ODPT_API_KEY",
      "apiKey",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("reports the same counters shape for every status", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [] as OdptStationTimetable[]),
      trainTimetable: () =>
        records("train_timetable", [] as OdptTrainTimetable[]),
    });
    expect(Object.keys(resolution.diagnostics).sort()).toEqual([
      "candidateLimitReached",
      "candidatesConclusive",
      "candidatesDiscovered",
      "candidatesInconclusive",
      "candidatesInspected",
      "candidatesWithoutTrainIdentity",
      "exactTrainLookups",
      "logicalLookups",
      "reasons",
      "stationTimetableLookups",
    ]);
  });
});

describe("resolveOdptDirectJourney — response scope validation", () => {
  const discover = (recordsIn: readonly OdptStationTimetable[]) => ({
    stationTimetable: () => records("station_timetable", recordsIn),
    trainTimetable: (input: OdptTrainTimetableQuery) =>
      records("train_timetable", [
        marunouchiRecordFor(String(input.train), "06:00"),
      ]),
  });

  it("fails closed when StationTimetable returns ANOTHER station", async () => {
    const wrongStation = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Ikebukuro",
      station: marunouchiStationId("Ikebukuro"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const { resolution, calls } = await resolve(discover([wrongStation]));
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("station_timetable_scope_mismatch");
    // Discovery only: a scope violation must not seed candidate lookups.
    expect(calls).toHaveLength(1);
    expect(resolution.diagnostics.logicalLookups).toBe(1);
  });

  it("fails closed when a StationTimetable record omits its station", async () => {
    const noStation = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Anonymous",
      station: null as unknown as string,
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const { resolution } = await resolve(discover([noStation]));
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("station_timetable_scope_mismatch");
  });

  it("fails closed when StationTimetable names the OTHER pilot operator", async () => {
    // Both are pilot operators, so an "inside the pilot" check alone would pass —
    // the record must still be consistent with the requested station's operator.
    const foreignOperator = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const { resolution } = await resolve(discover([foreignOperator]));
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("station_timetable_scope_mismatch");
  });

  it("fails closed when the exact lookup returns a DIFFERENT train", async () => {
    // Toei is inside the pilot, so only the exact-identity scope check can catch
    // this: a record for another train must not prove the requested candidate.
    const otherTrain = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:Toei.Mita.535T",
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:41", null),
      ],
    });
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [
          stationTimetableFixture({
            sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
            station: marunouchiStationId("Shinjuku"),
            operator: TOKYO_METRO_OPERATOR,
            railway: "odpt.Railway:TokyoMetro.Marunouchi",
            objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
          }),
        ]),
      trainTimetable: () => records("train_timetable", [otherTrain]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("train_timetable_scope_mismatch");
  });

  it("fails closed when the exact lookup returns a contradicting calendar", async () => {
    const holidayOnly = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427Holiday",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "B427",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:41", null),
      ],
    });
    const { resolution } = await resolve({
      // Discovery declares Weekday, so the query is narrowed to that calendar…
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      // …but only a SaturdayHoliday record comes back.
      trainTimetable: () => records("train_timetable", [holidayOnly]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("calendar_scope_mismatch");
  });
});

describe("resolveOdptDirectJourney — discovery vs exact departure reconciliation", () => {
  const singleTrainTimetable = () =>
    stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });

  it("resolves when the proven departure agrees with discovery", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [singleTrainTimetable()]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(String(input.train), "06:00"),
        ]),
    });
    expect(resolution.status).toBe("resolved");
  });

  it("compares parsed clock meaning, so HH:MM:SS equals HH:MM", async () => {
    const secondsRecord = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "B427",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00:30"),
        trainTimetableObject(
          marunouchiStationId("Ikebukuro"),
          "06:41:00",
          null,
        ),
      ],
    });
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [singleTrainTimetable()]),
      trainTimetable: () => records("train_timetable", [secondsRecord]),
    });
    // Textual formatting differs; the service-clock meaning does not.
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates[0].scheduledDepartureMinutes).toBe(6 * 60);
  });

  it("fails closed when the PROVEN departure is outside the requested window", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [singleTrainTimetable()]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(String(input.train), "09:30"),
        ]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("departure_evidence_mismatch");
  });

  it("fails closed when discovery and the exact timetable disagree", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [singleTrainTimetable()]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(String(input.train), "06:10"),
        ]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("departure_evidence_mismatch");
  });

  it("reports and orders by the VERIFIED departure", async () => {
    const timetable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        stationTimetableObject(
          "odpt.Train:TokyoMetro.Marunouchi.LATE",
          "06:40",
        ),
        stationTimetableObject(
          "odpt.Train:TokyoMetro.Marunouchi.EARLY",
          "06:05",
        ),
      ],
    });
    const departures: Record<string, string> = {
      "odpt.Train:TokyoMetro.Marunouchi.LATE": "06:40",
      "odpt.Train:TokyoMetro.Marunouchi.EARLY": "06:05",
    };
    const { resolution } = await resolve({
      stationTimetable: () => records("station_timetable", [timetable]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(
            String(input.train),
            departures[String(input.train)] ?? "06:00",
          ),
        ]),
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(
      resolution.candidates.map(
        (candidate) => candidate.scheduledDepartureMinutes,
      ),
    ).toEqual([6 * 60 + 5, 6 * 60 + 40]);
  });
});

describe("resolveOdptDirectJourney — duplicate identity across calendars", () => {
  it("issues ONE bounded lookup WITHOUT a calendar filter when variants disagree", async () => {
    // The measured Toei shape: one departure, several distinct calendars.
    // Retaining the first would arbitrarily pick a variant.
    const weekday = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Weekday",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:Weekday",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const holiday = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Holiday",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const variantRecords = [
      trainTimetableFixture({
        sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.Weekday",
        train: MARUNOUCHI_TRAIN,
        trainNumber: "B427",
        operator: TOKYO_METRO_OPERATOR,
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
        calendar: "odpt.Calendar:Weekday",
        objects: [
          trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
          trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:41", null),
        ],
      }),
      trainTimetableFixture({
        sameAs:
          "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.SaturdayHoliday",
        train: MARUNOUCHI_TRAIN,
        trainNumber: "B427",
        operator: TOKYO_METRO_OPERATOR,
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
        calendar: "odpt.Calendar:SaturdayHoliday",
        objects: [
          trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
          trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:41", null),
        ],
      }),
    ];
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [weekday, holiday]),
      trainTimetable: () => records("train_timetable", variantRecords),
    });

    // One identity → one lookup, despite appearing under two calendars.
    expect(trainCalls(calls)).toHaveLength(1);
    // No calendar filter: choosing one variant would be arbitrary.
    expect(trainCalls(calls)[0].input).toEqual({ train: MARUNOUCHI_TRAIN });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.diagnostics.candidatesDiscovered).toBe(1);
    // Both agreeing variants are represented rather than collapsed.
    expect(resolution.candidates[0].evidence.calendars).toEqual([
      "odpt.Calendar:SaturdayHoliday",
      "odpt.Calendar:Weekday",
    ]);
    expect(resolution.candidates[0].evidence.calendar).toBeNull();
  });

  it("fails closed when one identity has conflicting discovery departures", async () => {
    const early = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Early",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    });
    const late = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Late",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:30")],
    });
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [early, late]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(String(input.train), "06:00"),
        ]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("ambiguous_discovery_departure");
    // No lookup can settle a conflict inside the discovery response itself.
    expect(trainCalls(calls)).toHaveLength(0);
  });
});

describe("resolveOdptDirectJourney — coverage completeness", () => {
  it("is PARTIAL when another candidate was inconclusive", async () => {
    let call = 0;
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(2)]),
      trainTimetable: (input) => {
        call += 1;
        if (call === 1) {
          return records("train_timetable", [
            marunouchiRecordFor(String(input.train), "06:00"),
          ]);
        }
        return failure<OdptTrainTimetable>(
          "train_timetable",
          "provider_unavailable",
        );
      },
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.coverage).toBe("partial");
    expect(resolution.diagnostics.candidatesInconclusive).toBe(1);
  });

  it("is COMPLETE only when every discovered candidate was settled", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(2)]),
      trainTimetable: (input) =>
        records("train_timetable", [marunouchiNoPairFor(String(input.train))]),
    });
    // Nothing proven, but every candidate was CONCLUSIVELY settled.
    expect(resolution.status).toBe("no_direct_service_evidence");
    expect(resolution.diagnostics.candidatesInconclusive).toBe(0);
    expect(resolution.diagnostics.candidatesConclusive).toBe(2);
  });

  it("is INCONCLUSIVE rather than an absence when a candidate is unreadable", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(1)]),
      trainTimetable: () =>
        failure<OdptTrainTimetable>(
          "train_timetable",
          "provider_response_too_large",
        ),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("train_timetable_response_too_large");
  });
});

describe("resolveOdptDirectJourney — strict departure-window grammar", () => {
  it.each([
    ["00:00", 0],
    ["06:30", 390],
    ["23:59", 1439],
  ])("accepts %s", (value, expected) => {
    expect(parseDepartureWindowBound(value)).toBe(expected);
  });

  it.each([
    ["single-digit hour", "6:30"],
    ["seconds", "06:30:00"],
    ["hour 24", "24:00"],
    ["minute 60", "06:60"],
    ["leading whitespace", " 06:30"],
    ["trailing whitespace", "06:30 "],
    ["no separator", "0630"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(
      parseDepartureWindowBound(value as string | null | undefined),
    ).toBeNull();
  });

  it("is stricter than the shared chronology parser, by design", () => {
    // The provider grammar is broader; the caller-facing window is documented as
    // exactly HH:MM, so the two must not be conflated.
    expect(parseClockMinutes("6:30")).toBe(390);
    expect(parseDepartureWindowBound("6:30")).toBeNull();
    expect(parseClockMinutes("06:30:00")).toBe(390);
    expect(parseDepartureWindowBound("06:30:00")).toBeNull();
  });

  it.each([["06:30:00"], [" 06:00"]])(
    "rejects %s at the resolver boundary without any lookup",
    async (bound) => {
      const { resolution, calls } = await resolve(
        {
          stationTimetable: () =>
            records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
          trainTimetable: () => records("train_timetable", []),
        },
        { departureWindow: { start: bound, end: "08:00" } },
      );
      expect(resolution.status).toBe("inconclusive");
      if (resolution.status !== "inconclusive") return;
      expect(resolution.reason).toBe("invalid_departure_window");
      expect(calls).toHaveLength(0);
    },
  );
});

describe("resolveOdptDirectJourney — malformed discovery evidence", () => {
  it("fails closed when an exact train has a PRESENT but unreadable departure", async () => {
    const unreadable = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "6:5x")],
    });
    const { resolution } = await resolve({
      stationTimetable: () => records("station_timetable", [unreadable]),
      trainTimetable: (input) =>
        records("train_timetable", [
          marunouchiRecordFor(String(input.train), "06:00"),
        ]),
    });
    // We cannot tell whether this train falls inside the window, so this must
    // not be reported as an absence.
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("station_timetable_departure_unreadable");
  });

  it("does not fabricate a candidate from an identity-less object with a bad time", async () => {
    const noIdentity = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(null, "6:5x")],
    });
    const { resolution } = await resolve({
      stationTimetable: () => records("station_timetable", [noIdentity]),
      trainTimetable: () => records("train_timetable", []),
    });
    expect(resolution.diagnostics.candidatesDiscovered).toBe(0);
    expect(resolution.diagnostics.candidatesWithoutTrainIdentity).toBe(1);
    expect(resolution.status).toBe("no_direct_service_evidence");
  });

  it("safely ignores a readable departure outside the window", async () => {
    const outOfWindow = stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "09:30")],
    });
    const { resolution } = await resolve({
      stationTimetable: () => records("station_timetable", [outOfWindow]),
      trainTimetable: () => records("train_timetable", []),
    });
    // We CAN place it in time, so it simply is not a candidate.
    expect(resolution.diagnostics.candidatesDiscovered).toBe(0);
    expect(resolution.status).toBe("no_direct_service_evidence");
  });
});

describe("resolveOdptDirectJourney — sibling agreement at the resolver level", () => {
  // ONE exact train, two calendar variants, only one of which serves the
  // destination. This is the semantic case that must never resolve unfiltered.
  const weekdayPair = trainTimetableFixture({
    sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.Weekday",
    train: MARUNOUCHI_TRAIN,
    trainNumber: "B427",
    operator: TOKYO_METRO_OPERATOR,
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    calendar: "odpt.Calendar:Weekday",
    objects: [
      trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
      trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:35", null),
    ],
  });
  const holidayNoDestination = trainTimetableFixture({
    sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.SaturdayHoliday",
    train: MARUNOUCHI_TRAIN,
    trainNumber: "B427",
    operator: TOKYO_METRO_OPERATOR,
    railway: "odpt.Railway:TokyoMetro.Marunouchi",
    calendar: "odpt.Calendar:SaturdayHoliday",
    objects: [
      trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
      trainTimetableObject(marunouchiStationId("Tokyo"), "06:12", null),
    ],
  });

  /** Discovery where the SAME departure appears under two distinct calendars. */
  const twoCalendarDiscovery = () => [
    stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Weekday",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:Weekday",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    }),
    stationTimetableFixture({
      sameAs: "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Holiday",
      station: marunouchiStationId("Shinjuku"),
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
    }),
  ];

  it("A. never resolves when an unfiltered variant lacks the destination", async () => {
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", twoCalendarDiscovery()),
      trainTimetable: () =>
        records("train_timetable", [weekdayPair, holidayNoDestination]),
    });

    expect(resolution.status).not.toBe("resolved");
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("sibling_evidence_conflict");
    // Several calendars => one lookup WITHOUT a calendar filter, never two.
    expect(trainCalls(calls)).toHaveLength(1);
    expect(trainCalls(calls)[0].input).toEqual({ train: MARUNOUCHI_TRAIN });
  });

  it("B. resolves from the narrowed variant once scope excludes the other", async () => {
    // Discovery declares exactly ONE calendar, so the query IS narrowed and the
    // contradicting variant is excluded before evaluation.
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [
          stationTimetableFixture({
            sameAs:
              "odpt.StationTimetable:TokyoMetro.Marunouchi.Shinjuku.Weekday",
            station: marunouchiStationId("Shinjuku"),
            operator: TOKYO_METRO_OPERATOR,
            railway: "odpt.Railway:TokyoMetro.Marunouchi",
            calendar: "odpt.Calendar:Weekday",
            objects: [stationTimetableObject(MARUNOUCHI_TRAIN, "06:00")],
          }),
        ]),
      trainTimetable: () =>
        records("train_timetable", [weekdayPair, holidayNoDestination]),
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.candidates[0].journey.legs[0].duration.minutes).toEqual([
      35, 35,
    ]);
    expect(resolution.candidates[0].evidence.calendars).toEqual([
      "odpt.Calendar:Weekday",
    ]);
    // The contradicting variant is set aside explicitly, not silently dropped.
    expect(resolution.candidates[0].evidence.excludedRecordIds).toEqual([
      "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.SaturdayHoliday",
    ]);
    expect(trainCalls(calls)[0].input).toEqual({
      train: MARUNOUCHI_TRAIN,
      calendar: "odpt.Calendar:Weekday",
    });
  });

  it("C. resolves and reports BOTH calendars when unfiltered variants agree", async () => {
    const holidayTwin = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.SaturdayHoliday",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "B427",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: weekdayPair.objects,
    });
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", twoCalendarDiscovery()),
      trainTimetable: () =>
        records("train_timetable", [holidayTwin, weekdayPair]),
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.candidates[0].evidence.calendars).toEqual([
      "odpt.Calendar:SaturdayHoliday",
      "odpt.Calendar:Weekday",
    ]);
    expect(resolution.candidates[0].evidence.calendar).toBeNull();
    expect(resolution.coverage).toBe("complete");
  });

  it("D. fails closed when unfiltered variants disagree on times", async () => {
    const holidayShifted = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427.SaturdayHoliday",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "B427",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      calendar: "odpt.Calendar:SaturdayHoliday",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:50", null),
      ],
    });
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", twoCalendarDiscovery()),
      trainTimetable: () =>
        records("train_timetable", [weekdayPair, holidayShifted]),
    });
    expect(resolution.status).toBe("inconclusive");
    if (resolution.status !== "inconclusive") return;
    expect(resolution.reason).toBe("inspection_inconclusive");
    expect(resolution.diagnostics.candidatesInconclusive).toBe(1);
  });
});
