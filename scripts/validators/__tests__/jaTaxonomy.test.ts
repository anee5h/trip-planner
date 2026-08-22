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

// Explicit legacy location metadata that is not rendered as a taxonomy label.
// This is intentionally value-by-value, not a suffix or casing exemption.
const NON_DISPLAY_TAXONOMY = new Set([
  "Abashiri City",
  "Adachi City",
  "sendai",
  "Taito City",
  "Sendai City",
  "Arakawa City",
  "Asahikawa City",
  "tochigi",
  "Aso City",
  "Atami City",
  "Beppu City",
  "Biei Town",
  "Narita City",
  "Bunkyo City",
  "Fukuoka City",
  "Chiba City",
  "Chichibu City",
  "Chigasaki City",
  "Chiyoda City",
  "Chuo City",
  "akita",
  "Dazaifu City",
  "matsuyama",
  "Edogawa City",
  "Kamakura City",
  "Fujisawa City",
  "Sapporo City",
  "Fujikawaguchiko Town",
  "Kawasaki City",
  "Fujinomiya City",
  "Funabashi City",
  "Furano City",
  "Gero City",
  "Top Onsen Town",
  "Gifu City",
  "Shinjuku City",
  "Gotemba City",
  "Setagaya City",
  "Hakodate City",
  "Hakuba Village",
  "Hamamatsu City",
  "Hatsukaichi City",
  "Hikone City",
  "Himeji City",
  "Hiroshima City",
  "Nagoya City",
  "Ikaruga Town",
  "Inuyama City",
  "Itabashi City",
  "Ito City",
  "Saitama City",
  "Izumo City",
  "Kagoshima City",
  "Karuizawa Town",
  "Kawagoe City",
  "Katsushika City",
  "Kawaguchi City",
  "Kisarazu City",
  "Kita City",
  "Kitakyushu City",
  "Kobe City",
  "Kochi City",
  "Kofu City",
  "Koto City",
  "Koya Town",
  "Kumamoto City",
  "Kurashiki City",
  "Kusatsu Town",
  "Kushiro City",
  "Matsudo City",
  "Matsue City",
  "Matsumoto City",
  "Matsuyama City",
  "Meguro City",
  "Minakami Town",
  "Minato City",
  "Mito City",
  "Miyazaki City",
  "Miyazu City",
  "Nagasaki City",
  "Nakano City",
  "Nara City",
  "Naruto City",
  "Nerima City",
  "Core Designated City",
  "Nikko City",
  "Niseko Town",
  "Numazu City",
  "Odawara City",
  "Okayama City",
  "Okazaki City",
  "Onomichi City",
  "Ota City",
  "Otaru City",
  "Otsu City",
  "Sagamihara City",
  "Sakai City",
  "Shimonoseki City",
  "Shinagawa City",
  "Shirahama Town",
  "Alpine Village",
  "Shizuoka City",
  "Suginami City",
  "Sumida City",
  "Toshima City",
  "Takachiho Town",
  "Takamatsu City",
  "Takayama City",
  "Tokorozawa City",
  "Tokushima City",
  "Tottori City",
  "Toyota City",
  "Tsukuba City",
  "Uji City",
  "Urayasu City",
  "Utsunomiya City",
  "Wakayama City",
  "Yakushima Town",
  "Yokosuka City",
  "Yufu City",
  "Shibuya City",
  "destination-hub-expansion",
  "Hachioji City",
  "Hino City",
  "Tachikawa City",
  "Karatsu City",
  "Sasebo City",
  "Ibusuki City",
  "Nichinan City",
  "Hita City",
  "Marugame City",
  "Miyoshi City",
  "Uwajima City",
  "Kojima Ward",
  "Copper Mining Town",
  "Matsushima Town",
  "Aomori City",
  "Hachinohe City",
  "Towada City",
  "Hirosaki City",
  "Morioka City",
  "Shizukuishi Town",
  "Hiraizumi Town",
  "Fukushima City",
  "Oga City",
  "Akita City",
  "Yamagata City",
  "Kaminoyama City",
  "Aizuwakamatsu City",
  "Kitakata City",
  "Taketomi Island",
  "Shodoshima Island",
  "Inujima Island",
  "Ogijima Island",
]);

// Values that are inherently non-label data. These are formatted elsewhere
// and are deliberately classified separately from proper nouns.
function isAutoAllowlisted(value: string): boolean {
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(value)) return true; // already JA
  if (PREFECTURE_NAMES.has(value) || REGION_NAMES.has(value)) return true;
  return false;
}

export function findUnlocalizedTaxonomy(
  catalog: ReadonlyArray<{
    categories?: readonly string[];
    tags?: readonly string[];
    kind?: string;
  }>,
): string[] {
  const canonical = new Set<string>();
  for (const d of catalog) {
    for (const key of ["categories", "tags"] as const) {
      for (const v of d[key] ?? []) canonical.add(v);
    }
    if (d.kind) canonical.add(d.kind);
  }

  return [...canonical].filter((value) => {
    if (isAutoAllowlisted(value)) return false;
    if (NON_DISPLAY_TAXONOMY.has(value)) return false;
    if (PROPER_NOUN_ALLOWLIST.has(value)) return false;
    return localizePlaceLabel(value, "ja") === value;
  });
}

describe("KAI-98 Japanese taxonomy coverage", () => {
  const catalog = destinationsIndex as Array<{
    id: string;
    categories?: string[];
    tags?: string[];
    kind?: string;
  }>;

  it("every generic canonical taxonomy value has a Japanese label", () => {
    expect(findUnlocalizedTaxonomy(catalog)).toEqual([]);
  });

  it("localizes the confirmed leak examples", () => {
    expect(localizePlaceLabel("Adventure", "ja")).toBe("アドベンチャー");
    expect(localizePlaceLabel("Castle", "ja")).toBe("城");
    expect(localizePlaceLabel("Heritage", "ja")).toBe("遺産");
    expect(localizePlaceLabel("Historic Monuments of Ancient Kyoto", "ja")).toBe(
      "古都京都の文化財",
    );
    expect(localizePlaceLabel("Park", "ja")).toBe("公園");
    expect(localizePlaceLabel("Museum", "ja")).toBe("博物館");
    expect(localizePlaceLabel("Sake", "ja")).toBe("日本酒");
    expect(localizePlaceLabel("Crab", "ja")).toBe("カニ");
    expect(localizePlaceLabel("Green Tea", "ja")).toBe("緑茶");
    expect(localizePlaceLabel("Oysters", "ja")).toBe("牡蠣");
    expect(localizePlaceLabel("Plum", "ja")).toBe("梅");
    expect(localizePlaceLabel("Concert Hall", "ja")).toBe("コンサートホール");
    expect(localizePlaceLabel("Ropeway Observatory", "ja")).toBe(
      "ロープウェイ展望台",
    );
    // English mode stays untouched.
    expect(localizePlaceLabel("Castle", "en")).toBe("Castle");
  });

  it("fails for a new unmapped lowercase or snake-case tag", () => {
    expect(
      findUnlocalizedTaxonomy([{ tags: ["future_generic_tag"] }]),
    ).toContain("future_generic_tag");
  });
});
