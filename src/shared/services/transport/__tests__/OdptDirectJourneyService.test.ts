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
  resolveOdptDirectJourney,
  type OdptDirectJourneyResolution,
} from "../OdptDirectJourneyService";
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
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });

    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    // The origin's own timetable lists B427 (06:00) and B429 (06:04) in window.
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
    const { resolution, calls } = await resolve({
      stationTimetable: () => records("station_timetable", [timetable]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
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
    // A record that never contains the requested pair, so no candidate verifies
    // and the budget cap is what decides the outcome.
    const noPair = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.NOPAIR",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "NOPAIR",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
      ],
    });
    const { resolution, calls } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(12)]),
      trainTimetable: () => records("train_timetable", [noPair]),
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
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(12)]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.coverage).toBe("partial");
    expect(resolution.diagnostics.candidateLimitReached).toBe(true);
    expect(resolution.candidates.length).toBeGreaterThan(0);
  });

  it("uses complete coverage when every discovered candidate was inspected", async () => {
    const { resolution } = await resolve({
      stationTimetable: () =>
        records("station_timetable", [shinjukuTimetableWithTrains(3)]),
      trainTimetable: () =>
        records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.coverage).toBe("complete");
    expect(resolution.diagnostics.candidateLimitReached).toBe(false);
    expect(resolution.diagnostics.logicalLookups).toBe(4);
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
    const durations: Record<string, number> = {
      "odpt.Train:TokyoMetro.Marunouchi.FAST": 5,
      "odpt.Train:TokyoMetro.Marunouchi.MID": 30,
      "odpt.Train:TokyoMetro.Marunouchi.SLOW": 50,
    };
    const { resolution } = await resolve({
      stationTimetable: () => records("station_timetable", [timetable]),
      trainTimetable: (input) => {
        const minutes = durations[String(input.train)] ?? 10;
        return records("train_timetable", [
          trainTimetableFixture({
            sameAs: `odpt.TrainTimetable:${String(input.train)}`,
            train: String(input.train),
            trainNumber: "X",
            operator: TOKYO_METRO_OPERATOR,
            railway: "odpt.Railway:TokyoMetro.Marunouchi",
            objects: [
              trainTimetableObject(
                marunouchiStationId("Shinjuku"),
                null,
                "06:00",
              ),
              trainTimetableObject(
                marunouchiStationId("Ikebukuro"),
                `06:${String(minutes).padStart(2, "0")}`,
                null,
              ),
            ],
          }),
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
      "candidatesDiscovered",
      "candidatesInspected",
      "candidatesWithoutTrainIdentity",
      "exactTrainLookups",
      "logicalLookups",
      "reasons",
      "stationTimetableLookups",
    ]);
  });
});
