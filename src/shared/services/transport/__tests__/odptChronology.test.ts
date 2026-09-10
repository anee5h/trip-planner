import { describe, expect, it } from "vitest";
import {
  ROLLOVER_CURRENT_HOUR,
  ROLLOVER_PREVIOUS_HOUR,
  buildServiceChronology,
  isLegitimateRollover,
  parseClockMinutes,
  trainTimetableStopSequence,
  validateSplitTimetablePair,
} from "../odptChronology";

function sequence(times: readonly (string | null)[]) {
  return times.map((time) => ({ time }));
}

describe("parseClockMinutes", () => {
  it("parses ODPT clock times", () => {
    expect(parseClockMinutes("00:00")).toBe(0);
    expect(parseClockMinutes("05:08")).toBe(308);
    expect(parseClockMinutes("23:59")).toBe(1439);
    expect(parseClockMinutes("06:15:30")).toBe(375);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["non-time", "tomorrow"],
    ["hour out of range", "24:00"],
    ["minute out of range", "23:60"],
    ["ISO date-time", "2026-09-10T05:08:00+09:00"],
  ])("returns null for %s", (_label, value) => {
    expect(parseClockMinutes(value as string | null)).toBeNull();
  });
});

describe("buildServiceChronology — normal daytime sequence", () => {
  it("produces monotonically increasing minutes", () => {
    const result = buildServiceChronology(
      sequence(["06:00", "06:14", "06:30", "07:00"]),
    );
    expect(result.status).toBe("ok");
    expect(result.rollovers).toEqual([]);
    expect(result.events.map((event) => event.minutes)).toEqual([
      360, 374, 390, 420,
    ]);
    expect(result.events.every((event) => event.dayOffset === 0)).toBe(true);
    expect(result.durationMinutes).toBe(60);
  });

  it("keeps a departure spanning a normal gap positive", () => {
    const result = buildServiceChronology(sequence(["09:00", "10:30"]));
    expect(result.durationMinutes).toBe(90);
    expect(result.status).toBe("ok");
  });
});

describe("buildServiceChronology — midnight rollover", () => {
  it("detects the documented 23:58 -> 00:03 crossing", () => {
    // API v4.16 §3.3.6 gives exactly this example.
    const result = buildServiceChronology(sequence(["23:58", "00:03"]));
    expect(result.status).toBe("rollover");
    expect(result.rollovers).toEqual([1]);
    expect(result.events[0].minutes).toBe(1438);
    expect(result.events[0].dayOffset).toBe(0);
    expect(result.events[1].rawMinutes).toBe(3);
    expect(result.events[1].dayOffset).toBe(1);
    expect(result.events[1].minutes).toBe(1443);
    // The whole point: the duration must be +5 minutes, not -1435.
    expect(result.durationMinutes).toBe(5);
  });

  it("supports multiple events after midnight", () => {
    const result = buildServiceChronology(
      sequence(["23:58", "00:03", "00:10", "00:45", "01:20"]),
    );
    expect(result.status).toBe("rollover");
    expect(result.rollovers).toEqual([1]);
    const minutes = result.events.map((event) => event.minutes);
    expect(minutes).toEqual([1438, 1443, 1450, 1485, 1520]);
    // Strictly increasing across the whole sequence.
    for (let index = 1; index < minutes.length; index += 1) {
      expect(minutes[index]!).toBeGreaterThan(minutes[index - 1]!);
    }
    expect(result.durationMinutes).toBe(82);
    expect(result.events[1].dayOffset).toBe(1);
    expect(result.events[4].dayOffset).toBe(1);
  });

  it("rejects a 22:30 -> 00:20 crossing as unproven by the ODPT contract", () => {
    // §3.3.6 only proves a crossing when the previous hour is 23 and the
    // current hour is 0. A 22:30 -> 00:20 step is plausible in the real world
    // but NOT evidenced by the provider, so it must stay unresolved rather
    // than being promoted into a next-day chronology.
    const result = buildServiceChronology(sequence(["22:30", "00:20"]));
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("invalid_backward_chronology:1");
    expect(result.rollovers).toEqual([]);
  });

  it("accepts the exact §3.3.6 boundary crossing 23:00 -> 00:59", () => {
    // Previous hour is 23 and current hour is 0, so this IS contract-proven.
    const result = buildServiceChronology(sequence(["23:00", "00:59"]));
    expect(result.status).toBe("rollover");
    expect(result.durationMinutes).toBe(119);
    expect(result.rollovers).toEqual([1]);
  });

  it("never returns a negative duration across midnight", () => {
    const result = buildServiceChronology(sequence(["23:59", "00:00"]));
    expect(result.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(result.durationMinutes).toBe(1);
  });
});

describe("buildServiceChronology — invalid backward chronology", () => {
  it("rejects a backward step that is not a midnight crossing", () => {
    // 06:00 -> 05:00 is a decrease, and the previous hour is neither 23 nor
    // followed by hour 0, so it is not a §3.3.6 crossing.
    const result = buildServiceChronology(sequence(["06:00", "05:00"]));
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("invalid_backward_chronology:1");
    expect(result.rollovers).toEqual([]);
  });

  it("rejects a small daytime decrease", () => {
    const result = buildServiceChronology(sequence(["10:00", "09:59"]));
    expect(result.status).toBe("invalid");
    expect(result.errors).toEqual(["invalid_backward_chronology:1"]);
  });

  it("rejects a second crossing after midnight has already rolled", () => {
    const result = buildServiceChronology(
      sequence(["23:58", "00:03", "23:50"]),
    );
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("backward_chronology_after_rollover:2");
    expect(result.rollovers).toEqual([1]);
  });

  it("still never returns a negative duration for an invalid sequence", () => {
    const result = buildServiceChronology(
      sequence(["06:00", "05:00", "04:00"]),
    );
    expect(result.status).toBe("invalid");
    expect(result.durationMinutes).not.toBeNull();
    expect(result.durationMinutes!).toBeGreaterThanOrEqual(0);
  });

  it("does not repair an invalid sequence by reordering it", () => {
    const result = buildServiceChronology(sequence(["06:00", "05:00"]));
    // Order is preserved exactly as supplied.
    expect(result.events.map((event) => event.time)).toEqual([
      "06:00",
      "05:00",
    ]);
  });
});

describe("buildServiceChronology — missing and equal times", () => {
  it("tolerates a missing time and reports it", () => {
    const result = buildServiceChronology(sequence(["06:00", null, "06:30"]));
    expect(result.hasMissingTimes).toBe(true);
    expect(result.status).toBe("ok");
    expect(result.events[1].minutes).toBeNull();
    expect(result.events[1].rawMinutes).toBeNull();
    expect(result.notes).toContain("sequence_contains_missing_times");
    // Duration still spans the timed events.
    expect(result.durationMinutes).toBe(30);
  });

  it("reports an unparseable time as missing rather than guessing", () => {
    const result = buildServiceChronology(sequence(["06:00", "soon", "06:30"]));
    expect(result.hasMissingTimes).toBe(true);
    expect(result.events[1].minutes).toBeNull();
  });

  it("allows an arrival and departure at the same station with zero dwell", () => {
    const result = buildServiceChronology([
      { time: "06:14", kind: "arrival", station: "odpt.Station:A" },
      { time: "06:14", kind: "departure", station: "odpt.Station:A" },
    ]);
    expect(result.status).toBe("ok");
    expect(result.events.map((event) => event.minutes)).toEqual([374, 374]);
    expect(result.durationMinutes).toBe(0);
  });

  it("allows a positive dwell at the same station", () => {
    const result = buildServiceChronology([
      { time: "06:14", kind: "arrival", station: "odpt.Station:A" },
      { time: "06:15", kind: "departure", station: "odpt.Station:A" },
    ]);
    expect(result.status).toBe("ok");
    expect(result.durationMinutes).toBe(1);
  });

  it("returns an empty result for an empty sequence", () => {
    const result = buildServiceChronology([]);
    expect(result.status).toBe("empty");
    expect(result.durationMinutes).toBeNull();
    expect(result.notes).toContain("empty_sequence");
  });
});

describe("isLegitimateRollover", () => {
  it("accepts exactly the §3.3.6 shape: previous hour 23, current hour 0", () => {
    expect(isLegitimateRollover(23 * 60, 0)).toBe(true);
    expect(isLegitimateRollover(23 * 60 + 58, 3)).toBe(true);
    expect(isLegitimateRollover(23 * 60, 59)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLegitimateRollover(6 * 60, 5 * 60)).toBe(false);
    expect(isLegitimateRollover(21 * 60, 1 * 60)).toBe(false);
    expect(isLegitimateRollover(23 * 60, 10 * 60)).toBe(false);
  });

  it("pins the exact ODPT rollover rule, not a heuristic window", () => {
    // §3.3.6: rollover is proven when "the time (hour) changes from the
    // previous station's from 23 to 0". These two constants are the rule; a
    // 22:00-03:00 style window would be an invented heuristic.
    expect(ROLLOVER_PREVIOUS_HOUR).toBe(23);
    expect(ROLLOVER_CURRENT_HOUR).toBe(0);
  });

  it("classifies the required worked examples per the ODPT contract", () => {
    const cases: ReadonlyArray<{
      readonly from: string;
      readonly to: string;
      readonly rollover: boolean;
    }> = [
      { from: "23:58", to: "00:03", rollover: true },
      { from: "23:00", to: "00:59", rollover: true },
      // Plausible in the real world, but NOT proven by §3.3.6.
      { from: "22:30", to: "02:00", rollover: false },
      { from: "21:55", to: "00:10", rollover: false },
      { from: "23:58", to: "01:03", rollover: false },
      // Not a crossing at all.
      { from: "10:30", to: "09:50", rollover: false },
    ];
    for (const { from, to, rollover } of cases) {
      const previous = parseClockMinutes(from);
      const current = parseClockMinutes(to);
      expect(previous, `${from} must parse`).not.toBeNull();
      expect(current, `${to} must parse`).not.toBeNull();
      expect(
        isLegitimateRollover(previous!, current!),
        `${from} -> ${to} should be ${rollover ? "a" : "NOT a"} rollover`,
      ).toBe(rollover);
      // The sequence builder must agree with the predicate.
      const result = buildServiceChronology(sequence([from, to]));
      expect(result.status, `${from} -> ${to} chronology status`).toBe(
        rollover ? "rollover" : "invalid",
      );
      if (!rollover) {
        expect(result.rollovers).toEqual([]);
        expect(result.errors).toContain("invalid_backward_chronology:1");
      }
    }
  });
});

describe("trainTimetableStopSequence", () => {
  it("orders arrival before departure at each stop", () => {
    const sequenceFromObjects = trainTimetableStopSequence([
      { departureTime: "06:00", departureStation: "odpt.Station:A" },
      {
        arrivalTime: "06:14",
        arrivalStation: "odpt.Station:B",
        departureTime: "06:15",
        departureStation: "odpt.Station:B",
      },
      { arrivalTime: "07:00", arrivalStation: "odpt.Station:C" },
    ]);
    expect(sequenceFromObjects.map((entry) => entry.time)).toEqual([
      "06:00",
      "06:14",
      "06:15",
      "07:00",
    ]);
    expect(sequenceFromObjects.map((entry) => entry.kind)).toEqual([
      "departure",
      "arrival",
      "departure",
      "arrival",
    ]);
    expect(buildServiceChronology(sequenceFromObjects).durationMinutes).toBe(
      60,
    );
  });

  it("carries rollover through a full stop sequence", () => {
    const result = buildServiceChronology(
      trainTimetableStopSequence([
        { departureTime: "23:50", departureStation: "odpt.Station:A" },
        { arrivalTime: "00:05", arrivalStation: "odpt.Station:B" },
      ]),
    );
    expect(result.status).toBe("rollover");
    expect(result.durationMinutes).toBe(15);
  });

  it("ignores stops with no times", () => {
    const result = trainTimetableStopSequence([
      { arrivalStation: "odpt.Station:A" },
    ]);
    expect(result).toEqual([]);
  });
});

describe("validateSplitTimetablePair", () => {
  const first = {
    id: "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday",
    sameAs: "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday",
    nextTrainTimetable: [
      "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday.1",
    ],
    objects: [
      { departureTime: "06:00", departureStation: "odpt.Station:A" },
      { arrivalTime: "06:30", arrivalStation: "odpt.Station:B" },
    ],
  };
  const second = {
    id: "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday.1",
    sameAs: "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday.1",
    previousTrainTimetable: [
      "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday",
    ],
    objects: [
      { departureTime: "06:31", departureStation: "odpt.Station:B" },
      { arrivalTime: "07:00", arrivalStation: "odpt.Station:C" },
    ],
  };

  it("accepts an explicit link with compatible chronology", () => {
    const result = validateSplitTimetablePair(first, second);
    expect(result.compatible).toBe(true);
    expect(result.hasExplicitLink).toBe(true);
    expect(result.chronologyCompatible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects records with no explicit previous/next link", () => {
    const result = validateSplitTimetablePair(
      { ...first, nextTrainTimetable: [] },
      { ...second, previousTrainTimetable: [] },
    );
    expect(result.compatible).toBe(false);
    expect(result.hasExplicitLink).toBe(false);
    expect(result.reasons).toContain("missing_explicit_previous_next_link");
  });

  it("accepts a one-directional link", () => {
    const result = validateSplitTimetablePair(
      { ...first, nextTrainTimetable: [] },
      second,
    );
    expect(result.hasExplicitLink).toBe(true);
    expect(result.compatible).toBe(true);
  });

  it("rejects a link whose chronology does not continue", () => {
    const backwards = {
      ...second,
      objects: [
        { departureTime: "05:00", departureStation: "odpt.Station:B" },
        { arrivalTime: "05:30", arrivalStation: "odpt.Station:C" },
      ],
    };
    const result = validateSplitTimetablePair(first, backwards);
    expect(result.compatible).toBe(false);
    expect(result.chronologyCompatible).toBe(false);
  });

  it("rejects records without timetable objects", () => {
    const result = validateSplitTimetablePair(
      { ...first, objects: [] },
      { ...second, objects: [] },
    );
    expect(result.compatible).toBe(false);
    expect(result.reasons).toContain("missing_timetable_objects");
  });

  it("allows a split that legitimately crosses midnight", () => {
    const lateFirst = {
      ...first,
      objects: [
        { departureTime: "23:40", departureStation: "odpt.Station:A" },
        { arrivalTime: "23:58", arrivalStation: "odpt.Station:B" },
      ],
    };
    const earlySecond = {
      ...second,
      objects: [
        { departureTime: "00:03", departureStation: "odpt.Station:B" },
        { arrivalTime: "00:20", arrivalStation: "odpt.Station:C" },
      ],
    };
    const result = validateSplitTimetablePair(lateFirst, earlySecond);
    expect(result.compatible).toBe(true);
  });

  it("does NOT join on matching train number alone", () => {
    const sameNumberNoLink = { ...second, previousTrainTimetable: [] };
    const noLinkFirst = { ...first, nextTrainTimetable: [] };
    const result = validateSplitTimetablePair(noLinkFirst, sameNumberNoLink);
    expect(result.compatible).toBe(false);
    expect(result.reasons).toContain("missing_explicit_previous_next_link");
  });

  it("does NOT join on a similar time or the same railway alone", () => {
    const result = validateSplitTimetablePair(
      {
        id: "odpt.TrainTimetable:X.1",
        sameAs: "odpt.TrainTimetable:X.1",
        objects: [
          { departureTime: "06:00", departureStation: "odpt.Station:A" },
        ],
      },
      {
        id: "odpt.TrainTimetable:X.2",
        sameAs: "odpt.TrainTimetable:X.2",
        objects: [
          { departureTime: "06:01", departureStation: "odpt.Station:A" },
        ],
      },
    );
    expect(result.compatible).toBe(false);
    expect(result.hasExplicitLink).toBe(false);
  });
});
