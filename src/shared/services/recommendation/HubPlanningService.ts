import type { Destination } from "@/shared/types/destination";
import { DestinationRelationshipService } from "@/shared/services/destination/DestinationRelationshipService";
import {
  calculateItemizedTripCost,
  getTransportCost,
} from "@/shared/services/budget/BudgetService";
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
  travelToHubCost: number; // Counted ONCE for the whole plan
  localTransitCost: number;
  ticketCost: number;
  foodCost: number;
  perPersonTotal: number;
  partyTotal: number;
  perPersonRange: { min: number; max: number };
  partyRange: { min: number; max: number };
  /**
   * KAI-89: true when any itinerary POI has an UNKNOWN budget (absent
   * values). Unknown items contribute 0 to the totals — they are never
   * treated as free — so the estimate covers only the known items; the
   * plan must not claim a complete cost.
   */
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

    // 3. Single Travel-to-Hub Transport Fare (Counted ONCE!)
    const rawHubCost = getTransportCost(hub, travelMode, 1);
    const travelToHubCost =
      Number.isNaN(rawHubCost) || !rawHubCost ? 500 : rawHubCost;

    // 4. Calculate Itemized Costs across all POIs
    let totalLocalTransit = 0;
    let totalTickets = 0;
    let totalFood = 0;
    let hasUnknownBudgetItems = false;

    for (const item of items) {
      totalLocalTransit += item.localTransitCost;

      if (!item.isHub) {
        const itemBreakdown = calculateItemizedTripCost(item.destination, {
          partySize: 1,
          activeMode: travelMode,
        });
        // KAI-89: an unknown-budget POI contributes NOTHING to the totals
        // (0 is 'free', which is a false claim); the plan flags the gap so
        // the estimate is never presented as a complete cost.
        if (!itemBreakdown.budgetAvailable) {
          hasUnknownBudgetItems = true;
          continue;
        }
        totalTickets += itemBreakdown.tickets || 0;
        const foodAvg = itemBreakdown.food
          ? Math.round((itemBreakdown.food[0] + itemBreakdown.food[1]) / 2)
          : 0;
        const cafeVal = Number(itemBreakdown.cafe || 0);
        totalFood += foodAvg + cafeVal;
      }
    }

    // 5. Total Budget Math (Deduplicated Single Hub Transit)
    const perPersonBase =
      travelToHubCost + totalLocalTransit + totalTickets + totalFood;
    const perPersonMin = Math.round(perPersonBase * 0.85);
    const perPersonMax = Math.round(perPersonBase * 1.25);

    const partyBase = perPersonBase * partySize;
    const partyMin = Math.round(partyBase * 0.85);
    const partyMax = Math.round(partyBase * 1.25);

    const budget: HubPlanBudget = {
      travelToHubCost,
      localTransitCost: totalLocalTransit,
      ticketCost: totalTickets,
      foodCost: totalFood,
      hasUnknownBudgetItems,
      perPersonTotal: Math.round(perPersonBase),
      partyTotal: Math.round(partyBase),
      perPersonRange: { min: perPersonMin, max: perPersonMax },
      partyRange: { min: partyMin, max: partyMax },
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
