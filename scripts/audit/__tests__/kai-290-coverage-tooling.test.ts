/**
 * KAI-290 — coverage tooling unit tests.
 *
 * Covers the pure helpers behind `scripts/audit/kai-290-odpt-coverage.mjs`:
 * argument/operator parsing, boundary-response classification, ratio maths,
 * truncation detection, per-operator section assembly, deterministic ordering
 * and the Markdown summary renderer. No network is touched.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildCoverageArtifact,
  buildOperatorSection,
  buildPendingEntry,
  buildTimetableSection,
  classifyProbeResult,
  containsCredentialLike,
  coverageSection,
  deriveFareProbe,
  deriveFindings,
  deriveTimetableScopes,
  FARE_FIELDS,
  formatRatio,
  formatTable,
  HARD_MAX_REQUESTS,
  isConclusiveProbe,
  isSuspiciousRoundNumber,
  missingCoordinateIds,
  parseArgs,
  parseBoundaryResponse,
  PROBE_EMPTY,
  PROBE_ERROR,
  PROBE_RECORDS,
  PROBE_TOO_LARGE,
  PROBE_UNAVAILABLE,
  parseOperatorList,
  parseRetryAfterSeconds,
  renderMarkdown,
  safeRatio,
  STATION_FIELDS,
  stableStringify,
  summarizeRecords,
  truncationSignals,
} from "../kai-290-odpt-coverage.mjs";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const station = (overrides: Record<string, unknown> = {}) => ({
  id: "odpt.Station:TokyoMetro.Ginza.Shibuya",
  sameAs: "odpt.Station:TokyoMetro.Ginza.Shibuya",
  ucode: "urn:ucode:_00001C00000000000000000000000000",
  title: "渋谷",
  stationTitle: { ja: "渋谷", en: "Shibuya" },
  operator: "odpt.Operator:TokyoMetro",
  operatorTitle: { ja: "東京地下鉄" },
  railway: "odpt.Railway:TokyoMetro.Ginza",
  railwayTitle: { ja: "銀座線" },
  stationCode: "G01",
  coordinates: { lat: 35.658, lng: 139.701 },
  connectingRailway: ["odpt.Railway:JR-East.Yamanote"],
  connectingStation: ["odpt.Station:JR-East.Yamanote.Shibuya"],
  date: "2024-01-01T00:00:00+09:00",
  validUntil: null,
  provenance: { provider: "odpt", coverage: "unknown" },
  ...overrides,
});

const railway = (overrides: Record<string, unknown> = {}) => ({
  id: "odpt.Railway:TokyoMetro.Ginza",
  sameAs: "odpt.Railway:TokyoMetro.Ginza",
  title: "銀座線",
  railwayTitle: { ja: "銀座線" },
  operator: "odpt.Operator:TokyoMetro",
  operatorTitle: { ja: "東京地下鉄" },
  lineCode: "G",
  color: "#F39700",
  ascendingRailDirection: "odpt.RailDirection:Shibuya",
  descendingRailDirection: "odpt.RailDirection:Asakusa",
  stationOrder: [
    {
      index: 0,
      station: "odpt.Station:TokyoMetro.Ginza.Shibuya",
      stationTitle: { ja: "渋谷" },
    },
    {
      index: 1,
      station: "odpt.Station:TokyoMetro.Ginza.OmoteSando",
      stationTitle: { ja: "表参道" },
    },
  ],
  date: "2024-01-01T00:00:00+09:00",
  validUntil: null,
  provenance: { provider: "odpt", coverage: "unknown" },
  ...overrides,
});

const available = (
  records: unknown[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  state: "available",
  httpStatus: 200,
  outcome: "records",
  errorCode: null,
  recordCount: records.length,
  records,
  sourceUrl:
    "https://api.odpt.org/api/v4/odpt:Station?odpt:operator=odpt.Operator:TokyoMetro",
  ...extra,
});

// ── Argument + operator parsing ─────────────────────────────────────────────

describe("KAI-290 parseArgs", () => {
  it("defaults to the three canonical operators, 40 requests, 400 ms", () => {
    const config = parseArgs([]);
    expect(config.help).toBe(false);
    expect(config.maxRequests).toBe(40);
    expect(config.delayMs).toBe(400);
    expect(config.fare).toBe(true);
    expect(config.out).toBe("qa/kai-290/odpt-coverage.json");
    expect(config.operators).toEqual([
      "odpt.Operator:JR-East",
      "odpt.Operator:Toei",
      "odpt.Operator:TokyoMetro",
    ]);
  });

  it("collects flags and the --help/-h alias", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--no-fare"]).fare).toBe(false);
    expect(parseArgs(["--out=tmp/x.json"]).out).toBe("tmp/x.json");
    expect(parseArgs(["--delay=0"]).delayMs).toBe(0);
  });

  it("parses --operators and --max-requests", () => {
    const config = parseArgs([
      "--operators=odpt.Operator:Toei,odpt.Operator:JR-East",
      "--max-requests=7",
    ]);
    expect(config.operators).toEqual([
      "odpt.Operator:JR-East",
      "odpt.Operator:Toei",
    ]);
    expect(config.maxRequests).toBe(7);
  });

  it("clamps --max-requests to the hard ceiling", () => {
    expect(
      parseArgs([`--max-requests=${HARD_MAX_REQUESTS + 500}`]).maxRequests,
    ).toBe(HARD_MAX_REQUESTS);
  });

  it("rejects unknown flags and invalid values (fail loud)", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--max-requests=0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--max-requests=abc"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--delay=-1"])).toThrow(/non-negative/);
    expect(() => parseArgs(["--out="])).toThrow(/requires a path/);
  });
});

describe("KAI-290 parseOperatorList", () => {
  it("trims, de-duplicates and byte-order sorts", () => {
    expect(
      parseOperatorList(
        " odpt.Operator:Toei , odpt.Operator:JR-East ,odpt.Operator:Toei ",
      ),
    ).toEqual(["odpt.Operator:JR-East", "odpt.Operator:Toei"]);
  });

  it("rejects empty and malformed lists", () => {
    expect(() => parseOperatorList("")).toThrow(/at least one/);
    expect(() => parseOperatorList("TokyoMetro")).toThrow(
      /invalid operator id/,
    );
    expect(() => parseOperatorList("odpt.Operator:OK,bogus")).toThrow(
      /invalid operator id/,
    );
  });
});

// ── Response classification ─────────────────────────────────────────────────

describe("KAI-290 parseBoundaryResponse", () => {
  it("treats records/0 as a successful zero-match result", () => {
    const parsed = parseBoundaryResponse(200, {
      provider: "odpt",
      outcome: "records",
      records: [],
      recordCount: 0,
      sourceUrl: "https://api.odpt.org/x",
      normalization: "odpt-api-v4.16",
    });
    expect(parsed.state).toBe("available");
    expect(parsed.recordCount).toBe(0);
    expect(parsed.records).toEqual([]);
  });

  it("treats no_data as available and error as available-with-errorCode", () => {
    expect(
      parseBoundaryResponse(200, { provider: "odpt", outcome: "no_data" })
        .state,
    ).toBe("available");
    const errored = parseBoundaryResponse(200, {
      provider: "odpt",
      outcome: "error",
      errorCode: "provider_not_configured",
    });
    expect(errored.state).toBe("available");
    expect(errored.errorCode).toBe("provider_not_configured");
  });

  it("maps unsupported_operation to pending, other 400s to invalid", () => {
    expect(
      parseBoundaryResponse(400, { ok: false, error: "unsupported_operation" })
        .state,
    ).toBe("pending");
    expect(
      parseBoundaryResponse(400, { ok: false, error: "invalid_operator" })
        .state,
    ).toBe("invalid");
  });

  it("maps 429 / 405 / other non-200 statuses", () => {
    expect(parseBoundaryResponse(429, null).state).toBe("rate_limited");
    expect(parseBoundaryResponse(405, null).state).toBe("http_error");
    expect(parseBoundaryResponse(500, null).state).toBe("http_error");
  });

  it("rejects a 200 with an unexpected body shape", () => {
    expect(parseBoundaryResponse(200, { hello: "world" }).state).toBe(
      "invalid",
    );
  });
});

// ── Ratio maths ─────────────────────────────────────────────────────────────

describe("KAI-290 safeRatio / formatRatio", () => {
  it("computes rounded ratios", () => {
    expect(safeRatio(186, 186)).toBe(1);
    expect(safeRatio(149, 149)).toBe(1);
    expect(safeRatio(0, 134)).toBe(0);
    expect(safeRatio(1, 3)).toBe(0.3333);
    expect(safeRatio(2, 3, 2)).toBe(0.67);
  });

  it("returns null without a denominator and formats null as n/a", () => {
    expect(safeRatio(0, 0)).toBeNull();
    expect(safeRatio(5, 0)).toBeNull();
    expect(safeRatio(Number.NaN, 5)).toBeNull();
    expect(formatRatio(null)).toBe("n/a");
    expect(formatRatio(safeRatio(1, 2))).toBe("50.0%");
  });
});

describe("KAI-290 summarizeRecords", () => {
  it("counts filled fields and the coordinate coverage", () => {
    const records = [
      station(),
      station({ stationCode: null }),
      station({ coordinates: null }),
    ];
    const fields = summarizeRecords(records, STATION_FIELDS);
    expect(fields.coordinates).toEqual({ filled: 2, total: 3, ratio: 0.6667 });
    expect(fields.stationCode).toEqual({ filled: 2, total: 3, ratio: 0.6667 });
    expect(fields.stationTitle).toEqual({ filled: 3, total: 3, ratio: 1 });
  });

  it("returns an all-zero summary for an empty record set", () => {
    const fields = summarizeRecords([], STATION_FIELDS);
    expect(fields.id).toEqual({ filled: 0, total: 0, ratio: null });
  });
});

// ── Truncation detection ────────────────────────────────────────────────────

describe("KAI-290 truncation detection", () => {
  it("flags only exact round numbers as suspicious", () => {
    for (const count of [100, 200, 500, 1000, 5000]) {
      expect(isSuspiciousRoundNumber(count)).toBe(true);
    }
    for (const count of [0, 1, 99, 134, 186, 149, 1001]) {
      expect(isSuspiciousRoundNumber(count)).toBe(false);
    }
  });

  it("always marks ODPT search counts as lower bounds", () => {
    expect(truncationSignals(186)).toEqual({
      count: 186,
      countsAreLowerBounds: true,
      isSuspiciousRoundNumber: false,
      note: null,
    });
    const flagged = truncationSignals(500);
    expect(flagged.countsAreLowerBounds).toBe(true);
    expect(flagged.isSuspiciousRoundNumber).toBe(true);
    expect(flagged.note).toMatch(/truncation/);
  });

  it("propagates the lower-bound flag into a station coverage section", () => {
    const section = coverageSection(available([station()]), STATION_FIELDS);
    expect(section.countsAreLowerBounds).toBe(true);
    expect(section.truncation?.isSuspiciousRoundNumber).toBe(false);
  });

  it("keeps fare coverage exact (not a lower bound)", () => {
    const section = coverageSection(available([station()]), FARE_FIELDS, {
      countsAreLowerBounds: false,
    });
    expect(section.countsAreLowerBounds).toBe(false);
    expect(section.truncation?.countsAreLowerBounds).toBe(false);
  });
});

// ── Per-operator assembly ───────────────────────────────────────────────────

describe("KAI-290 operator sections", () => {
  it("exposes station/railway/fare sections and the coordinate gap", () => {
    const section = buildOperatorSection({
      operator: "odpt.Operator:TokyoMetro",
      station: available([
        station(),
        station({
          id: "odpt.Station:TokyoMetro.Ginza.Aoyama",
          sameAs: "odpt.Station:TokyoMetro.Ginza.Aoyama",
          coordinates: null,
        }),
      ]),
      railway: available([railway()]),
      fare: available([{ id: "odpt.RailwayFare:X", ticketFare: 170 }]),
      fareProbe: {
        fromStation: "odpt.Station:TokyoMetro.Ginza.Shibuya",
        toStation: "odpt.Station:TokyoMetro.Ginza.OmoteSando",
        railway: "odpt.Railway:TokyoMetro.Ginza",
      },
    });
    expect(section.station.recordCount).toBe(2);
    expect(section.railway.recordCount).toBe(1);
    expect(section.railwayFare.countsAreLowerBounds).toBe(false);
    expect(section.missingCoordinateStationIds).toEqual({
      count: 1,
      truncated: false,
      ids: ["odpt.Station:TokyoMetro.Ginza.Aoyama"],
    });
  });

  it("marks budget-exhausted sections as skipped, not as zero-coverage", () => {
    const section = buildOperatorSection({
      operator: "odpt.Operator:JR-East",
      station: { state: "skipped", reason: "budget_exhausted" },
      railway: { state: "skipped", reason: "budget_exhausted" },
      fare: { state: "skipped", reason: "budget_exhausted" },
      fareProbe: null,
    });
    expect(section.station.state).toBe("skipped");
    expect(section.station.recordCount).toBeNull();
    expect(section.missingCoordinateStationIds).toBeNull();
  });

  it("derives the coordinate-gap and round-number findings", () => {
    const gap = buildOperatorSection({
      operator: "odpt.Operator:JR-East",
      station: available([
        station({ coordinates: null }),
        station({ id: "b", sameAs: "b", coordinates: null }),
      ]),
      railway: available([], { recordCount: 500 }),
      fare: { state: "skipped", reason: "no_fare_probe" },
      fareProbe: null,
    });
    const findings = deriveFindings([gap]);
    expect(findings).toContainEqual({
      kind: "station_coordinates_missing",
      operator: "odpt.Operator:JR-East",
      missing: 2,
      total: 2,
    });
    expect(findings).toContainEqual({
      kind: "suspicious_round_number_railway_count",
      operator: "odpt.Operator:JR-East",
      count: 500,
    });
  });

  it("caps the missing-coordinate id list", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      station({ id: `s-${i}`, sameAs: `s-${i}`, coordinates: null }),
    );
    const capped = missingCoordinateIds(records, 2);
    expect(capped.count).toBe(5);
    expect(capped.truncated).toBe(true);
    expect(capped.ids).toEqual(["s-0", "s-1"]);
  });

  it("derives the fare probe from the first railway with two stations", () => {
    const probe = deriveFareProbe([
      railway({ stationOrder: [{ index: 0, station: "only-one" }] }),
      railway({
        id: "odpt.Railway:TokyoMetro.Marunouchi",
        stationOrder: [
          { index: 0, station: "odpt.Station:TokyoMetro.Marunouchi.A" },
          { index: 1, station: "odpt.Station:TokyoMetro.Marunouchi.B" },
        ],
      }),
    ]);
    expect(probe).toEqual({
      fromStation: "odpt.Station:TokyoMetro.Marunouchi.A",
      toStation: "odpt.Station:TokyoMetro.Marunouchi.B",
      railway: "odpt.Railway:TokyoMetro.Marunouchi",
    });
    expect(deriveFareProbe([])).toBeNull();
  });
});

// ── Artifact construction + determinism ─────────────────────────────────────

describe("KAI-290 buildCoverageArtifact", () => {
  const makeSection = (operator: string) =>
    buildOperatorSection({
      operator,
      station: available([station()]),
      railway: available([railway()]),
      fare: { state: "skipped", reason: "no_fare_probe" },
      fareProbe: null,
    });

  it("sorts operators deterministically and fixes top-level key order", () => {
    const artifact = buildCoverageArtifact({
      generatedAt: "1970-01-01T00:00:00.000Z",
      operators: [
        makeSection("odpt.Operator:Toei"),
        makeSection("odpt.Operator:JR-East"),
      ],
      referenceProbes: [
        buildPendingEntry("operator", {
          state: "available",
          outcome: "records",
          recordCount: 176,
        }),
      ],
      requestBudget: {
        maxRequests: 40,
        requestsMade: 9,
        delayMs: 400,
        budgetExhausted: false,
        rateLimitHalted: false,
      },
      sourceUrlSample: "https://api.odpt.org/x",
      checks: { noCredentialLeak: true },
    });
    expect(
      artifact.operators.map(
        (section: { operator: string }) => section.operator,
      ),
    ).toEqual(["odpt.Operator:JR-East", "odpt.Operator:Toei"]);
    expect(Object.keys(artifact)).toEqual([
      "schemaVersion",
      "tool",
      "generatedAt",
      "boundaryUrl",
      "boundaryOnly",
      "countsAreLowerBounds",
      "requestBudget",
      "sourceUrlSample",
      "calendar",
      "operators",
      "referenceProbes",
      "findings",
      "checks",
    ]);
    expect(artifact.checks.boundaryOnly).toBe(true);
  });

  it("stableStringify emits keys in byte order at every level", () => {
    const a = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    const b = stableStringify({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("formatTable matches Prettier's column padding and alignment markers", () => {
    expect(
      formatTable(
        ["A", "B", "C"],
        ["left", "right", "center"],
        [
          ["xxxxxxx", "5", "mid"],
          ["yy", "123456", "longerheader"],
        ],
      ),
    ).toEqual([
      "| A       |      B |      C       |",
      "| ------- | -----: | :----------: |",
      "| xxxxxxx |      5 |     mid      |",
      "| yy      | 123456 | longerheader |",
    ]);
  });

  it("buildPendingEntry records pending operations with evidence", () => {
    const entry = buildPendingEntry("calendar", { state: "pending" });
    expect(entry).toEqual({
      operation: "calendar",
      state: "pending",
      evidence: "unsupported_operation (HTTP 400) — pending deployment",
    });
  });
});

// ── Safety + rendering ──────────────────────────────────────────────────────

describe("KAI-290 safety + summary", () => {
  it("detects credential-like content", () => {
    expect(containsCredentialLike("?acl:consumerKey=deadbeef")).toBe(true);
    expect(containsCredentialLike('{"consumerKey":"x"}')).toBe(true);
    expect(containsCredentialLike("odpt:operator=odpt.Operator:Toei")).toBe(
      false,
    );
    expect(containsCredentialLike("")).toBe(false);
  });

  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfterSeconds("600")).toBe(600);
    expect(parseRetryAfterSeconds("0")).toBe(0);
    expect(parseRetryAfterSeconds("")).toBe(0);
    expect(parseRetryAfterSeconds(null as unknown as string)).toBe(0);
    expect(
      parseRetryAfterSeconds("Wed, 21 Oct 2099 07:28:00 GMT"),
    ).toBeGreaterThan(0);
  });

  it("renders a Markdown summary with the coverage table and reference probes", () => {
    const artifact = buildCoverageArtifact({
      generatedAt: "1970-01-01T00:00:00.000Z",
      operators: [
        buildOperatorSection({
          operator: "odpt.Operator:TokyoMetro",
          station: available([station()]),
          railway: available([railway()]),
          fare: { state: "skipped", reason: "no_fare_probe" },
          fareProbe: null,
          timetable: {
            ...buildTimetableSection({
              trainType: available([]),
              railDirection: available([{ title: "Local" }]),
              stationTimetable: [
                {
                  scope: { station: "odpt.Station:X" },
                  descriptor: {
                    state: "available",
                    outcome: "error",
                    errorCode: "provider_response_too_large",
                    recordCount: 0,
                  },
                },
              ],
            }),
            scope: {
              stations: ["odpt.Station:X"],
              railways: ["odpt.Railway:X"],
            },
          },
        }),
      ],
      referenceProbes: [
        buildPendingEntry("operator", {
          state: "available",
          outcome: "records",
          recordCount: 176,
        }),
      ],
      requestBudget: {
        maxRequests: 40,
        requestsMade: 3,
        delayMs: 400,
        budgetExhausted: false,
        rateLimitHalted: false,
      },
      sourceUrlSample: "https://api.odpt.org/x",
      checks: { noCredentialLeak: true },
    });
    const markdown = renderMarkdown(artifact);
    expect(markdown).toContain("# KAI-290 — ODPT operator coverage audit");
    expect(markdown).toContain("| odpt.Operator:TokyoMetro |");
    expect(markdown).toContain("100.0%");
    expect(markdown).toContain("## Provider-wide reference resources");
    expect(markdown).toContain("No credential in any response: pass");
    // A `too_large` probe must be rendered as unknown, never as an absence.
    expect(markdown).toContain("**too_large**");
    expect(markdown).not.toContain("too_large** — 0 record");
  });
});

// ── Import safety ───────────────────────────────────────────────────────────

describe("KAI-290 PR 2 probe classification", () => {
  it("treats a successful zero-record answer as proven empty", () => {
    const result = classifyProbeResult({
      state: "available",
      outcome: "records",
      recordCount: 0,
    });
    expect(result.state).toBe(PROBE_EMPTY);
    expect(result.recordCount).toBe(0);
    expect(result.note).toContain("successful zero-record");
  });

  it("treats records as conclusive positive coverage", () => {
    const result = classifyProbeResult({
      state: "available",
      outcome: "records",
      recordCount: 277,
    });
    expect(result.state).toBe(PROBE_RECORDS);
    expect(result.recordCount).toBe(277);
  });

  it("never reports too_large as empty — coverage stays unknown", () => {
    // The live case: operator-wide StationTimetable exceeds the 1MB byte guard.
    const result = classifyProbeResult({
      state: "available",
      outcome: "error",
      errorCode: "provider_response_too_large",
      recordCount: 0,
    });
    expect(result.state).toBe(PROBE_TOO_LARGE);
    expect(result.state).not.toBe(PROBE_EMPTY);
    expect(result.note).toContain("unknown, not empty");
    expect(isConclusiveProbe(result.state)).toBe(false);
  });

  it("treats a provider error outcome as unknown, not empty", () => {
    const result = classifyProbeResult({
      state: "available",
      outcome: "error",
      errorCode: "provider_unavailable",
      recordCount: 0,
    });
    expect(result.state).toBe(PROBE_ERROR);
    expect(isConclusiveProbe(result.state)).toBe(false);
  });

  it("treats skipped/invalid/rate-limited probes as unavailable", () => {
    for (const descriptor of [
      { state: "skipped", reason: "budget_exhausted" },
      { state: "invalid", error: "invalid_station" },
      { state: "rate_limited", httpStatus: 429 },
      { state: "pending", error: "unsupported_operation" },
    ]) {
      const result = classifyProbeResult(descriptor);
      expect(result.state).toBe(PROBE_UNAVAILABLE);
      expect(isConclusiveProbe(result.state)).toBe(false);
    }
    expect(classifyProbeResult(null).state).toBe(PROBE_UNAVAILABLE);
  });

  it("marks coverage unknown when any probe is inconclusive", () => {
    const section = buildTimetableSection({
      trainType: { state: "available", outcome: "records", recordCount: 12 },
      railDirection: {
        state: "available",
        outcome: "error",
        errorCode: "provider_response_too_large",
        recordCount: 0,
      },
      stationTimetable: [
        {
          scope: { station: "odpt.Station:A" },
          descriptor: {
            state: "available",
            outcome: "records",
            recordCount: 4,
          },
        },
      ],
      trainTimetable: [],
    });
    expect(section.conclusiveProbes).toBe(2);
    expect(section.totalProbes).toBe(3);
    expect(section.coverageKnown).toBe(false);
    // The per-station detail survives, so the reader can see WHICH probe failed.
    expect(section.stationTimetable.results[0].state).toBe(PROBE_RECORDS);
    expect(section.railDirection.state).toBe(PROBE_TOO_LARGE);
  });

  it("marks coverage known only when every probe is conclusive", () => {
    const section = buildTimetableSection({
      trainType: { state: "available", outcome: "records", recordCount: 12 },
      railDirection: { state: "available", outcome: "records", recordCount: 3 },
      stationTimetable: [
        {
          scope: { station: "odpt.Station:A" },
          descriptor: {
            state: "available",
            outcome: "records",
            recordCount: 0,
          },
        },
        {
          scope: { station: "odpt.Station:B" },
          descriptor: {
            state: "available",
            outcome: "records",
            recordCount: 0,
          },
        },
      ],
      trainTimetable: [],
    });
    expect(section.coverageKnown).toBe(true);
    expect(section.stationTimetable.conclusiveCount).toBe(2);
    expect(section.stationTimetable.byState).toEqual({ empty: 2 });
  });

  it("derives bounded probe scopes from the operator's own records", () => {
    const scopes = deriveTimetableScopes({
      station: available([
        { id: "odpt.Station:JR-East.Keiyo.Tokyo", title: "東京" },
      ]),
      railway: available([{ sameAs: "odpt.Railway:JR-East.Keiyo" }]),
    });
    expect(scopes.station).toBe("odpt.Station:JR-East.Keiyo.Tokyo");
    expect(scopes.railway).toBe("odpt.Railway:JR-East.Keiyo");
    expect(scopes.stationName).toBe("東京");
  });

  it("returns null scopes when the operator has no records to scope from", () => {
    const scopes = deriveTimetableScopes({
      station: {
        state: "available",
        outcome: "records",
        recordCount: 0,
        records: [],
      },
      railway: {
        state: "available",
        outcome: "records",
        recordCount: 0,
        records: [],
      },
    });
    expect(scopes.station).toBeNull();
    expect(scopes.railway).toBeNull();
    expect(deriveTimetableScopes().station).toBeNull();
  });
});

// ── Import safety ───────────────────────────────────────────────────────────

describe("KAI-290 import safety", () => {
  it("performs no I/O or fetch on import", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    await import("../kai-290-odpt-coverage.mjs");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
});
