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

    // 1. Discover child POIs for this hub
    const directChildren = DestinationRelationshipService.getChildDestinations(
      hub.id,
    );
    const featuredChildren =
      DestinationRelationshipService.getFeaturedChildDestinations(hub);

    // Combine & deduplicate available POIs
    const candidateMap = new Map<string, Destination>();
    for (const d of [...featuredChildren, ...directChildren]) {
      if (d.id !== hub.id) candidateMap.set(d.id, d);
    }

    // Fallback to nearby destinations if child list is small
    if (candidateMap.size < 3 && hub.coordinates) {
      const nearby = DestinationRelationshipService.getNearbyDestinations(hub);
      for (const d of nearby) {
        if (d.id !== hub.id) candidateMap.set(d.id, d);
      }
    }

    const candidates = Array.from(candidateMap.values());

    // Filter by plan type count
    const targetCount = planType === "half_day" ? 2 : 4;
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
        transitTime = Math.max(8, Math.round(distKm * 4 + 5)); // ~15km/h local bus/walk
        transitCost = distKm > 8 ? 420 : 210; // tiered local fare
      }

      const visitTime = (poi.recommendedVisitHours?.min || 1.5) * 60;
      cumulativeVisitMinutes += visitTime + transitTime;

      items.push({
        destination: poi,
        visitDurationMinutes: Math.round(visitTime),
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

    for (const item of items) {
      totalLocalTransit += item.localTransitCost;

      if (!item.isHub) {
        const itemBreakdown = calculateItemizedTripCost(item.destination, {
          partySize: 1,
          activeMode: travelMode,
        });
        totalTickets += itemBreakdown.tickets || 0;
        const foodAvg = Array.isArray(itemBreakdown.food)
          ? Math.round((itemBreakdown.food[0] + itemBreakdown.food[1]) / 2)
          : Number(itemBreakdown.food || 0);
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
    const totalHours = Math.max(3, Math.round(cumulativeVisitMinutes / 60));
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
