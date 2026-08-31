import { beforeAll, describe, expect, it } from "vitest";
import destinationsIndex from "@/shared/data/destinations-index.json";
import type { Destination } from "@/shared/types/destination";
import {
  DestinationRelationshipService,
  loadRelationshipIndex,
} from "../DestinationRelationshipService";
import { HubPlanningService } from "@/shared/services/recommendation/HubPlanningService";

const destinations = destinationsIndex as Destination[];
const byId = new Map(destinations.map((d) => [d.id, d]));

describe("KAI-257 Top Sights and Geographic Relationship Integrity", () => {
  beforeAll(async () => {
    await loadRelationshipIndex(destinations);
  });

  describe("1. Karuizawa Town specific regression tests", () => {
    const karuizawa = byId.get("karuizawa-town")!;

    it("ensures Matsumoto City cannot appear in Karuizawa Town Top Sights", () => {
      expect(karuizawa).toBeDefined();
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(karuizawa);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).not.toContain("matsumoto-city");
    });

    it("ensures Bessho Onsen cannot appear in Karuizawa Town Top Sights", () => {
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(karuizawa);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).not.toContain("nagano-bessho-onsen");
    });

    it("ensures Kiso Valley cannot appear in Karuizawa Town Top Sights", () => {
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(karuizawa);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).not.toContain("kiso");
    });

    it("returns the canonical Karuizawa child POIs instead of padding with peers", () => {
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(karuizawa);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toEqual(
        expect.arrayContaining([
          "kumoba-pond",
          "kyu-karuizawa-ginza",
          "harunire-terrace",
        ]),
      );
      expect(sightIds).toHaveLength(3);
      expect(sightIds).not.toContain("matsumoto-city");
      expect(sightIds).not.toContain("nagano-bessho-onsen");
      expect(sightIds).not.toContain("kiso");
    });

    it("still returns legitimate Karuizawa POIs when present in relationships", () => {
      const mockKaruizawaPoi = {
        id: "kyu-karuizawa-ginza-mock",
        name: "Kyu-Karuizawa Ginza Street",
        role: "poi",
        kind: "street",
        prefecture: "Nagano",
        region: "Chubu",
        municipalityId: "Nagano:karuizawa",
        heroImage: "https://example.com/mock.jpg",
        description: "Historic shopping street in Karuizawa.",
        highlights: ["Shopping"],
        categories: ["Shopping"],
        relationships: {
          parentDestinationId: "karuizawa-town",
        },
        transportOptions: {},
      } as unknown as Destination;

      const mockKaruizawaHub = {
        ...karuizawa,
        relationships: {
          featuredDestinationIds: [
            "kyu-karuizawa-ginza-mock",
            "matsumoto-city", // invalid peer
            "nagano-bessho-onsen", // invalid peer
          ],
        },
      } as unknown as Destination;

      // Test isValidChildSight directly
      expect(
        DestinationRelationshipService.isValidChildSight(
          mockKaruizawaPoi,
          mockKaruizawaHub,
        ),
      ).toBe(true);

      const matsumoto = byId.get("matsumoto-city")!;
      expect(
        DestinationRelationshipService.isValidChildSight(
          matsumoto,
          mockKaruizawaHub,
        ),
      ).toBe(false);

      const bessho = byId.get("nagano-bessho-onsen")!;
      expect(
        DestinationRelationshipService.isValidChildSight(
          bessho,
          mockKaruizawaHub,
        ),
      ).toBe(false);
    });
  });

  describe("2. Matsumoto City regression tests", () => {
    const matsumoto = byId.get("matsumoto-city")!;

    it("ensures Matsumoto City Top Sights are not contaminated by peer destinations", () => {
      expect(matsumoto).toBeDefined();
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(matsumoto);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).not.toContain("karuizawa-town");
      expect(sightIds).not.toContain("nagano-city");
      expect(sightIds).not.toContain("kiso");
      expect(sightIds).not.toContain("nagano-bessho-onsen");

      // Matsumoto should contain its genuine attractions
      expect(sightIds).toContain("matsumoto-castle-nagano");
    });
  });

  describe("3. Bessho Onsen regression tests", () => {
    const bessho = byId.get("nagano-bessho-onsen")!;

    it("ensures Bessho Onsen (standalone onsen) returns empty Top Sights rail", () => {
      expect(bessho).toBeDefined();
      expect(bessho.role).toBe("standalone");

      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(bessho);
      expect(sights).toEqual([]);
    });
  });

  describe("4. Representative destination types across prefectures", () => {
    it("City Hub: Kyoto City Top Sights contains only Kyoto POIs, not peer cities", () => {
      const kyoto = byId.get("kyoto-city")!;
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(kyoto);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds.length).toBeGreaterThan(0);
      expect(sightIds).toContain("kiyomizu-dera");
      expect(sightIds).toContain("kinkaku-ji");
      expect(sightIds).toContain("nijo-castle-kyoto");

      expect(sightIds).not.toContain("osaka-city");
      expect(sightIds).not.toContain("nara-city");
      expect(sightIds).not.toContain("uji-city");
    });

    it("City Hub: Chiyoda City Top Sights contains only Chiyoda POIs, not peer hubs", () => {
      const chiyoda = byId.get("chiyoda-city")!;
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(chiyoda);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toContain("akihabara-chiyoda");
      expect(sightIds).toContain("edo-castle-tokyo");

      expect(sightIds).not.toContain("akasaka-minato");
      expect(sightIds).not.toContain("chofu-tokyo");
      expect(sightIds).not.toContain("edogawa-city");
      expect(sightIds).not.toContain("ghibli-museum");
    });

    it("City Hub: Hino City retains Takahata Fudoson after relationship metadata is corrected", () => {
      const hino = byId.get("hino-city")!;
      const takahata = byId.get("takahata-fudoson")!;

      expect(takahata.municipalityId).toBe("Tokyo:hino");
      expect(takahata.relationships?.parentDestinationId).toBe("hino-city");

      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(hino);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toContain("takahata-fudoson");
      expect(sightIds).toContain("tama-zoological-park");
      expect(sightIds).toContain("hijikata-toshizo-museum");
    });

    it("City Hub: Tokushima City retains Tokushima Castle as a legitimate attraction", () => {
      const tokushima = byId.get("tokushima-city")!;
      const castle = byId.get("tokushima-castle")!;

      expect(castle.municipalityId).toBe("Tokushima:tokushima");
      expect(castle.kind).toBe("castle");

      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(tokushima);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toContain("tokushima-castle");
      expect(sightIds).toContain("awa-odori-kaikan");
      expect(sightIds).toContain("bizan-ropeway-tokushima");
    });

    it("City Hub: Taito City Top Sights contains POIs and excludes sub-hub ueno-taito", () => {
      const taito = byId.get("taito-city")!;
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(taito);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toContain("national-museum-western-art-tokyo");
      expect(sightIds).toContain("ueno-park");
      expect(sightIds).toContain("tokyo-national-museum");

      expect(sightIds).not.toContain("ueno-taito");
    });

    it("Town Hub: Fujikawaguchiko Town contains Fuji Five Lakes, not Kofu City", () => {
      const fujikawaguchiko = byId.get("fujikawaguchiko-town")!;
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(
          fujikawaguchiko,
        );
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toContain("fuji-5-lake");
      expect(sightIds).not.toContain("kofu-city");
      expect(sightIds).not.toContain("takeda-castle-yamanashi");
    });

    it("Town Hub: Kusatsu Town contains Kusatsu Onsen, not Oze National Park", () => {
      const kusatsu = byId.get("kusatsu-town")!;
      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(kusatsu);
      const sightIds = sights.map((s) => s.id);

      expect(sightIds).toContain("gunma-kusatsu-onsen");
      expect(sightIds).not.toContain("oze-national-park");
      expect(sightIds).not.toContain("gunma-ikaho-onsen");
    });

    it("Hokkaido Hubs: Abashiri, Asahikawa, Furano, Kushiro do not feature Hakodate Night View", () => {
      const hokkaidoHubs = [
        "abashiri-city",
        "asahikawa-city",
        "furano-city",
        "kushiro-city",
        "biei-town",
      ];
      for (const hubId of hokkaidoHubs) {
        const hub = byId.get(hubId)!;
        const sights =
          DestinationRelationshipService.getFeaturedChildDestinations(hub);
        const sightIds = sights.map((s) => s.id);
        expect(sightIds).not.toContain("hakodate-night-view");
      }
    });

    it("Shizuoka Hubs: Atami, Fujinomiya, Gotemba, Hamamatsu do not feature peer cities", () => {
      const shizuokaHubs = [
        "atami-city",
        "fujinomiya-city",
        "gotemba-city",
        "hamamatsu-city",
        "ito-city",
      ];
      for (const hubId of shizuokaHubs) {
        const hub = byId.get(hubId)!;
        const sights =
          DestinationRelationshipService.getFeaturedChildDestinations(hub);
        const sightIds = sights.map((s) => s.id);
        expect(sightIds).not.toContain("atami-city");
        expect(sightIds).not.toContain("fujinomiya-city");
        expect(sightIds).not.toContain("ito-city");
      }
    });

    it("POI destination: getFeaturedChildDestinations on a POI always returns empty", () => {
      const kinkakuji = byId.get("kinkaku-ji")!;
      expect(kinkakuji.role).not.toBe("hub");

      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(kinkakuji);
      expect(sights).toEqual([]);
    });

    it("Standalone nature area: getFeaturedChildDestinations on Kiso Valley returns empty", () => {
      const kiso = byId.get("kiso")!;
      expect(kiso.role).toBe("standalone");

      const sights =
        DestinationRelationshipService.getFeaturedChildDestinations(kiso);
      expect(sights).toEqual([]);
    });
  });

  describe("5. HubPlanningService candidate isolation", () => {
    it("never includes peer cities in HubPlan stops even if nearby destinations exist", () => {
      const karuizawa = byId.get("karuizawa-town")!;
      const plan = HubPlanningService.generateHubPlan(karuizawa);

      const stopIds = plan.items.map((item) => item.destination.id);
      expect(stopIds).not.toContain("matsumoto-city");
      expect(stopIds).not.toContain("nagano-city");
      expect(stopIds).not.toContain("nagano-bessho-onsen");
      expect(stopIds).not.toContain("nagoya-city");
      expect(stopIds).not.toContain("shirakawa-village");
    });
  });

  describe("6. Generic invariant test across ENTIRE catalogue (CI Guard)", () => {
    it("proves every hub in the published catalogue produces ONLY valid child attractions in Top Sights", () => {
      const destinationLevelKinds = new Set([
        "city",
        "town",
        "village",
        "ward",
        "region",
      ]);

      const hubs = destinations.filter((d) => d.role === "hub");
      expect(hubs.length).toBeGreaterThan(100);

      for (const hub of hubs) {
        const sights =
          DestinationRelationshipService.getFeaturedChildDestinations(hub);

        // Check for duplicates
        const sightIds = sights.map((s) => s.id);
        const uniqueIds = new Set(sightIds);
        expect(sightIds.length).toBe(uniqueIds.size);

        for (const sight of sights) {
          // Invariant 1: Sight cannot be the hub itself
          expect(sight.id).not.toBe(hub.id);

          // Invariant 2: Sight cannot be another hub
          expect(sight.role).not.toBe("hub");

          // Invariant 3: Sight cannot be a destination-level administrative entity
          if (sight.kind && destinationLevelKinds.has(sight.kind)) {
            expect(sight.role).toBe("poi");
          }

          // Invariant 4: Sight must share the hub's prefecture
          expect(sight.prefecture).toBe(hub.prefecture);

          // Invariant 5: If parentDestinationId is set, it MUST be this hub
          if (sight.relationships?.parentDestinationId) {
            expect(sight.relationships.parentDestinationId).toBe(hub.id);
          }

          // Invariant 6: If municipalityId is set on both, it must match
          if (hub.municipalityId && sight.municipalityId) {
            expect(sight.municipalityId).toBe(hub.municipalityId);
          }
        }
      }
    });

    it("proves every non-hub destination returns empty Top Sights", () => {
      const nonHubs = destinations.filter((d) => d.role !== "hub");
      for (const place of nonHubs) {
        const sights =
          DestinationRelationshipService.getFeaturedChildDestinations(place);
        expect(sights).toEqual([]);
      }
    });

    it("rejects future synthetic destination-level entities from Top Sights", () => {
      const dummyHub = {
        id: "dummy-hub",
        name: "Dummy Hub",
        role: "hub",
        kind: "city",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:dummy",
        heroImage: "https://example.com/dummy.jpg",
        description: "A test hub",
        highlights: ["Test"],
        categories: ["City"],
        transportOptions: {},
      } as unknown as Destination;

      const foreignPrefecturePoi = {
        id: "foreign-poi",
        name: "Foreign POI",
        role: "poi",
        kind: "temple",
        prefecture: "Osaka",
        region: "Kansai",
        municipalityId: "Osaka:dummy",
        heroImage: "https://example.com/foreign.jpg",
        description: "A foreign temple",
        highlights: ["Temple"],
        categories: ["Temple"],
        relationships: { parentDestinationId: "dummy-hub" },
        transportOptions: {},
      } as unknown as Destination;

      const peerCity = {
        id: "peer-city",
        name: "Peer City",
        role: "hub",
        kind: "city",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:peer",
        heroImage: "https://example.com/peer.jpg",
        description: "A peer city",
        highlights: ["City"],
        categories: ["City"],
        transportOptions: {},
      } as unknown as Destination;

      const differentParentPoi = {
        id: "different-parent-poi",
        name: "Different Parent POI",
        role: "poi",
        kind: "museum",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:dummy",
        heroImage: "https://example.com/diff.jpg",
        description: "A museum",
        highlights: ["Museum"],
        categories: ["Museum"],
        relationships: { parentDestinationId: "other-hub" },
        transportOptions: {},
      } as unknown as Destination;

      expect(
        DestinationRelationshipService.isValidChildSight(
          foreignPrefecturePoi,
          dummyHub,
        ),
      ).toBe(false);
      expect(
        DestinationRelationshipService.isValidChildSight(peerCity, dummyHub),
      ).toBe(false);
      expect(
        DestinationRelationshipService.isValidChildSight(
          differentParentPoi,
          dummyHub,
        ),
      ).toBe(false);
    });

    it("distinguishes legitimate standalone attractions from administrative containers", () => {
      const cityHub = {
        id: "sample-city-hub",
        name: "Sample City Hub",
        role: "hub",
        kind: "city",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:sample",
      } as unknown as Destination;

      const standaloneCastle = {
        id: "sample-castle",
        name: "Sample Castle",
        role: "standalone",
        kind: "castle",
        placeType: "destination",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:sample",
      } as unknown as Destination;

      const standaloneTemple = {
        id: "sample-temple",
        name: "Sample Temple",
        role: "standalone",
        kind: "temple",
        placeType: "destination",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:sample",
      } as unknown as Destination;

      const administrativeContainerTown = {
        id: "neighbor-town",
        name: "Neighbor Town",
        role: "standalone",
        kind: "town",
        placeType: "destination",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:sample",
      } as unknown as Destination;

      const administrativeContainerVillage = {
        id: "sample-village",
        name: "Sample Village",
        role: "hub",
        kind: "village",
        placeType: "hub",
        prefecture: "Tokyo",
        region: "Kanto",
        municipalityId: "Tokyo:sample",
      } as unknown as Destination;

      // Standalone castle and temple in same municipality qualify
      expect(
        DestinationRelationshipService.isValidChildSight(
          standaloneCastle,
          cityHub,
        ),
      ).toBe(true);
      expect(
        DestinationRelationshipService.isValidChildSight(
          standaloneTemple,
          cityHub,
        ),
      ).toBe(true);

      // Administrative town and village containers are strictly rejected
      expect(
        DestinationRelationshipService.isValidChildSight(
          administrativeContainerTown,
          cityHub,
        ),
      ).toBe(false);
      expect(
        DestinationRelationshipService.isValidChildSight(
          administrativeContainerVillage,
          cityHub,
        ),
      ).toBe(false);
    });
  });
});
