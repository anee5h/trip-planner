const cache = new Map<string, string | null>();

/**
 * NOTE (LICENSING): leadImage is retrieved as an unverified fallback from Wikipedia REST API
 * (data.originalimage?.source || data.thumbnail?.source) for personal/demonstration use.
 * Images hosted on Wikimedia Commons have varying licenses (Public Domain, CC BY-SA, GFDL,
 * or Fair Use). If deployed in commercial or public production, an explicit Commons API
 * imageinfo query (prop=imageinfo&iiprop=extmetadata) must be added to verify individual
 * image reuse rights before rendering.
 */
export interface WikipediaSummary {
  extract: string;
  url: string;
  japaneseTitle?: string;
  japaneseExtract?: string;
  japaneseUrl?: string;
  leadImage?: string;
  leadImageLicense?: string;
}

export class WikipediaService {
  private static async fetchJapaneseSummary(title?: string): Promise<{
    extract?: string;
    url?: string;
  }> {
    if (!title) return {};
    try {
      const response = await fetch(
        `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      if (!response.ok) return {};
      const data = await response.json();
      if (data.type === "disambiguation" || !data.extract) return {};
      return {
        extract: data.extract,
        url:
          data.content_urls?.desktop?.page ||
          `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      };
    } catch (err) {
      console.warn("Error fetching Japanese Wikipedia summary:", err);
      return {};
    }
  }
  /**
   * Fetches Japanese language title for an English Wikipedia article title.
   * e.g. "Hakone" -> "箱根町", "Mount Takao" -> "高尾山"
   */
  static async fetchJapaneseTitle(title: string): Promise<string | undefined> {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          title,
        )}&prop=langlinks&lllang=ja&format=json&origin=*`,
      );
      if (res.ok) {
        const data = await res.json();
        const pages = data.query?.pages;
        if (pages) {
          const firstPageId = Object.keys(pages)[0];
          const langlinks = pages[firstPageId]?.langlinks;
          if (langlinks && langlinks.length > 0 && langlinks[0]["*"]) {
            return langlinks[0]["*"];
          }
        }
      }
    } catch (err) {
      console.warn("Error fetching Japanese title:", err);
    }
    return undefined;
  }

  /**
   * Fetches Wikipedia article summary, Japanese name, and lead image for a destination.
   * Returns Wikipedia data if found, or null to fallback to local description.
   */
  static async fetchSummary(
    name: string,
    prefecture?: string,
    locale: "en" | "ja" = "en",
  ): Promise<WikipediaSummary | null> {
    const cacheKey = `${name}_${prefecture || ""}_${locale}`;
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    }

    try {
      // 1. Try direct title query
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          name,
        )}`,
      );

      if (res.ok) {
        const data = await res.json();
        if (
          data.type !== "disambiguation" &&
          data.extract &&
          data.extract.length > 30
        ) {
          const titleToUse = data.title || name;
          const jaTitle = await this.fetchJapaneseTitle(titleToUse);
          const jaSummary = await this.fetchJapaneseSummary(jaTitle);

          const result: WikipediaSummary = {
            extract:
              locale === "ja"
                ? jaSummary.extract || data.extract
                : data.extract,
            url:
              locale === "ja" && jaSummary.url
                ? jaSummary.url
                : data.content_urls?.desktop?.page ||
                  `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`,
            japaneseTitle: jaTitle,
            japaneseExtract: jaSummary.extract,
            japaneseUrl: jaSummary.url,
            leadImage: data.originalimage?.source || data.thumbnail?.source,
            leadImageLicense: "Wikimedia Commons (Unverified)",
          };
          cache.set(cacheKey, JSON.stringify(result));
          return result;
        }
      }

      // 2. Fallback search via Wikipedia Search API
      const searchQuery = `${name} ${prefecture || ""} Japan`;
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          searchQuery,
        )}&format=json&origin=*`,
      );

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const firstResult = searchData.query?.search?.[0];
        if (firstResult?.title) {
          const summaryRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
              firstResult.title,
            )}`,
          );
          if (summaryRes.ok) {
            const sumData = await summaryRes.json();
            if (
              sumData.type !== "disambiguation" &&
              sumData.extract &&
              sumData.extract.length > 30
            ) {
              const jaTitle = await this.fetchJapaneseTitle(firstResult.title);
              const jaSummary = await this.fetchJapaneseSummary(jaTitle);
              const result: WikipediaSummary = {
                extract:
                  locale === "ja"
                    ? jaSummary.extract || sumData.extract
                    : sumData.extract,
                url:
                  locale === "ja" && jaSummary.url
                    ? jaSummary.url
                    : sumData.content_urls?.desktop?.page ||
                      `https://en.wikipedia.org/wiki/${encodeURIComponent(
                        firstResult.title,
                      )}`,
                japaneseTitle: jaTitle,
                japaneseExtract: jaSummary.extract,
                japaneseUrl: jaSummary.url,
                leadImage:
                  sumData.originalimage?.source || sumData.thumbnail?.source,
                leadImageLicense: "Wikimedia Commons (Unverified)",
              };
              cache.set(cacheKey, JSON.stringify(result));
              return result;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Wikipedia summary fetch error:", err);
    }

    cache.set(cacheKey, null);
    return null;
  }
}
