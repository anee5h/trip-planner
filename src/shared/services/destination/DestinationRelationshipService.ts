import type { Destination } from "@/shared/types/destination";
import { toCanonicalPlace } from "@/shared/services/place/PlaceCatalog";
import { getDistance } from "@/shared/utils/distance";

const RELATIONSHIP_INDEX_URL = "/data/destination-relationships.json";

interface RelationshipIndexPayload {
  schemaVersion: number;
  sourceRecordCount: number;
  nodes: Destination[];
}

let relationshipIndexPromise: Promise<Destination[]> | null = null;
let loadedRelationshipPlaces: Destination[] | null = null;

/**
 * Loads the compact relationship/card projection exactly once per session.
 * It contains only relationship-relevant nodes and the card/map fields used
 * by destination detail rails; it is deliberately not the nationwide summary
 * catalogue. A failed request clears the singleton so retry can re-fetch.
 */
export function loadRelationshipIndex(
  customPlaces?: Destination[],
): Promise<Destination[]> {
  if (customPlaces) {
    loadedRelationshipPlaces = customPlaces.map((node) =>
      toCanonicalPlace(node),
    );
    DestinationRelationshipService.clearIndex();
    relationshipIndexPromise = Promise.resolve(loadedRelationshipPlaces);
    return relationshipIndexPromise;
  }
  if (!relationshipIndexPromise) {
    relationshipIndexPromise = fetch(RELATIONSHIP_INDEX_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} fetching relationship index`,
          );
        }
        return response.json() as Promise<RelationshipIndexPayload>;
      })
      .then((payload) => {
        if (
          !payload ||
          payload.schemaVersion !== 1 ||
          !Array.isArray(payload.nodes)
        ) {
          throw new Error("relationship index has an invalid shape");
        }
        // The projection is intentionally narrower than Destination. The
        // relationship service exposes the historic Destination return type
        // for card/map compatibility; the generated fields are validated by
        // the generator and this service never sends projection records to
        // full-data/editorial consumers.
        loadedRelationshipPlaces = payload.nodes.map((node) =>
          toCanonicalPlace(node),
        );
        DestinationRelationshipService.clearIndex();
        return loadedRelationshipPlaces;
      })
      .catch((error) => {
        relationshipIndexPromise = null;
        loadedRelationshipPlaces = null;
        DestinationRelationshipService.clearIndex();
        throw new Error(`failed to load relationship index: ${String(error)}`);
      });
  }
  return relationshipIndexPromise;
}

export function hasLoadedRelationshipIndex(): boolean {
  return loadedRelationshipPlaces !== null;
}

export function resetRelationshipIndexForTests(): void {
  relationshipIndexPromise = null;
  loadedRelationshipPlaces = null;
  DestinationRelationshipService.clearIndex();
}

export class DestinationRelationshipService {
  private static byIdMap: Map<string, Destination> | null = null;
  private static childrenByParentMap: Map<string, Destination[]> | null = null;
  private static indexedCatalogueSize = -1;

  private static ensureIndex() {
    const all = loadedRelationshipPlaces ?? [];

    // The detail route can render before the relationship projection has
    // resolved. Do not permanently cache that safe empty state; rebuild on
    // the first post-load access instead of making relationships timing
    // dependent.
    if (all.length === 0) {
      this.byIdMap = null;
      this.childrenByParentMap = null;
      this.indexedCatalogueSize = -1;
      return;
    }
    if (this.byIdMap && this.indexedCatalogueSize === all.length) return;

    this.byIdMap = new Map();
    this.childrenByParentMap = new Map();

    for (const dest of all) {
      if (!dest.id) continue;
      this.byIdMap.set(dest.id, dest);

      const parentId = dest.relationships?.parentDestinationId;
      if (parentId) {
        if (!this.childrenByParentMap.has(parentId)) {
          this.childrenByParentMap.set(parentId, []);
        }
        this.childrenByParentMap.get(parentId)!.push(dest);
      }
    }
    this.indexedCatalogueSize = all.length;
  }

  /** Resets only the derived maps; the loaded projection remains reusable. */
  static clearIndex() {
    this.byIdMap = null;
    this.childrenByParentMap = null;
    this.indexedCatalogueSize = -1;
  }

  /** Returns the parent container destination. */
  static getParentDestination(destination: Destination): Destination | null {
    this.ensureIndex();
    const parentId = destination.relationships?.parentDestinationId;
    if (!parentId) return null;
    return this.byIdMap?.get(parentId) || null;
  }

  /**
   * KAI-257 invariant: Evaluates whether candidate is a valid attraction/POI
   * belonging to hub.
   *
   * Rules:
   * 1. Hub cannot feature itself.
   * 2. Candidate must NOT be a destination-level container entity (role === "hub",
   *    or kind in ["city", "town", "village", "ward", "region"]).
   * 3. Candidate must be in the same prefecture.
   * 4. Candidate must belong to this hub:
   *    - If candidate has parentDestinationId, it MUST match hub.id.
   *    - If candidate has no parentDestinationId, it must match municipalityId
   *      and cannot be a root standalone destination.
   */
  static isValidChildSight(candidate: Destination, hub: Destination): boolean {
    if (!candidate || !hub) return false;
    if (candidate.id === hub.id) return false;
    if (candidate.role === "hub") return false;

    const destinationLevelKinds = ["city", "town", "village", "ward", "region"];
    if (
      candidate.kind &&
      destinationLevelKinds.includes(candidate.kind as string) &&
      candidate.role !== "poi"
    ) {
      return false;
    }

    if (candidate.prefecture !== hub.prefecture) return false;

    if (candidate.relationships?.parentDestinationId) {
      return candidate.relationships.parentDestinationId === hub.id;
    }

    if (
      hub.municipalityId &&
      candidate.municipalityId &&
      hub.municipalityId === candidate.municipalityId
    ) {
      if (
        candidate.role === "standalone" &&
        candidate.placeType === "destination"
      ) {
        return false;
      }
      return true;
    }

    return false;
  }

  /** Returns child attractions assigned to a parent hub. */
  static getChildDestinations(parentId: string): Destination[] {
    this.ensureIndex();
    const parent = this.byIdMap?.get(parentId);
    const children = this.childrenByParentMap?.get(parentId) || [];
    return children.filter(
      (place) =>
        place.id !== parentId &&
        place.role !== "hub" &&
        (!parent || place.prefecture === parent.prefecture),
    );
  }

  /** Returns city hubs within a straight-line radius, ordered nearest first. */
  static getNearbyHubs(
    destination: Destination,
    radiusKm: number,
  ): Destination[] {
    this.ensureIndex();
    const origin = destination.coordinates;
    if (!origin) return [];

    return Array.from(this.byIdMap?.values() || [])
      .filter(
        (place) =>
          place.id !== destination.id &&
          place.role === "hub" &&
          Boolean(place.coordinates),
      )
      .flatMap((place) => {
        const coordinates = place.coordinates;
        if (!coordinates) return [];
        return [
          {
            place,
            distanceKm: getDistance(
              origin.lat,
              origin.lng,
              coordinates.lat,
              coordinates.lng,
            ),
          },
        ];
      })
      .filter(({ distanceKm }) => distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map(({ place }) => place);
  }

  /**
   * Returns editorially featured top sights for a hub page.
   *
   * Top Sights in a hub must contain only actual attraction/POI entities
   * belonging to that hub. Peer destinations (cities, towns, villages, onsen
   * areas, hubs, regions) and cross-municipality / unrelated destinations
   * are strictly excluded.
   *
   * Never pads sparse rails with nearby or sibling destinations.
   */
  static getFeaturedChildDestinations(city: Destination): Destination[] {
    this.ensureIndex();
    if (!city || city.role !== "hub") return [];

    const featuredIds = city.relationships?.featuredDestinationIds;

    if (featuredIds && featuredIds.length > 0) {
      const validFeatured = featuredIds
        .map((id) => this.byIdMap?.get(id))
        .filter((d): d is Destination => Boolean(d))
        .filter((d) => this.isValidChildSight(d, city));

      if (validFeatured.length > 0) {
        return validFeatured;
      }
    }

    // Fallback: child attractions assigned to this hub
    return this.getChildDestinations(city.id)
      .filter((d) => this.isValidChildSight(d, city))
      .slice(0, 4);
  }

  /**
   * Returns places relevant to a destination without inferring municipality
   * membership from a shared prefecture. A destination's assigned hub always
   * appears first, followed by explicit nearby places or sibling destinations.
   */
  static getNearbyDestinations(destination: Destination): Destination[] {
    this.ensureIndex();
    const rels = destination.relationships;

    const results: Destination[] = [];
    const parent = this.getParentDestination(destination);
    if (parent) results.push(parent);

    // Explicit editorial relationships take precedence over inferred siblings.
    if (rels?.nearbyDestinationIds && rels.nearbyDestinationIds.length > 0) {
      results.push(
        ...rels.nearbyDestinationIds
          .map((id) => this.byIdMap?.get(id))
          .filter((d): d is Destination => Boolean(d)),
      );
    } else if (rels?.parentDestinationId) {
      results.push(
        ...this.getChildDestinations(rels.parentDestinationId).filter(
          (place) => place.id !== destination.id,
        ),
      );
    }

    return Array.from(
      new Map(results.map((place) => [place.id, place])).values(),
    ).slice(0, 4);
  }

  /** Returns thematically related destinations. */
  static getRelatedDestinations(destination: Destination): Destination[] {
    this.ensureIndex();
    const rels = destination.relationships;

    if (rels?.relatedDestinationIds && rels.relatedDestinationIds.length > 0) {
      return rels.relatedDestinationIds
        .map((id) => this.byIdMap?.get(id))
        .filter((d): d is Destination => Boolean(d));
    }

    return [];
  }
}
