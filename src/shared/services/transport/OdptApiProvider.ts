/**
 * KAI-289 — browser-side adapter for the Meguruto server endpoint /api/odpt.
 *
 * The ODPT credential NEVER reaches the browser: this adapter talks to the
 * Pages Function, which holds `ODPT_API_KEY` server-side and returns
 * Meguruto's canonical normalized ODPT evidence.
 *
 * The adapter is deliberately thin. It sends only an allow-listed operation
 * plus narrow filters; it cannot express a provider URL, an `rdf:type`, an
 * arbitrary query object or a consumer key, because the request shape has no
 * field for them.
 */

import type {
  OdptCalendar,
  OdptCalendarQuery,
  OdptDatapointQuery,
  OdptDatapointResource,
  OdptErrorCode,
  OdptNearbyStationsInput,
  OdptOperator,
  OdptOperatorQuery,
  OdptOutcome,
  OdptProvider,
  OdptRailDirection,
  OdptRailDirectionQuery,
  OdptRailway,
  OdptRailwayFare,
  OdptRailwayFareQuery,
  OdptRailwayQuery,
  OdptResult,
  OdptStation,
  OdptStationQuery,
  OdptStationTimetable,
  OdptStationTimetableQuery,
  OdptTrainTimetable,
  OdptTrainTimetableQuery,
  OdptTrainType,
  OdptTrainTypeQuery,
} from "./OdptProvider";

export const ODPT_API_ENDPOINT = "/api/odpt";
export const ODPT_API_TIMEOUT_MS = 12_000;

const ODPT_OUTCOMES: ReadonlySet<string> = new Set([
  "records",
  "no_data",
  "error",
]);

type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResult<T>(operation: string, errorCode: string): OdptResult<T> {
  return {
    provider: "odpt",
    operation,
    outcome: "error",
    records: [],
    recordCount: 0,
    errorCode,
    retrievedAt: new Date().toISOString(),
    sourceResource: "unknown",
    sourceUrl: "",
    normalization: "odpt-api-v4.16",
  };
}

function parseResult<T>(value: unknown, operation: string): OdptResult<T> {
  if (!isRecord(value))
    return errorResult<T>(operation, "invalid_provider_response");

  const outcome = value.outcome;
  if (typeof outcome !== "string" || !ODPT_OUTCOMES.has(outcome)) {
    return errorResult<T>(operation, "invalid_provider_response");
  }

  const records = Array.isArray(value.records) ? (value.records as T[]) : [];
  if (outcome === "records" && !Array.isArray(value.records)) {
    return errorResult<T>(operation, "invalid_provider_response");
  }

  return {
    provider: "odpt",
    operation:
      typeof value.operation === "string" ? value.operation : operation,
    outcome: outcome as OdptOutcome,
    records,
    recordCount:
      typeof value.recordCount === "number" &&
      Number.isFinite(value.recordCount)
        ? value.recordCount
        : records.length,
    errorCode:
      typeof value.errorCode === "string"
        ? (value.errorCode as OdptErrorCode)
        : undefined,
    retrievedAt:
      typeof value.retrievedAt === "string"
        ? value.retrievedAt
        : new Date().toISOString(),
    sourceResource:
      typeof value.sourceResource === "string"
        ? value.sourceResource
        : "unknown",
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : "",
    normalization:
      typeof value.normalization === "string" ? value.normalization : "unknown",
  };
}

/**
 * OdptProvider backed by the server-side /api/odpt boundary.
 *
 * CACHING BOUNDARY — the adapter itself performs NO caching, deliberately:
 *
 * - The `/api/odpt` boundary now provides request protection (dedup,
 *   in-flight coalescing, edge cache, validity-capped TTLs and the per-attempt
 *   provider budget) server-side, where the shared credential lives. A
 *   browser-side cache would protect nothing collectively: it would multiply
 *   per user, and a cold client would still hit the provider.
 * - This adapter must therefore NOT add another browser cache. Doing so would
 *   layer a second, differently-keyed store in front of the authoritative
 *   server contract and make cache behaviour impossible to reason about.
 */
export class OdptApiProvider implements OdptProvider {
  private readonly endpoint: string;
  private readonly fetchImpl: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(
    options: {
      readonly endpoint?: string;
      readonly fetchImpl?: FetchImplementation;
      readonly timeoutMs?: number;
    } = {},
  ) {
    this.endpoint = options.endpoint ?? ODPT_API_ENDPOINT;
    this.fetchImpl =
      options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? ODPT_API_TIMEOUT_MS;
  }

  nearbyStations(
    input: OdptNearbyStationsInput,
  ): Promise<OdptResult<OdptStation>> {
    return this.invoke<OdptStation>("nearby_stations", {
      lat: input.lat,
      lon: input.lon,
      radius: input.radius,
    });
  }

  station(input: OdptStationQuery): Promise<OdptResult<OdptStation>> {
    return this.invoke<OdptStation>("station", { ...input });
  }

  railway(input: OdptRailwayQuery): Promise<OdptResult<OdptRailway>> {
    return this.invoke<OdptRailway>("railway", { ...input });
  }

  railwayFare(
    input: OdptRailwayFareQuery,
  ): Promise<OdptResult<OdptRailwayFare>> {
    return this.invoke<OdptRailwayFare>("railway_fare", { ...input });
  }

  datapoint(
    input: OdptDatapointQuery,
  ): Promise<OdptResult<OdptDatapointResource>> {
    return this.invoke<OdptDatapointResource>("datapoint", {
      dataUri: input.dataUri,
    });
  }

  // KAI-290 operations. Each sends only its allow-listed fields; the server
  // boundary re-validates and rejects anything else.

  calendar(input: OdptCalendarQuery = {}): Promise<OdptResult<OdptCalendar>> {
    return this.invoke<OdptCalendar>("calendar", { ...input });
  }

  operator(input: OdptOperatorQuery = {}): Promise<OdptResult<OdptOperator>> {
    return this.invoke<OdptOperator>("operator", { ...input });
  }

  trainType(input: OdptTrainTypeQuery): Promise<OdptResult<OdptTrainType>> {
    return this.invoke<OdptTrainType>("train_type", { ...input });
  }

  railDirection(
    input: OdptRailDirectionQuery,
  ): Promise<OdptResult<OdptRailDirection>> {
    return this.invoke<OdptRailDirection>("rail_direction", { ...input });
  }

  stationTimetable(
    input: OdptStationTimetableQuery,
  ): Promise<OdptResult<OdptStationTimetable>> {
    return this.invoke<OdptStationTimetable>("station_timetable", { ...input });
  }

  trainTimetable(
    input: OdptTrainTimetableQuery,
  ): Promise<OdptResult<OdptTrainTimetable>> {
    return this.invoke<OdptTrainTimetable>("train_timetable", { ...input });
  }

  private async invoke<T>(
    operation: string,
    body: Record<string, unknown>,
  ): Promise<OdptResult<T>> {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ operation, ...body }),
        signal: controller.signal,
      });
    } catch (error) {
      return errorResult<T>(
        operation,
        error !== null &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "AbortError"
          ? "provider_timeout"
          : "network_error",
      );
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    if (!response.ok) {
      // Status-class failures are classified BEFORE attempting to parse the
      // body, mirroring `functions/api/car-route-core.js`: a non-JSON or empty
      // error body must never turn a known status into a generic HTTP code.
      if (response.status === 429) {
        return errorResult<T>(operation, "rate_limited");
      }
      if (response.status === 405) {
        return errorResult<T>(operation, "method_not_allowed");
      }
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      const record = isRecord(payload) ? payload : undefined;
      const code =
        record !== undefined && typeof record.error === "string"
          ? record.error
          : `provider_http_${response.status}`;
      return errorResult<T>(operation, code);
    }

    try {
      payload = await response.json();
    } catch {
      return errorResult<T>(operation, "invalid_provider_response");
    }

    return parseResult<T>(payload, operation);
  }
}

export function createOdptApiProvider(
  options?: ConstructorParameters<typeof OdptApiProvider>[0],
): OdptProvider {
  return new OdptApiProvider(options);
}
