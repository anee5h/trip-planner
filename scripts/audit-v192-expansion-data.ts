import fs from "fs";
import path from "path";
import catalogJson from "../src/shared/data/destinations-index.json";
import type {
  Destination,
  DestinationKind,
  Ratings,
} from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailsDirectory = path.join(process.cwd(), "public/data/destinations");
const catalog = structuredClone(catalogJson) as Destination[];
const touchedIds = new Set<string>();

const CATEGORY_JA: Record<string, string> = {
  Aquarium: "水族館",
  Culture: "文化",
  Food: "グルメ",
  History: "歴史",
  Market: "市場",
  Museum: "博物館",
  Nature: "自然",
  Shopping: "ショッピング",
  "Theme Park": "テーマパーク",
  Viewpoint: "展望",
};

function semantics(name: string): {
  kind: DestinationKind;
  categories: string[];
  indoorPercent: number;
} {
  const value = name.toLowerCase();
  if (/boso-no-mura|nihon minka-en|mediatheque/.test(value))
    return { kind: "museum", categories: ["Museum"], indoorPercent: 80 };
  if (/kawasaki daishi|kita-in|sanjusangen-do/.test(value))
    return { kind: "temple", categories: ["History"], indoorPercent: 25 };
  if (/zeniarai benten|zuihoden/.test(value))
    return { kind: "shrine", categories: ["History"], indoorPercent: 20 };
  if (/toki no kane|tsutenkaku/.test(value))
    return { kind: "tower", categories: ["Viewpoint"], indoorPercent: 60 };
  if (/universal studios/.test(value))
    return { kind: "park", categories: ["Theme Park"], indoorPercent: 35 };
  if (
    /canal city|lazona|sunshine city|golden gai|bonsai village|saitama shintoshin|stadium|super arena/.test(
      value,
    )
  )
    return {
      kind: "district",
      categories: ["Culture", "Shopping"],
      indoorPercent: 55,
    };
  if (/philosopher's walk/.test(value))
    return {
      kind: "street",
      categories: ["Nature", "Culture"],
      indoorPercent: 5,
    };
  if (/shingashi river/.test(value))
    return { kind: "park", categories: ["Nature"], indoorPercent: 5 };
  if (/great buddha/.test(value))
    return { kind: "temple", categories: ["History"], indoorPercent: 15 };
  if (
    /former hokkaido government office|kitano ijinkan|shell mounds/.test(value)
  )
    return {
      kind: "museum",
      categories: ["History", "Museum"],
      indoorPercent: 70,
    };
  if (/aquarium/.test(value))
    return { kind: "aquarium", categories: ["Aquarium"], indoorPercent: 90 };
  if (/zoo|animal kingdom/.test(value))
    return { kind: "zoo", categories: ["Nature"], indoorPercent: 25 };
  if (/museum|gallery|science|miraikan/.test(value))
    return { kind: "museum", categories: ["Museum"], indoorPercent: 90 };
  if (/shrine|jingu|hachimangu|inari/.test(value))
    return { kind: "shrine", categories: ["History"], indoorPercent: 20 };
  if (/temple|ji\b|dera|kannon|tochoji|hasedera/.test(value))
    return { kind: "temple", categories: ["History"], indoorPercent: 25 };
  if (/castle|palace|honmaru/.test(value))
    return { kind: "castle", categories: ["History"], indoorPercent: 35 };
  if (/market|yatai/.test(value))
    return {
      kind: "market",
      categories: ["Food", "Market"],
      indoorPercent: 25,
    };
  if (/shopping|street|yokocho|chinatown|dotonbori/.test(value))
    return {
      kind: "shopping",
      categories: ["Shopping", "Food"],
      indoorPercent: 30,
    };
  if (/tower|observ|sea candle/.test(value))
    return { kind: "tower", categories: ["Viewpoint"], indoorPercent: 75 };
  if (/ropeway/.test(value))
    return { kind: "viewpoint", categories: ["Viewpoint"], indoorPercent: 40 };
  if (/station/.test(value))
    return { kind: "station", categories: ["Culture"], indoorPercent: 65 };
  if (/beach|seaside|coast/.test(value))
    return { kind: "beach", categories: ["Nature"], indoorPercent: 5 };
  if (/falls/.test(value))
    return { kind: "waterfall", categories: ["Nature"], indoorPercent: 5 };
  if (/mount|moiwa/.test(value))
    return { kind: "mountain", categories: ["Nature"], indoorPercent: 5 };
  if (/garden/.test(value))
    return { kind: "garden", categories: ["Nature"], indoorPercent: 10 };
  if (/park|ryokuchi|inamuragasaki/.test(value))
    return { kind: "park", categories: ["Nature"], indoorPercent: 10 };
  if (/island|enoshima/.test(value))
    return { kind: "island", categories: ["Nature"], indoorPercent: 10 };
  if (
    /district|susukino|tenjin|nakasu|yanaka|kabukicho|kagurazaka|shinjuku|shinsaibashi|shinsekai|harborland|saitama-shintoshin/.test(
      value,
    )
  )
    return {
      kind: "district",
      categories: ["Culture"],
      indoorPercent: 30,
    };
  return { kind: "viewpoint", categories: ["Culture"], indoorPercent: 30 };
}

const roundHalf = (value: number) => Math.round(value * 2) / 2;

function correctedRatings(ratings: Ratings, indoorPercent: number): Ratings {
  const corrected = Object.fromEntries(
    Object.entries(ratings).map(([key, value]) => [
      key,
      typeof value === "number" ? roundHalf(value) : value,
    ]),
  ) as unknown as Ratings;
  corrected.rain = Math.min(
    corrected.rain,
    indoorPercent >= 80 ? 9 : indoorPercent >= 50 ? 7.5 : 5.5,
  );
  return corrected;
}

function description(
  destination: Destination,
  categories: string[],
  locale: "en" | "ja",
) {
  const parent = catalog.find(
    ({ id }) => id === destination.relationships?.parentDestinationId,
  );
  const city =
    locale === "ja"
      ? parent?.content?.ja?.name || parent?.nameJa || parent?.name
      : parent?.name;
  const name =
    locale === "ja"
      ? destination.content?.ja?.name || destination.nameJa || destination.name
      : destination.name;
  const focus = categories.includes("Food")
    ? locale === "ja"
      ? "食事や買い物、街歩きを楽しめます"
      : "Visitors can enjoy local food, shopping, and an easy walk through the area"
    : categories.includes("Nature")
      ? locale === "ja"
        ? "景観や自然を楽しみながら散策できます"
        : "Visitors can enjoy the scenery and explore at a relaxed walking pace"
      : categories.includes("History")
        ? locale === "ja"
          ? "歴史的な建築や地域文化に触れられます"
          : "Visitors can experience historic architecture and local culture"
        : categories.includes("Museum") || categories.includes("Aquarium")
          ? locale === "ja"
            ? "展示を通して地域の文化やテーマを学べます"
            : "Visitors can explore focused exhibits and learn about the venue's subject"
          : locale === "ja"
            ? "地域の雰囲気や見どころを気軽に楽しめます"
            : "Visitors can experience the area's character and main sights";
  return locale === "ja"
    ? `${name}は${city || "周辺地域"}にある観光スポットです。${focus}。所要時間、営業状況、料金は訪問前に公式情報をご確認ください。`
    : `${name} is a visitor destination in ${city || "the surrounding area"}. ${focus}. Check current hours, access, and admission information before visiting.`;
}

for (const destination of catalog) {
  if (!destination.tags?.includes("v1.9.2")) continue;
  touchedIds.add(destination.id);
  const profile = semantics(destination.name);
  destination.kind = profile.kind;
  destination.categories = profile.categories;
  destination.tags = Array.from(
    new Set([
      ...profile.categories,
      destination.tags.find((tag) => tag.endsWith("City")) || "",
      "v1.9.2",
    ]),
  ).filter(Boolean);
  destination.indoorPercent = profile.indoorPercent;
  destination.comfort = {
    ...destination.comfort,
    rainFriendly:
      profile.indoorPercent >= 80 ? 8 : profile.indoorPercent >= 50 ? 6 : 3,
  };
  destination.ratings = correctedRatings(
    destination.ratings,
    profile.indoorPercent,
  );
  destination.ratingMetadata = {
    rubricVersion: 1,
    method: "assisted",
    confidence: "low",
  };
  destination.weatherDependence =
    profile.indoorPercent >= 80
      ? "low"
      : profile.indoorPercent >= 50
        ? "moderate"
        : "high";

  const freeForm = new Set<DestinationKind>([
    "beach",
    "castle",
    "district",
    "garden",
    "island",
    "market",
    "mountain",
    "park",
    "shopping",
    "shrine",
    "street",
    "temple",
    "waterfall",
  ]).has(profile.kind);
  if (freeForm && destination.budgetBreakdown) {
    destination.budgetBreakdown.tickets = 0;
    destination.budgetBreakdown.food =
      destination.budgetRecommended -
      destination.budgetBreakdown.transport -
      destination.budgetBreakdown.cafe;
  }

  destination.transportOptions = Object.fromEntries(
    Object.keys(destination.transportOptions || {})
      .filter((mode) => mode === "train" || mode === "bus" || mode === "car")
      .map((mode) => [mode, mode === "train" ? 25 : 35]),
  );
  if (!destination.transportOptions.train) {
    destination.transportOptions.train = 25;
  }
  destination.totalTripHours = destination.recommendedVisitHours.max + 1;

  const enDescription = description(destination, profile.categories, "en");
  const jaDescription = description(destination, profile.categories, "ja");
  destination.description = enDescription;
  destination.highlights = profile.categories;
  destination.content = {
    en: {
      name: destination.content?.en.name || destination.name,
      description: enDescription,
      highlights: profile.categories,
    },
    ja: {
      name:
        destination.content?.ja?.name || destination.nameJa || destination.name,
      description: jaDescription,
      highlights: profile.categories.map(
        (category) => CATEGORY_JA[category] || category,
      ),
    },
  };
  if (destination.editorial) {
    destination.editorial.lifecycle = "in_review";
    delete destination.editorial.reviewedAt;
    delete destination.editorial.reviewedBy;
    destination.editorial.freshness = "review_due";
    destination.editorial.changeSummary =
      "v1.9.3 semantic audit; awaiting individual editorial review";
    destination.editorial.changes = [
      ...(destination.editorial.changes || []),
      {
        changedAt: "2026-07-29",
        changedBy: "TabiMap data audit",
        summary:
          "Canonicalized type, localized categories, budgets, ratings, and transport semantics",
        method: "assisted",
      },
    ];
  }
}

const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
for (const id of ["boso-no-mura", "chiba-sawara", "katori-jingu"]) {
  const destination = byId.get(id);
  if (!destination) continue;
  delete destination.relationships?.parentDestinationId;
  destination.role = "standalone";
  delete destination.areaId;
  touchedIds.add(id);
}
const narita = byId.get("narita-city");
if (narita?.relationships) {
  touchedIds.add(narita.id);
  const related = ["boso-no-mura", "chiba-sawara", "katori-jingu"];
  narita.relationships.featuredDestinationIds =
    narita.relationships.featuredDestinationIds?.filter(
      (id) => !related.includes(id),
    );
  narita.relationships.relatedDestinationIds = Array.from(
    new Set([
      ...(narita.relationships.relatedDestinationIds || []),
      ...related,
    ]),
  );
}
const animalKingdom = byId.get("kobe-animal-kingdom");
if (animalKingdom) animalKingdom.areaId = "port-island";

fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
for (const destination of catalog.filter(({ id }) => touchedIds.has(id))) {
  fs.writeFileSync(
    path.join(detailsDirectory, `${destination.id}.json`),
    `${JSON.stringify(destination, null, 2)}\n`,
  );
}

console.log("Audited 160 v1.9.2 expansion records.");
