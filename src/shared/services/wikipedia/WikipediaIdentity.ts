export type WikipediaLanguage = "en" | "ja";

export interface WikipediaMapping {
  language: WikipediaLanguage;
  title?: string;
  url?: string;
  pageId?: number;
  wikidataId?: string;
}

export interface WikipediaSourceReference {
  type?: string;
  url?: string;
  title?: string;
}

export interface WikipediaIdentitySource {
  wikipediaTitle?: string;
  wikipediaLanguage?: WikipediaLanguage;
  wikipediaUrl?: string;
  wikipediaPageId?: number;
  wikidataId?: string;
  editorial?: {
    sources?: WikipediaSourceReference[];
    fieldSources?: Record<string, WikipediaSourceReference[]>;
  };
}

/**
 * Parse only canonical Wikipedia article URLs. External source URLs are not
 * identity declarations merely because they contain the word "wikipedia".
 */
export function parseWikipediaUrl(
  value?: string,
): { language: WikipediaLanguage; title: string } | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const language = url.hostname.match(/^(en|ja)\.wikipedia\.org$/i)?.[1] as
      WikipediaLanguage | undefined;
    const match = url.pathname.match(/^\/wiki\/(.+)$/);
    if (!language || !match) return undefined;
    return {
      language,
      title: decodeURIComponent(match[1]).replace(/_/g, " "),
    };
  } catch {
    return undefined;
  }
}

/**
 * Stable URL identity shared by the runtime resolver and offline audit.
 * Parenthetical title qualifiers are intentionally preserved.
 */
export function canonicalWikipediaIdentity(value?: string): string | undefined {
  const parsed = parseWikipediaUrl(value);
  if (!parsed) return undefined;
  return `${parsed.language}:${parsed.title
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()}`;
}

function provenanceReferences(
  source: WikipediaIdentitySource,
): WikipediaSourceReference[] {
  return [
    ...(source.editorial?.sources ?? []),
    ...Object.values(source.editorial?.fieldSources ?? {}).flat(),
  ];
}

export function wikipediaProvenanceReferences(
  source: WikipediaIdentitySource,
): WikipediaSourceReference[] {
  return provenanceReferences(source).filter(
    (reference) =>
      reference.type === "wikipedia" && parseWikipediaUrl(reference.url),
  );
}

/**
 * The single canonical rule for a destination's explicit Wikipedia identity.
 * Runtime resolution and catalogue auditing must both use this helper.
 */
export function extractWikipediaMapping(
  source: WikipediaIdentitySource,
): WikipediaMapping | undefined {
  const structuredUrl = parseWikipediaUrl(source.wikipediaUrl);
  const explicitTitle = source.wikipediaTitle || structuredUrl?.title;

  if (
    explicitTitle ||
    source.wikipediaUrl ||
    source.wikipediaPageId !== undefined ||
    source.wikidataId
  ) {
    return {
      language: source.wikipediaLanguage ?? structuredUrl?.language ?? "en",
      ...(explicitTitle ? { title: explicitTitle } : {}),
      ...(source.wikipediaUrl ? { url: source.wikipediaUrl } : {}),
      ...(source.wikipediaPageId !== undefined
        ? { pageId: source.wikipediaPageId }
        : {}),
      ...(source.wikidataId ? { wikidataId: source.wikidataId } : {}),
    };
  }

  const curatedReference = wikipediaProvenanceReferences(source)[0];
  const curatedUrl = parseWikipediaUrl(curatedReference?.url);
  return curatedUrl
    ? {
        language: curatedUrl.language,
        title: curatedUrl.title,
        url: curatedReference?.url,
      }
    : undefined;
}
