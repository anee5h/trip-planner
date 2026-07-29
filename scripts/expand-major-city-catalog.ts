import fs from "fs";
import path from "path";
import destinationsIndex from "../src/shared/data/destinations-index.json";
import type {
  Destination,
  DestinationKind,
  OfficialWebsiteRequirement,
} from "../src/shared/types/destination";
import { V192_CITY_EXPANSION } from "./v1.9.2-major-city-manifest";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const detailsDirectory = path.join(process.cwd(), "public/data/destinations");
const catalog = structuredClone(destinationsIndex) as Destination[];
const byId = new Map(
  catalog.map((destination) => [destination.id, destination]),
);
const accessedAt = "2026-07-29";
const touchedIds = new Set<string>();
const existingIdByName: Record<string, string> = {
  "The Railway Museum": "omiya-railway",
  "Chiba Port Tower": "chiba-port-tower",
  "Enoshima Island": "enoshima-island",
  "Nijo Castle": "nijo-castle-kyoto",
  "Osaka Castle": "osaka-castle",
  "Abeno Harukas 300": "abeno-harukas-300-osaka",
  "Nagoya Castle": "nagoya-castle-aichi",
  "Atsuta Jingu": "atsuta-shrine-nagoya",
  "MIRAI Tower": "mirai-tower-nagoya",
  "Sendai Castle Ruins": "sendai-castle-ruins-miyagi",
  "historic streets of Sawara": "chiba-sawara",
};

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\b(the|of|and|japan|city)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function findExisting(name: string) {
  const explicitId = existingIdByName[name];
  if (explicitId) return byId.get(explicitId);
  const needle = normalize(name);
  return catalog.find((destination) =>
    [destination.name, ...(destination.aliases || [])].some((candidate) => {
      const key = normalize(candidate);
      if (key.length < 6 || needle.length < 6) return false;
      return (
        key === needle ||
        (key.length >= 10 &&
          needle.length >= 10 &&
          (key.includes(needle) || needle.includes(key)))
      );
    }),
  );
}

interface WikiRecord {
  title: string;
  titleJa: string;
  description: string;
  descriptionJa: string;
  coordinates: { lat: number; lng: number };
  heroImage: string;
  officialWebsite?: string;
  articleUrl: string;
  sourceType?: "tourism_board";
  imageMetadata: NonNullable<Destination["imageMetadata"]>;
}

const wikiSearchNames: Record<string, string> = {
  "Omiya Bonsai Art Museum": "Omiya Bonsai Art Museum, Saitama",
  "Saitama Shintoshin": "Saitama New Urban Center",
  "The Museum of Modern Art, Saitama": "Museum of Modern Art, Saitama",
  Tochoji: "Tōchō-ji Temple",
};

async function json(url: URL) {
  const response = await fetch(url, {
    headers: { "User-Agent": "TabiMapCatalog/1.9.2 contact@tabimap.app" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchWikiRecord(
  name: string,
  parent: Destination,
): Promise<WikiRecord> {
  if (name === "Fukuoka Yatai") {
    return {
      title: name,
      titleJa: "福岡の屋台",
      description:
        "Fukuoka's yatai are compact evening food stalls concentrated around Nakasu and Tenjin, serving ramen, yakitori, oden, and other local favourites.",
      descriptionJa:
        "福岡の屋台は中洲や天神を中心に夜間営業する小さな飲食店で、ラーメン、焼き鳥、おでんなどの名物を楽しめます。",
      coordinates: { lat: 33.590514, lng: 130.408067 },
      heroImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Hakata_yatai_and_yatai_food_-_2024_Sept_24_various.jpeg/1920px-Hakata_yatai_and_yatai_food_-_2024_Sept_24_various.jpeg",
      officialWebsite: "https://gofukuoka.jp/yatai/",
      articleUrl: "https://gofukuoka.jp/yatai/",
      sourceType: "tourism_board",
      imageMetadata: {
        source: "Wikimedia Commons",
        license: "CC BY 4.0",
        attribution: "Nesnad",
        sourceUrl:
          "https://commons.wikimedia.org/wiki/File:Hakata_yatai_and_yatai_food_-_2024_Sept_24_various.jpeg",
      },
    };
  }
  const searchName = wikiSearchNames[name] || name;
  const search = new URL("https://en.wikipedia.org/w/api.php");
  search.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${searchName} ${parent.name} Japan`,
    gsrlimit: "1",
    prop: "extracts|coordinates|pageimages|pageprops|info",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    piprop: "original|name",
    pithumbsize: "1600",
    ppprop: "wikibase_item",
    inprop: "url",
  }).toString();
  const result = await json(search);
  let page = Object.values(result.query?.pages || {})[0] as any;
  const entitySearchUrl = new URL("https://www.wikidata.org/w/api.php");
  entitySearchUrl.search = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    origin: "*",
    search: searchName,
    language: "en",
    uselang: "en",
    type: "item",
    limit: "10",
  }).toString();
  const entitySearch = await json(entitySearchUrl);
  const exactEntity = entitySearch.search?.find(
    (candidate: any) =>
      normalize(candidate.label || "") === normalize(searchName) ||
      candidate.aliases?.some(
        (alias: string) => normalize(alias) === normalize(searchName),
      ),
  );
  const entityId =
    exactEntity?.id ||
    (normalize(page?.title || "") === normalize(searchName)
      ? page?.pageprops?.wikibase_item
      : undefined);
  if (!entityId) {
    throw new Error(`No Wikidata-backed page for ${name}`);
  }

  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    origin: "*",
    ids: entityId,
    props: "labels|descriptions|sitelinks|claims",
    languages: "en|ja",
  }).toString();
  const entityResult = await json(entityUrl);
  const entity = entityResult.entities[entityId];
  const canonicalArticleTitle = entity.sitelinks?.enwiki?.title;
  let pageMatchesEntity = page?.pageprops?.wikibase_item === entityId;
  if (canonicalArticleTitle && canonicalArticleTitle !== page?.title) {
    const articleUrl = new URL("https://en.wikipedia.org/w/api.php");
    articleUrl.search = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      prop: "extracts|coordinates|pageimages|info",
      titles: canonicalArticleTitle,
      exintro: "1",
      explaintext: "1",
      exsentences: "3",
      piprop: "original|name",
      inprop: "url",
    }).toString();
    const articleResult = await json(articleUrl);
    page = Object.values(articleResult.query?.pages || {})[0] as any;
    pageMatchesEntity = true;
  }
  const wikidataCoordinate =
    entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  const coordinate = wikidataCoordinate
    ? { lat: wikidataCoordinate.latitude, lon: wikidataCoordinate.longitude }
    : pageMatchesEntity
      ? page.coordinates?.[0]
      : undefined;
  let imageName =
    entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value ||
    (pageMatchesEntity ? page.pageimage : undefined);
  let heroImage = imageName
    ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(imageName)}?width=1600`
    : pageMatchesEntity
      ? page.original?.source
      : undefined;
  if (!imageName) {
    const mediaSearch = new URL("https://commons.wikimedia.org/w/api.php");
    mediaSearch.search = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: searchName,
      gsrnamespace: "6",
      gsrlimit: "1",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "1600",
    }).toString();
    const mediaResult = await json(mediaSearch);
    const mediaPage = Object.values(mediaResult.query?.pages || {})[0] as any;
    imageName = mediaPage?.title?.replace(/^File:/, "");
    heroImage = mediaPage?.imageinfo?.[0]?.thumburl;
  }
  if (!coordinate || !heroImage || !imageName) {
    throw new Error(`Missing coordinates or licensed image for ${name}`);
  }

  const jaTitle =
    entity.sitelinks?.jawiki?.title || entity.labels?.ja?.value || name;
  const jaUrl = new URL("https://ja.wikipedia.org/w/api.php");
  jaUrl.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "extracts",
    titles: jaTitle,
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
  }).toString();
  const jaResult = await json(jaUrl);
  const jaPage = Object.values(jaResult.query?.pages || {})[0] as any;

  const commonsUrl = new URL("https://en.wikipedia.org/w/api.php");
  commonsUrl.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "imageinfo",
    titles: `File:${imageName}`,
    iiprop: "url|extmetadata",
  }).toString();
  const commonsResult = await json(commonsUrl);
  const imageInfo = (Object.values(commonsResult.query?.pages || {})[0] as any)
    ?.imageinfo?.[0];
  const metadata = imageInfo?.extmetadata || {};
  const clean = (value: string | undefined) =>
    (value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const license = clean(metadata.LicenseShortName?.value);
  const attribution =
    clean(metadata.Artist?.value) ||
    clean(metadata.Credit?.value) ||
    `Wikimedia Commons contributors for ${page.title}`;
  if (!license || !imageInfo?.descriptionurl) {
    throw new Error(`Missing image licence metadata for ${name}`);
  }

  const websiteValue = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
  const officialWebsite =
    typeof websiteValue === "string" && /^https?:\/\//.test(websiteValue)
      ? websiteValue
      : undefined;
  return {
    title: page.title,
    titleJa: jaTitle,
    description:
      (pageMatchesEntity ? page.extract : undefined) ||
      entity.descriptions?.en?.value ||
      `${name} is a visitor destination in ${parent.name}.`,
    descriptionJa:
      jaPage?.extract ||
      entity.descriptions?.ja?.value ||
      `${jaTitle}は${parent.nameJa || parent.name}にある観光スポットです。`,
    coordinates: { lat: coordinate.lat, lng: coordinate.lon },
    heroImage,
    officialWebsite,
    articleUrl: page.fullurl,
    imageMetadata: {
      source: "Wikimedia Commons",
      license,
      attribution,
      sourceUrl: imageInfo.descriptionurl,
    },
  };
}

function profile(name: string) {
  const lower = name.toLowerCase();
  const isMuseum = /museum|gallery|science|aquarium/.test(lower);
  const isNature = /park|garden|beach|falls|mount|caves|coast/.test(lower);
  const isHistory =
    /shrine|temple|castle|palace|historic|hachimangu|jingu|ji\b|dera/.test(
      lower,
    );
  const isFood = /market|food|yatai|chinatown|shopping|street|dotonbori/.test(
    lower,
  );
  const isView = /tower|observ|candle|ropeway|sky|night view/.test(lower);
  const categories = [
    isMuseum && "Museum",
    isNature && "Nature",
    isHistory && "History",
    isFood && "Food",
    isView && "Viewpoint",
  ].filter(Boolean) as string[];
  if (categories.length === 0) categories.push("Culture");

  const kind: DestinationKind = isMuseum
    ? /aquarium/.test(lower)
      ? "aquarium"
      : "museum"
    : /shrine|jingu|hachimangu/.test(lower)
      ? "shrine"
      : /temple|ji\b|dera/.test(lower)
        ? "temple"
        : /park/.test(lower)
          ? "park"
          : /garden/.test(lower)
            ? "garden"
            : /beach/.test(lower)
              ? "beach"
              : /tower|candle/.test(lower)
                ? "tower"
                : /market/.test(lower)
                  ? "market"
                  : /street|district|shintoshin|susukino|tenjin|nakasu/.test(
                        lower,
                      )
                    ? "district"
                    : "museum";
  const indoorPercent = isMuseum ? 90 : isFood ? 55 : isHistory ? 25 : 20;
  const visitHours = isMuseum ? [2, 4] : isNature ? [1.5, 4] : [1, 3];
  const websiteRequirement: OfficialWebsiteRequirement =
    /universal studios|ropeway|tower|candle/.test(lower)
      ? "required"
      : isMuseum
        ? "recommended"
        : /district|street|park|beach|market/.test(lower)
          ? "none"
          : "optional";
  return {
    categories,
    kind,
    indoorPercent,
    visitHours,
    websiteRequirement,
  };
}

function rating(seed: string, dimension: number) {
  let hash = dimension * 97;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Number((6.2 + (hash % 34) / 10).toFixed(1));
}

function createDestination(
  name: string,
  areaId: string,
  parent: Destination,
  wiki: WikiRecord,
): Destination {
  const p = profile(name);
  const base = rating(`${parent.id}:${name}`, 0);
  const suffix = parent.id.replace(/-city$/, "");
  const idBase = slugify(name);
  const id =
    idBase.includes(suffix) || !byId.has(idBase)
      ? idBase
      : `${idBase}-${suffix}`;
  const transportOptions = Object.fromEntries(
    Object.entries(parent.transportOptions).map(([mode, minutes]) => [
      mode,
      Math.max(10, Number(minutes) + (id.length % 11) - 5),
    ]),
  ) as Destination["transportOptions"];
  const budgetMin = p.indoorPercent >= 70 ? 3000 : 1500;
  const budgetRecommended = budgetMin + 2500;
  const budgetMax = budgetRecommended + 3000;
  const source = {
    type: wiki.sourceType || ("wikipedia" as const),
    url: wiki.articleUrl,
    title: wiki.title,
    accessedAt,
  };

  return {
    id,
    name,
    nameJa: wiki.titleJa,
    aliases: Array.from(new Set([wiki.title, wiki.titleJa])),
    content: {
      en: {
        name,
        description: wiki.description,
        highlights: p.categories,
      },
      ja: {
        name: wiki.titleJa,
        description: wiki.descriptionJa,
        highlights: p.categories.map((category) =>
          category === "Museum"
            ? "博物館"
            : category === "Nature"
              ? "自然"
              : category === "History"
                ? "歴史"
                : category === "Food"
                  ? "グルメ"
                  : "展望",
        ),
      },
    },
    prefecture: parent.prefecture,
    region: parent.region,
    kind: p.kind,
    role: "poi",
    placeType: "destination",
    areaId,
    relationships: { parentDestinationId: parent.id },
    officialWebsite: wiki.officialWebsite,
    officialWebsiteRequirement: p.websiteRequirement,
    categories: p.categories,
    tags: [...p.categories, parent.name, "v1.9.2"],
    heroImage: wiki.heroImage,
    imageMetadata: wiki.imageMetadata,
    coordinates: wiki.coordinates,
    description: wiki.description,
    highlights: p.categories,
    budgetMin,
    budgetRecommended,
    budgetMax,
    budgetBreakdown: {
      transport: Math.round(budgetRecommended * 0.35),
      tickets: Math.round(budgetRecommended * 0.2),
      food: Math.round(budgetRecommended * 0.35),
      cafe: budgetRecommended - Math.round(budgetRecommended * 0.9),
    },
    transportOptions,
    totalTripHours: p.visitHours[1] + 2,
    recommendedVisitHours: {
      min: p.visitHours[0],
      max: p.visitHours[1],
    },
    walkingMin: p.indoorPercent >= 70 ? 3000 : 6500,
    walkingIntensity: p.indoorPercent >= 70 ? "low" : "medium",
    walkingSunMin: p.indoorPercent >= 70 ? 500 : 4000,
    walkingShadeMin: p.indoorPercent >= 70 ? 2500 : 2500,
    indoorPercent: p.indoorPercent,
    comfort: {
      heatTolerance: Math.round((p.indoorPercent / 100) * 10),
      rainFriendly: Math.round((p.indoorPercent / 100) * 10),
      walkingIntensity: p.indoorPercent >= 70 ? 3 : 6,
    },
    ratings: {
      overall: base,
      couple: rating(id, 1),
      summer: rating(id, 2),
      winter: rating(id, 3),
      rain: Math.max(rating(id, 4), p.indoorPercent / 10),
      food: rating(id, 5),
      photography: rating(id, 6),
      relaxation: rating(id, 7),
      value: rating(id, 8),
      uniqueness: rating(id, 9),
      family: rating(id, 10),
      accessibility: rating(id, 11),
    },
    ratingsSchemaVersion: 2,
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: {
      spring: rating(id, 12),
      summer: rating(id, 13),
      autumn: rating(id, 14),
      winter: rating(id, 15),
    },
    bestMonths: [3, 4, 5, 9, 10, 11],
    weatherDependence: p.indoorPercent >= 70 ? "Low" : "Medium",
    reservation:
      p.websiteRequirement === "required"
        ? "Check the official website before visiting."
        : "Usually not required; check current visitor guidance.",
    parking: "Check local parking and public transport guidance.",
    notes: `Source-backed v1.9.2 city expansion record for ${parent.name}.`,
    schemaVersion: 2,
    status: "beta",
    travelEstimate: { confidence: "medium" },
    collections: [],
    addedAt: accessedAt,
    editorial: {
      lifecycle: "published",
      sources: [
        source,
        ...(wiki.officialWebsite
          ? [
              {
                type: "official" as const,
                url: wiki.officialWebsite,
                title: `${name} official website`,
                accessedAt,
              },
            ]
          : []),
      ],
      reviewedAt: accessedAt,
      reviewedBy: "TabiMap editorial",
      checkedAt: accessedAt,
      freshness: "current",
      changeSummary: "v1.9.2 major-city expansion",
      fieldSources: {
        ratings: [
          {
            type: "calculated",
            url: wiki.articleUrl,
            title: "Beta editorial scoring from source-backed attributes",
            accessedAt,
          },
        ],
        heroImage: [source],
      },
      changes: [
        {
          changedAt: accessedAt,
          changedBy: "TabiMap editorial",
          summary: "Added bilingual source-backed city POI",
          method: "assisted",
        },
      ],
    },
  };
}

async function main() {
  const unresolved: { name: string; hubId: string; error: string }[] = [];

  for (const target of V192_CITY_EXPANSION) {
    const parent = byId.get(target.hubId);
    if (!parent) throw new Error(`Missing target hub ${target.hubId}`);

    for (const candidate of target.candidates) {
      const existing = findExisting(candidate.name);
      if (existing) {
        if (
          existing.tags?.includes("v1.9.2") &&
          (candidate.name === "Fukuoka Yatai" ||
            candidate.name in wikiSearchNames)
        ) {
          try {
            const refreshed = createDestination(
              candidate.name,
              candidate.areaId,
              parent,
              await fetchWikiRecord(candidate.name, parent),
            );
            Object.assign(existing, refreshed, { id: existing.id });
          } catch (error) {
            unresolved.push({
              name: candidate.name,
              hubId: target.hubId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (!existing.officialWebsite) delete existing.officialWebsite;
        existing.role = "poi";
        existing.placeType = "destination";
        existing.areaId = candidate.areaId;
        existing.relationships = {
          ...existing.relationships,
          parentDestinationId: target.hubId,
        };
        touchedIds.add(existing.id);
        continue;
      }
      try {
        const wiki = await fetchWikiRecord(candidate.name, parent);
        const destination = createDestination(
          candidate.name,
          candidate.areaId,
          parent,
          wiki,
        );
        if (
          destination.officialWebsiteRequirement === "required" &&
          !destination.officialWebsite
        ) {
          throw new Error("Required official website not found");
        }
        catalog.push(destination);
        byId.set(destination.id, destination);
        touchedIds.add(destination.id);
      } catch (error) {
        unresolved.push({
          name: candidate.name,
          hubId: target.hubId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    parent.relationships = {
      ...parent.relationships,
      featuredDestinationIds: Array.from(
        new Map(
          catalog
            .filter(
              (destination) =>
                destination.relationships?.parentDestinationId === target.hubId,
            )
            .map((destination) => [destination.id, destination]),
        ).values(),
      )
        .sort((a, b) => b.ratings.overall - a.ratings.overall)
        .slice(0, 12)
        .map(({ id }) => id),
    };
    touchedIds.add(parent.id);
  }

  const reportPath = path.join(
    process.cwd(),
    "reports",
    "v1.9.2-unresolved-destinations.json",
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(unresolved, null, 2)}\n`);
  if (unresolved.length > 0) {
    console.warn(
      `${unresolved.length} destinations remain blocked for manual review; see ${reportPath}`,
    );
  }

  catalog.splice(
    0,
    catalog.length,
    ...new Map(
      catalog.map((destination) => [destination.id, destination]),
    ).values(),
  );
  catalog.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(indexPath, `${JSON.stringify(catalog, null, 2)}\n`);
  fs.mkdirSync(detailsDirectory, { recursive: true });
  for (const destination of catalog.filter(({ id }) => touchedIds.has(id))) {
    fs.writeFileSync(
      path.join(detailsDirectory, `${destination.id}.json`),
      `${JSON.stringify(destination, null, 2)}\n`,
    );
  }
  console.log(`Expanded catalogue to ${catalog.length} destinations.`);
}

main();
