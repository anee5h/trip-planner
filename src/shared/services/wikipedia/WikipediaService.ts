import {
  extractWikipediaMapping,
  titleMatchesDestination,
  validateWikipediaCandidate,
  type WikipediaCandidate,
  type WikipediaDestination,
  type WikipediaLanguage,
  type WikipediaMapping,
} from "./WikipediaValidation";

const cache = new Map<string, string | null>();

/**
 * Wikipedia data is rendered only after the resolver has validated the page
 * identity, language, semantic type, and (when available) geography.
 *
 * Lead images remain an unverified Wikimedia fallback. The text card itself is
 * gated by WikipediaValidation; an HTTP 200 is never sufficient evidence.
 */
export interface WikipediaSummary {
  extract: string;
  url: string;
  title: string;
  language: WikipediaLanguage;
  pageId?: number;
  wikidataId?: string;
  coordinates?: { lat: number; lng: number };
  confidence: "high";
  matchMethod: "deterministic" | "exact-title";
  japaneseTitle?: string;
  japaneseExtract?: string;
  japaneseUrl?: string;
  leadImage?: string;
  leadImageLicense?: string;
}

interface WikipediaPageData {
  title?: string;
  type?: string;
  pageid?: number;
  wikibase_item?: string;
  extract?: string;
  description?: string;
  coordinates?:
    { lat: number; lon: number } | Array<{ lat: number; lon: number }>;
  content_urls?: { desktop?: { page?: string } };
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
}

const WIKIPEDIA_HOST: Record<WikipediaLanguage, string> = {
  en: "https://en.wikipedia.org",
  ja: "https://ja.wikipedia.org",
};

function summaryUrl(language: WikipediaLanguage, title: string): string {
  return `${WIKIPEDIA_HOST[language]}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
}

function searchUrl(language: WikipediaLanguage, query: string): string {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
    srnamespace: "0",
    format: "json",
    origin: "*",
  });
  return `${WIKIPEDIA_HOST[language]}/w/api.php?${params.toString()}`;
}

function pageInfoUrl(language: WikipediaLanguage, pageId: number): string {
  const params = new URLSearchParams({
    action: "query",
    pageids: String(pageId),
    prop: "info",
    format: "json",
    origin: "*",
  });
  return `${WIKIPEDIA_HOST[language]}/w/api.php?${params.toString()}`;
}

function langLinkUrl(
  language: WikipediaLanguage,
  title: string,
  targetLanguage: WikipediaLanguage,
): string {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "langlinks",
    lllang: targetLanguage,
    format: "json",
    origin: "*",
  });
  return `${WIKIPEDIA_HOST[language]}/w/api.php?${params.toString()}`;
}

function wikidataSitelinkUrl(
  wikidataId: string,
  language: WikipediaLanguage,
): string {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: wikidataId,
    props: "sitelinks",
    sitefilter: `${language}wiki`,
    format: "json",
    origin: "*",
  });
  return `https://www.wikidata.org/w/api.php?${params.toString()}`;
}

function cacheKey(
  destination: WikipediaDestination,
  locale: WikipediaLanguage,
): string {
  return `${destination.id ?? destination.name}_${destination.prefecture ?? ""}_${locale}`;
}

function coordinatesFromData(
  coordinates: WikipediaPageData["coordinates"],
): { lat: number; lng: number } | undefined {
  const point = Array.isArray(coordinates) ? coordinates[0] : coordinates;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    return undefined;
  }
  return { lat: point.lat, lng: point.lon };
}

function candidateFromData(
  language: WikipediaLanguage,
  requestedTitle: string,
  data: WikipediaPageData,
): WikipediaCandidate {
  return {
    language,
    title: data.title || requestedTitle,
    extract: data.extract || "",
    description: data.description,
    type: data.type,
    pageId: data.pageid,
    wikidataId: data.wikibase_item,
    url:
      data.content_urls?.desktop?.page ||
      `${WIKIPEDIA_HOST[language]}/wiki/${encodeURIComponent(data.title || requestedTitle)}`,
    coordinates: coordinatesFromData(data.coordinates),
    leadImage: data.originalimage?.source || data.thumbnail?.source,
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("Wikipedia request failed:", error);
    return null;
  }
}

async function fetchPage(
  language: WikipediaLanguage,
  title: string,
): Promise<WikipediaCandidate | null> {
  const data = await fetchJson(summaryUrl(language, title));
  if (!data || typeof data !== "object") return null;
  return candidateFromData(language, title, data as WikipediaPageData);
}

async function fetchPageTitleById(
  language: WikipediaLanguage,
  pageId: number,
): Promise<string | undefined> {
  const data = await fetchJson(pageInfoUrl(language, pageId));
  if (!data || typeof data !== "object") return undefined;
  const pages = (
    data as {
      query?: { pages?: Record<string, { title?: string; missing?: string }> };
    }
  ).query?.pages;
  const page = pages && Object.values(pages)[0];
  return page && !page.missing ? page.title : undefined;
}

async function fetchWikidataSitelink(
  wikidataId: string,
  language: WikipediaLanguage,
): Promise<string | undefined> {
  const data = await fetchJson(wikidataSitelinkUrl(wikidataId, language));
  if (!data || typeof data !== "object") return undefined;
  const entity = (
    data as {
      entities?: Record<
        string,
        { sitelinks?: Record<string, { title?: string }> }
      >;
    }
  ).entities?.[wikidataId];
  return entity?.sitelinks?.[`${language}wiki`]?.title;
}

async function fetchLanguageLink(
  language: WikipediaLanguage,
  title: string,
  targetLanguage: WikipediaLanguage,
): Promise<string | undefined> {
  const data = await fetchJson(langLinkUrl(language, title, targetLanguage));
  if (!data || typeof data !== "object") return undefined;
  const pages = (
    data as {
      query?: {
        pages?: Record<string, { langlinks?: Array<{ "*"?: string }> }>;
      };
    }
  ).query?.pages;
  const firstPage = pages && Object.values(pages)[0];
  return firstPage?.langlinks?.[0]?.["*"];
}

function primaryName(
  destination: WikipediaDestination,
  locale: WikipediaLanguage,
): string {
  return locale === "ja"
    ? destination.nameJa || destination.name
    : destination.name;
}

function searchQuery(
  destination: WikipediaDestination,
  locale: WikipediaLanguage,
): string {
  const name = primaryName(destination, locale);
  if (locale === "ja") return `${name} 日本`;
  return `${name} ${destination.prefecture || ""} Japan`.trim();
}

async function searchTitles(
  destination: WikipediaDestination,
  locale: WikipediaLanguage,
): Promise<string[]> {
  const data = await fetchJson(
    searchUrl(locale, searchQuery(destination, locale)),
  );
  if (!data || typeof data !== "object") return [];
  const results = (data as { query?: { search?: Array<{ title?: string }> } })
    .query?.search;
  return Array.from(
    new Set(
      (results ?? [])
        .map((result) => result.title)
        .filter((title): title is string => Boolean(title)),
    ),
  );
}

function validationMapping(
  mapping: WikipediaMapping,
  candidate: WikipediaCandidate,
): WikipediaMapping {
  return {
    ...mapping,
    // A language-link target is identified by the link itself. When it carries
    // a QID, retain it as a second identity check; when it does not, do not
    // fabricate one.
    ...(mapping.title ? { title: mapping.title } : {}),
    ...(candidate.wikidataId && !mapping.wikidataId
      ? { wikidataId: candidate.wikidataId }
      : {}),
  };
}

async function buildSummary(
  candidate: WikipediaCandidate,
  matchMethod: WikipediaSummary["matchMethod"],
): Promise<WikipediaSummary> {
  let japaneseTitle: string | undefined;
  if (candidate.language === "en") {
    japaneseTitle = await fetchLanguageLink("en", candidate.title, "ja");
  }
  return {
    extract: candidate.extract,
    url: candidate.url!,
    title: candidate.title,
    language: candidate.language,
    pageId: candidate.pageId,
    wikidataId: candidate.wikidataId,
    coordinates: candidate.coordinates,
    confidence: "high",
    matchMethod,
    japaneseTitle,
    leadImage: candidate.leadImage,
    leadImageLicense: "Wikimedia Commons (Unverified)",
  };
}

async function resolveExplicitMapping(
  destination: WikipediaDestination,
  locale: WikipediaLanguage,
  mapping: WikipediaMapping,
): Promise<WikipediaSummary | null> {
  const sourceTitle =
    mapping.pageId !== undefined
      ? ((await fetchPageTitleById(mapping.language, mapping.pageId)) ??
        (mapping.wikidataId
          ? await fetchWikidataSitelink(mapping.wikidataId, mapping.language)
          : mapping.title))
      : mapping.wikidataId
        ? ((await fetchWikidataSitelink(
            mapping.wikidataId,
            mapping.language,
          )) ?? mapping.title)
        : mapping.title;

  if (mapping.language !== locale) {
    const sourceCandidate = sourceTitle
      ? await fetchPage(mapping.language, sourceTitle)
      : null;
    if (!sourceCandidate) return null;
    const sourceValidation = validateWikipediaCandidate(
      destination,
      sourceCandidate,
      {
        locale: mapping.language,
        mapping,
      },
    );
    if (!sourceValidation.accepted) return null;
    const linkedTitle = await fetchLanguageLink(
      mapping.language,
      sourceCandidate.title,
      locale,
    );
    if (!linkedTitle) return null;
    const targetCandidate = await fetchPage(locale, linkedTitle);
    if (!targetCandidate) return null;
    if (
      sourceCandidate.wikidataId &&
      targetCandidate.wikidataId &&
      sourceCandidate.wikidataId !== targetCandidate.wikidataId
    ) {
      return null;
    }
    const targetValidation = validateWikipediaCandidate(
      destination,
      targetCandidate,
      {
        locale,
        mapping: validationMapping(
          { language: locale, title: linkedTitle },
          targetCandidate,
        ),
      },
    );
    return targetValidation.accepted
      ? buildSummary(targetCandidate, "deterministic")
      : null;
  }

  if (!sourceTitle) return null;
  const candidate = await fetchPage(locale, sourceTitle);
  if (!candidate) return null;
  const validation = validateWikipediaCandidate(destination, candidate, {
    locale,
    mapping,
  });
  return validation.accepted ? buildSummary(candidate, "deterministic") : null;
}

export class WikipediaService {
  static clearCache(): void {
    cache.clear();
  }

  static async fetchSummary(
    destination: WikipediaDestination,
    locale?: WikipediaLanguage,
  ): Promise<WikipediaSummary | null>;
  static async fetchSummary(
    name: string,
    prefecture?: string,
    locale?: WikipediaLanguage,
  ): Promise<WikipediaSummary | null>;
  static async fetchSummary(
    destinationOrName: WikipediaDestination | string,
    prefectureOrLocale?: string | WikipediaLanguage,
    legacyLocale: WikipediaLanguage = "en",
  ): Promise<WikipediaSummary | null> {
    const destination: WikipediaDestination =
      typeof destinationOrName === "string"
        ? {
            name: destinationOrName,
            prefecture:
              typeof prefectureOrLocale === "string"
                ? prefectureOrLocale
                : undefined,
          }
        : destinationOrName;
    const locale: WikipediaLanguage =
      typeof destinationOrName === "string"
        ? legacyLocale
        : (prefectureOrLocale as WikipediaLanguage | undefined) || "en";
    const key = cacheKey(destination, locale);
    if (cache.has(key)) {
      const cached = cache.get(key);
      return cached ? (JSON.parse(cached) as WikipediaSummary) : null;
    }

    const mapping = extractWikipediaMapping(destination);
    if (mapping) {
      const result = await resolveExplicitMapping(destination, locale, mapping);
      cache.set(key, result ? JSON.stringify(result) : null);
      return result;
    }

    const directTitle = primaryName(destination, locale);
    const directCandidate = await fetchPage(locale, directTitle);
    if (directCandidate) {
      const directValidation = validateWikipediaCandidate(
        destination,
        directCandidate,
        {
          locale,
        },
      );
      if (directValidation.accepted) {
        const result = await buildSummary(directCandidate, "exact-title");
        cache.set(key, JSON.stringify(result));
        return result;
      }
    }

    // Search is a bounded fallback. It may only consider exact/normalized
    // title or alias matches; the first result and nearest fuzzy result are
    // never accepted. Multiple matching candidates fail closed as ambiguous.
    const titles = await searchTitles(destination, locale);
    const matchingTitles = titles.filter((title) =>
      titleMatchesDestination(destination, title),
    );
    if (matchingTitles.length !== 1) {
      cache.set(key, null);
      return null;
    }
    const searchedCandidate = await fetchPage(locale, matchingTitles[0]);
    if (!searchedCandidate) {
      cache.set(key, null);
      return null;
    }
    const validation = validateWikipediaCandidate(
      destination,
      searchedCandidate,
      {
        locale,
        searchCandidateCount: matchingTitles.length,
      },
    );
    if (!validation.accepted) {
      cache.set(key, null);
      return null;
    }
    const result = await buildSummary(searchedCandidate, "exact-title");
    cache.set(key, JSON.stringify(result));
    return result;
  }
}
