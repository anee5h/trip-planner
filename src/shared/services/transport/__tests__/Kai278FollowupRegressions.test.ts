/**
 * KAI-278 follow-up regressions (review blockers on PR #353):
 *
 *   1. Same-origin semantics must reach the traveller-facing DISPLAY
 *      boundary. Cards skip the origin-aware engine call entirely for a
 *      destination that shares the canonical origin anchor (Tokyo Station ->
 *      Tokyo Station) and render "Already there", so a raw 14-19 min local
 *      estimate can never surface as a normal journey. Detail glance/ground
 *      rows use the same shared predicate. Engine estimators are untouched:
 *      corridor/outage/island contracts keep their own semantics.
 *
 *   2. A provider-backed car Journey must hand off to the canonical
 *      route/access anchor (e.g. Karuizawa's verified parking anchor), never
 *      to the catalogue centroid, while preserving catalogue identity.
 */
import { describe, expect, it } from "vitest";
import type { Destination } from "@/shared/types/destination";
import destinations from "@/shared/data/destinations-index.json";
import type { CarAccessAnchor } from "@/shared/types/carAccess";
import { getOriginAwareTransportJourney } from "../JourneyService";
import { buildCarJourney } from "../CarJourneyBuilder";
import { buildJourneyHandoff } from "../JourneyHandoff";
import { getRoutableCarAccessAnchors } from "../CarAccessService";
import { destinationSharesOriginAnchor } from "../JourneyEndpoints";
import type { CarRouteEndpoint, CarRoundTripRoute } from "../CarRouteProvider";

const TOKYO = { lat: 35.6812, lng: 139.7671 };

const tokyoStation = destinations.find(
  (candidate) => candidate.id === "tokyo-station-chiyoda",
) as Destination;
const karuizawa = destinations.find(
  (candidate) => candidate.id === "karuizawa-town",
) as Destination;

describe("KAI-278 same-origin display boundary (Tokyo Station)", () => {
  it("the Tokyo Station destination shares the Tokyo Station origin anchor", () => {
    expect(destinationSharesOriginAnchor(tokyoStation, TOKYO)).toBe(true);
  });

  it("a genuinely displaced anchor is NOT treated as same-origin", () => {
    const displaced = {
      ...tokyoStation,
      coordinates: {
        lat: tokyoStation.coordinates!.lat + 0.001,
        lng: tokyoStation.coordinates!.lng,
      },
    };
    expect(destinationSharesOriginAnchor(displaced, TOKYO)).toBe(false);
  });

  it("an area destination (Naha City) at identical coordinates keeps local-access semantics", () => {
    const nahaCity = destinations.find(
      (candidate) => candidate.id === "naha-city",
    ) as Destination;
    expect(destinationSharesOriginAnchor(nahaCity, nahaCity.coordinates)).toBe(
      false,
    );
  });

  it("the canonical same-anchor Journey is zero minutes and forbids an external handoff", () => {
    const journey = getOriginAwareTransportJourney(
      tokyoStation,
      { homeStationCoords: TOKYO },
      ["train"],
    );
    expect(journey).not.toBeNull();
    expect(journey!.legs[0].duration.minutes).toEqual([0, 0]);
    expect(journey!.externalHandoff.supported).toBe(false);
    expect(journey!.externalHandoff.reason).toBe("same_anchor");
  });
});

describe("KAI-278 provider-backed car handoff uses the route/access anchor", () => {
  function anchorEndpoint(anchor: CarAccessAnchor): CarRouteEndpoint {
    return {
      id: anchor.id,
      label: anchor.label,
      coordinates: anchor.coordinates!,
      kind: anchor.kind,
      accessAnchorId: anchor.id,
    };
  }

  function karuizawaRoute(anchor: CarAccessAnchor): CarRoundTripRoute {
    const access = anchorEndpoint(anchor);
    const toll = {
      state: "priced" as const,
      amountJPY: 1300,
      basis: "ETC" as const,
    };
    const facts = {
      provider: "kai-278-fixture",
      distanceKm: 142,
      durationMinutes: 148,
      toll,
      confidence: "verified" as const,
      completeness: "complete" as const,
      retrievedAt: "2026-09-07T00:00:00.000Z",
    };
    return {
      outbound: {
        ...facts,
        availability: "available" as const,
        direction: "outbound" as const,
        origin: TOKYO,
        originEndpoint: {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: TOKYO,
        },
        destination: access,
        accessAnchor: access,
      },
      returnRoute: {
        ...facts,
        availability: "available" as const,
        direction: "return" as const,
        origin: anchor.coordinates!,
        originEndpoint: access,
        destination: {
          id: "origin",
          label: "Trip origin",
          kind: "origin",
          coordinates: TOKYO,
        },
        accessAnchor: access,
      },
    };
  }

  it("journey destination is the parking anchor with catalogue identity preserved", () => {
    const anchor = getRoutableCarAccessAnchors(karuizawa).find(
      (candidate) => candidate.id === "karuizawa-old-new-area-parking",
    );
    expect(anchor).toBeDefined();
    const journey = buildCarJourney(
      karuizawa,
      TOKYO,
      karuizawaRoute(anchor!),
      undefined,
      "my_car",
    );
    expect(journey).not.toBeNull();

    const destination = journey!.destination;
    expect(destination.id).toBe("karuizawa-town");
    expect(destination.name).toBe("Karuizawa Town");
    expect(destination.kind).toBe("access_anchor");
    expect(destination.coordinates).toEqual(anchor!.coordinates);
    expect(destination.coordinates!.lat).not.toBeCloseTo(
      karuizawa.coordinates!.lat,
      3,
    );
    expect(destination.coordinates!.lng).not.toBeCloseTo(
      karuizawa.coordinates!.lng,
      3,
    );
  });

  it("the directions handoff targets the parking anchor in driving mode", () => {
    const anchor = getRoutableCarAccessAnchors(karuizawa).find(
      (candidate) => candidate.id === "karuizawa-old-new-area-parking",
    );
    const journey = buildCarJourney(
      karuizawa,
      TOKYO,
      karuizawaRoute(anchor!),
      undefined,
      "my_car",
    );
    const handoff = buildJourneyHandoff(journey!);
    expect(handoff).not.toBeNull();
    expect(handoff!.externalMode).toBe("driving");
    expect(handoff!.destination).toEqual(anchor!.coordinates);
    expect(handoff!.destination).not.toEqual(karuizawa.coordinates);

    const url = new URL(handoff!.href);
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("destination")).toBe("36.357333,138.633287");
  });

  it("the Detail journey seam preserves the access-anchor endpoint through to the handoff", () => {
    const anchor = getRoutableCarAccessAnchors(karuizawa).find(
      (candidate) => candidate.id === "karuizawa-old-new-area-parking",
    );
    const journey = getOriginAwareTransportJourney(
      karuizawa,
      { homeStationCoords: TOKYO, carRoute: karuizawaRoute(anchor!) },
      ["my_car"],
    );
    expect(journey).not.toBeNull();
    const handoff = buildJourneyHandoff(journey!);
    expect(handoff?.externalMode).toBe("driving");
    expect(handoff?.destination).toEqual(anchor!.coordinates);
  });
});
