// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FILTER_KINDS,
  FILTER_PARAM_NAMES,
  ODPT_RADIUS_MAX_METERS,
  OPERATION_SCHEMAS,
  OPERATIONS_REQUIRING_FILTER,
  REFERENCE_OPERATIONS,
  TIMETABLE_OPERATIONS,
  buildParams,
  buildResourcePath,
  normalizeCalendar,
  normalizeOperatorRecord,
  normalizeRailDirection,
  normalizeStationTimetable,
  normalizeTrainTimetable,
  normalizeTrainType,
  odptLookup,
  validateOdptRequest,
} from "./odpt-core.js";

const KEY = "fixture-odpt-key";
const ENV = { ODPT_API_KEY: KEY };
const NOW = () => "2026-09-10T00:00:00.000Z";
const BASE = "https://api.odpt.org/api/v4";

// ---------------------------------------------------------------------------
// Fixtures shaped from API v4.16 examples (§2.2.1, §2.2.2, §3.2.6, §3.2.9,
// §3.3.2, §3.3.6, §3.3.9, §3.3.10). No credential is ever stored.
// ---------------------------------------------------------------------------

const CALENDAR_WEEKDAY = {
  "@context": "http://vocab.odpt.org/context_odpt.jsonld",
  "@id": "urn:ucode:_00001C000000000000010000030FD801",
  "@type": "odpt:Calendar",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Calendar:Weekday",
  "dc:title": "平日",
  "odpt:calendarTitle": { ja: "平日", en: "Weekday" },
};

const CALENDAR_HOLIDAY = {
  "@id": "urn:ucode:_00001C000000000000010000030FD802",
  "@type": "odpt:Calendar",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Calendar:Holiday",
  "dc:title": "休日",
  "odpt:calendarTitle": { ja: "休日", en: "Holiday" },
  "odpt:day": ["2017-01-01", "2017-01-09"],
};

const CALENDAR_SPECIFIC = {
  "@id": "urn:ucode:_00001C000000000000010000030FD803",
  "@type": "odpt:Calendar",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Calendar:Specific.Toei.MarketHoliday",
  "odpt:calendarTitle": { ja: "市場休日", en: "Market holiday" },
  "odpt:day": ["2017-01-16"],
  "odpt:duration": "2017-01-01/2017-12-31",
};

const OPERATOR_JR_EAST = {
  "@id": "urn:ucode:_00001C000000000000010000030FD804",
  "@type": "odpt:Operator",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.Operator:JR-East",
  "dc:title": "JR東日本",
  "odpt:operatorTitle": { ja: "JR東日本", en: "JR East" },
};

const RAIL_DIRECTION = {
  "@id": "urn:ucode:_00001C000000000000010000030FD805",
  "@type": "odpt:RailDirection",
  "dc:date": "2017-01-13T06:10:00+09:00",
  "owl:sameAs": "odpt.RailDirection:Outbound",
  "dc:title": "上り",
  "odpt:railDirectionTitle": { ja: "上り", en: "Inbound" },
};

const TRAIN_TYPE = {
  "@id": "urn:ucode:_00001C000000000000010000030FD806",
  "@type": "odpt:TrainType",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "owl:sameAs": "odpt.TrainType:JR-East.Local",
  "odpt:operator": "odpt.Operator:JR-East",
  "dc:title": "普通",
  "odpt:trainTypeTitle": { ja: "普通", en: "Local" },
};

const STATION_TIMETABLE = {
  "@context": "http://vocab.odpt.org/context_odpt.jsonld",
  "@id": "urn:ucode:_00001C000000000000010000030FD807",
  "@type": "odpt:StationTimetable",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "dct:issued": "2017-01-13",
  "dct:valid": "2017-12-07T01:30:03+09:00",
  "owl:sameAs":
    "odpt.StationTimetable:JR-East.ChuoRapid.Tokyo.Outbound.Weekday",
  "odpt:operator": "odpt.Operator:JR-East",
  "odpt:railway": "odpt.Railway:JR-East.ChuoRapid",
  "odpt:railwayTitle": { ja: "中央線快速", en: "Chuo Rapid" },
  "odpt:station": "odpt.Station:JR-East.ChuoRapid.Tokyo",
  "odpt:stationTitle": { ja: "東京", en: "Tokyo" },
  "odpt:railDirection": "odpt.RailDirection:Outbound",
  "odpt:calendar": "odpt.Calendar:Weekday",
  "odpt:note": { ja: "注釈", en: "Note" },
  "odpt:stationTimetableObject": [
    {
      "odpt:departureTime": "06:00",
      "odpt:originStation": ["odpt.Station:JR-East.ChuoRapid.Tokyo"],
      "odpt:destinationStation": ["odpt.Station:JR-East.ChuoRapid.Takao"],
      "odpt:train": "odpt.Train:JR-East.ChuoRapid.123M",
      "odpt:trainNumber": "123M",
      "odpt:trainType": "odpt.TrainType:JR-East.Local",
      "odpt:trainName": [{ ja: "むさし", en: "Musashi" }],
      "odpt:trainOwner": "odpt.Operator:JR-East",
      "odpt:isOrigin": true,
      "odpt:platformNumber": "1",
      "odpt:platformName": { ja: "1番線", en: "Platform 1" },
      "odpt:carComposition": 8,
    },
    {
      "odpt:arrivalTime": "23:58",
      "odpt:departureTime": "23:59",
      "odpt:viaStation": ["odpt.Station:TokyoMetro.Tozai.NishiFunabashi"],
      "odpt:viaRailway": ["odpt.Railway:TokyoMetro.Tozai"],
      "odpt:trainNumber": "999M",
      "odpt:isLast": true,
      "odpt:note": { ja: "最終", en: "Last train" },
    },
  ],
};

const TRAIN_TIMETABLE = {
  "@context": "http://vocab.odpt.org/context_odpt.jsonld",
  "@id": "urn:ucode:_00001C000000000000010000030FD808",
  "@type": "odpt:TrainTimetable",
  "dc:date": "2017-01-13T15:10:00+09:00",
  "dct:issued": "2017-01-01",
  "dct:valid": "2017-12-07T01:30:03+09:00",
  "owl:sameAs": "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday",
  "odpt:operator": "odpt.Operator:JR-East",
  "odpt:railway": "odpt.Railway:JR-East.ChuoRapid",
  "odpt:railDirection": "odpt.RailDirection:Outbound",
  "odpt:calendar": "odpt.Calendar:Weekday",
  "odpt:train": "odpt.Train:JR-East.ChuoRapid.123M",
  "odpt:trainNumber": "123M",
  "odpt:trainType": "odpt.TrainType:JR-East.Local",
  "odpt:trainName": [{ ja: "むさし", en: "Musashi" }],
  "odpt:trainOwner": "odpt.Operator:JR-East",
  "odpt:originStation": ["odpt.Station:JR-East.ChuoRapid.Tokyo"],
  "odpt:destinationStation": ["odpt.Station:JR-East.ChuoRapid.Takao"],
  "odpt:viaStation": ["odpt.Station:JR-East.ChuoRapid.Shinjuku"],
  "odpt:viaRailway": ["odpt.Railway:JR-East.ChuoRapid"],
  "odpt:previousTrainTimetable": [
    "odpt.TrainTimetable:JR-East.ChuoRapid.122M.Weekday",
  ],
  "odpt:nextTrainTimetable": [
    "odpt.TrainTimetable:JR-East.ChuoRapid.124M.Weekday",
  ],
  "odpt:needExtraFee": true,
  "odpt:note": { ja: "注釈", en: "Note" },
  "odpt:trainTimetableObject": [
    {
      "odpt:departureTime": "06:00",
      "odpt:departureStation": "odpt.Station:JR-East.ChuoRapid.Tokyo",
      "odpt:platformNumber": "1",
      "odpt:platformName": { ja: "1番線", en: "Platform 1" },
    },
    {
      "odpt:arrivalTime": "06:14",
      "odpt:arrivalStation": "odpt.Station:JR-East.ChuoRapid.Shinjuku",
      "odpt:departureTime": "06:15",
      "odpt:departureStation": "odpt.Station:JR-East.ChuoRapid.Shinjuku",
    },
    {
      "odpt:arrivalTime": "07:00",
      "odpt:arrivalStation": "odpt.Station:JR-East.ChuoRapid.Takao",
    },
  ],
};

function jsonResponse(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch(payload, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(payload, status);
  };
  impl.calls = calls;
  return impl;
}

// ---------------------------------------------------------------------------
// Allow-list / schema
// ---------------------------------------------------------------------------

describe("KAI-290 operation allow-list", () => {
  it("declares each new operation with path/query separation", () => {
    for (const operation of [
      "calendar",
      "operator",
      "train_type",
      "rail_direction",
      "station_timetable",
      "train_timetable",
    ]) {
      const schema = OPERATION_SCHEMAS[operation];
      expect(schema, `${operation} schema`).toBeDefined();
      expect(Array.isArray(schema.pathParams)).toBe(true);
      expect(Array.isArray(schema.queryParams)).toBe(true);
      // These all address collections by query, never by path.
      expect(schema.pathParams).toEqual([]);
    }
  });

  it("maps every declared query input to a documented ODPT parameter name", () => {
    for (const [operation, schema] of Object.entries(OPERATION_SCHEMAS)) {
      for (const name of schema.queryParams) {
        expect(
          typeof FILTER_PARAM_NAMES[name] === "string" &&
            FILTER_PARAM_NAMES[name].length > 0,
          `${operation}.${name} has no documented ODPT parameter name`,
        ).toBe(true);
      }
    }
  });

  it("declares a validation kind for every ODPT query parameter name", () => {
    for (const name of Object.keys(FILTER_PARAM_NAMES)) {
      expect(
        FILTER_KINDS[name],
        `${name} has no validation kind`,
      ).toBeDefined();
    }
  });

  it("uses only parameter names the specification documents", () => {
    // Guards against inventing a parameter. Every mapped name must be one of the
    // documented ODPT query parameters.
    const documented = new Set([
      "owl:sameAs",
      "dc:title",
      "dc:date",
      "odpt:operator",
      "odpt:railway",
      "odpt:station",
      "odpt:stationCode",
      "odpt:lineCode",
      "odpt:railDirection",
      "odpt:calendar",
      "odpt:fromStation",
      "odpt:toStation",
      "odpt:trainNumber",
      "odpt:trainType",
      "odpt:train",
      "lat",
      "lon",
      "radius",
    ]);
    for (const [filter, param] of Object.entries(FILTER_PARAM_NAMES)) {
      expect(documented.has(param), `${filter} -> ${param}`).toBe(true);
    }
  });

  it("classifies reference and timetable operations", () => {
    expect([...REFERENCE_OPERATIONS].sort()).toEqual([
      "calendar",
      "operator",
      "rail_direction",
      "train_type",
    ]);
    expect([...TIMETABLE_OPERATIONS].sort()).toEqual([
      "station_timetable",
      "train_timetable",
    ]);
    expect(OPERATIONS_REQUIRING_FILTER).toContain("station_timetable");
    expect(OPERATIONS_REQUIRING_FILTER).toContain("train_timetable");
    // Timetable operations must always require narrowing.
    for (const operation of TIMETABLE_OPERATIONS) {
      expect(OPERATIONS_REQUIRING_FILTER).toContain(operation);
    }
  });
});

describe("KAI-290 request validation", () => {
  it.each([
    ["calendar", {}],
    ["calendar", { sameAs: "odpt.Calendar:Weekday" }],
    ["operator", {}],
    ["operator", { sameAs: "odpt.Operator:JR-East" }],
    ["train_type", { operator: "odpt.Operator:JR-East" }],
    ["rail_direction", { operator: "odpt.Operator:JR-East" }],
  ])("accepts reference operation %s", (operation, extra) => {
    expect(validateOdptRequest({ operation, ...extra }).ok).toBe(true);
  });

  it.each([
    ["station_timetable", { station: "odpt.Station:JR-East.ChuoRapid.Tokyo" }],
    ["station_timetable", { railway: "odpt.Railway:JR-East.ChuoRapid" }],
    ["station_timetable", { operator: "odpt.Operator:JR-East" }],
    ["station_timetable", { railDirection: "odpt.RailDirection:Outbound" }],
    ["station_timetable", { calendar: "odpt.Calendar:Weekday" }],
    ["station_timetable", { date: "2026-09-10" }],
    ["train_timetable", { railway: "odpt.Railway:JR-East.ChuoRapid" }],
    ["train_timetable", { trainNumber: "123M" }],
    ["train_timetable", { operator: "odpt.Operator:JR-East" }],
    ["train_timetable", { trainType: "odpt.TrainType:JR-East.Local" }],
    ["train_timetable", { train: "odpt.Train:JR-East.ChuoRapid.123M" }],
    ["train_timetable", { calendar: "odpt.Calendar:Weekday" }],
  ])("accepts narrowing filter for %s", (operation, extra) => {
    expect(validateOdptRequest({ operation, ...extra }).ok).toBe(true);
  });

  it.each(["station_timetable", "train_timetable"])(
    "rejects an unfiltered %s query",
    (operation) => {
      expect(validateOdptRequest({ operation })).toEqual({
        ok: false,
        error: "unfiltered_search_not_allowed",
      });
    },
  );

  it.each([
    [
      "arbitrary resource override",
      { operation: "station_timetable", "rdf:type": "odpt:Train" },
    ],
    [
      "arbitrary provider url",
      { operation: "train_timetable", url: "https://evil.example" },
    ],
    [
      "arbitrary endpoint",
      { operation: "train_timetable", endpoint: "https://evil.example" },
    ],
    [
      "generic filters object",
      { operation: "station_timetable", filters: { "odpt:station": "x" } },
    ],
    [
      "client-supplied consumer key",
      { operation: "calendar", "acl:consumerKey": "attacker" },
    ],
  ])("rejects %s", (_label, body) => {
    expect(validateOdptRequest(body)).toEqual({
      ok: false,
      error: "unsupported_field",
    });
  });

  it.each([
    [
      "invalid station identity",
      { operation: "station_timetable", station: "東京" },
    ],
    [
      "invalid railway identity",
      { operation: "station_timetable", railway: "JR-East" },
    ],
    [
      "invalid calendar identity",
      { operation: "station_timetable", calendar: "Weekday" },
    ],
    [
      "invalid train number",
      { operation: "train_timetable", trainNumber: "12 3M" },
    ],
    ["invalid date", { operation: "station_timetable", date: "not-a-date" }],
    [
      "date with provider syntax",
      { operation: "station_timetable", date: "2026-09-10&x=1" },
    ],
  ])("rejects %s", (_label, body) => {
    expect(validateOdptRequest(body).ok).toBe(false);
  });

  it("rejects a timetable query whose only filter is an unknown field", () => {
    const result = validateOdptRequest({
      operation: "train_timetable",
      dcDate: "2026-09-10",
    });
    expect(result).toEqual({ ok: false, error: "unsupported_field" });
  });
});

describe("KAI-290 request construction", () => {
  it("builds the calendar URL exactly", async () => {
    const fetchImpl = captureFetch([CALENDAR_WEEKDAY]);
    await odptLookup({ operation: "calendar" }, ENV, fetchImpl, NOW);
    expect(fetchImpl.calls[0].url).toBe(
      `${BASE}/odpt:Calendar?acl:consumerKey=${KEY}`,
    );
  });

  it("builds a station timetable URL with its documented filters", async () => {
    const fetchImpl = captureFetch([STATION_TIMETABLE]);
    const result = await odptLookup(
      {
        operation: "station_timetable",
        station: "odpt.Station:JR-East.ChuoRapid.Tokyo",
        calendar: "odpt.Calendar:Weekday",
      },
      ENV,
      fetchImpl,
      NOW,
    );
    expect(fetchImpl.calls[0].url).toBe(
      `${BASE}/odpt:StationTimetable?odpt:station=odpt.Station%3AJR-East.ChuoRapid.Tokyo&odpt:calendar=odpt.Calendar%3AWeekday&acl:consumerKey=${KEY}`,
    );
    expect(result.sourceUrl).toBe(
      `${BASE}/odpt:StationTimetable?odpt:station=odpt.Station%3AJR-East.ChuoRapid.Tokyo&odpt:calendar=odpt.Calendar%3AWeekday`,
    );
    expect(result.sourceUrl).not.toContain("acl:consumerKey");
  });

  it("builds a train timetable URL with its documented filters", async () => {
    const fetchImpl = captureFetch([TRAIN_TIMETABLE]);
    await odptLookup(
      {
        operation: "train_timetable",
        railway: "odpt.Railway:JR-East.ChuoRapid",
        trainNumber: "123M",
      },
      ENV,
      fetchImpl,
      NOW,
    );
    // Parameter order follows the operation's declared queryParams order, which
    // is deterministic; assert it exactly so the request cannot drift.
    expect(fetchImpl.calls[0].url).toBe(
      `${BASE}/odpt:TrainTimetable?odpt:trainNumber=123M&odpt:railway=odpt.Railway%3AJR-East.ChuoRapid&acl:consumerKey=${KEY}`,
    );
  });

  it("never emits an undefined parameter for a new operation", async () => {
    for (const [operation, extra] of [
      ["calendar", {}],
      ["operator", {}],
      ["train_type", { operator: "odpt.Operator:JR-East" }],
      ["rail_direction", { operator: "odpt.Operator:JR-East" }],
      ["station_timetable", { operator: "odpt.Operator:JR-East" }],
      ["train_timetable", { operator: "odpt.Operator:JR-East" }],
    ]) {
      const fetchImpl = captureFetch([]);
      await odptLookup({ operation, ...extra }, ENV, fetchImpl, NOW);
      const url = fetchImpl.calls[0].url;
      expect(url, `${operation} url`).not.toContain("undefined");
      expect(url).toContain("acl:consumerKey=");
    }
  });

  it("rejects a timetable request before any provider call", async () => {
    const fetchImpl = captureFetch([]);
    const result = await odptLookup(
      { operation: "station_timetable" },
      ENV,
      fetchImpl,
      NOW,
    );
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toContain("invalid_request");
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it.each([
    ["calendar", {}, "odpt:Calendar"],
    ["operator", {}, "odpt:Operator"],
    ["train_type", { operator: "odpt.Operator:JR-East" }, "odpt:TrainType"],
    [
      "rail_direction",
      { operator: "odpt.Operator:JR-East" },
      "odpt:RailDirection",
    ],
    [
      "station_timetable",
      { operator: "odpt.Operator:JR-East" },
      "odpt:StationTimetable",
    ],
    [
      "train_timetable",
      { operator: "odpt.Operator:JR-East" },
      "odpt:TrainTimetable",
    ],
  ])("resolves the %s resource path", (operation, extra, expected) => {
    void extra;
    expect(buildResourcePath(operation, {})).toBe(expected);
    expect(buildParams(operation, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("Calendar normalization", () => {
  const SOURCE = `${BASE}/odpt:Calendar`;
  const FETCHED = "2026-09-10T00:00:00.000Z";

  it("preserves day, duration and specificity", () => {
    const { record } = normalizeCalendar(CALENDAR_SPECIFIC, SOURCE, FETCHED);
    expect(record).toMatchObject({
      sameAs: "odpt.Calendar:Specific.Toei.MarketHoliday",
      calendarTitle: { ja: "市場休日", en: "Market holiday" },
      day: ["2017-01-16"],
      duration: "2017-01-01/2017-12-31",
      isSpecific: true,
    });
    expect(record.provenance.sourceResource).toBe("odpt:Calendar");
  });

  it("marks a base calendar as not specific", () => {
    const { record } = normalizeCalendar(CALENDAR_HOLIDAY, SOURCE, FETCHED);
    expect(record.isSpecific).toBe(false);
    expect(record.day).toEqual(["2017-01-01", "2017-01-09"]);
  });

  it("fails closed on a calendar without an identity", () => {
    expect(
      normalizeCalendar({ "@type": "odpt:Calendar" }, SOURCE, FETCHED).error,
    ).toBe("malformed_provider_record");
  });

  it("does not collapse a calendar to a weekday/saturday/holiday enum", () => {
    const { record } = normalizeCalendar(CALENDAR_WEEKDAY, SOURCE, FETCHED);
    // The raw ODPT identity must survive; no derived enum may replace it.
    expect(record.sameAs).toBe("odpt.Calendar:Weekday");
    expect(record).not.toHaveProperty("weekday");
  });
});

describe("Operator / RailDirection / TrainType normalization", () => {
  const SOURCE = BASE;
  const FETCHED = "2026-09-10T00:00:00.000Z";

  it("normalizes an operator", () => {
    const { record } = normalizeOperatorRecord(
      OPERATOR_JR_EAST,
      SOURCE,
      FETCHED,
    );
    expect(record).toMatchObject({
      sameAs: "odpt.Operator:JR-East",
      title: "JR東日本",
      operatorTitle: { ja: "JR東日本", en: "JR East" },
    });
  });

  it("normalizes a rail direction with multilingual title", () => {
    const { record } = normalizeRailDirection(RAIL_DIRECTION, SOURCE, FETCHED);
    expect(record).toMatchObject({
      sameAs: "odpt.RailDirection:Outbound",
      railDirectionTitle: { ja: "上り", en: "Inbound" },
    });
  });

  it("normalizes a train type with its operator", () => {
    const { record } = normalizeTrainType(TRAIN_TYPE, SOURCE, FETCHED);
    expect(record).toMatchObject({
      sameAs: "odpt.TrainType:JR-East.Local",
      operator: "odpt.Operator:JR-East",
      trainTypeTitle: { ja: "普通", en: "Local" },
    });
  });
});

describe("StationTimetable normalization", () => {
  const SOURCE = `${BASE}/odpt:StationTimetable`;
  const FETCHED = "2026-09-10T00:00:00.000Z";

  it("preserves the record's identifying context and revision dates", () => {
    const { record } = normalizeStationTimetable(
      STATION_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record).toMatchObject({
      sameAs: "odpt.StationTimetable:JR-East.ChuoRapid.Tokyo.Outbound.Weekday",
      operator: "odpt.Operator:JR-East",
      railway: "odpt.Railway:JR-East.ChuoRapid",
      railwayTitle: { ja: "中央線快速", en: "Chuo Rapid" },
      station: "odpt.Station:JR-East.ChuoRapid.Tokyo",
      stationTitle: { ja: "東京", en: "Tokyo" },
      railDirection: "odpt.RailDirection:Outbound",
      calendar: "odpt.Calendar:Weekday",
      issuedAt: "2017-01-13",
      validUntil: "2017-12-07T01:30:03+09:00",
      note: { ja: "注釈", en: "Note" },
    });
  });

  it("normalizes timetable objects without flattening them", () => {
    const { record } = normalizeStationTimetable(
      STATION_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record.objectCount).toBe(2);
    const [first, second] = record.objects;
    expect(first).toMatchObject({
      departureTime: "06:00",
      arrivalTime: null,
      originStation: ["odpt.Station:JR-East.ChuoRapid.Tokyo"],
      destinationStation: ["odpt.Station:JR-East.ChuoRapid.Takao"],
      train: "odpt.Train:JR-East.ChuoRapid.123M",
      trainNumber: "123M",
      trainType: "odpt.TrainType:JR-East.Local",
      trainName: [{ ja: "むさし", en: "Musashi" }],
      trainOwner: "odpt.Operator:JR-East",
      isOrigin: true,
      platformNumber: "1",
      platformName: { ja: "1番線", en: "Platform 1" },
      carComposition: 8,
    });
    expect(second).toMatchObject({
      arrivalTime: "23:58",
      departureTime: "23:59",
      viaStation: ["odpt.Station:TokyoMetro.Tozai.NishiFunabashi"],
      viaRailway: ["odpt.Railway:TokyoMetro.Tozai"],
      isLast: true,
      note: { ja: "最終", en: "Last train" },
    });
  });

  it("treats omitted isLast/isOrigin as false, per the specification", () => {
    const { record } = normalizeStationTimetable(
      STATION_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record.objects[0].isLast).toBe(false);
    expect(record.objects[1].isOrigin).toBe(false);
  });

  it("preserves unknown multilingual title keys", () => {
    const multi = structuredClone(STATION_TIMETABLE);
    multi["odpt:stationTitle"] = {
      ja: "日本橋",
      en: "Nihombashi",
      ko: "니혼바시",
      "ja-Hrkt": "にほんばし",
      "zh-Hans": "日本桥",
      "zh-Hant": "日本橋",
    };
    const { record } = normalizeStationTimetable(multi, SOURCE, FETCHED);
    expect(Object.keys(record.stationTitle).sort()).toEqual([
      "en",
      "ja",
      "ja-Hrkt",
      "ko",
      "zh-Hans",
      "zh-Hant",
    ]);
  });

  it("fails closed when the required timetable object list is missing", () => {
    const { "odpt:stationTimetableObject": _omitted, ...without } =
      STATION_TIMETABLE;
    expect(normalizeStationTimetable(without, SOURCE, FETCHED).error).toBe(
      "malformed_timetable_objects",
    );
  });

  it("fails closed on a non-object timetable entry", () => {
    const bad = {
      ...STATION_TIMETABLE,
      "odpt:stationTimetableObject": ["nope"],
    };
    expect(normalizeStationTimetable(bad, SOURCE, FETCHED).error).toBe(
      "malformed_timetable_objects",
    );
  });

  it("does not invent an end-to-end duration from a station timetable", () => {
    const { record } = normalizeStationTimetable(
      STATION_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    // A StationTimetable is single-station evidence; it must not carry a
    // duration or journey-shaped field.
    expect(record).not.toHaveProperty("durationMinutes");
    expect(record).not.toHaveProperty("journey");
    expect(record).not.toHaveProperty("legs");
  });
});

describe("TrainTimetable normalization", () => {
  const SOURCE = `${BASE}/odpt:TrainTimetable`;
  const FETCHED = "2026-09-10T00:00:00.000Z";

  it("preserves identity, service context and split links", () => {
    const { record } = normalizeTrainTimetable(
      TRAIN_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record).toMatchObject({
      sameAs: "odpt.TrainTimetable:JR-East.ChuoRapid.123M.Weekday",
      operator: "odpt.Operator:JR-East",
      railway: "odpt.Railway:JR-East.ChuoRapid",
      railDirection: "odpt.RailDirection:Outbound",
      calendar: "odpt.Calendar:Weekday",
      train: "odpt.Train:JR-East.ChuoRapid.123M",
      trainNumber: "123M",
      trainType: "odpt.TrainType:JR-East.Local",
      trainOwner: "odpt.Operator:JR-East",
      originStation: ["odpt.Station:JR-East.ChuoRapid.Tokyo"],
      destinationStation: ["odpt.Station:JR-East.ChuoRapid.Takao"],
      viaStation: ["odpt.Station:JR-East.ChuoRapid.Shinjuku"],
      viaRailway: ["odpt.Railway:JR-East.ChuoRapid"],
      previousTrainTimetable: [
        "odpt.TrainTimetable:JR-East.ChuoRapid.122M.Weekday",
      ],
      nextTrainTimetable: [
        "odpt.TrainTimetable:JR-East.ChuoRapid.124M.Weekday",
      ],
      issuedAt: "2017-01-01",
      validUntil: "2017-12-07T01:30:03+09:00",
    });
  });

  it("preserves ordered stop-by-stop station/time pairs", () => {
    const { record } = normalizeTrainTimetable(
      TRAIN_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record.objectCount).toBe(3);
    expect(record.objects.map((entry) => entry.departureTime)).toEqual([
      "06:00",
      "06:15",
      null,
    ]);
    expect(record.objects[0]).toMatchObject({
      departureStation: "odpt.Station:JR-East.ChuoRapid.Tokyo",
      platformNumber: "1",
    });
    expect(record.objects[1]).toMatchObject({
      arrivalStation: "odpt.Station:JR-East.ChuoRapid.Shinjuku",
      arrivalTime: "06:14",
      departureTime: "06:15",
    });
    expect(record.objects[2]).toMatchObject({
      arrivalStation: "odpt.Station:JR-East.ChuoRapid.Takao",
      arrivalTime: "07:00",
    });
  });

  it("preserves needExtraFee=true so a base fare cannot be presented as complete", () => {
    const { record } = normalizeTrainTimetable(
      TRAIN_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record.needExtraFee).toBe(true);
  });

  it.each([
    [true, true],
    [false, false],
    [undefined, null],
  ])("keeps needExtraFee tri-state for input %s", (input, expected) => {
    const fixture = { ...TRAIN_TIMETABLE };
    if (input === undefined) delete fixture["odpt:needExtraFee"];
    else fixture["odpt:needExtraFee"] = input;
    const { record } = normalizeTrainTimetable(fixture, SOURCE, FETCHED);
    expect(record.needExtraFee).toBe(expected);
  });

  it("distinguishes absent needExtraFee from an explicit false", () => {
    const absent = { ...TRAIN_TIMETABLE };
    delete absent["odpt:needExtraFee"];
    const absentRecord = normalizeTrainTimetable(
      absent,
      SOURCE,
      FETCHED,
    ).record;
    const falseRecord = normalizeTrainTimetable(
      { ...TRAIN_TIMETABLE, "odpt:needExtraFee": false },
      SOURCE,
      FETCHED,
    ).record;
    expect(absentRecord.needExtraFee).toBeNull();
    expect(falseRecord.needExtraFee).toBe(false);
    expect(absentRecord.needExtraFee).not.toBe(falseRecord.needExtraFee);
  });

  it("fails closed without the required train number", () => {
    const { "odpt:trainNumber": _omitted, ...without } = TRAIN_TIMETABLE;
    expect(normalizeTrainTimetable(without, SOURCE, FETCHED).error).toBe(
      "timetable_without_train_number",
    );
  });

  it("fails closed without the required timetable object list", () => {
    const { "odpt:trainTimetableObject": _omitted, ...without } =
      TRAIN_TIMETABLE;
    expect(normalizeTrainTimetable(without, SOURCE, FETCHED).error).toBe(
      "malformed_timetable_objects",
    );
  });

  it("does not reconstruct transfers or a journey", () => {
    const { record } = normalizeTrainTimetable(
      TRAIN_TIMETABLE,
      SOURCE,
      FETCHED,
    );
    expect(record).not.toHaveProperty("durationMinutes");
    expect(record).not.toHaveProperty("transfers");
    expect(record).not.toHaveProperty("journey");
  });
});

describe("KAI-290 credential containment", () => {
  it.each([
    ["calendar", {}, [CALENDAR_WEEKDAY]],
    ["operator", {}, [OPERATOR_JR_EAST]],
    ["train_type", { operator: "odpt.Operator:JR-East" }, [TRAIN_TYPE]],
    [
      "station_timetable",
      { operator: "odpt.Operator:JR-East" },
      [STATION_TIMETABLE],
    ],
    [
      "train_timetable",
      { operator: "odpt.Operator:JR-East" },
      [TRAIN_TIMETABLE],
    ],
  ])(
    "never returns the credential for %s",
    async (operation, extra, payload) => {
      const result = await odptLookup(
        { operation, ...extra },
        ENV,
        captureFetch(payload),
        NOW,
      );
      expect(result.outcome).toBe("records");
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(JSON.stringify(result)).not.toContain("acl:consumerKey");
      expect(result.sourceUrl).not.toContain("acl:consumerKey");
    },
  );

  it("keeps the credential out of a new operation's error path", async () => {
    const result = await odptLookup(
      { operation: "calendar" },
      ENV,
      captureFetch({ message: "Invalid acl:consumerKey." }, 403),
      NOW,
    );
    expect(result.outcome).toBe("error");
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain("Invalid acl");
  });

  it("keeps the credential out when the key is absent", async () => {
    const result = await odptLookup(
      { operation: "train_timetable", operator: "odpt.Operator:JR-East" },
      {},
      captureFetch([]),
      NOW,
    );
    expect(result.errorCode).toBe("provider_not_configured");
    expect(JSON.stringify(result)).not.toContain("consumerKey");
  });
});

describe("KAI-290 response semantics for the new operations", () => {
  it("treats an empty timetable result as success, not an error", async () => {
    const result = await odptLookup(
      { operation: "train_timetable", operator: "odpt.Operator:JR-East" },
      ENV,
      captureFetch([]),
      NOW,
    );
    expect(result.outcome).toBe("records");
    expect(result.recordCount).toBe(0);
    expect(result.errorCode).toBeUndefined();
  });

  it("rejects a non-array success payload for a new operation", async () => {
    const result = await odptLookup(
      { operation: "calendar" },
      ENV,
      captureFetch({ "@type": "odpt:Calendar" }),
      NOW,
    );
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toContain("unexpected_provider_payload_");
  });

  it("fails closed on a malformed timetable record inside an array", async () => {
    const result = await odptLookup(
      { operation: "train_timetable", operator: "odpt.Operator:JR-East" },
      ENV,
      captureFetch([{ "@type": "odpt:TrainTimetable" }]),
      NOW,
    );
    expect(result.outcome).toBe("error");
    expect(result.errorCode).toBe("malformed_provider_record");
    expect(result.records).toEqual([]);
  });

  it("keeps 402 billing_required terminal for a reference read", async () => {
    const fetchImpl = captureFetch({ message: "billing" }, 402);
    const result = await odptLookup(
      { operation: "calendar" },
      ENV,
      fetchImpl,
      NOW,
      { sleepImpl: async () => {} },
    );
    expect(result.errorCode).toBe("billing_required");
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("still enforces the documented radius bound", () => {
    expect(
      validateOdptRequest({
        operation: "nearby_stations",
        lat: 35.68,
        lon: 139.76,
        radius: ODPT_RADIUS_MAX_METERS + 1,
      }).ok,
    ).toBe(false);
  });
});
