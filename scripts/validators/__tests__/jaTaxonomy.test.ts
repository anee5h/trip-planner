import { describe, expect, it } from "vitest";
import destinationsIndex from "../../../src/shared/data/destinations-index.json";
import { localizePlaceLabel } from "../../../src/shared/utils/placeLabels";
import properNounAllowlistJson from "../ja-taxonomy-allowlist.json";

/**
 * KAI-98: no canonical destination taxonomy value may fall back to raw
 * English in Japanese mode. Every canonical categories/tags/kind value is
 * either (a) mapped in the JA label table, or (b) an intentional proper
 * noun / brand / named place that keeps its English form per the KAI-49
 * localization conventions. A NEW canonical tag that is neither mapped nor
 * allowlisted fails this test.
 */

// Proper nouns / brands / named places intentionally kept in English form.
// A value is only added here after deciding it is NOT a generic taxonomy
// label; generic labels must be translated instead.
const PROPER_NOUN_ALLOWLIST: ReadonlySet<string> = new Set(
  properNounAllowlistJson,
);

// Prefecture/region names render via formatPrefecture, never as taxonomy.
const PREFECTURE_NAMES = new Set([
  "Hokkaido",
  "Aomori",
  "Iwate",
  "Miyagi",
  "Akita",
  "Yamagata",
  "Fukushima",
  "Ibaraki",
  "Tochigi",
  "Gunma",
  "Saitama",
  "Chiba",
  "Tokyo",
  "Kanagawa",
  "Niigata",
  "Toyama",
  "Ishikawa",
  "Fukui",
  "Yamanashi",
  "Nagano",
  "Gifu",
  "Shizuoka",
  "Aichi",
  "Mie",
  "Shiga",
  "Kyoto",
  "Osaka",
  "Hyogo",
  "Nara",
  "Wakayama",
  "Tottori",
  "Shimane",
  "Okayama",
  "Hiroshima",
  "Yamaguchi",
  "Tokushima",
  "Kagawa",
  "Ehime",
  "Kochi",
  "Fukuoka",
  "Saga",
  "Nagasaki",
  "Kumamoto",
  "Oita",
  "Miyazaki",
  "Kagoshima",
  "Okinawa",
]);
const REGION_NAMES = new Set([
  "Kanto",
  "Kansai",
  "Chubu",
  "Tohoku",
  "Hokkaido",
  "Chugoku",
  "Shikoku",
  "Kyushu",
  "Okinawa",
]);

// Values that are inherently non-label data (prefecture/region names are
// formatted by formatPrefecture; municipality names carry their own
// Japanese names; Japanese values and destination-specific lowercase tag
// ids never render as English taxonomy).
function isAutoAllowlisted(value: string): boolean {
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(value)) return true; // already JA
  if (/(City|Town|Village|Ward|Island|Prefecture|Prefectures)$/.test(value))
    return true; // municipality name, localized via place names
  if (PREFECTURE_NAMES.has(value) || REGION_NAMES.has(value)) return true;
  if (value === value.toLowerCase()) return true; // destination tag id
  if (value.includes("_")) return true; // snake_case tag id
  return false;
}

describe("KAI-98 Japanese taxonomy coverage", () => {
  const catalog = destinationsIndex as Array<{
    id: string;
    categories?: string[];
    tags?: string[];
    kind?: string;
  }>;

  const canonical = new Set<string>();
  for (const d of catalog) {
    for (const key of ["categories", "tags"] as const) {
      for (const v of d[key] ?? []) canonical.add(v);
    }
    if (d.kind) canonical.add(d.kind);
  }

  it("every generic canonical taxonomy value has a Japanese label", () => {
    const leaks: string[] = [];
    for (const value of canonical) {
      if (isAutoAllowlisted(value)) continue;
      if (PROPER_NOUN_ALLOWLIST.has(value)) continue;
      const ja = localizePlaceLabel(value, "ja");
      if (ja === value) leaks.push(value);
    }
    expect(leaks).toEqual([]);
  });

  it("localizes the confirmed leak examples", () => {
    expect(localizePlaceLabel("Castle", "ja")).toBe("城");
    expect(localizePlaceLabel("Park", "ja")).toBe("公園");
    expect(localizePlaceLabel("Museum", "ja")).toBe("博物館");
    // English mode stays untouched.
    expect(localizePlaceLabel("Castle", "en")).toBe("Castle");
  });
});
