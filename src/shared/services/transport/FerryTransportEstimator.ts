import ferryData from "../../data/ferry-estimates.json";
import { getBestEstimateBetween, getDistanceKm } from "./TransportEstimator";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "./TransportTopologyService";
import type { Destination } from "../../types/destination";
import type { Season } from "@/shared/utils/season";
import type {
  FerryOperatingPeriod,
  FerryPort,
  FerryService,
  FerryTemporalContext,
  Location,
  TransportEstimate,
} from "./types";

const ports: FerryPort[] = ferryData.ports;
// JSON arrays are inferred as number[], cast to tuple explicitly.
const services: FerryService[] = (
  ferryData.services as unknown as Array<
    Omit<FerryService, "durationMinutes" | "fare"> & {
      durationMinutes: number[];
      fare: number[] | null;
    }
  >
).map((s) => ({
  ...s,
  durationMinutes: [s.durationMinutes[0], s.durationMinutes[1]] as [
    number,
    number,
  ],
  fare: s.fare === null ? null : ([s.fare[0], s.fare[1]] as [number, number]),
})) as FerryService[];

const portById = new Map<string, FerryPort>();
for (const p of ports) portById.set(p.id, p);

/** Maximum km from an origin to a candidate departure port. */
const ORIGIN_PORT_CATCHMENT_KM = 300;

/** Buffer for check-in, boarding, and unloading at both ports. */
const FERRY_BUFFER_MINUTES = 30;

/**
 * Conservative annual intervals for season-only evaluation. A service is
 * only claimed available for a season when the entire season falls inside
 * its operating period / fare window.
 */
const SEASON_INTERVALS: Record<Season, { from: string; to: string }> = {
  spring: { from: "03-01", to: "05-31" },
  summer: { from: "06-01", to: "08-31" },
  autumn: { from: "09-01", to: "11-30" },
  winter: { from: "12-01", to: "02-28" },
};

/**
 * Directional match: a service serves from→to directly, and additionally
 * to→from only when the published service supports the reverse direction.
 */
export function serviceMatchesDirection(
  service: FerryService,
  fromPortId: string,
  toPortId: string,
): boolean {
  if (service.fromPort === fromPortId && service.toPort === toPortId) {
    return true;
  }
  return (
    service.bidirectional === true &&
    service.fromPort === toPortId &&
    service.toPort === fromPortId
  );
}

function monthDay(date: Date): number {
  return (date.getMonth() + 1) * 100 + date.getDate();
}

function parseMonthDay(value: string): number {
  const [month, day] = value.split("-").map((part) => Number(part));
  return month * 100 + day;
}

function periodContains(period: FerryOperatingPeriod, md: number): boolean {
  const from = parseMonthDay(period.from);
  const to = parseMonthDay(period.to);
  if (from <= to) return md >= from && md <= to;
  // Period wraps a year boundary (e.g. 11-01 → 03-31).
  return md >= from || md <= to;
}

/**
 * A single date inside a period, honoring weekday and exclusion
 * constraints. A constrained period can never be confirmed for a
 * season-only context, so the caller fails conservatively.
 */
function periodDateActive(period: FerryOperatingPeriod, date: Date): boolean {
  const md = monthDay(date);
  if (!periodContains(period, md)) return false;
  if (
    period.excludeDates &&
    period.excludeDates.some((excluded) => parseMonthDay(excluded) === md)
  ) {
    return false;
  }
  if (period.weekdays && !period.weekdays.includes(date.getDay())) {
    return false;
  }
  return true;
}

/**
 * Operating availability against the canonical temporal input. Never reads
 * the system clock: no travelDate/season means a seasonally restricted
 * service cannot be verified and is treated as unavailable.
 */
export function isServiceActive(
  service: FerryService,
  temporal: FerryTemporalContext = {},
): boolean {
  if (service.passengerService !== true) return false;
  if (!service.operatingPeriods || service.operatingPeriods.length === 0) {
    return true;
  }
  if (temporal.travelDate) {
    return service.operatingPeriods.some((period) =>
      periodDateActive(period, temporal.travelDate!),
    );
  }
  if (temporal.season) {
    const { from, to } = SEASON_INTERVALS[temporal.season];
    // Conservative: the entire season must fall inside ONE operating
    // period with no weekday/exclusion constraints — a constrained period
    // cannot be confirmed for a season span.
    return service.operatingPeriods.some(
      (period) =>
        !period.weekdays &&
        !period.excludeDates &&
        periodContains(period, parseMonthDay(from)) &&
        periodContains(period, parseMonthDay(to)),
    );
  }
  return false;
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  // Local noon avoids timezone drift on month/day comparisons.
  return new Date(year, month - 1, day, 12, 0, 0);
}

function seasonStartDate(season: Season, year: number): Date {
  if (season === "winter") {
    // Winter spans Dec of the previous year through February of `year`.
    return new Date(year - 1, 11, 1, 12);
  }
  const [month, day] = SEASON_INTERVALS[season].from.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function seasonEndDate(season: Season, year: number): Date {
  const [month, day] = SEASON_INTERVALS[season].to.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

/**
 * Fare applicability against the canonical temporal input. A fare with a
 * validity window is only applied when the travel date falls inside it (or,
 * conservatively, when the whole planned season does). Outside the window —
 * or with no temporal context at all — the fare is not reused: the route
 * stays available but the cost is unavailable.
 */
export function isFareValid(
  service: FerryService,
  temporal: FerryTemporalContext = {},
): boolean {
  if (service.fare === null) return false;
  if (!service.fareValidFrom || !service.fareValidTo) {
    // Open-ended "valid since" window (e.g. a fare revision): a from-only
    // window applies from that date onward; a to-only or absent window
    // keeps the fare always valid.
    if (service.fareValidFrom && !service.fareValidTo) {
      const from = parseIsoDate(service.fareValidFrom);
      if (temporal.travelDate) {
        return temporal.travelDate >= from;
      }
      if (temporal.season) {
        // Conservative: the whole season must start after the revision.
        return seasonStartDate(temporal.season, from.getFullYear()) >= from;
      }
      return false;
    }
    return true;
  }
  const from = parseIsoDate(service.fareValidFrom);
  const to = parseIsoDate(service.fareValidTo);
  if (temporal.travelDate) {
    const travel = temporal.travelDate;
    return travel >= from && travel <= to;
  }
  if (temporal.season) {
    const year = from.getFullYear();
    return (
      seasonStartDate(temporal.season, year) >= from &&
      seasonEndDate(temporal.season, year) <= to
    );
  }
  return false;
}

/**
 * All verified passenger services between two ports for a temporal context,
 * respecting directionality and operating availability. Fare validity is not
 * a selection filter: an expired fare keeps the route available (the
 * estimate then carries costUnavailable).
 */
export function getFerryServices(
  fromPortId: string,
  toPortId: string,
  temporal: FerryTemporalContext = {},
): FerryService[] {
  return services.filter(
    (service) =>
      serviceMatchesDirection(service, fromPortId, toPortId) &&
      isServiceActive(service, temporal),
  );
}

export function findPortById(portId: string): FerryPort | null {
  return portById.get(portId) ?? null;
}

/**
 * True when verified seasonal operating periods restrict ferry access to the
 * arrival port on the given date. Only services with published operating
 * periods count as evidence: a port with period-less services is never
 * claimed seasonally unavailable, and a port with no passenger services at
 * all is not ferry-reachable (no seasonal claim either way).
 */
export function isDestinationFerrySeasonallyUnavailable(
  arrPortId: string,
  travelDate: Date,
): boolean {
  const servicesToPort = services.filter(
    (service) => service.toPort === arrPortId && service.passengerService,
  );
  if (servicesToPort.length === 0) return false;
  const seasonalServices = servicesToPort.filter(
    (service) => (service.operatingPeriods?.length ?? 0) > 0,
  );
  if (seasonalServices.length === 0) return false;
  return !servicesToPort.some((service) =>
    isServiceActive(service, { travelDate }),
  );
}

/**
 * True when verified passenger ferry services can cover the WHOLE trip for
 * the given travel dates: the outbound leg must operate on the first date
 * and the return leg on the last date (same day for day trips, Day 2 for
 * 2D1N). Directionality is respected via serviceMatchesDirection: a
 * one-way service only serves its published direction; a bidirectional
 * service serves both. Only candidate departure ports inside the origin
 * catchment count, and the arrival port is the destination's nearest port.
 */
export function isFerryTripAvailable(
  dest: Destination,
  homeCoords: { lat: number; lng: number },
  travelDates: readonly Date[],
): boolean {
  if (!dest.coordinates || travelDates.length === 0) return false;
  const originZoneId = resolveOriginTransportZone({ coordinates: homeCoords });
  if (originZoneId === "unknown") return false;
  const destinationZoneId = resolveDestinationTransportZone(dest);
  if (destinationZoneId === "unknown") return false;
  const arrivalPort = findArrivalFerryPort(dest);
  if (!arrivalPort) return false;

  const depPorts = ports.filter(
    (port) =>
      port.zoneId === originZoneId &&
      getDistanceKm(
        homeCoords.lat,
        homeCoords.lng,
        port.coordinates.lat,
        port.coordinates.lng,
      ) <= ORIGIN_PORT_CATCHMENT_KM,
  );

  const outboundDate = travelDates[0];
  const returnDate = travelDates[travelDates.length - 1];
  for (const depPort of depPorts) {
    if (
      getFerryServices(depPort.id, arrivalPort.id, {
        travelDate: outboundDate,
      }).length === 0
    ) {
      continue;
    }
    if (
      getFerryServices(arrivalPort.id, depPort.id, {
        travelDate: returnDate,
      }).length === 0
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * The destination's arrival port: the nearest port in the destination's
 * transport zone.
 */
export function findArrivalFerryPort(dest: Destination): FerryPort | null {
  if (!dest.coordinates) return null;
  const destinationZoneId = resolveDestinationTransportZone(dest);
  if (destinationZoneId === "unknown") return null;

  let best: { port: FerryPort; distKm: number } | null = null;
  for (const port of ports) {
    if (port.zoneId !== destinationZoneId) continue;
    const distKm = getDistanceKm(
      dest.coordinates.lat,
      dest.coordinates.lng,
      port.coordinates.lat,
      port.coordinates.lng,
    );
    if (!best || distKm < best.distKm) {
      best = { port, distKm };
    }
  }
  return best?.port ?? null;
}

function buildFerryEstimate(
  dest: Destination,
  homeCoords: { lat: number; lng: number },
  depPort: FerryPort,
  arrPort: FerryPort,
  service: FerryService,
  fareValid: boolean,
): TransportEstimate {
  const homeLoc: Location = { coordinates: homeCoords };
  // Guarded by getFerryTransportEstimate before any call.
  const destCoords = dest.coordinates!;
  const destLoc: Location = {
    name: dest.name,
    coordinates: { lat: destCoords.lat, lng: destCoords.lng },
  };
  const depLoc: Location = {
    name: depPort.name,
    coordinates: depPort.coordinates,
  };
  const arrLoc: Location = {
    name: arrPort.name,
    coordinates: arrPort.coordinates,
  };

  const originAccess = getBestEstimateBetween(homeLoc, depLoc);
  const destAccess = getBestEstimateBetween(arrLoc, destLoc);

  const minTime =
    originAccess.timeRange[0] +
    FERRY_BUFFER_MINUTES +
    service.durationMinutes[0] +
    destAccess.timeRange[0];
  const maxTime =
    originAccess.timeRange[1] +
    FERRY_BUFFER_MINUTES +
    service.durationMinutes[1] +
    destAccess.timeRange[1];

  // fareBasis shapes the cost semantics: a one-way fare is doubled for the
  // return trip; a round-trip fare is already the return journey. An
  // expired or unverified fare is never reused: cost is unavailable.
  const roundTripBasis = service.fareBasis === "round-trip";
  const costUnavailable = !fareValid;
  const minCost = costUnavailable
    ? 0
    : roundTripBasis
      ? (originAccess.costRange[0] + destAccess.costRange[0]) * 2 +
        service.fare![0]
      : originAccess.costRange[0] + service.fare![0] + destAccess.costRange[0];
  const maxCost = costUnavailable
    ? 0
    : roundTripBasis
      ? (originAccess.costRange[1] + destAccess.costRange[1]) * 2 +
        service.fare![1]
      : originAccess.costRange[1] + service.fare![1] + destAccess.costRange[1];

  return {
    mode: "ferry",
    label: "Ferry",
    available: true,
    recommended: false,
    timeRange: [minTime, maxTime],
    costUnavailable,
    costRange: [minCost, maxCost],
    source: "dataset",
    details: {
      departurePortName: depPort.name,
      arrivalPortName: arrPort.name,
      operator: service.operator,
      serviceName: service.serviceName ?? service.operator,
      ferryFareBasis: service.fareBasis,
      originAccessTimeRange: originAccess.timeRange,
      destAccessTimeRange: destAccess.timeRange,
      ferryNotes: service.notes,
      /**
       * KAI-216: the verified service fare (per person, one-way or
       * round-trip per fareBasis) WITHOUT access-leg costs. Present only
       * when the fare is currently valid AND its fareStatus is not
       * "unverified"; null when unverified/expired/missing. Canonical
       * budget consumers use this instead of the door-to-door costRange
       * (which mixes in generic access-leg estimates).
       */
      verifiedFare:
        costUnavailable || service.fareStatus === "unverified"
          ? null
          : service.fare,
      verifiedFareStatus:
        costUnavailable || service.fareStatus === "unverified"
          ? "unverified"
          : "verified",
    },
  };
}

/** Prefers faster, then cost-available, then cheaper. */
function isBetterCandidate(
  candidate: TransportEstimate,
  best: TransportEstimate,
): boolean {
  if (candidate.timeRange[0] !== best.timeRange[0]) {
    return candidate.timeRange[0] < best.timeRange[0];
  }
  if (candidate.costUnavailable !== best.costUnavailable) {
    return !candidate.costUnavailable;
  }
  return candidate.costRange[0] < best.costRange[0];
}

/**
 * Door-to-door ferry estimate for a destination.
 *
 * Selection: every origin-zone port inside the catchment is a candidate;
 * only candidates with a verified, operating passenger service to the
 * arrival port survive, each complete service option is evaluated, and the
 * fastest valid candidate wins (ties broken by cost availability, then
 * cost). A nearer port with no route never blocks a farther port with one.
 *
 * Returns null when no verified passenger route connects the origin and
 * destination zones for the temporal context. An operating route whose fare
 * is outside its validity window returns an estimate with costUnavailable.
 */
export function getFerryTransportEstimate(
  dest: Destination,
  homeCoords?: { lat: number; lng: number },
  temporal: FerryTemporalContext = {},
): TransportEstimate | null {
  if (!dest.coordinates || !homeCoords) return null;

  const originZoneId = resolveOriginTransportZone({ coordinates: homeCoords });
  if (originZoneId === "unknown") return null;
  const destinationZoneId = resolveDestinationTransportZone(dest);
  if (destinationZoneId === "unknown") return null;

  const arrPort = findArrivalFerryPort(dest);
  if (!arrPort) return null;

  // Candidate departure ports: every origin-zone port inside the catchment.
  // Route existence authorizes the ferry — including same-zone routes such
  // as Kagoshima → Sakurajima, where both gateways share a zone.
  const candidateDepPorts = ports.filter(
    (port) =>
      port.zoneId === originZoneId &&
      getDistanceKm(
        homeCoords.lat,
        homeCoords.lng,
        port.coordinates.lat,
        port.coordinates.lng,
      ) <= ORIGIN_PORT_CATCHMENT_KM,
  );

  let best: TransportEstimate | null = null;
  for (const depPort of candidateDepPorts) {
    const depServices = getFerryServices(depPort.id, arrPort.id, temporal);
    for (const service of depServices) {
      const estimate = buildFerryEstimate(
        dest,
        homeCoords,
        depPort,
        arrPort,
        service,
        isFareValid(service, temporal),
      );
      if (!best || isBetterCandidate(estimate, best)) {
        best = estimate;
      }
    }
  }
  if (!best) return null;

  // Route existence and gateways already proved connectivity; distance is
  // used only to compare door-to-door times for the `recommended` flag.
  const homeLoc: Location = { coordinates: homeCoords };
  const destLoc: Location = {
    name: dest.name,
    coordinates: { lat: dest.coordinates.lat, lng: dest.coordinates.lng },
  };
  const groundEstimate = getBestEstimateBetween(homeLoc, destLoc);
  return {
    ...best,
    recommended: best.timeRange[0] < groundEstimate.timeRange[0],
  };
}
