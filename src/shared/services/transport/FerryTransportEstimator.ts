import ferryData from "../../data/ferry-estimates.json";
import { getBestEstimateBetween, getDistanceKm } from "./TransportEstimator";
import {
  resolveDestinationTransportZone,
  resolveOriginTransportZone,
} from "./TransportTopologyService";
import type { Destination } from "../../types/destination";
import type {
  FerryOperatingPeriod,
  FerryPort,
  FerryService,
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
 * True when the service runs passengers and the reference date falls inside
 * one of its operating periods (absent periods = year-round).
 */
export function isServiceActive(service: FerryService, refDate: Date): boolean {
  if (service.passengerService !== true) return false;
  if (!service.operatingPeriods || service.operatingPeriods.length === 0) {
    return true;
  }
  const md = monthDay(refDate);
  return service.operatingPeriods.some((period) => periodContains(period, md));
}

/**
 * All verified passenger services between two ports on a given date,
 * respecting directionality and operating periods.
 */
export function getFerryServices(
  fromPortId: string,
  toPortId: string,
  refDate: Date = new Date(),
): FerryService[] {
  return services.filter(
    (service) =>
      serviceMatchesDirection(service, fromPortId, toPortId) &&
      isServiceActive(service, refDate),
  );
}

export function findPortById(portId: string): FerryPort | null {
  return portById.get(portId) ?? null;
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
  // return trip; a round-trip fare is already the return journey.
  const roundTripBasis = service.fareBasis === "round-trip";
  const costUnavailable = service.fare === null;
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
    },
  };
}

/**
 * Door-to-door ferry estimate for a destination.
 *
 * Selection: every origin-zone port inside the catchment is a candidate;
 * only candidates with a verified, active passenger service to the arrival
 * port survive, each complete service option is evaluated, and the fastest
 * valid candidate wins (ties broken by lower cost). A nearer port with no
 * route never blocks a farther port with one.
 *
 * Returns null when no verified passenger route connects the origin and
 * destination zones on the reference date.
 */
export function getFerryTransportEstimate(
  dest: Destination,
  homeCoords?: { lat: number; lng: number },
  refDate: Date = new Date(),
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
    const depServices = getFerryServices(depPort.id, arrPort.id, refDate);
    for (const service of depServices) {
      const estimate = buildFerryEstimate(
        dest,
        homeCoords,
        depPort,
        arrPort,
        service,
      );
      if (
        !best ||
        estimate.timeRange[0] < best.timeRange[0] ||
        (estimate.timeRange[0] === best.timeRange[0] &&
          estimate.costRange[0] < best.costRange[0])
      ) {
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
