import { describe, expect, it } from "vitest";
import {
  ODPT_DIRECT_JOURNEY_MAX_CHAIN_RECORDS,
  ODPT_TIMETABLE_PILOT_OPERATORS,
  buildDirectJourneyFromOdptTrainTimetable,
  credentialFreeSourceUrl,
  enumerateStopEvents,
  isRealCalendarDate,
  isTimetablePilotOperator,
  odptStationEndpoint,
  type OdptDirectJourneyBuildResult,
} from "../odptDirectJourney";
import { trainTimetableStopSequence } from "../odptChronology";
import {
  JR_EAST_OPERATOR,
  MARUNOUCHI_EXPECTED_MINUTES,
  MARUNOUCHI_TRAIN,
  MARUNOUCHI_TRAIN_TIMETABLE,
  MITA_CALENDAR_VARIANTS,
  MITA_CALENDAR_VARIANT_IDS,
  MITA_EXPECTED_MINUTES,
  MITA_PART_1,
  MITA_PART_1_ID,
  MITA_PART_2,
  MITA_PART_2_ID,
  MITA_TRAIN,
  MITA_RAILWAY,
  MITA_STATIONS,
  MITA_VARIANT_MINUTES,
  ROLLOVER_TRAIN_TIMETABLE,
  TOEI_OPERATOR,
  TOKYO_METRO_OPERATOR,
  marunouchiStation,
  marunouchiStationId,
  mitaStation,
  mitaStationId,
  stationFixture,
  trainTimetableFixture,
  trainTimetableObject,
} from "./fixtures/odptDirectJourneyFixtures";

/** Narrows to the `no_match` branch, failing loudly on an unexpected kind. */
function noMatchReason(result: OdptDirectJourneyBuildResult): string {
  if (result.kind !== "no_match") {
    throw new Error(`expected no_match, received ${result.kind}`);
  }
  return result.reason;
}

/** Narrows to the `inconclusive` branch, failing loudly on an unexpected kind. */
function inconclusiveReason(result: OdptDirectJourneyBuildResult): string {
  if (result.kind !== "inconclusive") {
    throw new Error(`expected inconclusive, received ${result.kind}`);
  }
  return result.reason;
}

/** Narrows to the `verified` branch, failing loudly on an unexpected kind. */
function verified(result: OdptDirectJourneyBuildResult) {
  if (result.kind !== "verified") {
    throw new Error(
      `expected verified, received ${result.kind}${
        "reason" in result ? `:${result.reason}` : ""
      }`,
    );
  }
  return result;
}

function build(overrides: {
  readonly records: Parameters<
    typeof buildDirectJourneyFromOdptTrainTimetable
  >[0]["records"];
  readonly originStation?: Parameters<
    typeof buildDirectJourneyFromOdptTrainTimetable
  >[0]["originStation"];
  readonly destinationStation?: Parameters<
    typeof buildDirectJourneyFromOdptTrainTimetable
  >[0]["destinationStation"];
  readonly serviceDate?: string | null;
}): OdptDirectJourneyBuildResult {
  return buildDirectJourneyFromOdptTrainTimetable({
    records: overrides.records,
    originStation: overrides.originStation ?? marunouchiStation("Shinjuku"),
    destinationStation:
      overrides.destinationStation ?? marunouchiStation("Ikebukuro"),
    ...(overrides.serviceDate !== undefined
      ? { serviceDate: overrides.serviceDate }
      : {}),
  });
}

describe("pilot operator set", () => {
  it("contains exactly the two measured pilot operators", () => {
    expect([...ODPT_TIMETABLE_PILOT_OPERATORS].sort()).toEqual([
      "odpt.Operator:Toei",
      "odpt.Operator:TokyoMetro",
    ]);
  });

  it("does NOT include JR-East, and never infers data absence from that", () => {
    expect(ODPT_TIMETABLE_PILOT_OPERATORS).not.toContain(JR_EAST_OPERATOR);
    expect(isTimetablePilotOperator(JR_EAST_OPERATOR)).toBe(false);
  });

  it.each([
    ["TokyoMetro", TOKYO_METRO_OPERATOR, true],
    ["Toei", TOEI_OPERATOR, true],
    ["JR-East", JR_EAST_OPERATOR, false],
    ["unknown operator", "odpt.Operator:Odakyu", false],
    ["null", null, false],
    ["undefined", undefined, false],
    ["empty", "", false],
  ])("classifies %s", (_label, value, expected) => {
    expect(isTimetablePilotOperator(value)).toBe(expected);
  });
});

describe("isRealCalendarDate", () => {
  it.each([
    ["ordinary date", "2026-09-11", true],
    ["leap day in a leap year", "2016-02-29", true],
    ["leap day in a century leap year", "2000-02-29", true],
    ["last day of a month", "2017-11-30", true],
  ])("accepts %s", (_label, value, expected) => {
    expect(isRealCalendarDate(value)).toBe(expected);
  });

  it.each([
    ["impossible non-leap Feb 29", "2017-02-29"],
    ["impossible Feb 30", "2017-02-30"],
    ["impossible century Feb 29", "1900-02-29"],
    ["April 31", "2017-04-31"],
    ["month 13", "2017-13-01"],
    ["month 0", "2017-00-10"],
    ["day 0", "2017-11-00"],
    ["non-padded", "2017-1-1"],
    ["full datetime", "2017-11-13T00:00:00Z"],
    ["date range", "2017-11-13/2017-11-18"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(isRealCalendarDate(value as string | null | undefined)).toBe(false);
  });

  it("does not let Date.parse normalise an impossible date into a real one", () => {
    // The trap this guard exists for: JS accepts this and rolls it to March 1.
    expect(Number.isNaN(Date.parse("2017-02-29"))).toBe(false);
    expect(isRealCalendarDate("2017-02-29")).toBe(false);
  });
});

describe("credentialFreeSourceUrl", () => {
  it("strips a consumer key query parameter", () => {
    expect(
      credentialFreeSourceUrl(
        "https://api.example.invalid/odpt/TrainTimetable?acl:consumerKey=SECRET",
      ),
    ).toBe("https://api.example.invalid/odpt/TrainTimetable");
  });

  it("strips a consumer key among other parameters", () => {
    expect(
      credentialFreeSourceUrl(
        "https://api.example.invalid/x?a=1&acl:consumerKey=SECRET&b=2",
      ),
    ).toBe("https://api.example.invalid/x?a=1&b=2");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
  ])("returns empty for %s", (_label, value) => {
    expect(credentialFreeSourceUrl(value)).toBe("");
  });
});

describe("odptStationEndpoint", () => {
  it("derives a deterministic anchor key from the exact identity", () => {
    const endpoint = odptStationEndpoint(marunouchiStation("Shinjuku"));
    expect(endpoint.kind).toBe("station");
    expect(endpoint.id).toBe(marunouchiStationId("Shinjuku"));
    expect(endpoint.anchorKey).toBe(marunouchiStationId("Shinjuku"));
    expect(endpoint.name).toBe("新宿");
  });

  it("attaches coordinates only when the provider supplied them", () => {
    const withCoordinates = odptStationEndpoint(marunouchiStation("Shinjuku"));
    expect(withCoordinates.coordinates).toEqual({
      lat: 35.6909,
      lng: 139.7003,
    });

    const withoutCoordinates = odptStationEndpoint(
      stationFixture({
        sameAs: marunouchiStationId("NoCoords"),
        title: "座標なし",
        operator: TOKYO_METRO_OPERATOR,
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
        coordinates: null,
      }),
    );
    expect(withoutCoordinates.coordinates).toBeUndefined();
    // Identity-anchored, so the missing coordinates do not change the anchor.
    expect(withoutCoordinates.anchorKey).toBe(marunouchiStationId("NoCoords"));
  });

  it("keeps the anchor key stable regardless of coordinates", () => {
    const a = odptStationEndpoint(marunouchiStation("Tokyo"));
    const b = odptStationEndpoint(
      stationFixture({
        sameAs: marunouchiStationId("Tokyo"),
        title: "東京",
        operator: TOKYO_METRO_OPERATOR,
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
        coordinates: null,
      }),
    );
    expect(a.anchorKey).toBe(b.anchorKey);
  });
});

describe("stop-event enumeration", () => {
  it("matches the shared chronology enumeration exactly", () => {
    const objects = MARUNOUCHI_TRAIN_TIMETABLE.objects;
    expect(enumerateStopEvents(objects).sequence).toEqual(
      trainTimetableStopSequence(objects),
    );
  });

  it("matches it for the split parts and the rollover fixture too", () => {
    for (const objects of [
      MITA_PART_1.objects,
      MITA_PART_2.objects,
      ROLLOVER_TRAIN_TIMETABLE.objects,
    ]) {
      expect(enumerateStopEvents(objects).sequence).toEqual(
        trainTimetableStopSequence(objects),
      );
    }
  });

  it("indexes events consistently with the chronology input sequence", () => {
    const { events, sequence } = enumerateStopEvents(
      MARUNOUCHI_TRAIN_TIMETABLE.objects,
    );
    expect(events).toHaveLength(sequence.length);
    events.forEach((event, index) => {
      expect(event.sequenceIndex).toBe(index);
      expect(sequence[index].time).toBe(event.time);
    });
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — direct same-record", () => {
  const result = verified(build({ records: [MARUNOUCHI_TRAIN_TIMETABLE] }));

  it("emits the exact on-train scheduled duration as [N, N]", () => {
    expect(result.durationMinutes).toBe(MARUNOUCHI_EXPECTED_MINUTES);
    expect(result.journey.legs).toHaveLength(1);
    expect(result.journey.legs[0].duration.minutes).toEqual([
      MARUNOUCHI_EXPECTED_MINUTES,
      MARUNOUCHI_EXPECTED_MINUTES,
    ]);
  });

  it("uses the origin DEPARTURE and the destination ARRIVAL", () => {
    expect(result.evidence.scheduledDepartureTime).toBe("06:00");
    expect(result.evidence.scheduledArrivalTime).toBe("06:41");
    // Shinjuku's own arrival is absent and Ikebukuro's departure is absent, so
    // these could only come from the correct fields.
    const shinjuku = MARUNOUCHI_TRAIN_TIMETABLE.objects[0];
    const ikebukuro = MARUNOUCHI_TRAIN_TIMETABLE.objects.at(-1);
    expect(shinjuku?.arrivalTime).toBeNull();
    expect(ikebukuro?.departureTime).toBeNull();
  });

  it("builds both endpoints from exact ODPT identities", () => {
    expect(result.journey.origin.id).toBe(marunouchiStationId("Shinjuku"));
    expect(result.journey.destination.id).toBe(
      marunouchiStationId("Ikebukuro"),
    );
    expect(result.journey.origin.anchorKey).toBe(
      marunouchiStationId("Shinjuku"),
    );
  });

  it("marks the leg as a verified, high-confidence train leg", () => {
    const leg = result.journey.legs[0];
    expect(leg.mode).toBe("train");
    expect(leg.duration.evidence).toBe("verified");
    expect(leg.confidence).toBe("high");
    expect(leg.availability).toBe("available");
    expect(leg.provenance.duration).toBe("verified");
  });

  it("declares the journey complete for the station-to-station contract", () => {
    expect(result.journey.kind).toBe("journey");
    expect(result.journey.scope).toBe("complete_journey");
    expect(result.journey.directionality).toBe("one_way");
    expect(result.journey.completeness).toBe("complete");
    expect(result.journey.availability).toBe("available");
  });

  it("preserves intermediate stops as evidence only, never as legs", () => {
    expect(result.journey.legs).toHaveLength(1);
    // 18 ordered stops in the record, exactly one produced leg.
    expect(MARUNOUCHI_TRAIN_TIMETABLE.objects).toHaveLength(18);
    expect(result.evidence.timetableRecordIds).toEqual([
      MARUNOUCHI_TRAIN_TIMETABLE.sameAs,
    ]);
  });

  it("keeps cost deliberately unknown", () => {
    const cost = result.journey.legs[0].cost;
    expect(cost.state).toBe("unknown");
    expect(cost.representation).toBeNull();
    expect(cost.evidence).toBe("unknown");
    expect(cost.scope).toBe("unknown");
    expect(cost.completeness).toBe("unknown");
    expect(cost.currency).toBe("JPY");
  });

  it("never treats needExtraFee=false as a fare of zero", () => {
    const noExtraFee = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "B427",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: MARUNOUCHI_TRAIN_TIMETABLE.objects,
    });
    const built = verified(build({ records: [noExtraFee] }));
    expect(built.journey.legs[0].cost.representation).toBeNull();
    expect(built.journey.legs[0].cost.state).toBe("unknown");
  });

  it("retains the train identity, operator, railway, calendar and direction", () => {
    expect(result.evidence.trainIdentity).toBe(MARUNOUCHI_TRAIN);
    expect(result.evidence.trainNumber).toBe("B427");
    expect(result.evidence.operator).toBe(TOKYO_METRO_OPERATOR);
    expect(result.evidence.railway).toBe("odpt.Railway:TokyoMetro.Marunouchi");
    expect(result.evidence.calendar).toBe("odpt.Calendar:Weekday");
    expect(result.evidence.railDirection).toBe(
      "odpt.RailDirection:TokyoMetro.Ikebukuro",
    );
    expect(result.evidence.splitContinuation).toBe(false);
  });

  it("echoes a valid serviceDate into evidence", () => {
    const dated = verified(
      build({
        records: [MARUNOUCHI_TRAIN_TIMETABLE],
        serviceDate: "2026-09-11",
      }),
    );
    expect(dated.evidence.serviceDate).toBe("2026-09-11");
  });

  it("fails closed on an impossible serviceDate", () => {
    const bad = build({
      records: [MARUNOUCHI_TRAIN_TIMETABLE],
      serviceDate: "2017-02-29",
    });
    expect(inconclusiveReason(bad)).toBe("invalid_service_date");
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — identity, not names", () => {
  it("does not match a different identity that shares the same name", () => {
    const decoyTokyo = stationFixture({
      sameAs: "odpt.Station:Toei.Mita.Tokyo",
      title: "東京",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
    });
    const result = build({
      records: [MARUNOUCHI_TRAIN_TIMETABLE],
      originStation: decoyTokyo,
      destinationStation: marunouchiStation("Ikebukuro"),
    });
    expect(noMatchReason(result)).toBe("origin_stop_absent");
  });

  it("never infers equivalence from a similar-looking id", () => {
    const nearMiss = stationFixture({
      sameAs: "odpt.Station:TokyoMetro.Marunouchi.ShinjukuS",
      title: "新宿",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
    });
    const result = build({
      records: [MARUNOUCHI_TRAIN_TIMETABLE],
      originStation: nearMiss,
      destinationStation: marunouchiStation("Ikebukuro"),
    });
    expect(noMatchReason(result)).toBe("origin_stop_absent");
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — ordering", () => {
  it("rejects a destination that precedes the origin", () => {
    const reversed = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.REV",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "REV",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:05", null),
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:10"),
      ],
    });
    const result = build({
      records: [reversed],
      originStation: marunouchiStation("Shinjuku"),
      destinationStation: marunouchiStation("Ikebukuro"),
    });
    expect(noMatchReason(result)).toBe("destination_before_origin");
  });

  it("rejects an absent origin stop", () => {
    const result = build({
      records: [MARUNOUCHI_TRAIN_TIMETABLE],
      originStation: marunouchiStation("Meguro"),
    });
    expect(noMatchReason(result)).toBe("origin_stop_absent");
  });

  it("rejects an absent destination stop", () => {
    const result = build({
      records: [MARUNOUCHI_TRAIN_TIMETABLE],
      destinationStation: marunouchiStation("Meguro"),
    });
    expect(noMatchReason(result)).toBe("destination_stop_absent");
  });

  it("fails closed on a duplicate origin (multiple plausible pairs)", () => {
    const looping = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.LOOP",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "LOOP",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Tokyo"), "06:10", null),
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:30"),
        trainTimetableObject(marunouchiStationId("Tokyo"), "06:40", null),
      ],
    });
    const result = build({
      records: [looping],
      originStation: marunouchiStation("Shinjuku"),
      destinationStation: marunouchiStation("Tokyo"),
    });
    expect(inconclusiveReason(result)).toBe("ambiguous_stop_pair");
  });

  it("fails closed on a duplicate destination", () => {
    const looping = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.LOOP2",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "LOOP2",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Tokyo"), "06:10", "06:11"),
        trainTimetableObject(marunouchiStationId("Tokyo"), "06:40", null),
      ],
    });
    const result = build({
      records: [looping],
      originStation: marunouchiStation("Shinjuku"),
      destinationStation: marunouchiStation("Tokyo"),
    });
    expect(inconclusiveReason(result)).toBe("ambiguous_stop_pair");
  });

  it("still resolves when only ONE ordered pair is structurally possible", () => {
    // The origin is visited twice, but the destination is only reachable from
    // the first visit, so the pair is uniquely determined.
    const unambiguous = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.ONE",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "ONE",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Tokyo"), "06:10", null),
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:30"),
      ],
    });
    const result = verified(
      build({
        records: [unambiguous],
        originStation: marunouchiStation("Shinjuku"),
        destinationStation: marunouchiStation("Tokyo"),
      }),
    );
    expect(result.durationMinutes).toBe(10);
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — times", () => {
  it("gives no verified journey when the origin has no departure time", () => {
    const noDeparture = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.NODEP",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "NODEP",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), "06:00", null),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:41", null),
      ],
    });
    expect(noMatchReason(build({ records: [noDeparture] }))).toBe(
      "origin_departure_absent",
    );
  });

  it("gives no verified journey when the destination has no arrival time", () => {
    const noArrival = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.NOARR",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "NOARR",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), null, "06:41"),
      ],
    });
    expect(noMatchReason(build({ records: [noArrival] }))).toBe(
      "destination_arrival_absent",
    );
  });

  it("refuses to substitute a destination departure for a missing arrival", () => {
    const onlyDepartureAtDestination = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.SUBST",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "SUBST",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), null, "06:41"),
      ],
    });
    expect(
      noMatchReason(build({ records: [onlyDepartureAtDestination] })),
    ).toBe("destination_arrival_absent");
  });

  it.each([
    ["hour out of range", "24:00"],
    ["minute out of range", "06:75"],
    ["non-time", "morning"],
    ["ISO datetime", "2026-09-11T06:00:00+09:00"],
  ])("reports a malformed origin time (%s) as inconclusive", (_label, time) => {
    const malformed = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.BAD",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "BAD",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, time),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:41", null),
      ],
    });
    expect(inconclusiveReason(build({ records: [malformed] }))).toBe(
      "malformed_service_time",
    );
  });

  it("accepts the provider-proven 23:58 -> 00:03 rollover", () => {
    const result = verified(
      build({
        records: [ROLLOVER_TRAIN_TIMETABLE],
        originStation: marunouchiStation("Tokyo"),
        destinationStation: marunouchiStation("Otemachi"),
      }),
    );
    // 23:58 -> 00:03 is five minutes, not a negative or 24h figure.
    expect(result.durationMinutes).toBe(5);
    expect(result.journey.legs[0].duration.minutes).toEqual([5, 5]);
  });

  it.each([
    ["22:30 -> 02:00", "22:30", "02:00"],
    ["21:55 -> 00:10", "21:55", "00:10"],
    ["23:58 -> 01:03", "23:58", "01:03"],
  ])(
    "keeps the unproven backward chronology %s rejected",
    (_label, from, to) => {
      const record = trainTimetableFixture({
        sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.BACK",
        train: MARUNOUCHI_TRAIN,
        trainNumber: "BACK",
        operator: TOKYO_METRO_OPERATOR,
        railway: "odpt.Railway:TokyoMetro.Marunouchi",
        objects: [
          trainTimetableObject(marunouchiStationId("Tokyo"), null, from),
          trainTimetableObject(marunouchiStationId("Otemachi"), to, null),
        ],
      });
      expect(inconclusiveReason(build({ records: [record] }))).toBe(
        "invalid_chronology",
      );
    },
  );

  it("never emits a zero or negative duration", () => {
    const simultaneous = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.ZERO",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "ZERO",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [
        trainTimetableObject(marunouchiStationId("Shinjuku"), null, "06:00"),
        trainTimetableObject(marunouchiStationId("Ikebukuro"), "06:00", null),
      ],
    });
    expect(noMatchReason(build({ records: [simultaneous] }))).toBe(
      "non_positive_duration",
    );
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — degenerate inputs", () => {
  it("rejects an empty record set", () => {
    expect(noMatchReason(build({ records: [] }))).toBe(
      "timetable_records_empty",
    );
  });

  it("rejects records with no own stop objects", () => {
    const empty = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.EMPTY",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "EMPTY",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: [],
    });
    expect(noMatchReason(build({ records: [empty] }))).toBe(
      "timetable_objects_empty",
    );
  });

  it("rejects a station-to-itself request", () => {
    const result = build({
      records: [MARUNOUCHI_TRAIN_TIMETABLE],
      originStation: marunouchiStation("Shinjuku"),
      destinationStation: marunouchiStation("Shinjuku"),
    });
    expect(noMatchReason(result)).toBe("origin_equals_destination");
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — split records", () => {
  const meguro = mitaStation("Meguro");
  const sugamo = mitaStation("Sugamo");

  it("joins two records on the provider's explicit next/previous link", () => {
    const result = verified(
      build({
        records: [MITA_PART_1, MITA_PART_2],
        originStation: meguro,
        destinationStation: sugamo,
      }),
    );
    expect(result.durationMinutes).toBe(MITA_EXPECTED_MINUTES);
    expect(result.evidence.splitContinuation).toBe(true);
    expect(result.evidence.timetableRecordIds).toEqual([
      MITA_PART_1_ID,
      MITA_PART_2_ID,
    ]);
  });

  it("joins when supplied in the reverse order, using the same links", () => {
    const result = verified(
      build({
        records: [MITA_PART_2, MITA_PART_1],
        originStation: meguro,
        destinationStation: sugamo,
      }),
    );
    expect(result.durationMinutes).toBe(MITA_EXPECTED_MINUTES);
    // The chain is re-ordered into service order, so record ids stay forward.
    expect(result.evidence.timetableRecordIds).toEqual([
      MITA_PART_1_ID,
      MITA_PART_2_ID,
    ]);
    expect(result.evidence.splitContinuation).toBe(true);
  });

  it("joins on a forward link alone", () => {
    const second = trainTimetableFixture({
      sameAs: MITA_PART_2_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      calendar: "odpt.Calendar:SaturdayHoliday",
      previousTrainTimetable: [],
      objects: MITA_PART_2.objects,
    });
    const result = verified(
      build({
        records: [MITA_PART_1, second],
        originStation: meguro,
        destinationStation: sugamo,
      }),
    );
    expect(result.durationMinutes).toBe(MITA_EXPECTED_MINUTES);
  });

  it("joins on a backward link alone", () => {
    const first = trainTimetableFixture({
      sameAs: MITA_PART_1_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      calendar: "odpt.Calendar:SaturdayHoliday",
      nextTrainTimetable: [],
      objects: MITA_PART_1.objects,
    });
    const result = verified(
      build({
        records: [first, MITA_PART_2],
        originStation: meguro,
        destinationStation: sugamo,
      }),
    );
    expect(result.durationMinutes).toBe(MITA_EXPECTED_MINUTES);
  });

  it("NEVER joins without an explicit link, even with a matching train number", () => {
    const unlinkedFirst = trainTimetableFixture({
      sameAs: MITA_PART_1_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      nextTrainTimetable: [],
      objects: MITA_PART_1.objects,
    });
    const unlinkedSecond = trainTimetableFixture({
      sameAs: MITA_PART_2_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      previousTrainTimetable: [],
      objects: MITA_PART_2.objects,
    });
    const result = build({
      records: [unlinkedFirst, unlinkedSecond],
      originStation: meguro,
      destinationStation: sugamo,
    });
    expect(inconclusiveReason(result)).toBe("split_chain_not_linked");
  });

  it("NEVER joins on matching railway, operator, terminal or times alone", () => {
    const lookalike = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:Toei.Mita.999Z",
      train: "odpt.Train:Toei.Mita.999Z",
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      previousTrainTimetable: [],
      objects: MITA_PART_2.objects,
    });
    const noLinks = trainTimetableFixture({
      sameAs: MITA_PART_1_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      nextTrainTimetable: [],
      objects: MITA_PART_1.objects,
    });
    const result = build({
      records: [noLinks, lookalike],
      originStation: meguro,
      destinationStation: sugamo,
    });
    expect(inconclusiveReason(result)).toBe("split_chain_not_linked");
  });

  it.each([
    ["origin in part 1 only", ["Meguro", "ShirokaneTakanawa", "ShibaKoen"]],
    ["destination in part 2 only", ["Hibiya", "Sugamo"]],
  ])(
    "does not claim a journey from one part alone (%s)",
    (_label, suffixes) => {
      // Requesting a pair that needs BOTH parts must not resolve from part 1.
      const result = build({
        records: [MITA_PART_1],
        originStation: meguro,
        destinationStation: sugamo,
      });
      expect(result.kind).toBe("no_match");
      expect(suffixes.length).toBeGreaterThan(0);
    },
  );

  it("fails closed on an ambiguous two-way chain", () => {
    // Both orders must pass BOTH the explicit-link test and the chronology
    // compatibility test for the continuation to be ambiguous. That requires a
    // degenerate duplicate-record pair whose stop times never advance, which is
    // exactly the shape this branch exists to refuse.
    const degenerate = () => [
      trainTimetableObject(mitaStationId("Meguro"), null, "10:00"),
      trainTimetableObject(mitaStationId("Hibiya"), "10:00", "10:00"),
      trainTimetableObject(mitaStationId("Sugamo"), "10:00", null),
    ];
    const cyclicFirst = trainTimetableFixture({
      sameAs: MITA_PART_1_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      nextTrainTimetable: [MITA_PART_2_ID],
      previousTrainTimetable: [MITA_PART_2_ID],
      objects: degenerate(),
    });
    const cyclicSecond = trainTimetableFixture({
      sameAs: MITA_PART_2_ID,
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      nextTrainTimetable: [MITA_PART_1_ID],
      previousTrainTimetable: [MITA_PART_1_ID],
      objects: degenerate(),
    });
    const result = build({
      records: [cyclicFirst, cyclicSecond],
      originStation: meguro,
      destinationStation: sugamo,
    });
    expect(inconclusiveReason(result)).toBe("ambiguous_split_chain");
  });

  it("fails closed on an explicitly linked pair with invalid cross-record chronology", () => {
    const earlyFirst = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:Toei.Mita.700T.1",
      train: "odpt.Train:Toei.Mita.700T",
      trainNumber: "700T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      nextTrainTimetable: ["odpt.TrainTimetable:Toei.Mita.700T.2"],
      objects: [
        trainTimetableObject(mitaStationId("Meguro"), null, "12:00"),
        trainTimetableObject(mitaStationId("ShirokaneTakanawa"), "12:04", null),
      ],
    });
    const earlySecond = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:Toei.Mita.700T.2",
      train: "odpt.Train:Toei.Mita.700T",
      trainNumber: "700T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      previousTrainTimetable: ["odpt.TrainTimetable:Toei.Mita.700T.1"],
      objects: [
        trainTimetableObject(mitaStationId("Hibiya"), "11:00", "11:05"),
        trainTimetableObject(mitaStationId("Sugamo"), "11:30", null),
      ],
    });
    const result = build({
      records: [earlyFirst, earlySecond],
      originStation: meguro,
      destinationStation: sugamo,
    });
    expect(inconclusiveReason(result)).toBe("split_chain_incompatible");
  });

  it("refuses to join more records than the pilot chain allows", () => {
    const third = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:Toei.Mita.535T.3",
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      previousTrainTimetable: [MITA_PART_2_ID],
      objects: [
        trainTimetableObject(mitaStationId("Sugamo"), "10:40", "10:41"),
      ],
    });
    expect(ODPT_DIRECT_JOURNEY_MAX_CHAIN_RECORDS).toBe(2);
    const result = build({
      records: [MITA_PART_1, MITA_PART_2, third],
      originStation: meguro,
      destinationStation: sugamo,
    });
    expect(inconclusiveReason(result)).toBe("split_chain_too_long");
  });

  it("carries the split train identity through to evidence", () => {
    const result = verified(
      build({
        records: [MITA_PART_1, MITA_PART_2],
        originStation: meguro,
        destinationStation: sugamo,
      }),
    );
    expect(result.evidence.trainIdentity).toBe(MITA_TRAIN);
    expect(result.evidence.operator).toBe(TOEI_OPERATOR);
    expect(result.evidence.railway).toBe(MITA_RAILWAY);
    expect(result.evidence.calendar).toBe("odpt.Calendar:SaturdayHoliday");
  });

  it("resolves a single part's internal pair without claiming a split", () => {
    const result = verified(
      build({
        records: [MITA_PART_1],
        originStation: mitaStation("ShirokaneTakanawa"),
        destinationStation: mitaStation("Mita"),
      }),
    );
    expect(result.evidence.splitContinuation).toBe(false);
    expect(result.durationMinutes).toBe(8);
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — MEASURED calendar variants", () => {
  // The measured Toei 535T shape: TWO records for ONE exact train identity that
  // differ only by calendar and declare NO split link. This is the regression
  // guard for evaluating records independently BEFORE any chain join.
  const meguroVariant = mitaStation("ShirokaneTakanawa");
  const sugamoVariant = mitaStation("NishiTakashimadaira");

  const result = verified(
    build({
      records: [...MITA_CALENDAR_VARIANTS],
      originStation: meguroVariant,
      destinationStation: sugamoVariant,
    }),
  );

  it("resolves from a SINGLE record rather than demanding a chain", () => {
    expect(result.durationMinutes).toBe(MITA_VARIANT_MINUTES);
    expect(result.journey.legs[0].duration.minutes).toEqual([
      MITA_VARIANT_MINUTES,
      MITA_VARIANT_MINUTES,
    ]);
  });

  it("does NOT report a split continuation when no link exists", () => {
    expect(result.evidence.splitContinuation).toBe(false);
  });

  it("never falls into the chain-join failure reasons for this shape", () => {
    const outcome = build({
      records: [...MITA_CALENDAR_VARIANTS],
      originStation: meguroVariant,
      destinationStation: sugamoVariant,
    });
    expect(outcome.kind).toBe("verified");
    if (outcome.kind !== "inconclusive") return;
    expect(outcome.reason).not.toBe("split_chain_not_linked");
    expect(outcome.reason).not.toBe("split_chain_too_long");
  });

  it("resolves whichever variant is supplied alone", () => {
    for (const variant of MITA_CALENDAR_VARIANTS) {
      const single = verified(
        build({
          records: [variant],
          originStation: meguroVariant,
          destinationStation: sugamoVariant,
        }),
      );
      expect(single.durationMinutes).toBe(MITA_VARIANT_MINUTES);
      expect(single.evidence.splitContinuation).toBe(false);
    }
  });

  it("is order-independent across the two variants", () => {
    const forward = build({
      records: [...MITA_CALENDAR_VARIANTS],
      originStation: meguroVariant,
      destinationStation: sugamoVariant,
    });
    const reversedRecords = build({
      records: [...MITA_CALENDAR_VARIANTS].reverse(),
      originStation: meguroVariant,
      destinationStation: sugamoVariant,
    });
    expect(forward.kind).toBe("verified");
    expect(reversedRecords.kind).toBe("verified");
    if (forward.kind !== "verified" || reversedRecords.kind !== "verified")
      return;
    expect(reversedRecords.durationMinutes).toBe(forward.durationMinutes);
    expect(reversedRecords.evidence.scheduledDepartureTime).toBe(
      forward.evidence.scheduledDepartureTime,
    );
  });

  it("retains both retrieved record ids as evidence", () => {
    expect(result.evidence.timetableRecordIds).toEqual([
      ...MITA_CALENDAR_VARIANT_IDS,
    ]);
  });

  it("carries the measured spans and endpoint pair", () => {
    expect(MITA_CALENDAR_VARIANTS).toHaveLength(2);
    for (const variant of MITA_CALENDAR_VARIANTS) {
      expect(variant.objects).toHaveLength(25);
      expect(variant.objects[0].arrivalStation).toBe(
        mitaStationId("ShirokaneTakanawa"),
      );
      expect(variant.objects[0].departureTime).toBe("05:00");
      expect(variant.objects.at(-1)?.arrivalStation).toBe(
        mitaStationId("NishiTakashimadaira"),
      );
      expect(variant.objects.at(-1)?.arrivalTime).toBe("05:46");
      expect(variant.nextTrainTimetable).toEqual([]);
      expect(variant.previousTrainTimetable).toEqual([]);
    }
  });

  it("fails closed when sibling records prove the pair with DIFFERENT times", () => {
    // Two records for ONE train that disagree cannot be reconciled without
    // knowing which calendar applies, and the builder is given no calendar — so
    // it must refuse rather than pick one.
    const shiftClock = (value: string | null, byMinutes: number) => {
      if (value === null) return null;
      const [hours, minutes] = value.split(":").map(Number);
      const total = hours * 60 + minutes + byMinutes;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
        total % 60,
      ).padStart(2, "0")}`;
    };
    const shifted = trainTimetableFixture({
      sameAs: MITA_CALENDAR_VARIANT_IDS[1],
      train: MITA_TRAIN,
      trainNumber: "535T",
      operator: TOEI_OPERATOR,
      railway: MITA_RAILWAY,
      calendar: "odpt.Calendar:Weekday",
      objects: MITA_CALENDAR_VARIANTS[1].objects.map((object) =>
        trainTimetableObject(
          object.arrivalStation,
          shiftClock(object.arrivalTime, 10),
          shiftClock(object.departureTime, 10),
        ),
      ),
    });

    const outcome = build({
      records: [MITA_CALENDAR_VARIANTS[0], shifted],
      originStation: meguroVariant,
      destinationStation: sugamoVariant,
    });
    expect(inconclusiveReason(outcome)).toBe("ambiguous_split_chain");
  });
});

describe("buildDirectJourneyFromOdptTrainTimetable — evidence hygiene", () => {
  it("exposes credential-free source URLs only", () => {
    const withKey = trainTimetableFixture({
      sameAs: "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427",
      train: MARUNOUCHI_TRAIN,
      trainNumber: "B427",
      operator: TOKYO_METRO_OPERATOR,
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
      objects: MARUNOUCHI_TRAIN_TIMETABLE.objects,
    });
    const scrubbed = {
      ...withKey,
      provenance: {
        ...withKey.provenance,
        sourceUrl:
          "https://api.example.invalid/odpt/TrainTimetable?acl:consumerKey=SECRET",
      },
    };
    const result = verified(build({ records: [scrubbed] }));
    for (const url of result.evidence.sourceUrls) {
      expect(url).not.toContain("acl:consumerKey");
      expect(url).not.toContain("SECRET");
    }
    expect(result.journey.legs[0].duration.sourceUrl ?? "").not.toContain(
      "acl:consumerKey",
    );
  });

  it("retains the timetable record id and the retrieval timestamp", () => {
    const result = verified(build({ records: [MARUNOUCHI_TRAIN_TIMETABLE] }));
    expect(result.evidence.timetableRecordIds).toContain(
      "odpt.TrainTimetable:TokyoMetro.Marunouchi.B427",
    );
    expect(result.evidence.retrievedAt).toBe("2026-09-11T00:00:00.000Z");
  });

  it("keeps ODPT-specific fields out of the canonical Journey", () => {
    const result = verified(build({ records: [MARUNOUCHI_TRAIN_TIMETABLE] }));
    const serialized = JSON.stringify(result.journey);
    for (const forbidden of [
      "odptTrainTimetableSameAs",
      "odptRailDirectionId",
      "rawOdptObject",
      "consumerKey",
      "acl:consumerKey",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("is pure: the same input yields byte-identical output", () => {
    const first = build({ records: [MARUNOUCHI_TRAIN_TIMETABLE] });
    const second = build({ records: [MARUNOUCHI_TRAIN_TIMETABLE] });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("pilot-scope fixtures", () => {
  it("keeps every Mita fixture station inside the Mita railway", () => {
    for (const spec of MITA_STATIONS) {
      const station = mitaStation(spec.suffix);
      expect(station.operator).toBe(TOEI_OPERATOR);
      expect(station.railway).toBe(MITA_RAILWAY);
    }
  });

  it("declares the measured Marunouchi shape: 18 ordered stops", () => {
    expect(MARUNOUCHI_TRAIN_TIMETABLE.objects).toHaveLength(18);
    expect(MARUNOUCHI_EXPECTED_MINUTES).toBe(41);
  });
});
