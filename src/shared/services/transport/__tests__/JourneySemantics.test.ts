import { describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import type { JourneyEndpoint } from "@/shared/types/journey";
import {
  buildPartialLocalAccessJourney,
  getOriginAwareTransportJourney,
} from "../JourneyService";
import { resolveOriginTransportZone } from "../TransportTopologyService";

const destinations = destinationsIndex as Destination[];
const tokyo = { lat: 35.6812, lng: 139.7671 };
const hakone = destinations.find((d) => d.id === "hakone-town")!;
const shodoshima = destinations.find((d) => d.id === "shodoshima")!;
const tokyoStation = destinations.find(
  (d) => d.id === "tokyo-station-chiyoda",
)!;

const originContext = {
  homeStationCoords: tokyo,
  originZoneId: resolveOriginTransportZone({ coordinates: tokyo }),
  originMunicipalityId: "Tokyo:chiyoda",
};

const localOrigin: JourneyEndpoint = {
  id: "kyoto-city",
  anchorKey: "anchor:kyoto-city",
  kind: "access_anchor",
  name: "Kyoto",
  coordinates: { lat: 35.0116, lng: 135.7681 },
  zoneId: "mainland-honshu",
};

describe("KAI-278 canonical Journey semantics", () => {
  it.each([
    ["my_car", "driving"],
    ["car", "driving"],
    ["train", "transit"],
  ] as const)(
    "preserves the selected %s journey mode",
    (mode, _externalMode) => {
      const journey = getOriginAwareTransportJourney(hakone, originContext, [
        mode,
      ]);

      expect(journey).not.toBeNull();
      expect(journey!.legs[0].mode).toBe(mode);
      expect(journey!.scope).toBe("origin_journey");
      expect(journey!.directionality).toBe("one_way");
      expect(journey!.completeness).toBe("complete");
      expect(journey!.origin.coordinates).toEqual(tokyo);
      expect(journey!.destination.coordinates).toEqual(hakone.coordinates);
    },
  );

  it("returns local-access semantics for identical canonical anchors", () => {
    const journey = getOriginAwareTransportJourney(
      tokyoStation,
      originContext,
      ["train"],
    );

    expect(journey).not.toBeNull();
    expect(journey!.scope).toBe("local_access");
    expect(journey!.completeness).toBe("complete");
    expect(journey!.legs[0].duration.minutes).toEqual([0, 0]);
    expect(journey!.provenance.source).toBe("same_canonical_anchor");
    expect(journey!.provenance.duration).toBe("verified");
  });

  it("does not collapse a genuinely distinct nearby endpoint", () => {
    const distinct = {
      ...tokyoStation,
      id: "tokyo-station-east-exit",
      coordinates: {
        lat: tokyoStation.coordinates!.lat + 0.001,
        lng: tokyoStation.coordinates!.lng,
      },
    };
    const journey = getOriginAwareTransportJourney(distinct, originContext, [
      "train",
    ]);

    expect(journey).not.toBeNull();
    expect(journey!.provenance.source).not.toBe("same_canonical_anchor");
    expect(journey!.legs[0].duration.minutes).not.toEqual([0, 0]);
  });

  it("keeps known local ferry access partial instead of completing origin travel", () => {
    const journey = buildPartialLocalAccessJourney(
      shodoshima,
      ["bus"],
      localOrigin,
    );

    expect(journey.scope).toBe("final_segment");
    expect(journey.completeness).toBe("partial");
    expect(journey.availability).toBe("unknown");
    expect(journey.legs[0].mode).toBe("bus");
    expect(journey.legs[0].duration.minutes).toBeUndefined();
  });

  it("does not produce a journey or transit fallback for unsupported car", () => {
    const unsupported = destinations.find(
      (d) => d.id === "abukuma-cave-fukushima",
    )!;
    expect(
      getOriginAwareTransportJourney(unsupported, originContext, ["my_car"]),
    ).toBeNull();
  });
});
