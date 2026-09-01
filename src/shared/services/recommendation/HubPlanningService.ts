import type { Destination } from "@/shared/types/destination";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import { calculateTripEstimate } from "@/shared/services/budget/tripEstimateEngine";
import type { PriceRange } from "@/shared/types/planner";
import { getDistance } from "@/shared/utils/distance";
import rawCollections from "@/shared/data/collections-index.json";

export interface HubPlanItem {
  destination: Destination;
  visitDurationMinutes: number;
  localTransitTimeMinutes: number;
  localTransitCost: number;
  isHub: boolean;
  transitNote?: {
    en: string;
    ja: string;
  };
}

export interface HubPlanBudget {
  /** Canonical range; scalar fields below are compatibility projections. */
  estimateRange: PriceRange;
  estimateQuality: "verified" | "estimated" | "rough";
  originTransportIncluded: boolean;
  /** @deprecated Use estimateRange and originTransportIncluded. */
  travelToHubCost: number;
  /** @deprecated compatibility upper-bound projections. */
  localTransitCost: number;
  ticketCost: number;
  foodCost: number;
  perPersonTotal: number;
  partyTotal: number;
  perPersonRange: { min: number; max: number };
  partyRange: { min: number; max: number };
  hasUnknownBudgetItems: boolean;
}

export interface HubPlan {
  hub: Destination;
  planType: "half_day" | "full_day";
  title: { en: string; ja: string };
  summary: { en: string; ja: string };
  estimatedTotalHours: number;
  items: HubPlanItem[];
  budget: HubPlanBudget;
  relatedCollections: Array<{ id: string; title: string }>;
}

export interface HubPlanOptions {
  planType?: "half_day" | "full_day";
  partySize?: number;
  travelMode?: "train" | "bus" | "car" | "shinkansen";
  homeCoords?: { lat: number; lng: number };
}

export class HubPlanningService {
  /**
   * Generates a hub-centered travel plan where base transit to the hub is counted ONCE.
   */
  static generateHubPlan(
    hub: Destination,
    options: HubPlanOptions = {},
  ): HubPlan {
    const planType = options.planType || "half_day";
    const partySize = Math.max(1, options.partySize || 2);
    const travelMode = options.travelMode || "train";

    // 1. Discover POIs for this hub
    const directChildren = DestinationRelationshipService.getChildDestinations(
      hub.id,
    );
    const featuredChildren =
      DestinationRelationshipService.getFeaturedChildDestinations(hub);

    const candidateMap = new Map<string, Destination>();
    for (const d of [...featuredChildren, ...directChildren]) {
      if (d.id !== hub.id) candidateMap.set(d.id, d);
    }

    // KAI-257: Only direct/featured child attractions belonging to this hub are eligible.
    // Unsafe fallback to nearby/peer destinations is removed to prevent destination leakage.

    // STRICT GEOGRAPHIC & CATEGORY FILTERING
    // Stops MUST NOT be another hub/city/town/village and MUST be valid child attractions within 15km of the hub
    const candidates = Array.from(candidateMap.values()).filter((d) => {
      if (d.id === hub.id) return false;
      if (
        d.role === "hub" ||
        ["city", "town", "village", "ward", "region"].includes(d.kind as string)
      ) {
        return false;
      }
      if (d.prefecture !== hub.prefecture) return false;

      if (hub.coordinates && d.coordinates) {
        const dist = getDistance(
          hub.coordinates.lat,
          hub.coordinates.lng,
          d.coordinates.lat,
          d.coordinates.lng,
        );
        return dist <= 15; // Strict 15km radius constraint around hub
      }
      return true;
    });

    // Target stop count: half day = 2 stops, full day = 3 stops
    const targetCount = planType === "half_day" ? 2 : 3;
    const selectedPois = candidates.slice(0, targetCount);

    // 2. Build Plan Items with Intra-Hub Local Movement
    const items: HubPlanItem[] = [];

    // First stop: The Hub itself (Orientation / Start)
    items.push({
      destination: hub,
      visitDurationMinutes: 30,
      localTransitTimeMinutes: 0,
      localTransitCost: 0,
      isHub: true,
      transitNote: {
        en: "Start at Hub",
        ja: "拠点発",
      },
    });

    let cumulativeVisitMinutes = 30;
    let prevCoords = hub.coordinates;

    for (let i = 0; i < selectedPois.length; i++) {
      const poi = selectedPois[i];
      let transitTime = 15; // default 15 min local transit
      let transitCost = 210; // default local bus/subway fare (¥210)

      if (prevCoords && poi.coordinates) {
        const distKm = getDistance(
          prevCoords.lat,
          prevCoords.lng,
          poi.coordinates.lat,
          poi.coordinates.lng,
        );
        transitTime = Math.min(30, Math.max(8, Math.round(distKm * 4 + 5))); // Cap intra-hub transit to max 30 mins
        transitCost = distKm > 8 ? 420 : 210;
      }

      // Cap individual POI visit duration between 45 and 120 minutes for realistic day planning
      const rawVisit = (poi.recommendedVisitHours?.min || 1.5) * 60;
      const visitTime = Math.min(120, Math.max(45, Math.round(rawVisit)));
      cumulativeVisitMinutes += visitTime + transitTime;

      items.push({
        destination: poi,
        visitDurationMinutes: visitTime,
        localTransitTimeMinutes: transitTime,
        localTransitCost: transitCost,
        isHub: false,
        transitNote: {
          en: `${transitTime} min local transit`,
          ja: `移動 約${transitTime}分`,
        },
      });

      prevCoords = poi.coordinates || prevCoords;
    }

    // 3–5. Canonical range-first aggregation. Origin travel is calculated
    // once for the hub only; each POI contributes on-site local + admission,
    // and one canonical day-trip meal band covers the plan.
    const hubEstimate = calculateTripEstimate({
      dest: hub,
      mode: travelMode,
      partySize: 1,
      homeCoords: options.homeCoords,
      includeOriginTravel: Boolean(options.homeCoords),
      duration: "fullDay",
    });
    const hubOnSite = hubEstimate.components.filter(
      (component) =>
        component.evidence.scope !== "origin_travel" &&
        component.evidence.scope !== "meals",
    );
    const originComponent = hubEstimate.components.find(
      (component) => component.evidence.scope === "origin_travel",
    );
    const mealComponent = hubEstimate.components.find(
      (component) => component.evidence.scope === "meals",
    );

    let localRange: PriceRange = [0, 0];
    let ticketRange: PriceRange = [0, 0];
    let unknown = hubEstimate.total === undefined;
    for (const item of items) {
      if (item.isHub) continue;
      const estimate = calculateTripEstimate({
        dest: item.destination,
        mode: travelMode,
        partySize: 1,
        includeOriginTravel: false,
        duration: "fullDay",
      });
      const local = estimate.components.find(
        (component) => component.evidence.scope === "local_transport",
      );
      const admission = estimate.components.find(
        (component) => component.evidence.scope === "admission",
      );
      if (local?.cost.kind === "bounded") {
        localRange = [
          localRange[0] + local.cost.min,
          localRange[1] + local.cost.max,
        ];
      } else {
        unknown = true;
      }
      if (admission?.cost.kind === "bounded") {
        ticketRange = [
          ticketRange[0] + admission.cost.min,
          ticketRange[1] + admission.cost.max,
        ];
      } else if (admission?.evidence.state !== "not_applicable") {
        unknown = true;
      }
    }

    // The inter-stop movement is a profile estimate, not a fabricated ¥210
    // fare. It is intentionally broad and scales with the number of legs.
    const movementCount = Math.max(0, items.length - 1);
    const movementRange: PriceRange = [
      400 * movementCount,
      1600 * movementCount,
    ];
    localRange = [
      localRange[0] + movementRange[0],
      localRange[1] + movementRange[1],
    ];
    for (const component of hubOnSite) {
      if (
        component.evidence.scope === "local_transport" &&
        component.cost.kind === "bounded"
      ) {
        localRange = [
          localRange[0] + component.cost.min,
          localRange[1] + component.cost.max,
        ];
      }
      if (
        component.evidence.scope === "admission" &&
        component.cost.kind === "bounded"
      ) {
        ticketRange = [
          ticketRange[0] + component.cost.min,
          ticketRange[1] + component.cost.max,
        ];
      }
    }

    const originRange: PriceRange =
      originComponent?.cost.kind === "bounded"
        ? [originComponent.cost.min, originComponent.cost.max]
        : [0, 0];
    if (options.homeCoords && originComponent?.cost.kind !== "bounded")
      unknown = true;
    const mealsRange: PriceRange =
      mealComponent?.cost.kind === "bounded"
        ? [mealComponent.cost.min, mealComponent.cost.max]
        : [0, 0];
    if (mealComponent?.cost.kind !== "bounded") unknown = true;
    const partyOnSite: PriceRange = [
      (localRange[0] + ticketRange[0] + mealsRange[0]) * partySize,
      (localRange[1] + ticketRange[1] + mealsRange[1]) * partySize,
    ];
    const partyRange: PriceRange = [
      partyOnSite[0] + originRange[0] * partySize,
      partyOnSite[1] + originRange[1] * partySize,
    ];
    const perPersonRange: PriceRange = [
      Math.round(partyRange[0] / partySize),
      Math.round(partyRange[1] / partySize),
    ];
    const budget: HubPlanBudget = {
      estimateRange: partyRange,
      estimateQuality: unknown ? "rough" : "estimated",
      originTransportIncluded: Boolean(
        options.homeCoords && originComponent?.cost.kind === "bounded",
      ),
      travelToHubCost: originRange[1] * partySize,
      localTransitCost: localRange[1] * partySize,
      ticketCost: ticketRange[1] * partySize,
      foodCost: mealsRange[1] * partySize,
      perPersonTotal: perPersonRange[1],
      partyTotal: partyRange[1],
      perPersonRange: { min: perPersonRange[0], max: perPersonRange[1] },
      partyRange: { min: partyRange[0], max: partyRange[1] },
      hasUnknownBudgetItems: unknown,
    };

    // 6. Find Related Collections for this Hub
    const relatedCollections = (rawCollections as any[])
      .filter((col) => {
        const title = (col.name || "").toLowerCase();
        const hubName = hub.name.toLowerCase();
        return (
          title.includes(hubName) ||
          (hub.prefecture && title.includes(hub.prefecture.toLowerCase()))
        );
      })
      .slice(0, 3)
      .map((col) => ({ id: col.id, title: col.name }));

    // 7. Title & Summary
    const totalHours = Math.min(
      planType === "half_day" ? 5 : 9,
      Math.max(3, Math.round(cumulativeVisitMinutes / 60)),
    );

    const title = {
      en:
        planType === "half_day"
          ? `${hub.name} Half-Day Hub Tour`
          : `${hub.name} Full-Day Exploration Plan`,
      ja:
        planType === "half_day"
          ? `${hub.nameJa || hub.name} 半日拠点周遊プラン`
          : `${hub.nameJa || hub.name} 1日拠点周遊コース`,
    };

    const summary = {
      en: `A ${totalHours}-hour hub-centered plan exploring ${selectedPois.length} key sights around ${hub.name} with transit-to-hub fare counted once.`,
      ja: `${hub.nameJa || hub.name}を拠点に周辺の${selectedPois.length}箇所を巡る約${totalHours}時間の効率的な周遊プラン（基幹交通費は1回分のみ計算）。`,
    };

    return {
      hub,
      planType,
      title,
      summary,
      estimatedTotalHours: totalHours,
      items,
      budget,
      relatedCollections,
    };
  }
}
