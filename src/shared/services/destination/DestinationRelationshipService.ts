import type { Destination } from "@/shared/types/destination";
import { getDestinationList } from "./DestinationService";
import { getDistance } from "@/shared/utils/distance";

export class DestinationRelationshipService {
  private static byIdMap: Map<string, Destination> | null = null;
  private static childrenByParentMap: Map<string, Destination[]> | null = null;

  private static ensureIndex() {
    if (this.byIdMap) return;

    const all = getDestinationList() as Destination[];
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
  }

  /**
   * Resets the cache index (useful when destination list mutates dynamically).
   */
  static clearIndex() {
    this.byIdMap = null;
    this.childrenByParentMap = null;
  }

  /**
   * Returns the parent container destination (e.g. Nagoya Castle -> Nagoya City).
   */
  static getParentDestination(destination: Destination): Destination | null {
    this.ensureIndex();
    const parentId = destination.relationships?.parentDestinationId;
    if (!parentId) return null;
    return this.byIdMap?.get(parentId) || null;
  }

  /**
   * Returns child attractions assigned to a parent hub.
   */
  static getChildDestinations(parentId: string): Destination[] {
    this.ensureIndex();
    return this.childrenByParentMap?.get(parentId) || [];
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
   */
  static getFeaturedChildDestinations(city: Destination): Destination[] {
    this.ensureIndex();
    const featuredIds = city.relationships?.featuredDestinationIds;

    if (featuredIds && featuredIds.length > 0) {
      return featuredIds
        .map((id) => this.byIdMap?.get(id))
        .filter((d): d is Destination => Boolean(d));
    }

    // Fallback: child attractions assigned to this hub
    return this.getChildDestinations(city.id).slice(0, 4);
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

  /**
   * Returns thematically related destinations ("You may also like").
   */
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
