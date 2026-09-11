/**
 * KAI-290 PR 2C — offline direct-journey benchmark harness.
 *
 * EVIDENCE FOR THE NEXT INTEGRATION DECISION, NOT AN INTEGRATION.
 *
 * This harness is deliberately offline and deterministic: it drives the
 * resolver against synthetic providers built from the committed fixtures, so it
 * performs no network I/O, reads no clock, needs no credential, and can run in
 * CI. It reports what the primitive does per scenario — nothing about it changes
 * production precedence, and its output must not be used to change production
 * precedence in this PR.
 */

import type {
  OdptProvider,
  OdptResult,
  OdptStation,
  OdptStationTimetable,
  OdptTrainTimetable,
  OdptTrainTimetableQuery,
} from "../OdptProvider";
import {
  resolveOdptDirectJourney,
  type OdptDirectJourneyResolution,
} from "../OdptDirectJourneyService";
import {
  MARUNOUCHI_EXPECTED_MINUTES,
  MARUNOUCHI_TRAIN_TIMETABLE,
  MITA_CALENDAR_VARIANTS,
  MITA_EXPECTED_MINUTES,
  MITA_PART_1,
  MITA_PART_2,
  MITA_TRAIN,
  MITA_VARIANT_MINUTES,
  SHINJUKU_STATION_TIMETABLE,
  TOEI_OPERATOR,
  TOKYO_METRO_OPERATOR,
  JR_EAST_OPERATOR,
  marunouchiStation,
  marunouchiStationId,
  mitaStation,
  mitaStationId,
  stationTimetableFixture,
  stationTimetableObject,
  trainTimetableFixture,
  trainTimetableObject,
} from "../__tests__/fixtures/odptDirectJourneyFixtures";

const SERVICE_DATE = "2026-09-11";

/** One benchmark observation. Safe to print: no credential, no raw payload. */
export interface OdptDirectJourneyBenchRow {
  readonly scenario: string;
  readonly operator: string;
  readonly origin: string;
  readonly destination: string;
  readonly status: OdptDirectJourneyResolution["status"];
  readonly reason: string | null;
  readonly coverage: string | null;
  readonly candidatesDiscovered: number;
  readonly candidatesInspected: number;
  readonly candidatesVerified: number;
  readonly logicalCalls: number;
  readonly stationTimetableLookups: number;
  readonly exactTrainLookups: number;
  readonly candidateLimitReached: boolean;
  /** On-train scheduled minutes produced, in the order the candidates are returned. */
  readonly durationsMinutes: readonly number[];
  readonly splitChainUsed: boolean;
  readonly failureReasons: readonly string[];
}

interface BenchScenario {
  readonly name: string;
  readonly origin: OdptStation;
  readonly destination: OdptStation;
  readonly window: { readonly start: string; readonly end: string };
  readonly stationTimetable: () => OdptResult<OdptStationTimetable>;
  readonly trainTimetable: (
    input: OdptTrainTimetableQuery,
  ) => OdptResult<OdptTrainTimetable>;
}

function records<T>(operation: string, items: readonly T[]): OdptResult<T> {
  return {
    provider: "odpt",
    operation,
    outcome: "records",
    records: items,
    recordCount: items.length,
    retrievedAt: "2026-09-11T00:00:00.000Z",
    sourceResource: operation,
    sourceUrl: "",
    normalization: "odpt-api-v4.16",
  };
}

/**
 * A Marunouchi record for ONE requested train containing a single origin stop
 * only: it conclusively never carries the pair. Built per requested identity,
 * because a response for a different train is a scope violation rather than
 * conclusive evidence about the train that was asked for.
 */
function noPairFor(trainIdentity: string): OdptTrainTimetable {
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

/** A Marunouchi record for ONE requested train that DOES carry the pair. */
function pairFor(
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

function manyTrains(count: number): OdptStationTimetable {
  const objects = [];
  for (let index = 0; index < count; index += 1) {
    objects.push(
      stationTimetableObject(
        `odpt.Train:TokyoMetro.Marunouchi.T${String(index).padStart(3, "0")}`,
        `06:${String(index * 5).padStart(2, "0")}`,
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

const MEGURO_SPLIT_TIMETABLE = stationTimetableFixture({
  sameAs: "odpt.StationTimetable:Toei.Mita.Meguro",
  station: mitaStationId("Meguro"),
  operator: TOEI_OPERATOR,
  railway: "odpt.Railway:Toei.Mita",
  calendar: "odpt.Calendar:SaturdayHoliday",
  objects: [stationTimetableObject(MITA_TRAIN, "10:00")],
});

const MEASURED_VARIANT_TIMETABLE = stationTimetableFixture({
  sameAs: "odpt.StationTimetable:Toei.Mita.ShirokaneTakanawa",
  station: mitaStationId("ShirokaneTakanawa"),
  operator: TOEI_OPERATOR,
  railway: "odpt.Railway:Toei.Mita",
  calendar: "odpt.Calendar:Weekday",
  objects: [stationTimetableObject(MITA_TRAIN, "05:00")],
});

/** Discovery at the exact origin of the single-part scenario (10:03 departure). */
const SHIROKANE_SPLIT_TIMETABLE = stationTimetableFixture({
  sameAs: "odpt.StationTimetable:Toei.Mita.ShirokaneTakanawa",
  station: mitaStationId("ShirokaneTakanawa"),
  operator: TOEI_OPERATOR,
  railway: "odpt.Railway:Toei.Mita",
  calendar: "odpt.Calendar:SaturdayHoliday",
  objects: [stationTimetableObject(MITA_TRAIN, "10:03")],
});

const MORNING_WINDOW = { start: "06:00", end: "08:00" };
const MIDDAY_WINDOW = { start: "09:30", end: "11:30" };
/** Covers the measured 535T span (05:00 -> 05:46). */
const EARLY_WINDOW = { start: "04:30", end: "07:30" };

const SCENARIOS: readonly BenchScenario[] = [
  {
    name: "tokyometro_direct_single_record",
    origin: marunouchiStation("Shinjuku"),
    destination: marunouchiStation("Ikebukuro"),
    window: MORNING_WINDOW,
    stationTimetable: () =>
      records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
    trainTimetable: (input) => {
      const train = String(input.train);
      const departure =
        train === "odpt.Train:TokyoMetro.Marunouchi.B429" ? "06:04" : "06:00";
      return records("train_timetable", [pairFor(train, departure)]);
    },
  },
  {
    name: "toei_split_continuation",
    origin: mitaStation("Meguro"),
    destination: mitaStation("Sugamo"),
    window: MIDDAY_WINDOW,
    stationTimetable: () =>
      records("station_timetable", [MEGURO_SPLIT_TIMETABLE]),
    trainTimetable: () =>
      records("train_timetable", [MITA_PART_1, MITA_PART_2]),
  },
  {
    name: "toei_measured_calendar_variants",
    origin: mitaStation("ShirokaneTakanawa"),
    destination: mitaStation("NishiTakashimadaira"),
    window: EARLY_WINDOW,
    stationTimetable: () =>
      records("station_timetable", [MEASURED_VARIANT_TIMETABLE]),
    trainTimetable: () =>
      records("train_timetable", [...MITA_CALENDAR_VARIANTS]),
  },
  {
    name: "toei_single_part_no_split",
    origin: mitaStation("ShirokaneTakanawa"),
    destination: mitaStation("Mita"),
    window: MIDDAY_WINDOW,
    // Discovery must be at the REQUESTED origin so its departure is comparable
    // with the departure the exact timetable proves.
    stationTimetable: () =>
      records("station_timetable", [SHIROKANE_SPLIT_TIMETABLE]),
    trainTimetable: () => records("train_timetable", [MITA_PART_1]),
  },
  {
    name: "no_direct_pair_in_evidence",
    origin: marunouchiStation("Shinjuku"),
    destination: marunouchiStation("Ikebukuro"),
    window: MORNING_WINDOW,
    stationTimetable: () =>
      records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
    trainTimetable: (input) =>
      records("train_timetable", [noPairFor(String(input.train))]),
  },
  {
    name: "operator_outside_pilot",
    origin: { ...marunouchiStation("Shinjuku"), operator: JR_EAST_OPERATOR },
    destination: {
      ...marunouchiStation("Ikebukuro"),
      operator: JR_EAST_OPERATOR,
    },
    window: MORNING_WINDOW,
    stationTimetable: () =>
      records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
    trainTimetable: () =>
      records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
  },
  {
    name: "budget_capped_12_candidates",
    origin: marunouchiStation("Shinjuku"),
    destination: marunouchiStation("Ikebukuro"),
    window: MORNING_WINDOW,
    stationTimetable: () => records("station_timetable", [manyTrains(12)]),
    trainTimetable: (input) =>
      records("train_timetable", [noPairFor(String(input.train))]),
  },
  {
    name: "empty_window_no_candidates",
    origin: marunouchiStation("Shinjuku"),
    destination: marunouchiStation("Ikebukuro"),
    window: { start: "03:00", end: "05:00" },
    stationTimetable: () =>
      records("station_timetable", [SHINJUKU_STATION_TIMETABLE]),
    trainTimetable: () =>
      records("train_timetable", [MARUNOUCHI_TRAIN_TIMETABLE]),
  },
];

function benchProvider(scenario: BenchScenario): OdptProvider {
  const unexpected = (method: string) => async () => {
    throw new Error(`bench scenario made an unexpected call: ${method}`);
  };
  return {
    nearbyStations: unexpected("nearbyStations") as never,
    station: unexpected("station") as never,
    railway: unexpected("railway") as never,
    railwayFare: unexpected("railwayFare") as never,
    datapoint: unexpected("datapoint") as never,
    calendar: unexpected("calendar") as never,
    operator: unexpected("operator") as never,
    trainType: unexpected("trainType") as never,
    railDirection: unexpected("railDirection") as never,
    stationTimetable: async () => scenario.stationTimetable(),
    trainTimetable: async (input: OdptTrainTimetableQuery) =>
      scenario.trainTimetable(input),
  };
}

/**
 * Runs every scenario and returns one row each. Deterministic and side-effect
 * free: safe to call from a test, a script or CI.
 */
export async function runOdptDirectJourneyBench(): Promise<
  readonly OdptDirectJourneyBenchRow[]
> {
  const rows: OdptDirectJourneyBenchRow[] = [];
  for (const scenario of SCENARIOS) {
    const resolution = await resolveOdptDirectJourney({
      provider: benchProvider(scenario),
      originStation: scenario.origin,
      destinationStation: scenario.destination,
      serviceDate: SERVICE_DATE,
      departureWindow: scenario.window,
    });

    rows.push({
      scenario: scenario.name,
      operator: scenario.origin.operator ?? "unknown",
      origin: scenario.origin.title ?? scenario.origin.sameAs,
      destination: scenario.destination.title ?? scenario.destination.sameAs,
      status: resolution.status,
      reason: resolution.status === "inconclusive" ? resolution.reason : null,
      coverage: resolution.status === "resolved" ? resolution.coverage : null,
      candidatesDiscovered: resolution.diagnostics.candidatesDiscovered,
      candidatesInspected: resolution.diagnostics.candidatesInspected,
      candidatesVerified:
        resolution.status === "resolved" ? resolution.candidates.length : 0,
      logicalCalls: resolution.diagnostics.logicalLookups,
      stationTimetableLookups: resolution.diagnostics.stationTimetableLookups,
      exactTrainLookups: resolution.diagnostics.exactTrainLookups,
      candidateLimitReached: resolution.diagnostics.candidateLimitReached,
      durationsMinutes:
        resolution.status === "resolved"
          ? resolution.candidates.map(
              (candidate) =>
                candidate.journey.legs[0].duration.minutes?.[0] ?? -1,
            )
          : [],
      splitChainUsed:
        resolution.status === "resolved" &&
        resolution.candidates.some(
          (candidate) => candidate.evidence.splitContinuation,
        ),
      failureReasons: resolution.diagnostics.reasons,
    });
  }
  return rows;
}

/** Renders the rows as a fixed-width text table for a human or a CI log. */
export function formatOdptDirectJourneyBenchReport(
  rows: readonly OdptDirectJourneyBenchRow[],
): string {
  const header = [
    "scenario",
    "operator",
    "origin",
    "destination",
    "status",
    "reason",
    "coverage",
    "disc",
    "insp",
    "verif",
    "calls",
    "limit",
    "durations",
    "split",
  ];
  const body = rows.map((row) => [
    row.scenario,
    row.operator.replace("odpt.Operator:", ""),
    row.origin,
    row.destination,
    row.status,
    row.reason ?? "-",
    row.coverage ?? "-",
    String(row.candidatesDiscovered),
    String(row.candidatesInspected),
    String(row.candidatesVerified),
    String(row.logicalCalls),
    row.candidateLimitReached ? "yes" : "no",
    row.durationsMinutes.length > 0 ? row.durationsMinutes.join(",") : "-",
    row.splitChainUsed ? "yes" : "no",
  ]);
  const all = [header, ...body];
  const widths = header.map((_, column) =>
    Math.max(...all.map((line) => line[column].length)),
  );
  return all
    .map((line) =>
      line
        .map((cell, column) => cell.padEnd(widths[column]))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** Expected outcomes, so the harness is also a regression guard. */
export const ODPT_DIRECT_JOURNEY_BENCH_EXPECTATIONS: Readonly<
  Record<
    string,
    {
      readonly status: OdptDirectJourneyResolution["status"];
      readonly reason?: string;
      readonly durationsMinutes?: readonly number[];
      readonly splitChainUsed?: boolean;
    }
  >
> = Object.freeze({
  tokyometro_direct_single_record: {
    status: "resolved",
    durationsMinutes: [
      MARUNOUCHI_EXPECTED_MINUTES,
      MARUNOUCHI_EXPECTED_MINUTES,
    ],
    splitChainUsed: false,
  },
  toei_split_continuation: {
    status: "resolved",
    durationsMinutes: [MITA_EXPECTED_MINUTES],
    splitChainUsed: true,
  },
  toei_single_part_no_split: {
    status: "resolved",
    durationsMinutes: [8],
    splitChainUsed: false,
  },
  toei_measured_calendar_variants: {
    status: "resolved",
    durationsMinutes: [MITA_VARIANT_MINUTES],
    splitChainUsed: false,
  },
  no_direct_pair_in_evidence: { status: "no_direct_service_evidence" },
  operator_outside_pilot: {
    status: "inconclusive",
    reason: "operator_outside_timetable_pilot",
  },
  budget_capped_12_candidates: {
    status: "inconclusive",
    reason: "journey_budget_exhausted",
  },
  empty_window_no_candidates: { status: "no_direct_service_evidence" },
});
