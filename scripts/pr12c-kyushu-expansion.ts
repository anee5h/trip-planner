/**
 * PR 12C Kyushu Expansion — Data transformation script (v2, corrected)
 *
 * Changes from v1:
 * - Removed global whole-catalogue provenance mutation (Step 1.2)
 * - New POIs use real Wikipedia article URLs and Commons file-description pages
 * - Removed invented fieldSources
 * - Only touches Kyushu records (hubs + existing POIs + 38 new POIs)
 * - Includes assertions at the end
 *
 * Run: npx tsx scripts/pr12c-kyushu-expansion.ts
 * Then: npm run sync-destination-details
 * Validate: npm run verify:pr
 */

import fs from "fs";
import path from "path";

const INDEX_PATH = path.resolve("src/shared/data/destinations-index.json");

interface DestinationRecord {
  id: string;
  [key: string]: any;
}

const data: DestinationRecord[] = JSON.parse(
  fs.readFileSync(INDEX_PATH, "utf-8"),
);

const originalLength = data.length;
const originalIds = new Set(data.map((r) => r.id));

const EXPANSION_DATE = "2026-08-04";
const HOURS_VERIFIED_AT = "2026-08-05";

// ==========================================================================
// 1. Hub nameJa mapping (11 hubs)
// ==========================================================================
const hubNameJa: Record<string, string> = {
  "fukuoka-city": "福岡市",
  "nagasaki-city": "長崎市",
  "kumamoto-city": "熊本市",
  "beppu-city": "別府市",
  "yufu-city": "由布市",
  "dazaifu-city": "太宰府市",
  "kagoshima-city": "鹿児島市",
  "aso-city": "阿蘇市",
  "miyazaki-city": "宮崎市",
  "takachiho-town": "高千穂町",
  "kitakyushu-city": "北九州市",
  // yakushima-town already has "屋久島"
};

// ==========================================================================
// 2. Hub -> municipalityId mapping
// ==========================================================================
const hubMun: Record<string, string> = {
  "fukuoka-city": "Fukuoka:fukuoka",
  "nagasaki-city": "Nagasaki:nagasaki",
  "kumamoto-city": "Kumamoto:kumamoto",
  "beppu-city": "Oita:beppu",
  "yufu-city": "Oita:yufu",
  "dazaifu-city": "Fukuoka:dazaifu",
  "kagoshima-city": "Kagoshima:kagoshima",
  "aso-city": "Kumamoto:aso",
  "miyazaki-city": "Miyazaki:miyazaki",
  "takachiho-town": "Miyazaki:takachiho",
  "yakushima-town": "Kagoshima:yakushima",
  "kitakyushu-city": "Fukuoka:kitakyushu",
};

interface OpeningHoursEntry {
  en: string;
  ja: string;
  sourceUrl: string;
  lastAdmission?: string;
  closedDays?: string;
}

const kyushuOpeningHours: Record<string, OpeningHoursEntry> = {
  "amami-iriomote-natural-site": {
    en: "No fixed opening hours (natural site)",
    ja: "営業時間の設定なし（自然エリア）",
    sourceUrl:
      "https://www.japan.travel/en/world-heritage/amami-oshima-island-tokunoshima-island-northern-part-of-okinawa-island-and-iriomote-island/",
  },
  "aso-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/aso-city/",
  },
  "beppu-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/beppu-city/",
  },
  "beppu-hells-oita": {
    en: "08:00–17:00",
    ja: "08:00～17:00",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "canal-city-hakata": {
    en: "10:00–21:00 (Shops), 11:00–23:00 (Restaurants)",
    ja: "10:00～21:00（ショップ）、11:00～23:00（レストラン）",
    sourceUrl: "https://canalcity.co.jp/english",
  },
  "dazaifu-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/dazaifu-city/",
  },
  "fukuoka-art-museum": {
    en: "09:30–17:30 (Jul-Oct Fri/Sat until 20:00)",
    ja: "09:30～17:30（7～10月の金・土は20:00まで）",
    sourceUrl: "https://www.fukuoka-art-museum.jp/en/",
  },
  "fukuoka-castle-ruins": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "fukuoka-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/fukuoka-city/",
  },
  "fukuoka-tower": {
    en: "09:30–22:00",
    ja: "09:30～22:00",
    sourceUrl: "https://www.fukuokatower.co.jp/en/",
  },
  "fukuoka-yatai": {
    en: "Typically 18:00–02:00",
    ja: "通常 18:00～02:00",
    sourceUrl: "https://yokanavi.com/en/yatai/",
  },
  "gunkanjima-hashima-nagasaki": {
    en: "Tour times vary (typically 09:00–16:00)",
    ja: "ツアーにより異なる（通常 09:00～16:00）",
    sourceUrl: "https://www.gunkanjima-concierge.com/en/",
  },
  "hakata-machiya-folk-museum": {
    en: "10:00–18:00",
    ja: "10:00～18:00",
    sourceUrl: "https://www.hakatamachiya.com/english/",
  },
  "kagoshima-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/kagoshima-city/",
  },
  "kitakyushu-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/kitakyushu-city/",
  },
  "kumamoto-castle": {
    en: "09:00–17:00 (last admission 16:30)",
    ja: "09:00～17:00（最終入館16:30）",
    sourceUrl: "https://castle.kumamoto-guide.jp/en/",
  },
  "kumamoto-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/kumamoto-city/",
  },
  "kushida-shrine": {
    en: "04:00–22:00",
    ja: "04:00～22:00",
    sourceUrl: "https://yokanavi.com/en/spot/26906/",
  },
  "maizuru-park": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "miyazaki-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/miyazaki-city/",
  },
  "mount-aso-kumamoto": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "mount-inasa-nagasaki": {
    en: "09:00–22:00 (Ropeway)",
    ja: "09:00～22:00（ロープウェイ）",
    sourceUrl: "https://www.inasayama.com/english/",
  },
  "nagasaki-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/nagasaki-city/",
  },
  nakasu: {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "ohori-park": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "okinoshima-munakata-fukuoka": {
    en: "No public access allowed",
    ja: "一般の立ち入り禁止",
    sourceUrl: "https://www.okinoshima-heritage.jp/en/",
  },
  "oura-church-nagasaki": {
    en: "08:30–18:00",
    ja: "08:30～18:00",
    sourceUrl: "https://nagasaki-oura-church.jp/en",
  },
  "sakurajima-volcano-kagoshima": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "takachiho-town": {
    en: "No fixed opening hours (town area)",
    ja: "営業時間の設定なし（町内エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/takachiho-town/",
  },
  tenjin: {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  tochoji: {
    en: "09:00–16:45",
    ja: "09:00～16:45",
    sourceUrl: "https://yokanavi.com/en/spot/26928/",
  },
  "yakushima-town": {
    en: "No fixed opening hours (town area)",
    ja: "営業時間の設定なし（町内エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/yakushima-town/",
  },
  "yufu-city": {
    en: "No fixed opening hours (city area)",
    ja: "営業時間の設定なし（市内エリア）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/yufu-city/",
  },
  "hakata-station-area": {
    en: "No fixed opening hours (district area)",
    ja: "営業時間の設定なし（地区エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/hakata-station-area/",
  },
  "fukuoka-city-museum": {
    en: "09:30–17:30",
    ja: "09:30～17:30",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "nagasaki-peace-park": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "glover-garden-nagasaki": {
    en: "08:00–18:00",
    ja: "08:00～18:00",
    sourceUrl: "https://glover-garden.jp/",
  },
  "dejima-nagasaki": {
    en: "08:00–21:00",
    ja: "08:00～21:00",
    sourceUrl: "https://nagasakidejima.jp/en/",
  },
  "chinatown-nagasaki": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "meganebashi-bridge-nagasaki": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "suizenji-garden-kumamoto": {
    en: "08:30–17:00 (Mar-Oct 07:30-18:00)",
    ja: "08:30～17:00（3月～10月は07:30～18:00）",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "kumamoto-prefectural-art-museum": {
    en: "09:30–17:15",
    ja: "09:30～17:15",
    sourceUrl: "https://www.museum.pref.kumamoto.jp/english/",
  },
  "takegawara-onsen-beppu": {
    en: "06:30–22:30",
    ja: "06:30～22:30",
    sourceUrl: "https://www.city.beppu.oita.jp/sisetu/shieionsen/detail4.html",
  },
  "kannawa-onsen-district": {
    en: "No fixed opening hours (district area)",
    ja: "営業時間の設定なし（地区エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/kannawa-onsen-district/",
  },
  "beppu-tower": {
    en: "09:30–21:30",
    ja: "09:30～21:30",
    sourceUrl: "https://bepputower.co.jp/",
  },
  "kinrin-lake-yufuin": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "yufuin-floral-village": {
    en: "09:30–17:30",
    ja: "09:30～17:30",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "yufuin-onsen-ryokan-district": {
    en: "No fixed opening hours (district area)",
    ja: "営業時間の設定なし（地区エリア）",
    sourceUrl:
      "https://www.japan.travel/en/destinations/kyushu/yufuin-onsen-ryokan-district/",
  },
  "dazaifu-tenmangu": {
    en: "06:30–18:30 (varies by season)",
    ja: "06:30～18:30（季節により変動あり）",
    sourceUrl: "https://www.dazaifutenmangu.or.jp/en/",
  },
  "kyushu-national-museum": {
    en: "09:30–17:00 (Fri/Sat until 20:00)",
    ja: "09:30～17:00（金・土は20:00まで）",
    sourceUrl: "https://www.kyuhaku.jp/en/",
  },
  "komyozenji-temple-dazaifu": {
    en: "08:00–17:00",
    ja: "08:00～17:00",
    sourceUrl: "https://www.crossroadfukuoka.jp/en/spots/detail/4000000000108",
  },
  "sengan-en-garden-kagoshima": {
    en: "09:00–17:00",
    ja: "09:00～17:00",
    sourceUrl: "https://www.senganen.jp/en/",
  },
  "kagoshima-city-aquarium": {
    en: "09:30–18:00",
    ja: "09:30～18:00",
    sourceUrl: "https://ioworld.jp/english",
  },
  "nakadake-crater-aso": {
    en: "09:00–17:00 (Crater access varies by volcanic activity)",
    ja: "09:00～17:00（火口見学は火山活動により変動あり）",
    sourceUrl: "https://www.aso-volcano.jp/eng/",
  },
  "kusasenri-meadow-aso": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "daikanbo-viewpoint-aso": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "aso-volcanic-museum": {
    en: "09:00–17:00",
    ja: "09:00～17:00",
    sourceUrl: "https://www.asomuseum.jp/en/",
  },
  "aoshima-island-miyazaki": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "heiwadai-park-miyazaki": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "miyazaki-jingu-shrine": {
    en: "06:00–17:30",
    ja: "06:00～17:30",
    sourceUrl: "https://miyazakijingu.or.jp/",
  },
  "takachiho-gorge": {
    en: "08:30–17:00 (Boat rentals)",
    ja: "08:30～17:00（貸しボート）",
    sourceUrl: "https://takachiho-kanko.info/en/",
  },
  "amanoiwato-shrine": {
    en: "08:30–17:00",
    ja: "08:30～17:00",
    sourceUrl: "https://amanoiwato-jinja.jp/",
  },
  "takachiho-kagura-dance": {
    en: "20:00–21:00 (Nightly performances)",
    ja: "20:00～21:00（毎晩公演）",
    sourceUrl: "https://takachiho-kanko.info/en/",
  },
  "jomon-sugi-yakushima": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "shiratani-unsuikyo-ravine": {
    en: "08:30–16:30 (Administration building)",
    ja: "08:30～16:30（管理棟）",
    sourceUrl: "https://www.kagoshima-kankou.com/for/attractions/51079",
  },
  "yakusugi-land-yakushima": {
    en: "Open 24 hours",
    ja: "24時間営業",
    sourceUrl: "https://www.japan.travel/en/destinations/kyushu/",
  },
  "mojiko-retro-district": {
    en: "No fixed opening hours (district area)",
    ja: "営業時間の設定なし（地区エリア）",
    sourceUrl: "https://www.gururich-kitaq.com/en/spot/mojiko-retro-area",
  },
  "kitakyushu-manga-museum": {
    en: "11:00–19:00",
    ja: "11:00～19:00",
    sourceUrl: "https://www.ktqmm.jp/english",
  },
  "kawachi-wisteria-garden": {
    en: "08:00–18:00 (Only open late Apr-early May and mid-Nov-early Dec)",
    ja: "08:00～18:00（4月下旬～5月上旬、11月中旬～12月上旬のみ開園）",
    sourceUrl: "https://kawachi-fujien.com/",
  },
  "fukuoka-paypay-dome": {
    en: "Event times vary (Tours 10:00–17:00)",
    ja: "イベントにより異なる（ツアーは10:00～17:00）",
    sourceUrl: "https://www.softbankhawks.co.jp/global/english/",
  },
  "toto-museum-kitakyushu": {
    en: "10:00–17:00 (last admission 16:30)",
    ja: "10:00～17:00（最終入館16:30）",
    sourceUrl: "https://jp.toto.com/knowledge/visit/museum/",
    lastAdmission: "16:30",
    closedDays:
      "Mondays (including public holiday Mondays), summer holidays, and year-end/New Year holidays",
  },
};

// ==========================================================================
// 3. Parent hub mapping for existing Kyushu non-hub records (21 records)
// ==========================================================================
const parentHubMap: Record<string, string> = {
  // Fukuoka City (13 POIs)
  "canal-city-hakata": "fukuoka-city",
  "fukuoka-art-museum": "fukuoka-city",
  "fukuoka-castle-ruins": "fukuoka-city",
  "fukuoka-tower": "fukuoka-city",
  "fukuoka-yatai": "fukuoka-city",
  "hakata-machiya-folk-museum": "fukuoka-city",
  "kushida-shrine": "fukuoka-city",
  "maizuru-park": "fukuoka-city",
  nakasu: "fukuoka-city",
  "ohori-park": "fukuoka-city",
  "okinoshima-munakata-fukuoka": "fukuoka-city",
  tenjin: "fukuoka-city",
  tochoji: "fukuoka-city",
  // Nagasaki City (3)
  "gunkanjima-hashima-nagasaki": "nagasaki-city",
  "mount-inasa-nagasaki": "nagasaki-city",
  "oura-church-nagasaki": "nagasaki-city",
  // Kumamoto City (1)
  "kumamoto-castle": "kumamoto-city",
  // Beppu City (1)
  "beppu-hells-oita": "beppu-city",
  // Kagoshima City (1)
  "sakurajima-volcano-kagoshima": "kagoshima-city",
  // Aso City (1)
  "mount-aso-kumamoto": "aso-city",
  // amami-iriomote-natural-site stays a gateway — intentionally excluded
};

// ==========================================================================
// 4. Existing Kyushu records that need JA backfill (9 records)
//    + real Wikipedia source URLs for editorial.sources
// ==========================================================================
const jaBackfill: Record<
  string,
  {
    description: string;
    highlights: string[];
    wikiUrl: string;
    wikiTitle: string;
    notesEn: string;
    notesJa: string;
  }
> = {
  "okinoshima-munakata-fukuoka": {
    description:
      "「神宿る島」宗像・沖ノ島と関連遺産群は、福岡県宗像市沖に位置するユネスコ世界遺産です。沖ノ島は今も女人禁制の伝統が守られ、巨大な岩の祭祀遺跡と数万点の出土品が日本の古代信仰を物語ります。",
    highlights: [
      "世界遺産の沖ノ島祭祀遺跡群",
      "宗像大社辺津宮・中津宮・沖津宮",
      "宗像大社神宝館の国宝展示",
    ],
    wikiUrl:
      "https://en.wikipedia.org/wiki/Sacred_Island_of_Okinoshima_and_Associated_Sites_in_the_Munakata_Region",
    wikiTitle:
      "Sacred Island of Okinoshima and Associated Sites in the Munakata Region",
    notesEn:
      "Okinoshima Island itself is closed to the public (no landing allowed except for shrine priests). Visitors can explore the Munakata Taisha shrine complex on the mainland and the Shinpokan museum which displays excavated treasures.",
    notesJa:
      "沖ノ島自体は一般の上陸が禁止されています（神職以外立入不可）。本土の宗像大社（辺津宮）と出土品を展示する神宝館を見学できます。",
  },
  "gunkanjima-hashima-nagasaki": {
    description:
      "端島（軍艦島）は長崎港から約19km沖に浮かぶ廃墟の島です。明治から昭和にかけて海底炭鉱で栄え、最盛期には5,000人以上が居住し当時世界一の人口密度を誇りました。現在は上陸ツアーで見学可能な産業遺産です。",
    highlights: [
      "軍艦島上陸クルーズツアー",
      "明治日本の産業革命遺産（世界遺産）",
      "廃墟化した高層鉄筋アパート群",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Hashima_Island",
    wikiTitle: "Hashima Island",
    notesEn:
      "Landing tours run from Nagasaki Port (¥4,200–5,400). Weather-dependent — tours may be cancelled in high waves. The landing platform is small and can be hot; bring water in summer. Booking 1–2 days ahead is recommended.",
    notesJa:
      "軍艦島上陸ツアーは長崎港発（4,200～5,400円）。天候次第で高波時に欠航あり。上陸桟橋は狭く夏は高温、水分補給を。1～2日前の予約推奨。",
  },
  "mount-inasa-nagasaki": {
    description:
      "稲佐山（標高333m）は長崎市街を一望できる夜景スポットで、「世界新三大夜景」の一つに認定されています。山頂まではロープウェイで約5分、到着後は360度のパノラマが楽しめます。",
    highlights: [
      "世界新三大夜景の長崎夜景",
      "展望台からの360度パノラマ",
      "稲佐山ロープウェイの空中散歩",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mount_Inasa",
    wikiTitle: "Mount Inasa",
    notesEn:
      "The ropeway runs until 22:00. The summit observation deck is free; the ropeway round trip is ¥1,250. On clear days you can see as far as the Goto Islands. Bring a jacket — it's windy and cooler at the top.",
    notesJa:
      "ロープウェイは22:00まで。山頂展望台は無料、ロープウェイ往復1,250円。晴天時は五島列島まで見渡せます。山頂は風が強く冷えるため上着を持参。",
  },
  "oura-church-nagasaki": {
    description:
      "大浦天主堂は1864年に建立された日本最古の現存するキリスト教教会で、国宝に指定されています。「長崎と天草地方の潜伏キリシタン関連遺産」の構成資産として世界遺産にも登録されています。",
    highlights: [
      "国宝・日本最古のゴシック教会建築",
      "潜伏キリシタン関連の世界遺産",
      "隣接する旧羅典神学校とキリシタン資料館",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/%C5%8Cura_Church",
    wikiTitle: "Ōura Church",
    notesEn:
      "Admission ¥1,000 (includes museum and former seminary). The church is a short uphill walk from Glover Garden. Sunday morning Mass is open to visitors but sightseeing during service is not permitted.",
    notesJa:
      "拝観料1,000円（旧羅典神学校・博物館含む）。グラバー園から坂を少し上がった場所。日曜朝のミサは見学可ですが、礼拝中の観光は控えてください。",
  },
  "kumamoto-castle": {
    description:
      "熊本城は加藤清正によって1607年に築城された日本三名城の一つです。「武者返し」と呼ばれる石垣が特徴で、2016年の熊本地震で大きな被害を受けましたが、復興が進み天守閣は2021年に修復完了しました。",
    highlights: [
      "日本三名城の勇壮な石垣「武者返し」",
      "本丸御殿と昭君之間の金箔装飾",
      "城内の加藤神社と桜の名所",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kumamoto_Castle",
    wikiTitle: "Kumamoto Castle",
    notesEn:
      "Admission ¥800 for the castle keep. The castle restoration from the 2016 earthquake is partially complete. The Honmaru Goten palace interior is fully restored. Check the official website for current accessible areas.",
    notesJa:
      "天守閣入場800円。2016年熊本地震からの復旧は一部完了。本丸御殿は全面復旧済み。見学可能エリアは公式サイトで事前確認を。",
  },
  "beppu-hells-oita": {
    description:
      "別府地獄めぐりは、別府市内に点在する8つの自然温泉の噴気孔で構成される観光名所です。海地獄のコバルトブルー、血の池地獄の赤色など、それぞれが独自の色や特徴を持ち、国の名勝に指定されています。",
    highlights: [
      "8つの個性的な地獄湯煙",
      "コバルトブルーの海地獄と赤い血の池地獄",
      "地獄蒸し料理と温泉卵の名物",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Hells_of_Beppu",
    wikiTitle: "Hells of Beppu",
    notesEn:
      "Combined ticket for all 7 hells is ¥2,200; individual hells ¥450 each. Allow 2–3 hours to see them all. Umi-Jigoku (Sea Hell) and Chinoike-Jigoku (Blood Pond Hell) are the most striking. Parking is free at each site.",
    notesJa:
      "7地獄共通券2,200円、単独券各450円。全地獄見学に2～3時間。海地獄と血の池地獄が特に印象的。各所に無料駐車場あり。",
  },
  "sakurajima-volcano-kagoshima": {
    description:
      "桜島は鹿児島湾にそびえる活火山で、現在も活発な噴火活動を続ける日本有数の火山島です。フェリーで約15分、島内には展望台が点在し、溶岩なぎさ遊歩道では火山の造形美を間近に感じられます。",
    highlights: [
      "活火山の噴煙を望む溶岩遊歩道",
      "有村溶岩展望所からの絶景",
      "桜島フェリーと錦江湾クルーズ",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Sakurajima",
    wikiTitle: "Sakurajima",
    notesEn:
      "The Sakurajima Ferry runs 24/7 (¥200 one-way, 15 min). The island loop bus (¥500 day pass) stops at all major viewpoints. Ashfall is common — wear a hat and avoid light-coloured clothing on active days.",
    notesJa:
      "桜島フェリー24時間運航（片道200円、15分）。島内周遊バス（1日500円）で各展望所へ。降灰は日常的 — 帽子と濃い色の服装を推奨。",
  },
  "mount-aso-kumamoto": {
    description:
      "阿蘇山は世界最大級のカルデラを持つ活火山で、中岳火口を間近に見学できる日本屈指の火山観光スポットです。周囲約120kmのカルデラ内には草原や温泉が広がり、壮大なジオパーク景観が楽しめます。",
    highlights: [
      "世界最大級のカルデラ地形",
      "中岳火口の迫力ある噴煙",
      "広大な草千里ヶ浜の草原景観",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mount_Aso",
    wikiTitle: "Mount Aso",
    notesEn:
      "Crater access depends on volcanic gas levels — check conditions before departing. The Aso Volcano Museum near the ropeway station provides live updates. The surrounding caldera grasslands (Kusasenri) are always accessible.",
    notesJa:
      "火口見学は火山ガス濃度により規制あり — 出発前に状況確認を。ロープウェイ駅近くの阿蘇火山博物館で最新情報を入手。カルデラ内の草千里は常時見学可能。",
  },
  "amami-iriomote-natural-site": {
    description:
      "奄美大島、徳之島、沖縄島北部及び西表島は、生物多様性に富むユネスコ世界自然遺産です。固有種のアマミノクロウサギやヤンバルクイナ、イリオモテヤマネコが生息し、亜熱帯照葉樹林が豊かな生態系を育んでいます。",
    highlights: [
      "世界自然遺産の生物多様性",
      "奄美大島の原生林ハイキング",
      "西表島のマングローブカヌー体験",
    ],
    wikiUrl:
      "https://en.wikipedia.org/wiki/Amami-%C5%8Cshima_Island,_Tokunoshima_Island,_Northern_Okinawa_Island,_and_Iriomote_Island",
    wikiTitle:
      "Amami-Ōshima Island, Tokunoshima Island, Northern Okinawa Island, and Iriomote Island",
    notesEn:
      "This is a UNESCO World Heritage gateway entry spanning multiple islands across Kagoshima and Okinawa prefectures. Access varies by island — Amami Oshima has regular flights, Iriomote requires a ferry from Ishigaki. Plan travel logistics carefully.",
    notesJa:
      "鹿児島県～沖縄県にまたがる世界自然遺産の玄関口エントリーです。島ごとにアクセスが異なり、奄美大島は空路、西表島は石垣島からフェリー。旅程計画は慎重に。",
  },
};

// Count how many existing Kyushu non-hub records exist
const existingKyushuNonHub = data.filter(
  (r) => r.region === "Kyushu" && r.role !== "hub",
);
console.log(`Existing Kyushu non-hub records: ${existingKyushuNonHub.length}`);

// ==========================================================================
// 5. New POI definitions (38 new destinations)
//    Each with: real Wikipedia URL, Commons file-description sourceUrl,
//    no invented fieldSources, today's accessedAt.
// ==========================================================================
interface NewPoiInput {
  id: string;
  name: string;
  nameJa: string;
  hubId: string;
  prefecture: string;
  kind: string;
  categories: string[];
  tags: string[];
  heroImage: string;
  commonsFilePage: string;
  imageAttribution: string;
  imageLicense: string;
  coordinates: { lat: number; lng: number };
  budgetMin: number;
  budgetRecommended: number;
  budgetMax: number;
  ticketCost?: number;
  transportOptions: Record<string, number>;
  totalTripHours: number;
  recommendedVisitHours: { min: number; max: number };
  walkingMin: number;
  indoorPercent: number;
  ratings: Record<string, number>;
  crowd: { weekday: number; weekend: number; holiday: number };
  season: { spring: number; summer: number; autumn: number; winter: number };
  weatherDependence: string;
  reservation: string;
  parking: string;
  walkingIntensity: string;
  walkingSunMin: number;
  walkingShadeMin: number;
  comfort: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  };
  officialWebsite: string | null;
  officialWebsiteRequirement?: string;
  enDescription: string;
  enHighlights: string[];
  jaDescription: string;
  jaHighlights: string[];
  wikiUrl: string;
  wikiTitle: string;
  notesEn: string;
  notesJa: string;
}

function buildPoi(poi: NewPoiInput): DestinationRecord {
  const budgetBreakdown = {
    transport: Math.round(poi.budgetMin * 0.35),
    tickets: poi.ticketCost ?? 0,
    food: Math.round(poi.budgetMin * 0.4),
    cafe: Math.round(poi.budgetMin * 0.1),
  };

  const rec: DestinationRecord = {
    id: poi.id,
    name: poi.name,
    nameJa: poi.nameJa,
    aliases: [poi.name, poi.nameJa],
    content: {
      en: {
        name: poi.name,
        description: poi.enDescription,
        highlights: poi.enHighlights,
        openingHours: kyushuOpeningHours[poi.id]?.en || "",
      },
      ja: {
        name: poi.nameJa,
        description: poi.jaDescription,
        highlights: poi.jaHighlights,
        openingHours: kyushuOpeningHours[poi.id]?.ja || "",
      },
    },
    prefecture: poi.prefecture,
    region: "Kyushu",
    kind: poi.kind,
    role: "poi",
    placeType: "destination",
    relationships: { parentDestinationId: poi.hubId },
    officialWebsiteRequirement: poi.officialWebsiteRequirement ?? "optional",
    categories: poi.categories,
    tags: [...poi.tags],
    heroImage: poi.heroImage,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: poi.imageLicense,
      attribution: poi.imageAttribution,
      sourceUrl: poi.commonsFilePage,
    },
    coordinates: poi.coordinates,
    description: poi.enDescription,
    highlights: poi.enHighlights,
    openingHours: kyushuOpeningHours[poi.id]?.en || "",
    openingHoursJa: kyushuOpeningHours[poi.id]?.ja || "",
    openingHoursMetadata: {
      verifiedAt: "2026-08-05",
      sourceUrl: kyushuOpeningHours[poi.id]?.sourceUrl || "",
      ...(kyushuOpeningHours[poi.id]?.lastAdmission && {
        lastAdmission: kyushuOpeningHours[poi.id]?.lastAdmission,
      }),
      ...(kyushuOpeningHours[poi.id]?.closedDays && {
        closedDays: kyushuOpeningHours[poi.id]?.closedDays,
      }),
    },
    budgetMin: poi.budgetMin,
    budgetRecommended: poi.budgetRecommended,
    budgetMax: poi.budgetMax,
    budgetBreakdown,
    transportOptions: poi.transportOptions,
    totalTripHours: poi.totalTripHours,
    recommendedVisitHours: poi.recommendedVisitHours,
    walkingMin: poi.walkingMin,
    walkingIntensity: poi.walkingIntensity,
    walkingSunMin: poi.walkingSunMin,
    walkingShadeMin: poi.walkingShadeMin,
    indoorPercent: poi.indoorPercent,
    comfort: poi.comfort,
    ratings: { ...poi.ratings },
    ratingsSchemaVersion: 2,
    crowd: poi.crowd,
    season: poi.season,
    bestMonths: [3, 4, 5, 9, 10, 11],
    weatherDependence: poi.weatherDependence,
    reservation: poi.reservation,
    parking: poi.parking,
    notes: poi.notesEn,
    notesJa: poi.notesJa,
    schemaVersion: 2,
    status: "published",
    travelEstimate: { confidence: "medium" },
    collections: [],
    addedAt: EXPANSION_DATE,
    editorial: {
      lifecycle: "published",
      sources: [
        ...(poi.officialWebsite
          ? [
              {
                type: "official",
                url: poi.officialWebsite,
                title: `${poi.name} Official Website`,
                accessedAt: EXPANSION_DATE,
              },
            ]
          : []),
        {
          type: "wikipedia",
          url: poi.wikiUrl,
          title: poi.wikiTitle,
          accessedAt: EXPANSION_DATE,
        },
      ],
      checkedAt: EXPANSION_DATE,
      freshness: "current",
      changeSummary: "PR 12C Kyushu Regional Expansion",
      changes: [
        {
          changedAt: EXPANSION_DATE,
          changedBy: "Kyushu Regional Editorial Batch",
          summary: `Added bilingual curated POI: ${poi.name}`,
          method: "assisted",
        },
      ],
      reviewedAt: EXPANSION_DATE,
      reviewedBy: "Kyushu Regional Editorial Batch",
    },
    officialWebsite: poi.officialWebsite,
  };

  return JSON.parse(JSON.stringify(rec)) as DestinationRecord;
}

// ==========================================================================
// New POI data (38 entries)
// heroImage = raw Wikimedia Commons upload URL
// commonsFilePage = Wikimedia Commons file-description page URL
// wikiUrl = real English Wikipedia article URL
// ==========================================================================
const newPois: NewPoiInput[] = [
  // ---- FUKUOKA CITY (+3) ----
  {
    id: "hakata-station-area",
    name: "Hakata Station & AMU Plaza",
    nameJa: "博多駅・アミュプラザ博多",
    hubId: "fukuoka-city",
    prefecture: "Fukuoka",
    kind: "mixed",
    categories: ["Shopping", "Sightseeing"],
    tags: ["Shopping", "Station", "Fukuoka City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/3/33/Hakata_Station_20180306.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Hakata_Station_20180306.jpg",
    imageAttribution: "そらみみ",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.5896, lng: 130.4207 },
    budgetMin: 2000,
    budgetRecommended: 8000,
    budgetMax: 15000,
    ticketCost: 0,
    transportOptions: { train: 195, shinkansen: 295 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1, max: 4 },
    walkingMin: 4000,
    indoorPercent: 70,
    ratings: {
      overall: 8.5,
      couple: 7.8,
      summer: 8.8,
      winter: 8.2,
      rain: 8.9,
      food: 9.3,
      photography: 8.0,
      relaxation: 7.2,
      value: 8.5,
      uniqueness: 7.5,
    },
    crowd: { weekday: 6, weekend: 8, holiday: 8 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Station parking available",
    walkingIntensity: "medium",
    walkingSunMin: 1000,
    walkingShadeMin: 3000,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 4 },
    officialWebsite: "https://www.jrhakatacity.com/",
    enDescription:
      "Hakata Station is Kyushu's busiest rail terminal, surrounded by the AMU Plaza shopping complex with hundreds of stores, a rooftop garden, and an observation deck overlooking the city. It's the gateway for exploring Fukuoka and beyond.",
    enHighlights: [
      "Rooftop garden & observation deck",
      "AMU Plaza shopping complex",
      "Kyushu Shinkansen gateway",
    ],
    jaDescription:
      "博多駅は九州最大の鉄道ターミナルで、アミュプラザ博多を併設した大型複合商業施設です。屋上庭園「つばめの杜ひろば」からは市内の展望が楽しめ、九州新幹線の起点として九州各地への玄関口となっています。",
    jaHighlights: [
      "屋上庭園つばめの杜ひろば",
      "アミュプラザ博多のショッピング",
      "九州新幹線の起点と駅弁・グルメ",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Hakata_Station",
    wikiTitle: "Hakata Station",
    notesEn:
      "Hakata Station is directly connected to the subway, JR lines, and Kyushu Shinkansen. The 9th-floor rooftop garden is free and offers a great city view. AMU Plaza has a dedicated ramen floor (10F) popular with locals.",
    notesJa:
      "博多駅は地下鉄・JR・九州新幹線に直結。9階屋上庭園は無料で市内展望を楽しめます。アミュプラザ10階はラーメン好きに人気の「博多めん街道」。",
  },
  {
    id: "fukuoka-city-museum",
    name: "Fukuoka City Museum",
    nameJa: "福岡市博物館",
    hubId: "fukuoka-city",
    prefecture: "Fukuoka",
    kind: "museum",
    categories: ["Museum & Art", "Culture"],
    tags: ["Museum", "History", "Fukuoka City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/4/4e/FukuokaCity_Museum_2018.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:FukuokaCity_Museum_2018.jpg",
    imageAttribution: "Nkmr844",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.5881, lng: 130.3531 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 200,
    transportOptions: { train: 210, shinkansen: 310 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 3500,
    indoorPercent: 80,
    ratings: {
      overall: 9.0,
      couple: 8.5,
      summer: 8.8,
      winter: 8.6,
      rain: 9.2,
      food: 7.5,
      photography: 8.3,
      relaxation: 7.8,
      value: 9.0,
      uniqueness: 9.2,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 7 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Museum parking available",
    walkingIntensity: "medium",
    walkingSunMin: 500,
    walkingShadeMin: 3000,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 4 },
    officialWebsite: "https://museum.city.fukuoka.jp/",
    enDescription:
      "The Fukuoka City Museum showcases the history and culture of Fukuoka from ancient times to the present. Its most famous exhibit is the solid gold seal 'King of Na of Wa' (a National Treasure) discovered on Shikanoshima Island, dating from the 1st century AD.",
    enHighlights: [
      "National Treasure gold seal of 'King of Na'",
      "Fukuoka history from ancient to modern",
      "Special exhibitions and cultural events",
    ],
    jaDescription:
      "福岡市博物館は古代から現代までの福岡の歴史と文化を紹介する総合博物館です。最大の見どころは志賀島で発見された国宝「金印」（漢委奴国王印）で、1世紀の日本と大陸との交流を物語る貴重な文化財です。",
    jaHighlights: [
      "国宝『金印』（漢委奴国王印）の常設展示",
      "福岡の歴史とアジア交流の展示",
      "企画展と市民文化イベント",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Fukuoka_City_Museum",
    wikiTitle: "Fukuoka City Museum",
    notesEn:
      "Permanent exhibition is ¥200; special exhibitions cost extra. The National Treasure gold seal is the highlight. Museum is in a park complex near Fukuoka Tower — combine both in one trip.",
    notesJa:
      "常設展は200円、企画展は別料金。国宝「金印」が必見です。福岡タワーと同じエリアにあるので、博物館・タワーをセットで巡るのがおすすめ。",
  },
  {
    id: "fukuoka-paypay-dome",
    name: "Fukuoka PayPay Dome & BOSS E-ZO",
    nameJa: "福岡ペイペイドーム・BOSS E-ZO FUKUOKA",
    hubId: "fukuoka-city",
    prefecture: "Fukuoka",
    kind: "entertainment",
    categories: ["Entertainment", "Sports"],
    tags: ["Baseball", "Sports", "Entertainment", "Fukuoka City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/0/06/Mizuho_PayPay_dome_Fukuoka_2025.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Mizuho_PayPay_dome_Fukuoka_2025.jpg",
    imageAttribution: "Keeteria",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.5903, lng: 130.3701 },
    budgetMin: 2000,
    budgetRecommended: 7000,
    budgetMax: 15000,
    ticketCost: 0,
    transportOptions: { train: 215, shinkansen: 315 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 4 },
    walkingMin: 3000,
    indoorPercent: 70,
    ratings: {
      overall: 8.3,
      couple: 8.0,
      summer: 8.5,
      winter: 8.2,
      rain: 8.5,
      food: 8.5,
      photography: 8.0,
      relaxation: 7.5,
      value: 8.0,
      uniqueness: 8.2,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation: "Required for game days",
    parking: "Dome parking and nearby lots",
    walkingIntensity: "medium",
    walkingSunMin: 1000,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 4 },
    officialWebsite: "https://e-zo.jp/",
    enDescription:
      "Fukuoka PayPay Dome is home to the SoftBank Hawks baseball team and one of Japan's most modern indoor stadiums. Adjacent BOSS E-ZO FUKUOKA is a multi-floor entertainment complex featuring VR attractions, the Oh Sadaharu Baseball Museum Supported by MIZUNO, live concert venues, and restaurants with panoramic bay views.",
    enHighlights: [
      "SoftBank Hawks home games at PayPay Dome",
      "Oh Sadaharu Baseball Museum",
      "BOSS E-ZO entertainment complex & bay views",
    ],
    jaDescription:
      "福岡ペイペイドームはソフトバンクホークスの本拠地として知られる日本最大級の全天候型スタジアムです。隣接するBOSS E-ZO FUKUOKAは王貞治ベースボールミュージアムやVRアトラクション、ライブ会場、レストランを擁する複合エンターテインメント施設で、博多湾を一望するロケーションが魅力です。",
    jaHighlights: [
      "ソフトバンクホークスのホームゲーム観戦",
      "王貞治ベースボールミュージアム",
      "BOSS E-ZO FUKUOKA の体験型アトラクション",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Fukuoka_PayPay_Dome",
    wikiTitle: "Fukuoka PayPay Dome",
    notesEn:
      "Home of the Fukuoka SoftBank Hawks. Even on non-game days, the dome tour (¥1,500) takes you onto the field and into the bullpen. Adjacent BOSS E-ZO complex has entertainment facilities and food halls.",
    notesJa:
      "福岡ソフトバンクホークスの本拠地。試合がない日でもドームツアー（1,500円）でフィールドやブルペンを見学できます。隣接のBOSS E-ZOにはアミューズメントやフードホールが充実。",
  },

  // ---- NAGASAKI CITY (+5) ----
  {
    id: "nagasaki-peace-park",
    name: "Nagasaki Peace Park & Atomic Bomb Museum",
    nameJa: "長崎平和公園・原爆資料館",
    hubId: "nagasaki-city",
    prefecture: "Nagasaki",
    kind: "memorial",
    categories: ["History", "Culture"],
    tags: ["History", "Peace", "Memorial", "Nagasaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/f/f5/20190202_Nagasaki_Peace_Park_Statue_of_Peace-2.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:20190202_Nagasaki_Peace_Park_Statue_of_Peace-2.jpg",
    imageAttribution: "Balon Greyjoy",
    imageLicense: "CC0",
    coordinates: { lat: 32.7763, lng: 129.8631 },
    budgetMin: 2000,
    budgetRecommended: 4000,
    budgetMax: 8000,
    ticketCost: 200,
    transportOptions: { train: 270, shinkansen: 370 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 2, max: 4 },
    walkingMin: 5000,
    indoorPercent: 40,
    ratings: {
      overall: 9.3,
      couple: 8.5,
      summer: 8.2,
      winter: 8.8,
      rain: 8.5,
      food: 7.2,
      photography: 9.0,
      relaxation: 7.5,
      value: 9.5,
      uniqueness: 9.5,
    },
    crowd: { weekday: 5, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Museum parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2000,
    walkingShadeMin: 3000,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 5 },
    officialWebsite: "https://nagasakipeace.jp/",
    enDescription:
      "Nagasaki Peace Park and the adjacent Atomic Bomb Museum commemorate the events of August 9, 1945 and promote a message of peace. The park features the iconic Peace Statue and monuments donated from around the world, while the museum documents the history with powerful exhibits.",
    enHighlights: [
      "Iconic Peace Statue by Seibo Kitamura",
      "International peace monuments",
      "Atomic Bomb Museum historical exhibits",
    ],
    jaDescription:
      "長崎平和公園と隣接する長崎原爆資料館は、1945年8月9日の原爆投下を記憶し平和を発信する場所です。公園には北村西望作の平和祈念像がそびえ、世界各国から寄贈された平和モニュメントが点在。資料館では被爆の実相を伝える展示が行われています。",
    jaHighlights: [
      "北村西望作の巨大平和祈念像",
      "世界各国からの平和モニュメント",
      "原爆資料館の被爆遺物と歴史展示",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Nagasaki_Peace_Park",
    wikiTitle: "Nagasaki Peace Park",
    notesEn:
      "Admission ¥200 for the Atomic Bomb Museum; Peace Park is free. Allow 2 hours minimum. The museum is emotionally intense — the nearby Hypocenter Park and Urakami Cathedral add important context.",
    notesJa:
      "原爆資料館は200円、平和公園は無料。最低2時間は確保を。資料館は内容が重いため、爆心地公園や浦上天主堂と合わせて訪問すると理解が深まります。",
  },
  {
    id: "glover-garden-nagasaki",
    name: "Glover Garden",
    nameJa: "グラバー園",
    hubId: "nagasaki-city",
    prefecture: "Nagasaki",
    kind: "garden",
    categories: ["Sightseeing", "History"],
    tags: ["Garden", "History", "Western Architecture", "Nagasaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/a/a4/Nagasaki-Glover-Garden-5415.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Nagasaki-Glover-Garden-5415.jpg",
    imageAttribution: "Fg2",
    imageLicense: "Public domain",
    coordinates: { lat: 32.7343, lng: 129.8699 },
    budgetMin: 2500,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 620,
    transportOptions: { train: 275, shinkansen: 375 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 4500,
    indoorPercent: 30,
    ratings: {
      overall: 9.0,
      couple: 9.3,
      summer: 8.5,
      winter: 8.5,
      rain: 8.0,
      food: 7.5,
      photography: 9.2,
      relaxation: 8.3,
      value: 8.5,
      uniqueness: 9.2,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Nearby public parking",
    walkingIntensity: "medium",
    walkingSunMin: 2000,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 5 },
    officialWebsite: "https://glover-garden.jp/",
    enDescription:
      "Glover Garden is an open-air museum perched on a hillside overlooking Nagasaki Harbor, preserving several Meiji-era Western residences. The centerpiece is the former Glover House, Japan's oldest wooden Western-style building, once home to Scottish merchant Thomas Glover who helped modernize Japan.",
    enHighlights: [
      "Former Glover House (Japan's oldest Western building)",
      "Panoramic views of Nagasaki Harbor",
      "Collection of Meiji-era Western residences",
    ],
    jaDescription:
      "グラバー園は長崎港を一望する丘に広がる野外博物館で、明治時代の洋館数棟を移築保存しています。中心となる旧グラバー住宅は日本最古の木造洋風建築で、スコットランド出身の貿易商トーマス・グラバーが日本の近代化に貢献した邸宅です。",
    jaHighlights: [
      "国指定重要文化財『旧グラバー住宅』",
      "長崎港を見下ろす丘の絶景",
      "明治期の洋館建築群",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Glover_Garden",
    wikiTitle: "Glover Garden",
    notesEn:
      "Admission ¥620 for adults. The garden is on a hillside — wear comfortable shoes. The panoramic view of Nagasaki Harbour from the upper garden is spectacular. Combine with a visit to nearby Oura Church.",
    notesJa:
      "入園料620円。坂の多い庭園なので歩きやすい靴で。上部庭園からの長崎港パノラマは必見。隣接する大浦天主堂と合わせての見学がおすすめ。",
  },
  {
    id: "dejima-nagasaki",
    name: "Dejima",
    nameJa: "出島",
    hubId: "nagasaki-city",
    prefecture: "Nagasaki",
    kind: "museum",
    categories: ["History", "Culture"],
    tags: ["History", "Museum", "Dutch Trading", "Nagasaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/1/1a/View_of_the_Former_Dutch_Trading_Post_on_Dejima_from_Tamae_Bridge%2C_Nagasaki%2C_20240815_1501_3720.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:View_of_the_Former_Dutch_Trading_Post_on_Dejima_from_Tamae_Bridge,_Nagasaki,_20240815_1501_3720.jpg",
    imageAttribution: "Jakub Hałun",
    imageLicense: "CC BY 4.0",
    coordinates: { lat: 32.7435, lng: 129.8724 },
    budgetMin: 2000,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 520,
    transportOptions: { train: 270, shinkansen: 370 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 4000,
    indoorPercent: 40,
    ratings: {
      overall: 8.8,
      couple: 8.3,
      summer: 8.0,
      winter: 8.5,
      rain: 8.5,
      food: 7.3,
      photography: 8.5,
      relaxation: 7.5,
      value: 8.8,
      uniqueness: 9.3,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 7 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Nearby coin parking",
    walkingIntensity: "medium",
    walkingSunMin: 1500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 4 },
    officialWebsite: "https://nagasakidejima.jp/",
    enDescription:
      "Dejima was a fan-shaped artificial island built in 1636 that served as Japan's only window to the Western world during the isolation period (1641–1859). Today, meticulously restored warehouses, residences, and exhibits recreate the Dutch trading post where East met West.",
    enHighlights: [
      "Reconstructed Dutch trading post buildings",
      "Japan's Edo-era window to the West",
      "Interactive exhibits on trade history",
    ],
    jaDescription:
      "出島は1636年に築造された扇形の人工島で、鎖国時代（1641年〜1859年）に西洋に開かれた日本唯一の窓口でした。現在は復元された倉庫や住居、展示施設が当時のオランダ商館の様子を再現し、東西交流の歴史を伝えています。",
    jaHighlights: [
      "復元されたオランダ商館建造物群",
      "鎖国時代唯一の西洋交易拠点",
      "貿易史を伝える体験型展示",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Dejima",
    wikiTitle: "Dejima",
    notesEn:
      "Admission ¥520. The reconstructed island offers a fascinating look at Japan's only window to the West during the isolation period. English audio guides available. Plan ~1.5 hours.",
    notesJa:
      "入場料520円。江戸時代に日本で唯一西欧に開かれた窓口を復元した歴史地区。英語音声ガイドあり。所要約1.5時間。",
  },
  {
    id: "chinatown-nagasaki",
    name: "Nagasaki Chinatown",
    nameJa: "長崎新地中華街",
    hubId: "nagasaki-city",
    prefecture: "Nagasaki",
    kind: "shopping",
    categories: ["Food & Dining", "Sightseeing"],
    tags: ["Food", "Chinese", "Chinatown", "Nagasaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/a/a1/Chinatown%2C_Nagasaki%2C_20240813_1739_3156.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Chinatown,_Nagasaki,_20240813_1739_3156.jpg",
    imageAttribution: "Jakub Hałun",
    imageLicense: "CC BY 4.0",
    coordinates: { lat: 32.7422, lng: 129.8761 },
    budgetMin: 1500,
    budgetRecommended: 5000,
    budgetMax: 10000,
    ticketCost: 0,
    transportOptions: { train: 270, shinkansen: 370 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 3 },
    walkingMin: 3000,
    indoorPercent: 60,
    ratings: {
      overall: 8.3,
      couple: 8.5,
      summer: 8.0,
      winter: 8.3,
      rain: 8.5,
      food: 9.5,
      photography: 8.8,
      relaxation: 7.5,
      value: 8.3,
      uniqueness: 8.5,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Nearby commercial parking",
    walkingIntensity: "medium",
    walkingSunMin: 1000,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 7, rainFriendly: 9, walkingIntensity: 3 },
    officialWebsite: "https://nagasaki-chinatown.com/",
    enDescription:
      "Nagasaki Shinchi Chinatown is the oldest Chinatown in Japan, dating back to the 17th century when Chinese traders settled near Dejima. Today its narrow streets are lined with vibrant restaurants, street food stalls serving champon and sara-udon, and colorful gates marking each cardinal direction.",
    enHighlights: [
      "Oldest Chinatown in Japan",
      "Nagasaki champon & sara-udon noodles",
      "Four colorful gates & Lunar New Year festival",
    ],
    jaDescription:
      "長崎新地中華街は日本最古の中華街で、17世紀に中国人貿易商が出島近くに居を構えたことに始まります。細い路地にはちゃんぽんや皿うどんを供する老舗飲食店が軒を連ね、東西南北を守る四つの色鮮やかな門と春節祭が名物です。",
    jaHighlights: [
      "日本最古の歴史ある中華街",
      "長崎名物ちゃんぽん・皿うどん",
      "四色の門と春節ランタンフェスティバル",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Nagasaki_Shinchi_Chinatown",
    wikiTitle: "Nagasaki Shinchi Chinatown",
    notesEn:
      "One of Japan's three great Chinatowns. Best visited during the Nagasaki Lantern Festival (late Jan–Feb). Champon and sara-udon are the local specialities — try them at a street stall.",
    notesJa:
      "日本三大中華街の一つ。長崎ランタンフェスティバル（1月下旬～2月）の時期が特におすすめ。ちゃんぽん・皿うどんは長崎名物、屋台でぜひ。",
  },
  {
    id: "meganebashi-bridge-nagasaki",
    name: "Meganebashi Spectacles Bridge",
    nameJa: "眼鏡橋",
    hubId: "nagasaki-city",
    prefecture: "Nagasaki",
    kind: "monument",
    categories: ["Sightseeing", "History"],
    tags: ["Bridge", "History", "Stone Arch", "Nagasaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/6/6e/Nagasaki_Meganebashi_M5257.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Megane_Bridge_in_Nagasaki,_Japan,_20240815_1441_3704.jpg",
    imageAttribution: "Jakub Hałun",
    imageLicense: "CC BY 4.0",
    coordinates: { lat: 32.7472, lng: 129.8805 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 0,
    transportOptions: { train: 270, shinkansen: 370 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 2500,
    indoorPercent: 0,
    ratings: {
      overall: 8.5,
      couple: 8.8,
      summer: 8.0,
      winter: 8.5,
      rain: 7.5,
      food: 7.0,
      photography: 9.3,
      relaxation: 7.8,
      value: 9.0,
      uniqueness: 9.0,
    },
    crowd: { weekday: 3, weekend: 6, holiday: 7 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Nearby coin parking",
    walkingIntensity: "low",
    walkingSunMin: 1500,
    walkingShadeMin: 1000,
    comfort: { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 2 },
    officialWebsite: null,
    enDescription:
      "Meganebashi (Spectacles Bridge) is Japan's oldest stone arch bridge, built in 1634 over the Nakashima River. Its name comes from the reflection of its twin arches in the water, which together form the shape of spectacles. It survived the 1945 atomic bombing and remains a beloved symbol of Nagasaki.",
    enHighlights: [
      "Japan's oldest stone arch bridge (1634)",
      "Spectacle-shaped reflection on the water",
      "Survived 1945 atomic bombing intact",
    ],
    jaDescription:
      "眼鏡橋は1634年に中島川に架けられた日本最古の石造アーチ橋です。二連アーチが水面に映り眼鏡のように見えることから名付けられました。1945年の原爆投下にも耐えて現存し、長崎のシンボルとして親しまれています。",
    jaHighlights: [
      "日本最古の石造二連アーチ橋（1634年）",
      "水面に映る眼鏡のような美しいフォルム",
      "1945年原爆にも耐えた長崎の象徴",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Meganebashi",
    wikiTitle: "Meganebashi",
    notesEn:
      "Free public access 24/7. The stone bridge is especially photogenic in the late afternoon light when the reflection forms a full circle. Best combined with a stroll along Nakashima River.",
    notesJa:
      "無料・24時間見学可能。午後の光で川面に映る橋と影が円を描く時間帯が絶好の写真スポット。中島川沿いの散策とセットで。",
  },

  // ---- KUMAMOTO CITY (+2) ----
  {
    id: "suizenji-garden-kumamoto",
    name: "Suizenji Jojuen Garden",
    nameJa: "水前寺成趣園",
    hubId: "kumamoto-city",
    prefecture: "Kumamoto",
    kind: "garden",
    categories: ["Gardens", "Sightseeing"],
    tags: ["Garden", "Strolling Garden", "History", "Kumamoto City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/8/85/Kumamoto_Suizenji-jojuen01n4272.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kumamoto_Suizenji-jojuen01n4272.jpg",
    imageAttribution: "663highland",
    imageLicense: "CC BY 2.5",
    coordinates: { lat: 32.7911, lng: 130.7347 },
    budgetMin: 2000,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 400,
    transportOptions: { train: 275, shinkansen: 375 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 2.5 },
    walkingMin: 3500,
    indoorPercent: 0,
    ratings: {
      overall: 9.0,
      couple: 9.2,
      summer: 8.5,
      winter: 8.5,
      rain: 7.5,
      food: 7.8,
      photography: 9.3,
      relaxation: 9.0,
      value: 8.5,
      uniqueness: 9.0,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Garden parking available",
    walkingIntensity: "low",
    walkingSunMin: 1500,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 3 },
    officialWebsite: "https://www.suizenji.or.jp/",
    enDescription:
      "Suizenji Jojuen is a classic Edo-period strolling garden laid out in 1632 by the Hosokawa daimyo clan. The garden features a large central pond with a miniature Mt. Fuji, a recreation of the 53 stations of the Tokaido road, and a traditional teahouse overlooking the serene landscape.",
    enHighlights: [
      "Miniature Mt. Fuji mound & pond",
      "53 Stations of Tokaido landscape",
      "Traditional teahouse with garden views",
    ],
    jaDescription:
      "水前寺成趣園は1632年に細川藩によって造営された江戸時代の回遊式庭園です。広大な池を中心に築山の富士山、東海道五十三次を模した景観が広がり、池を見渡す茶屋からは熊本の美しい庭園風景を堪能できます。",
    jaHighlights: [
      "ミニチュア富士山と池泉回遊式庭園",
      "東海道五十三次の縮景",
      "伝統茶屋での抹茶と庭園眺望",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Suizen-ji_J%C5%8Dju-en",
    wikiTitle: "Suizen-ji Jōju-en",
    notesEn:
      "Admission ¥400. A beautiful strolling garden representing the 53 stations of the Tokaido, with miniature Mount Fuji. Best viewed in the morning when pond reflections are clearest.",
    notesJa:
      "入園料400円。東海道五十三次を模し、ミニ富士山もある回遊式庭園。池の反射が最も美しい午前中の訪問がおすすめ。",
  },
  {
    id: "kumamoto-prefectural-art-museum",
    name: "Kumamoto Prefectural Art Museum",
    nameJa: "熊本県立美術館",
    hubId: "kumamoto-city",
    prefecture: "Kumamoto",
    kind: "museum",
    categories: ["Museum & Art", "Culture"],
    tags: ["Museum", "Art", "Kumamoto City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/e/ed/Kumamoto-Prefectural_Museum_of_Art_main_1.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kumamoto-Prefectural_Museum_of_Art_main_1.jpg",
    imageAttribution: "MK Products at Japanese Wikipedia",
    imageLicense: "CC BY-SA 3.0",
    coordinates: { lat: 32.8081, lng: 130.6998 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 300,
    transportOptions: { train: 280, shinkansen: 380 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 2.5 },
    walkingMin: 3000,
    indoorPercent: 80,
    ratings: {
      overall: 8.5,
      couple: 8.3,
      summer: 8.5,
      winter: 8.5,
      rain: 8.8,
      food: 7.3,
      photography: 7.8,
      relaxation: 8.0,
      value: 8.5,
      uniqueness: 8.3,
    },
    crowd: { weekday: 3, weekend: 5, holiday: 6 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Museum parking available",
    walkingIntensity: "low",
    walkingSunMin: 500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 3 },
    officialWebsite: "https://www.pref.kumamoto.jp/site/museum/",
    enDescription:
      "The Kumamoto Prefectural Art Museum houses a significant collection spanning Japanese and Western art, including works by local Kumamoto artists and pieces related to the Hosokawa samurai clan. Adjacent to Kumamoto Castle, it makes an excellent cultural pairing after exploring the castle grounds.",
    enHighlights: [
      "Hosokawa clan samurai art collection",
      "Modern Kumamoto artist exhibitions",
      "Prime location next to Kumamoto Castle",
    ],
    jaDescription:
      "熊本県立美術館は細川家ゆかりの武家美術品から近代の熊本ゆかりの作家まで幅広いコレクションを所蔵しています。熊本城に隣接し、城見学と合わせた文化散策の拠点として最適です。",
    jaHighlights: [
      "細川家伝来の武家美術コレクション",
      "熊本ゆかりの近代作家作品",
      "熊本城に隣接する好立地",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kumamoto_Prefectural_Museum_of_Art",
    wikiTitle: "Kumamoto Prefectural Museum of Art",
    notesEn:
      "Admission ¥270 for the permanent collection. A short walk from Kumamoto Castle. Focuses on local Kyushu artists and decorative arts. Renovated branch of the main Prefectural Museum.",
    notesJa:
      "常設展270円。熊本城から徒歩圏内。九州ゆかりの作家と工芸品を中心に展示。県立美術館の分館としてリニューアルされた施設。",
  },

  // ---- BEPPU CITY (+3) ----
  {
    id: "takegawara-onsen-beppu",
    name: "Takegawara Onsen",
    nameJa: "竹瓦温泉",
    hubId: "beppu-city",
    prefecture: "Oita",
    kind: "onsen",
    categories: ["Hot Springs & Wellness", "History"],
    tags: ["Onsen", "Sentō", "History", "Beppu"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/1/15/Beppu_Takegawara_Onsen_1.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Beppu_Takegawara_Onsen_1.jpg",
    imageAttribution: "大分帰省中",
    imageLicense: "CC BY 3.0",
    coordinates: { lat: 33.2788, lng: 131.5025 },
    budgetMin: 1000,
    budgetRecommended: 3500,
    budgetMax: 6000,
    ticketCost: 100,
    transportOptions: { train: 290, shinkansen: 400 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 1500,
    indoorPercent: 90,
    ratings: {
      overall: 8.5,
      couple: 8.3,
      summer: 7.8,
      winter: 8.8,
      rain: 9.0,
      food: 7.3,
      photography: 8.0,
      relaxation: 9.3,
      value: 9.0,
      uniqueness: 9.0,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 8, summer: 7, autumn: 9, winter: 9 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Nearby public parking",
    walkingIntensity: "low",
    walkingSunMin: 300,
    walkingShadeMin: 1200,
    comfort: { heatTolerance: 6, rainFriendly: 9, walkingIntensity: 2 },
    officialWebsite: null,
    enDescription:
      "Takegawara Onsen is a historic public bathhouse built in 1879, famous for its striking Meiji-era tiled façade and traditional sand bath (sunaburo) where guests are buried in naturally heated volcanic sand. It's one of Beppu's most iconic onsen landmarks.",
    enHighlights: [
      "Historic 1879 Meiji-era bathhouse",
      "Traditional sand bath (sunaburo)",
      "Iconic tiled façade & retro interior",
    ],
    jaDescription:
      "竹瓦温泉は1879年に建てられた歴史ある公衆浴場で、唐破風の屋根とタイル張りのファサードが特徴です。名物の砂湯（砂風呂）は火山性の温熱砂に全身を埋めて汗をかく伝統的な入浴法で、別府の象徴的温泉施設の一つです。",
    jaHighlights: [
      "1879年創業の明治レトロ浴場",
      "名物砂湯（砂風呂）体験",
      "唐破風のタイル張りファサード",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Takegawara_Onsen",
    wikiTitle: "Takegawara Onsen",
    notesEn:
      "Admission ¥300 for the regular bath, ¥800 for sand bath. The distinctive blue-glass Meiji-era façade is a photo spot. Bring your own towel or rent one on-site.",
    notesJa:
      "普通浴300円、砂湯800円。明治期の青ガラス外観が目を引く写真スポット。タオルは持参または現地レンタル可。",
  },
  {
    id: "kannawa-onsen-district",
    name: "Kannawa Onsen Steam District",
    nameJa: "鉄輪温泉湯けむり街",
    hubId: "beppu-city",
    prefecture: "Oita",
    kind: "onsen",
    categories: ["Hot Springs & Wellness", "Sightseeing"],
    tags: ["Onsen", "Steam", "Hell", "Beppu"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/c/cd/2020-02-24_Kannawa_Onsen_%E9%89%84%E8%BC%AA%E6%B8%A9%E6%B3%89%E5%85%A8%E6%99%AF_DSCF8631.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:2020-02-24_Kannawa_Onsen_%E9%89%84%E8%BC%AA%E6%B8%A9%E6%B3%89%E5%85%A8%E6%99%AF_DSCF8631.jpg",
    imageAttribution: "松岡明芳",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.2856, lng: 131.4742 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 8000,
    ticketCost: 0,
    transportOptions: { train: 295, shinkansen: 405 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 3 },
    walkingMin: 4000,
    indoorPercent: 40,
    ratings: {
      overall: 8.8,
      couple: 8.5,
      summer: 7.8,
      winter: 9.0,
      rain: 8.5,
      food: 8.5,
      photography: 9.0,
      relaxation: 8.8,
      value: 8.5,
      uniqueness: 9.3,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 8, summer: 7, autumn: 9, winter: 9 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Local parking available",
    walkingIntensity: "medium",
    walkingSunMin: 1500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 6, rainFriendly: 8, walkingIntensity: 4 },
    officialWebsite: null,
    enDescription:
      "The Kannawa district is the spiritual heart of Beppu's onsen culture, where plumes of steam rise from every alleyway. Visitors can cook eggs and vegetables in the natural steam vents (jigoku-mushi), soak in dozens of local bathhouses, and experience the enigmatic 'Steam Bathing' tradition.",
    enHighlights: [
      "Steam cooking (jigoku-mushi) experience",
      "Dozens of local bathhouses & foot onsens",
      "Atmospheric steam vents in every alley",
    ],
    jaDescription:
      "鉄輪温泉は別府の湯けむり文化の中心地で、路地のあちこちから湯けむりが立ちのぼる情緒あふれる温泉街です。地獄蒸し料理を体験できる共同調理場や点在する共同浴場、足湯が散策の楽しみを広げます。",
    jaHighlights: [
      "地獄蒸し料理体験ができる共同調理場",
      "点在する共同浴場と足湯めぐり",
      "路地の湯けむり景観散策",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Beppu_Onsen",
    wikiTitle: "Beppu Onsen",
    notesEn:
      "The historical heart of Beppu's hot spring culture. Walk between public bathhouses in a yukata. Try jigoku-mushi (hell-steamed) cooking available at several shops. The Kannawa Steam Building is a free foot bath spot.",
    notesJa:
      "別府温泉文化の発祥地。浴衣で共同浴場を巡るのが定番スタイル。地獄蒸し料理を提供する店も点在。鉄輪むし湯は無料の足湯スポット。",
  },
  {
    id: "beppu-tower",
    name: "Beppu Tower",
    nameJa: "別府タワー",
    hubId: "beppu-city",
    prefecture: "Oita",
    kind: "observation",
    categories: ["Sightseeing", "Entertainment"],
    tags: ["Tower", "Observation", "City View", "Beppu"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/3/38/Beppu_Tower_20230212.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Beppu_Tower_20230212.jpg",
    imageAttribution: "Tabitan",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.2806, lng: 131.5064 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 500,
    transportOptions: { train: 290, shinkansen: 400 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 2000,
    indoorPercent: 80,
    ratings: {
      overall: 7.8,
      couple: 8.3,
      summer: 8.0,
      winter: 7.8,
      rain: 8.0,
      food: 7.3,
      photography: 8.5,
      relaxation: 7.5,
      value: 7.5,
      uniqueness: 7.8,
    },
    crowd: { weekday: 3, weekend: 6, holiday: 6 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Nearby public parking",
    walkingIntensity: "low",
    walkingSunMin: 500,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 2 },
    officialWebsite: "https://beppu-tower.com/",
    enDescription:
      "Beppu Tower is a 100-meter observation tower completed in 1957, designed in the style of the Eiffel Tower. Its observation deck offers panoramic views of Beppu Bay, the cityscape, and on clear days the mountains of Shikoku across the Seto Inland Sea.",
    enHighlights: [
      "100m Eiffel-style observation tower",
      "Panoramic views of Beppu Bay",
      "Night illumination & city lights view",
    ],
    jaDescription:
      "別府タワーは1957年に完成した高さ100mのエッフェル塔型展望塔です。展望台からは別府湾、市街地、晴れた日には瀬戸内海越しに四国の山並みまで360度の絶景パノラマが楽しめます。",
    jaHighlights: [
      "エッフェル塔型100m展望タワー",
      "別府湾と市街地の360度パノラマ",
      "夜景とライトアップ",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Beppu_Tower",
    wikiTitle: "Beppu Tower",
    notesEn:
      "Admission ¥800. Built in 1957, it's one of Japan's oldest TV towers. The 360° observation deck has views of Beppu Bay and Mount Tsurumi. Night illumination is spectacular.",
    notesJa:
      "展望料800円。1957年完成の日本最古級テレビ塔。360度の展望台から別府湾と鶴見岳を一望。夜景も見事。",
  },

  // ---- YUFU CITY (+3) ----
  {
    id: "kinrin-lake-yufuin",
    name: "Kinrin Lake",
    nameJa: "金鱗湖",
    hubId: "yufu-city",
    prefecture: "Oita",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Lake", "Photography", "Mist", "Yufuin"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/a/a1/Lake_Kinrin_with_Morning_fog.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Lake_Kinrin_with_Morning_fog.jpg",
    imageAttribution: "Tzu-hsun, Hsu",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.2731, lng: 131.3551 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 0,
    transportOptions: { train: 300, shinkansen: 410 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 2500,
    indoorPercent: 0,
    ratings: {
      overall: 9.0,
      couple: 9.3,
      summer: 8.5,
      winter: 9.0,
      rain: 8.0,
      food: 7.5,
      photography: 9.5,
      relaxation: 9.3,
      value: 9.0,
      uniqueness: 9.0,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 9 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Nearby paid parking",
    walkingIntensity: "low",
    walkingSunMin: 1500,
    walkingShadeMin: 1000,
    comfort: { heatTolerance: 8, rainFriendly: 7, walkingIntensity: 2 },
    officialWebsite: null,
    enDescription:
      "Kinrin Lake is a mystical small lake in Yufuin where morning mist rises from the warm spring-fed waters meeting the cold mountain air, creating an ethereal scene. The name means 'Golden Scales' after the shimmering fish scales said to have been seen here at sunset. A walking path encircles the lake.",
    enHighlights: [
      "Morning mist over the warm spring-fed lake",
      "Scenic walking path around the lake",
      "Autumn foliage & winter snow reflections",
    ],
    jaDescription:
      "金鱗湖は由布院の中心に位置する神秘的な小湖で、湖底から湧く温泉水が冷たい朝の空気と触れて立ちのぼる朝霧が幻想的な風景を作り出します。湖名は日没時に魚の鱗が金色に輝いたという伝説に由来します。湖畔の遊歩道が整備されています。",
    jaHighlights: [
      "湖面を覆う幻想的な朝霧",
      "湖畔一周の遊歩道散策",
      "紅葉と冬の雪景色のリフレクション",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kinrin_Lake",
    wikiTitle: "Kinrin Lake",
    notesEn:
      "Free public access. Arrive before sunrise to catch the magical morning mist — this is the signature view. The walk around the lake takes about 20 minutes.",
    notesJa:
      "無料で見学可能。名物の朝霧を見るには夜明け前の到着が必須。湖畔一周は徒歩約20分。",
  },
  {
    id: "yufuin-floral-village",
    name: "Yufuin Floral Village",
    nameJa: "由布院フローラルヴィレッジ",
    hubId: "yufu-city",
    prefecture: "Oita",
    kind: "mixed",
    categories: ["Shopping", "Sightseeing"],
    tags: ["Shopping", "Photography", "European Style", "Yufuin"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/e/e9/Yufuin_Floral_Village.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Yufuin_Floral_Village.jpg",
    imageAttribution: "Bpcon98",
    imageLicense: "CC0",
    coordinates: { lat: 33.2642, lng: 131.3547 },
    budgetMin: 2000,
    budgetRecommended: 6000,
    budgetMax: 12000,
    ticketCost: 0,
    transportOptions: { train: 300, shinkansen: 410 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 2.5 },
    walkingMin: 3000,
    indoorPercent: 40,
    ratings: {
      overall: 8.0,
      couple: 9.0,
      summer: 8.3,
      winter: 8.0,
      rain: 7.8,
      food: 8.0,
      photography: 9.3,
      relaxation: 8.0,
      value: 7.8,
      uniqueness: 8.5,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Nearby paid parking",
    walkingIntensity: "medium",
    walkingSunMin: 1500,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 3 },
    officialWebsite: "https://floral-village.com/",
    enDescription:
      "Yufuin Floral Village is a whimsical shopping complex designed like a storybook English countryside village, complete with cobblestone paths and quaint cottages. It features boutique shops, cafés, and gift stores, and is famously featured in the Studio Ghibli-inspired atmosphere of Yufuin.",
    enHighlights: [
      "Storybook English village aesthetic",
      "Cobblestone paths & quaint boutique shops",
      "Studio Ghibli-inspired gift & craft shops",
    ],
    jaDescription:
      "由布院フローラルヴィレッジはイギリスの田舎町を模したメルヘンチックな商業施設で、石畳の小道と小さなコテージが並びます。ジブリの世界観を思わせる雑貨店やカフェが点在し、由布院の散策スポットとして人気です。",
    jaHighlights: [
      "絵本のようなイギリス風コテージ群",
      "石畳の小道と小さなショップ巡り",
      "ジブリ風雑貨店とフォトジェニックな街並み",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Yufuin_Onsen",
    wikiTitle: "Yufuin Onsen",
    notesEn:
      "The main street from Yufuin Station to the lake is lined with cafés and boutiques. Most ryokan offer day-use bathing (typically ¥500–1,000). Book popular ryokan well in advance.",
    notesJa:
      "由布院駅から金鱗湖までのメインストリートにはカフェや雑貨店が並ぶ。多くの旅館で日帰り入浴可（500～1,000円程度）。人気旅館は早めの予約を。",
  },
  {
    id: "yufuin-onsen-ryokan-district",
    name: "Yufuin Onsen District",
    nameJa: "由布院温泉郷",
    hubId: "yufu-city",
    prefecture: "Oita",
    kind: "onsen",
    categories: ["Hot Springs & Wellness", "Sightseeing"],
    tags: ["Onsen", "Ryokan", "Yufuin", "Wellness"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/f/f5/Yufuin_Onsen_-Mus%C5%8Den_02.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Yufuin_Onsen_-Mus%C5%8Den_02.jpg",
    imageAttribution: "Yasuhiro from Tokyo, Japan",
    imageLicense: "CC BY 2.0",
    coordinates: { lat: 33.2633, lng: 131.3556 },
    budgetMin: 3000,
    budgetRecommended: 10000,
    budgetMax: 25000,
    ticketCost: 0,
    transportOptions: { train: 300, shinkansen: 410 },
    totalTripHours: 5,
    recommendedVisitHours: { min: 2, max: 6 },
    walkingMin: 5000,
    indoorPercent: 50,
    ratings: {
      overall: 9.3,
      couple: 9.5,
      summer: 8.5,
      winter: 9.3,
      rain: 8.8,
      food: 9.3,
      photography: 9.0,
      relaxation: 9.5,
      value: 8.0,
      uniqueness: 9.0,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 9 },
    weatherDependence: "low",
    reservation: "Recommended for ryokan stays",
    parking: "Ryokan parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 7, rainFriendly: 9, walkingIntensity: 4 },
    officialWebsite: null,
    enDescription:
      "Yufuin Onsen is one of Japan's most beloved hot spring towns, nestled at the base of Mount Yufu (Yufudake). Unlike Beppu's dramatic hells, Yufuin charms with its serene countryside atmosphere, upscale ryokan with open-air baths overlooking rice paddies, and a walkable main street lined with cafés and artisan shops.",
    enHighlights: [
      "Open-air rotenburo with Mount Yufu views",
      "Charming ryokan & boutique inns",
      "Lake Kinrin morning mist & café street",
    ],
    jaDescription:
      "由布院温泉は由布岳の麓に広がる全国有数の温泉地で、別府のような派手さはなく、田園風景に溶け込む露天風呂付きの高級旅館と洗練されたカフェや工芸品店が続く湯の坪街道が魅力です。湖畔の朝霧と合わせて、のんびりした湯治体験が楽しめます。",
    jaHighlights: [
      "由布岳を望む露天風呂付き旅館",
      "湯の坪街道のカフェと工芸品店巡り",
      "金鱗湖の朝霧と温泉情緒",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Yufuin_Onsen",
    wikiTitle: "Yufuin Onsen",
    notesEn:
      "Free entry to the shopping complex. A whimsical British-cottage-style village with petting zoos, owl forest, and artisan shops. Popular with families and couples. Can be crowded on weekends — visit on a weekday if possible.",
    notesJa:
      "入場無料。英国コッツウォルズ風の可愛らしい複合施設。ふれあい動物園やフクロウの森も併設。週末は混雑するため平日推奨。",
  },

  // ---- DAZAIFU CITY (+3) ----
  {
    id: "dazaifu-tenmangu",
    name: "Dazaifu Tenmangu Shrine",
    nameJa: "太宰府天満宮",
    hubId: "dazaifu-city",
    prefecture: "Fukuoka",
    kind: "shrine",
    categories: ["History", "Culture"],
    tags: ["Shrine", "Plum", "Learning", "Dazaifu"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/8/8b/20100719_Dazaifu_Tenmangu_Shrine_3328.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:20100719_Dazaifu_Tenmangu_Shrine_3328.jpg",
    imageAttribution: "Jakub Hałun",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.5211, lng: 130.5353 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 0,
    transportOptions: { train: 220, shinkansen: 320 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1, max: 3 },
    walkingMin: 4000,
    indoorPercent: 10,
    ratings: {
      overall: 9.3,
      couple: 9.0,
      summer: 8.8,
      winter: 9.0,
      rain: 8.3,
      food: 8.8,
      photography: 9.3,
      relaxation: 8.5,
      value: 9.3,
      uniqueness: 9.3,
    },
    crowd: { weekday: 6, weekend: 9, holiday: 10 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 9 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Shrine parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2000,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 4 },
    officialWebsite: "https://www.dazaifutenmangu.or.jp/",
    enDescription:
      "Dazaifu Tenmangu is one of Japan's most important Shinto shrines, dedicated to Sugawara no Michizane, the deity of learning and scholarship. Built over his grave in 919, the shrine is famous for its 6,000 plum trees that bloom spectacularly in February–March. Students from across Japan come to pray for exam success.",
    enHighlights: [
      "6,000 plum trees blooming in early spring",
      "One of Japan's top three Tenmangu shrines",
      "Prayers for academic success & exam luck",
    ],
    jaDescription:
      "太宰府天満宮は学問の神様・菅原道真公を祀る日本有数の神社で、919年に道真公の墓所に創建されました。境内には約6,000本の梅が植えられ、2月〜3月の梅まつりは見事です。受験シーズンには全国から合格祈願の参拝者が訪れます。",
    jaHighlights: [
      "約6,000本の梅と梅まつり（2〜3月）",
      "学問の神様・菅原道真公の御神徳",
      "日本三天神の一社と合格祈願",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Dazaifu_Tenman-g%C5%AB",
    wikiTitle: "Dazaifu Tenman-gū",
    notesEn:
      "Free grounds access; treasure hall ¥500. The head shrine of Tenmangu dedicated to the god of learning. Try the local umegae-mochi (grilled sweet bean rice cake) sold fresh on the approach road.",
    notesJa:
      "境内無料、宝物殿500円。学問の神様を祀る天満宮の総本社。参道の名物「梅ヶ枝餅」は焼き立てをぜひ。",
  },
  {
    id: "kyushu-national-museum",
    name: "Kyushu National Museum",
    nameJa: "九州国立博物館",
    hubId: "dazaifu-city",
    prefecture: "Fukuoka",
    kind: "museum",
    categories: ["Museum & Art", "Culture"],
    tags: ["Museum", "National Museum", "Asia", "Dazaifu"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/1/14/Kyushu_National_Museum_20170225.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kyushu_National_Museum_20170225.jpg",
    imageAttribution: "Suicasmo",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.5183, lng: 130.5383 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 700,
    transportOptions: { train: 220, shinkansen: 320 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 2, max: 4 },
    walkingMin: 4000,
    indoorPercent: 90,
    ratings: {
      overall: 9.0,
      couple: 8.5,
      summer: 9.0,
      winter: 8.8,
      rain: 9.3,
      food: 7.8,
      photography: 8.3,
      relaxation: 8.0,
      value: 8.8,
      uniqueness: 9.3,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation:
      "None required; special exhibitions may require advance booking",
    parking: "Museum parking available",
    walkingIntensity: "medium",
    walkingSunMin: 500,
    walkingShadeMin: 3500,
    comfort: { heatTolerance: 9, rainFriendly: 9, walkingIntensity: 4 },
    officialWebsite: "https://www.kyuhaku.jp/",
    enDescription:
      "The Kyushu National Museum is Japan's fourth national museum, opened in 2005, and the first to focus on the formation of Japanese culture through the lens of Asian exchange. Its innovative exhibits trace cultural connections from prehistoric times through the Silk Road, using cutting-edge display technology.",
    enHighlights: [
      "Japan's only Asia-focused national museum",
      "Cutting-edge cultural exchange exhibits",
      "Silk Road & Asian trade history displays",
    ],
    jaDescription:
      "九州国立博物館は2005年に開館した日本で4番目の国立博物館で、アジアとの文化交流を通じた日本文化の形成をテーマにした初の国立博物館です。先史時代からシルクロードに至る文化交流の歴史を最新の展示技術で紹介しています。",
    jaHighlights: [
      "アジア交流をテーマにした唯一の国立博物館",
      "最新展示技術による文化交流展示",
      "シルクロードとアジア交易史",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kyushu_National_Museum",
    wikiTitle: "Kyushu National Museum",
    notesEn:
      "Admission ¥700 for the cultural exchange exhibition. A striking modern building adjacent to Dazaifu Tenmangu. The museum focuses on Japan's historical connections with Asia.",
    notesJa:
      "文化交流展700円。太宰府天満宮に隣接する印象的な現代建築。日本とアジアの文化交流史をテーマにした展示。",
  },
  {
    id: "komyozenji-temple-dazaifu",
    name: "Komyozenji Temple",
    nameJa: "光明禅寺",
    hubId: "dazaifu-city",
    prefecture: "Fukuoka",
    kind: "temple",
    categories: ["Culture", "Sightseeing"],
    tags: ["Temple", "Garden", "Zen", "Dazaifu"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/3/3d/Komyozenji_Temple_02.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Komyozenji_Temple_02.jpg",
    imageAttribution: "STA3816",
    imageLicense: "CC BY-SA 3.0",
    coordinates: { lat: 33.52, lng: 130.5334 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 200,
    transportOptions: { train: 220, shinkansen: 320 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 2500,
    indoorPercent: 5,
    ratings: {
      overall: 8.5,
      couple: 8.8,
      summer: 8.5,
      winter: 8.3,
      rain: 8.0,
      food: 7.0,
      photography: 9.0,
      relaxation: 9.3,
      value: 8.8,
      uniqueness: 8.5,
    },
    crowd: { weekday: 3, weekend: 5, holiday: 6 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Nearby coin parking",
    walkingIntensity: "low",
    walkingSunMin: 1000,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 2 },
    officialWebsite: null,
    enDescription:
      "Komyozenji is a serene Rinzai Zen temple founded in 1273, located just a short walk from Dazaifu Tenmangu. It is renowned for its two exquisite dry landscape gardens (karesansui): one featuring moss and maple representing the word 'light', the other using stones and sand to depict a dragon. Best visited in autumn for spectacular maple colors.",
    enHighlights: [
      "Two exquisite Zen karesansui gardens",
      "Moss & maple 'light' garden",
      "Peaceful autumn foliage away from crowds",
    ],
    jaDescription:
      "光明禅寺は1273年創建の臨済宗の禅寺で、太宰府天満宮から徒歩すぐの静かな場所にあります。二つの枯山水庭園があり、苔と紅葉で「光」を表す庭と石と砂で龍を描く庭が特徴です。秋の紅葉の名所として知られ、観光客の喧騒から離れた静寂が魅力です。",
    jaHighlights: [
      "苔と紅葉の枯山水「光」の庭",
      "石と砂の龍の枯山水庭園",
      "秋の紅葉と禅の静寂",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Dazaifu,_Fukuoka",
    wikiTitle: "Dazaifu, Fukuoka",
    notesEn:
      "Admission ¥200. A small, quiet Zen temple just steps from the busy Tenmangu approach. Renowned for its two karesansui gardens. Best in autumn (late Nov) when the maple garden is at its peak. No indoor photography.",
    notesJa:
      "拝観料200円。天満宮参道の喧騒から徒歩すぐの静かな禅寺。二つの枯山水庭園で有名。秋（11月下旬）の紅葉が名高い。堂内撮影禁止。",
  },

  // ---- KAGOSHIMA CITY (+2) ----
  {
    id: "sengan-en-garden-kagoshima",
    name: "Sengan-en Garden",
    nameJa: "仙巌園",
    hubId: "kagoshima-city",
    prefecture: "Kagoshima",
    kind: "garden",
    categories: ["Gardens", "History", "Sightseeing"],
    tags: ["Garden", "Satsuma", "UNESCO", "Kagoshima City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/f/fe/Sengan-en2.jpg",
    commonsFilePage: "https://commons.wikimedia.org/wiki/File:Sengan-en2.jpg",
    imageAttribution: "STA3816",
    imageLicense: "CC BY-SA 3.0",
    coordinates: { lat: 31.6167, lng: 130.575 },
    budgetMin: 2500,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 1000,
    transportOptions: { train: 310, shinkansen: 420 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 4000,
    indoorPercent: 20,
    ratings: {
      overall: 9.3,
      couple: 9.5,
      summer: 8.8,
      winter: 9.0,
      rain: 8.3,
      food: 8.5,
      photography: 9.5,
      relaxation: 9.0,
      value: 8.5,
      uniqueness: 9.5,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Garden parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2000,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 4 },
    officialWebsite: "https://www.senganen.jp/",
    enDescription:
      "Sengan-en is a magnificent Japanese garden and former villa of the Shimazu clan, the powerful samurai lords of Satsuma domain. Built in 1658, the garden famously 'borrows' Sakurajima volcano as its backdrop (shakkei), creating one of Japan's most dramatic garden vistas. It is part of the UNESCO 'Sites of Japan's Meiji Industrial Revolution'.",
    enHighlights: [
      "Sakurajima volcano as borrowed scenery (shakkei)",
      "Shimazu clan samurai villa & gardens",
      "UNESCO World Heritage Meiji industrial site",
    ],
    jaDescription:
      "仙巌園は薩摩藩主・島津家の別邸として1658年に築かれた大名庭園で、桜島を借景とした日本屈指の雄大な庭園景観が特徴です。「明治日本の産業革命遺産」の構成資産として世界遺産にも登録され、武家文化と近代化の歴史が融合した名勝です。",
    jaHighlights: [
      "桜島を借景にした大名庭園",
      "島津家別邸と薩摩の武家文化",
      "世界遺産『明治日本の産業革命遺産』構成資産",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Sengan-en",
    wikiTitle: "Sengan-en",
    notesEn:
      "Admission ¥1,300 (includes garden, villa, and museum). The garden frames an iconic view of Sakurajima across the bay. A guided villa tour is included in the ticket.",
    notesJa:
      "入園料1,300円（庭園・御殿・博物館含む）。庭園越しに桜島を望む絶景がシンボル。御殿内部ガイドツアー付き。",
  },
  {
    id: "kagoshima-city-aquarium",
    name: "Kagoshima City Aquarium",
    nameJa: "いおワールドかごしま水族館",
    hubId: "kagoshima-city",
    prefecture: "Kagoshima",
    kind: "aquarium",
    categories: ["Entertainment", "Family & Kids"],
    tags: ["Aquarium", "Family", "Whale Shark", "Kagoshima City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/a/a4/Kagoshima_Aquarium_20220820_01.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kagoshima_Aquarium_20220820_01.jpg",
    imageAttribution: "ja:User:Sanjo",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 31.5944, lng: 130.5625 },
    budgetMin: 2500,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 1500,
    transportOptions: { train: 310, shinkansen: 420 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 3500,
    indoorPercent: 80,
    ratings: {
      overall: 8.3,
      couple: 7.8,
      summer: 8.5,
      winter: 8.0,
      rain: 8.8,
      food: 7.5,
      photography: 8.0,
      relaxation: 7.0,
      value: 7.8,
      uniqueness: 8.5,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Aquarium parking available",
    walkingIntensity: "medium",
    walkingSunMin: 1000,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 4 },
    officialWebsite: "https://ioworld.jp/",
    enDescription:
      "Kagoshima City Aquarium (Io World) showcases the rich marine life of the Kuroshio Current that flows past Kagoshima. Its star attraction is the massive Kuroshio Tank featuring whale sharks, the world's largest fish. The aquarium offers dolphin shows and interactive touch pools, all with Sakurajima volcano as the backdrop.",
    enHighlights: [
      "Whale sharks in the Kuroshio Tank",
      "Sakurajima volcano backdrop from waterfront",
      "Dolphin shows & interactive touch pools",
    ],
    jaDescription:
      "いおワールドかごしま水族館は、鹿児島沖を流れる黒潮の豊かな海洋生物を紹介する水族館です。最大の見どころはジンベエザメが泳ぐ巨大な黒潮大水槽で、桜島を背景にしたイルカショーやふれあいタッチプールも楽しめます。",
    jaHighlights: [
      "ジンベエザメが泳ぐ黒潮大水槽",
      "桜島を背景にしたイルカショー",
      "ふれあいタッチプール体験",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kagoshima_City_Aquarium",
    wikiTitle: "Kagoshima City Aquarium",
    notesEn:
      "Admission ¥1,500 for adults. The Kuroshio Tank is one of Japan's largest, with whale sharks and manta rays. Feeding shows run several times daily — check the schedule at entry.",
    notesJa:
      "入館料1,500円。ジンベエザメやマンタが泳ぐ巨大な黒潮水槽が見どころ。給餌ショーは1日数回、入口でスケジュール確認を。",
  },

  // ---- ASO CITY (+4) ----
  {
    id: "nakadake-crater-aso",
    name: "Nakadake Crater",
    nameJa: "阿蘇中岳火口",
    hubId: "aso-city",
    prefecture: "Kumamoto",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Volcano", "Crater", "Hiking", "Aso"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/b/b2/Mt.Aso_and_caldera01.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Mt.Aso_and_caldera01.jpg",
    imageAttribution: "Miya.m",
    imageLicense: "CC BY-SA 3.0",
    coordinates: { lat: 32.8844, lng: 131.1039 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 0,
    transportOptions: { train: 320, shinkansen: 430 },
    totalTripHours: 5,
    recommendedVisitHours: { min: 1, max: 3 },
    walkingMin: 6000,
    indoorPercent: 0,
    ratings: {
      overall: 9.3,
      couple: 8.8,
      summer: 9.0,
      winter: 8.0,
      rain: 6.5,
      food: 7.5,
      photography: 9.5,
      relaxation: 7.5,
      value: 9.3,
      uniqueness: 9.8,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
    weatherDependence: "high",
    reservation:
      "None required; check volcanic activity alerts before visiting",
    parking: "Crater parking available",
    walkingIntensity: "medium",
    walkingSunMin: 3000,
    walkingShadeMin: 3000,
    comfort: { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 5 },
    officialWebsite: "https://www.aso.ne.jp/",
    enDescription:
      "Nakadake Crater is the active volcanic crater at the heart of Mount Aso, Japan's largest active volcano. Visitors can walk to the rim and peer into the churning turquoise crater lake — one of the most accessible active volcanic vents in the world. The crater may close during high volcanic activity; check conditions before visiting.",
    enHighlights: [
      "Active volcanic crater with turquoise lake",
      "One of the world's most accessible craters",
      "Dramatic volcanic landscape & gas plumes",
    ],
    jaDescription:
      "阿蘇中岳火口は日本最大の活火山・阿蘇山の中心に位置する活発な火口で、遊歩道で火口縁まで近づきエメラルドグリーンの火口湖を間近に眺められます。火山活動状況により立入規制があるため、訪問前に最新情報を確認してください。",
    jaHighlights: [
      "エメラルドグリーンの火口湖を間近に",
      "世界有数のアクセス可能な活火口",
      "迫力の噴煙と火山ガスの景観",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mount_Aso",
    wikiTitle: "Mount Aso",
    notesEn:
      "Crater access depends on volcanic gas levels — check the Aso Volcano Observatory website before going. The ropeway may close without warning. Bring a mask if you have respiratory sensitivity. Parking at the crater costs ¥800.",
    notesJa:
      "火口見学の可否は火山ガス濃度次第 — 事前に阿蘇火山博物館ウェブサイトで確認を。ロープウェイは突然運休あり。呼吸器が弱い方はマスク持参。火口駐車場は800円。",
  },
  {
    id: "kusasenri-meadow-aso",
    name: "Kusasenri Grassland",
    nameJa: "草千里ヶ浜",
    hubId: "aso-city",
    prefecture: "Kumamoto",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Grassland", "Horses", "Caldera", "Aso"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/a/a2/Kusasenrigahama_in_Aso_City_2007_0811_03.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kusasenrigahama_in_Aso_City_2007_0811_03.jpg",
    imageAttribution: "Project Kei",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 32.8847, lng: 131.0947 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 0,
    transportOptions: { train: 320, shinkansen: 430 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1, max: 2.5 },
    walkingMin: 5000,
    indoorPercent: 0,
    ratings: {
      overall: 9.0,
      couple: 9.3,
      summer: 9.0,
      winter: 8.0,
      rain: 6.5,
      food: 7.8,
      photography: 9.5,
      relaxation: 9.0,
      value: 9.0,
      uniqueness: 9.5,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 9, autumn: 9, winter: 7 },
    weatherDependence: "high",
    reservation: "None required",
    parking: "Grassland parking available",
    walkingIntensity: "medium",
    walkingSunMin: 3000,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 4 },
    officialWebsite: null,
    enDescription:
      "Kusasenri is a vast grassland inside the Aso caldera, with a small pond at its center and grazing horses dotting the landscape. The sweeping views of Mount Aso's smoking crater against the green expanse are iconic. Horse riding is available in the meadow, making it a highlight of any Aso visit.",
    enHighlights: [
      "Vast caldera grassland with grazing horses",
      "Smoking crater backdrop views",
      "Horse riding experience in the meadow",
    ],
    jaDescription:
      "草千里ヶ浜は阿蘇カルデラ内に広がる広大な草原で、中央の池と放牧された馬の群れが牧歌的な風景を作り出します。阿蘇中岳の噴煙を背景に広がる緑の草原は阿蘇を代表する景観で、乗馬体験も楽しめます。",
    jaHighlights: [
      "広大なカルデラ草原と放牧馬",
      "中岳火口噴煙を背景にした絶景",
      "草原での乗馬体験",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mount_Aso",
    wikiTitle: "Mount Aso",
    notesEn:
      "Free access. The rolling grasslands with grazing horses offer iconic Aso scenery. Volcanic activity updates are posted at the visitor centre. Horse riding available (extra fee). The pond in the centre is a volcanic crater.",
    notesJa:
      "入場無料。放牧馬が草を食む広大な草原は阿蘇の象徴的風景。火山活動情報はビジターセンターで確認。乗馬体験あり（別料金）。中央の池は火山火口跡。",
  },
  {
    id: "daikanbo-viewpoint-aso",
    name: "Daikanbo Viewpoint",
    nameJa: "大観峰",
    hubId: "aso-city",
    prefecture: "Kumamoto",
    kind: "nature",
    categories: ["Sightseeing", "Nature & Outdoors"],
    tags: ["Viewpoint", "Caldera", "Panorama", "Aso"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Daikanb%C5%8D_Lookout%2C_Yamada%2C_Aso%2C_Kumamoto_-_Jul_9%2C_2011.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Daikanbō_Lookout,_Yamada,_Aso,_Kumamoto_-_Jul_9,_2011.jpg",
    imageAttribution: "t-mizo",
    imageLicense: "CC BY 2.0",
    coordinates: { lat: 32.9983, lng: 131.0744 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 0,
    transportOptions: { train: 325, shinkansen: 435 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 2000,
    indoorPercent: 0,
    ratings: {
      overall: 9.0,
      couple: 9.3,
      summer: 9.0,
      winter: 8.5,
      rain: 6.0,
      food: 7.0,
      photography: 9.5,
      relaxation: 9.0,
      value: 9.5,
      uniqueness: 9.3,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 9, autumn: 9, winter: 8 },
    weatherDependence: "high",
    reservation: "None required",
    parking: "Viewpoint parking available",
    walkingIntensity: "low",
    walkingSunMin: 1000,
    walkingShadeMin: 1000,
    comfort: { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 2 },
    officialWebsite: null,
    enDescription:
      "Daikanbo is the premier panoramic viewpoint of the Aso caldera at 936 meters elevation, offering a breathtaking 360-degree view of the five peaks of Mount Aso, the vast caldera floor, and on clear days as far as the Kuju mountain range. The sea of clouds phenomenon at sunrise is particularly spectacular.",
    enHighlights: [
      "360° caldera panorama at 936m",
      "Five peaks of Mount Aso in one view",
      "Spectacular sunrise sea of clouds",
    ],
    jaDescription:
      "大観峰（標高936m）は阿蘇カルデラを一望できる最高の展望スポットで、阿蘇五岳と広大なカルデラの底、晴れた日には九重連山まで360度の大パノラマが広がります。早朝の雲海が特に神秘的で、阿蘇観光のハイライトです。",
    jaHighlights: [
      "936mの絶景360度カルデラパノラマ",
      "阿蘇五岳の全容を一望",
      "早朝に現れる神秘的な雲海",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mount_Aso",
    wikiTitle: "Mount Aso",
    notesEn:
      "Free access 24/7. The best panoramic view of the Aso caldera — arrive at sunrise or sunset for the most dramatic light. Parking is free; road access may close in heavy snow or ice.",
    notesJa:
      "無料・24時間見学可能。阿蘇カルデラのベストパノラマ — 朝日か夕暮れが最も幻想的。駐車場無料。大雪・凍結時は道路通行止めあり。",
  },
  {
    id: "aso-volcanic-museum",
    name: "Aso Volcano Museum",
    nameJa: "阿蘇火山博物館",
    hubId: "aso-city",
    prefecture: "Kumamoto",
    kind: "museum",
    categories: ["Museum & Art", "Nature & Outdoors"],
    tags: ["Museum", "Volcano", "Science", "Aso"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/e/e8/Aso_Volcano_Museum.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Aso_Volcano_Museum.jpg",
    imageAttribution: "STA3816",
    imageLicense: "Public domain",
    coordinates: { lat: 32.8853, lng: 131.0914 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 6000,
    ticketCost: 600,
    transportOptions: { train: 320, shinkansen: 430 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 2 },
    walkingMin: 2500,
    indoorPercent: 85,
    ratings: {
      overall: 8.3,
      couple: 8.0,
      summer: 8.5,
      winter: 8.3,
      rain: 8.8,
      food: 7.3,
      photography: 7.8,
      relaxation: 7.5,
      value: 8.5,
      uniqueness: 8.8,
    },
    crowd: { weekday: 3, weekend: 6, holiday: 7 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "Museum parking available",
    walkingIntensity: "low",
    walkingSunMin: 500,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 3 },
    officialWebsite: "https://www.asomuse.jp/",
    enDescription:
      "The Aso Volcano Museum sits at the foot of Nakadake Crater and offers a fascinating introduction to the geology and history of Mount Aso. Live camera feeds from inside the crater, 3D volcano models, and exhibits on the 1990s eruption make it an essential stop before or after visiting the crater itself.",
    enHighlights: [
      "Live crater camera feeds & volcano science",
      "3D models of Mount Aso's geology",
      "Interactive eruption history exhibits",
    ],
    jaDescription:
      "阿蘇火山博物館は中岳火口の麓に位置し、阿蘇山の地質と噴火の歴史をわかりやすく紹介する博物館です。火口内部のライブカメラ映像、3D火山模型、1990年代の噴火に関する展示があり、火口見学の前後に立ち寄るのに最適です。",
    jaHighlights: [
      "火口ライブカメラと火山の科学展示",
      "阿蘇山の3D地質模型",
      "噴火の歴史と体験型展示",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mount_Aso",
    wikiTitle: "Mount Aso",
    notesEn:
      "Admission ¥1,100. The museum explains Aso's volcanic activity with live crater-camera feeds. An excellent first stop before heading to Nakadake Crater — check current conditions and gas levels here.",
    notesJa:
      "入館料1,100円。阿蘇の火山活動をライブカメラ映像で解説。中岳火口へ向かう前の最初の立ち寄り先として最適 — 現地の状況とガス濃度を確認できます。",
  },

  // ---- MIYAZAKI CITY (+3) ----
  {
    id: "aoshima-island-miyazaki",
    name: "Aoshima Island & Devil's Washboard",
    nameJa: "青島・鬼の洗濯板",
    hubId: "miyazaki-city",
    prefecture: "Miyazaki",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Island", "Rock Formation", "Shrine", "Miyazaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/4/4c/Aoshima_jinja%2C_Worship_Hall_01.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Aoshima_jinja,_Worship_Hall_01.jpg",
    imageAttribution: "Naokijp",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 31.8044, lng: 131.4747 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 0,
    transportOptions: { train: 340, shinkansen: 450 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 5000,
    indoorPercent: 5,
    ratings: {
      overall: 8.8,
      couple: 9.0,
      summer: 9.0,
      winter: 8.0,
      rain: 7.0,
      food: 7.5,
      photography: 9.5,
      relaxation: 8.5,
      value: 9.0,
      uniqueness: 9.3,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 9, autumn: 9, winter: 7 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Island parking available",
    walkingIntensity: "medium",
    walkingSunMin: 3000,
    walkingShadeMin: 2000,
    comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 4 },
    officialWebsite: null,
    enDescription:
      "Aoshima is a small subtropical island connected to the mainland by a bridge, famous for the 'Devil's Washboard' — a natural formation of parallel basalt rock ridges extending along the shore, created by ancient wave erosion. The island's center houses Aoshima Shrine, a colorful shrine surrounded by lush tropical vegetation.",
    enHighlights: [
      "Devil's Washboard basalt rock formation",
      "Aoshima Shrine in tropical jungle",
      "Subtropical island accessible by footbridge",
    ],
    jaDescription:
      "青島は橋で本土と結ばれた亜熱帯の小島で、海岸に広がる「鬼の洗濯板」と呼ばれる平行な玄武岩の隆起地形が有名です。島の中心には熱帯植物に囲まれた色鮮やかな青島神社が鎮座し、縁結びのパワースポットとして親しまれています。",
    jaHighlights: [
      "鬼の洗濯板の奇岩地形",
      "熱帯ジャングルの中の青島神社",
      "橋で渡る亜熱帯の小島散策",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Aoshima,_Miyazaki",
    wikiTitle: "Aoshima, Miyazaki",
    notesEn:
      "Free access across the pedestrian bridge. The 'Devil's Washboard' rock formation is best viewed at low tide. Combine with a visit to the subtropical Aoshima Shrine and the Aoshima Subtropical Botanical Garden nearby.",
    notesJa:
      "島へは歩道橋で無料アクセス。「鬼の洗濯板」は干潮時に最もよく見えます。青島神社と青島亜熱帯植物園を合わせて散策。",
  },
  {
    id: "heiwadai-park-miyazaki",
    name: "Heiwadai Park & Haniwa Garden",
    nameJa: "平和台公園・はにわ園",
    hubId: "miyazaki-city",
    prefecture: "Miyazaki",
    kind: "park",
    categories: ["Sightseeing", "History"],
    tags: ["Park", "Peace Tower", "Haniwa", "Miyazaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/e/ec/View_of_Tower_of_Peace_in_Heiwadai_Park_4.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:View_of_Tower_of_Peace_in_Heiwadai_Park_4.jpg",
    imageAttribution: "そらみみ",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 31.95, lng: 131.4153 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 0,
    transportOptions: { train: 335, shinkansen: 445 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 1, max: 2 },
    walkingMin: 3500,
    indoorPercent: 5,
    ratings: {
      overall: 8.0,
      couple: 8.0,
      summer: 8.3,
      winter: 8.0,
      rain: 7.3,
      food: 7.0,
      photography: 8.5,
      relaxation: 8.3,
      value: 9.0,
      uniqueness: 8.8,
    },
    crowd: { weekday: 3, weekend: 5, holiday: 6 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Park parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2000,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 4 },
    officialWebsite: null,
    enDescription:
      "Heiwadai Park is a hilltop park built to commemorate the 2,600th anniversary of the legendary Emperor Jimmu's enthronement. Its centerpiece is the 37-meter Peace Tower, and the adjacent Haniwa Garden displays hundreds of replica ancient clay figures (haniwa) excavated from local burial mounds, offering a unique glimpse into Japan's Kofun period.",
    enHighlights: [
      "37m Peace Tower monument",
      "Hundreds of replica haniwa clay figures",
      "Panoramic hilltop views of Miyazaki",
    ],
    jaDescription:
      "平和台公園は神武天皇即位2600年を記念して造られた丘陵公園で、中心にそびえる高さ37mの平和の塔が象徴的です。隣接するはにわ園には宮崎県内の古墳から出土した埴輪のレプリカ数百体が展示され、古代のロマンを感じさせます。",
    jaHighlights: [
      "高さ37mの平和の塔",
      "数百体の埴輪レプリカ展示",
      "丘の上からの宮崎市街パノラマ",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Heiwadai_Park",
    wikiTitle: "Heiwadai Park",
    notesEn:
      "Free entry to the park. The 37-metre Peace Tower is the symbol of Miyazaki. The adjacent Haniwa Garden displays replica ancient clay figures. Pleasant stroll in spring cherry blossom season.",
    notesJa:
      "入園無料。高さ37mの平和の塔が宮崎のシンボル。隣接するはにわ園には古代埴輪のレプリカ展示。春は桜の名所。",
  },
  {
    id: "miyazaki-jingu-shrine",
    name: "Miyazaki Jingu Shrine",
    nameJa: "宮崎神宮",
    hubId: "miyazaki-city",
    prefecture: "Miyazaki",
    kind: "shrine",
    categories: ["History", "Culture"],
    tags: ["Shrine", "Emperor Jimmu", "Forest", "Miyazaki City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/c/c1/Miyazaki-jingu%2C_Deity_crest_on_the_door_of_Jingu_Kaikan_01.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Miyazaki-jingu,_Deity_crest_on_the_door_of_Jingu_Kaikan_01.jpg",
    imageAttribution: "Naokijp",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 31.9392, lng: 131.4236 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 0,
    transportOptions: { train: 335, shinkansen: 445 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 3000,
    indoorPercent: 5,
    ratings: {
      overall: 8.5,
      couple: 8.3,
      summer: 8.0,
      winter: 8.5,
      rain: 7.5,
      food: 7.0,
      photography: 8.5,
      relaxation: 8.8,
      value: 9.0,
      uniqueness: 8.5,
    },
    crowd: { weekday: 3, weekend: 5, holiday: 7 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Shrine parking available",
    walkingIntensity: "medium",
    walkingSunMin: 1500,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 3 },
    officialWebsite: "https://miyazakijingu.or.jp/",
    enDescription:
      "Miyazaki Jingu is the most important Shinto shrine in Miyazaki, dedicated to Emperor Jimmu, Japan's legendary first emperor. Set within a vast ancient forest of camphor and oak trees, the shrine's peaceful precincts offer a serene retreat from the city. The Grand Festival in late October features a spectacular horseback archery (yabusame) performance.",
    enHighlights: [
      "Dedicated to Japan's first Emperor Jimmu",
      "Ancient camphor forest setting",
      "Yabusame horseback archery festival (October)",
    ],
    jaDescription:
      "宮崎神宮は初代天皇・神武天皇を祀る宮崎県随一の神社で、クスノキやシイの巨木が生い茂る深い森の中に鎮座しています。10月下旬の例大祭では流鏑馬（やぶさめ）が奉納され、境内は静寂で神聖な空気に包まれます。",
    jaHighlights: [
      "初代天皇・神武天皇を祀る由緒",
      "クスノキの巨木が茂る神域の森",
      "10月例大祭の流鏑馬（やぶさめ）",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Miyazaki-jing%C5%AB",
    wikiTitle: "Miyazaki-jingū",
    notesEn:
      "Free grounds access. A serene forest shrine dedicated to Emperor Jimmu. Best during the Grand Festival in late October or cherry blossom season in late March. The long gravel approach is shaded by ancient cedars.",
    notesJa:
      "境内無料。初代天皇・神武天皇を祀る静かな森の神社。10月下旬の大祭か3月下旬の桜シーズンが特におすすめ。長い玉砂利の参道は古木に覆われている。",
  },

  // ---- TAKACHIHO TOWN (+3) ----
  {
    id: "takachiho-gorge",
    name: "Takachiho Gorge",
    nameJa: "高千穂峡",
    hubId: "takachiho-town",
    prefecture: "Miyazaki",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Gorge", "Waterfall", "Mythology", "Takachiho"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/2/2b/Takachiho-gorge.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Takachiho-gorge.jpg",
    imageAttribution: "Takasunrise0921",
    imageLicense: "CC BY 2.5",
    coordinates: { lat: 32.7122, lng: 131.3056 },
    budgetMin: 2500,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 0,
    transportOptions: { train: 355, shinkansen: 465 },
    totalTripHours: 5,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 5000,
    indoorPercent: 0,
    ratings: {
      overall: 9.5,
      couple: 9.5,
      summer: 9.0,
      winter: 8.5,
      rain: 7.5,
      food: 7.8,
      photography: 9.8,
      relaxation: 9.0,
      value: 9.0,
      uniqueness: 9.8,
    },
    crowd: { weekday: 5, weekend: 8, holiday: 9 },
    season: { spring: 9, summer: 9, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "Boat rental available on site first-come-first-served",
    parking: "Gorge parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 4 },
    officialWebsite: "https://takachiho-kanko.info/",
    enDescription:
      "Takachiho Gorge is a stunning volcanic basalt ravine carved by the Gokase River, with sheer 80-meter cliffs draped in moss and ferns. The iconic Manai Waterfall cascades into the emerald waters below, and visitors can rent rowboats to glide past the falls. The area is steeped in Japanese mythology as the setting of the sun goddess Amaterasu's hiding cave legend.",
    enHighlights: [
      "Manai Waterfall & emerald gorge rowboats",
      "80m moss-covered basalt cliffs",
      "Mythological setting of Amaterasu legend",
    ],
    jaDescription:
      "高千穂峡は五ヶ瀬川が溶岩を浸食してできた柱状節理の渓谷で、高さ80mの断崖が苔とシダに覆われ、真名井の滝がエメラルドグリーンの水面に落ちる絶景が広がります。貸しボートで滝の真下まで漕ぎ寄せる体験が人気で、天照大神の天岩戸神話の舞台としても知られています。",
    jaHighlights: [
      "真名井の滝とエメラルド渓谷のボート",
      "高さ80mの苔むす柱状節理の断崖",
      "天照大神・天岩戸神話ゆかりの地",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Takachiho_Gorge",
    wikiTitle: "Takachiho Gorge",
    notesEn:
      "Free to walk the gorge path; boat rental ¥3,000 per 30 min. Boats cannot be reserved — arrive early or expect a long queue on weekends. The gorge path may close after heavy rain.",
    notesJa:
      "渓谷遊歩道は無料、貸しボートは30分3,000円。ボートは予約不可 — 週末は早朝到着が必須。大雨後は遊歩道閉鎖あり。",
  },
  {
    id: "amanoiwato-shrine",
    name: "Amanoiwato Shrine",
    nameJa: "天岩戸神社",
    hubId: "takachiho-town",
    prefecture: "Miyazaki",
    kind: "shrine",
    categories: ["History", "Culture"],
    tags: ["Shrine", "Mythology", "Cave", "Takachiho"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/3/3f/Amanoiwato_Shrine_%2830722535953%29.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Amanoiwato_Shrine_(30722535953).jpg",
    imageAttribution: "David Stanley",
    imageLicense: "CC BY 2.0",
    coordinates: { lat: 32.7339, lng: 131.3522 },
    budgetMin: 1000,
    budgetRecommended: 3000,
    budgetMax: 5000,
    ticketCost: 0,
    transportOptions: { train: 360, shinkansen: 470 },
    totalTripHours: 2,
    recommendedVisitHours: { min: 0.5, max: 1.5 },
    walkingMin: 2500,
    indoorPercent: 5,
    ratings: {
      overall: 8.8,
      couple: 8.5,
      summer: 8.3,
      winter: 8.5,
      rain: 7.8,
      food: 7.0,
      photography: 8.3,
      relaxation: 9.0,
      value: 9.0,
      uniqueness: 9.5,
    },
    crowd: { weekday: 3, weekend: 6, holiday: 7 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required; cave viewing requires shrine staff escort",
    parking: "Shrine parking available",
    walkingIntensity: "medium",
    walkingSunMin: 1500,
    walkingShadeMin: 1000,
    comfort: { heatTolerance: 7, rainFriendly: 7, walkingIntensity: 3 },
    officialWebsite: null,
    enDescription:
      "Amanoiwato Shrine venerates the sacred cave where, according to Japanese mythology, the sun goddess Amaterasu hid herself, plunging the world into darkness until lured out by the other gods. The cave itself is across the river and can be viewed with shrine staff escort. The shrine's peaceful forest setting exudes a profound spiritual atmosphere.",
    enHighlights: [
      "Sacred cave of the Amaterasu legend",
      "Profound Shinto mythological site",
      "Peaceful mountain shrine & forest setting",
    ],
    jaDescription:
      "天岩戸神社は日本神話で天照大神が天岩戸に隠れ、世界が暗闇に包まれた伝説の洞窟を祀る神社です。洞窟は川向かいにあり神職の案内で拝観できます。静かな山中の境内は神話の世界に想いを馳せる神聖な空気に満ちています。",
    jaHighlights: [
      "天照大神伝説の天岩戸洞窟",
      "日本神話の聖地を訪ねる",
      "山中の静寂な神社と神域の森",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Amanoiwato-jinja",
    wikiTitle: "Amanoiwato-jinja",
    notesEn:
      "Free entry. The shrine honours the cave where the sun goddess Amaterasu hid, plunging the world into darkness. A short walk behind the main hall leads to the sacred cave viewing point across the river. Quiet and deeply atmospheric.",
    notesJa:
      "参拝無料。天照大神が隠れた天岩戸を祀る神社。本殿裏手の小道を進むと、川の対岸に洞窟拝観所がある。静かで神秘的な雰囲気。",
  },
  {
    id: "takachiho-kagura-dance",
    name: "Takachiho Kagura Night Dance",
    nameJa: "高千穂神楽・夜神楽",
    hubId: "takachiho-town",
    prefecture: "Miyazaki",
    kind: "event",
    categories: ["Culture", "Entertainment"],
    tags: ["Culture", "Dance", "Shinto", "Takachiho"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/d/d6/Yokagura_Sacred_Dance_%2831561847845%29.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Yokagura_Sacred_Dance_(31561847845).jpg",
    imageAttribution: "publichall",
    imageLicense: "CC BY 2.0",
    coordinates: { lat: 32.7136, lng: 131.3078 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 700,
    transportOptions: { train: 355, shinkansen: 465 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 2 },
    walkingMin: 2000,
    indoorPercent: 80,
    ratings: {
      overall: 9.0,
      couple: 8.8,
      summer: 8.5,
      winter: 8.8,
      rain: 8.5,
      food: 7.5,
      photography: 8.8,
      relaxation: 8.0,
      value: 8.5,
      uniqueness: 9.8,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 9 },
    weatherDependence: "low",
    reservation: "Recommended; evening performances sell out",
    parking: "Nearby public parking",
    walkingIntensity: "low",
    walkingSunMin: 500,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 2 },
    officialWebsite: "https://takachiho-kanko.info/kagura/",
    enDescription:
      "Takachiho Kagura is an ancient Shinto ritual dance performed nightly at Takachiho Shrine, retelling the myth of Amaterasu hiding in the cave through mesmerizing masked performances. The full 33-dance cycle lasts all night at the annual Yokagura festival, but a condensed 1-hour highlight version is presented year-round to visitors.",
    enHighlights: [
      "Nightly Shinto ritual masked dance",
      "Amaterasu mythology performed live",
      "UNESCO Intangible Cultural Heritage",
    ],
    jaDescription:
      "高千穂神楽は高千穂神社で毎夜奉納される古来の神楽で、天岩戸神話を題材にした面をつけた舞が幻想的です。11月〜2月の夜神楽シーズンには全33番の神楽が一晩かけて舞われますが、通年で1時間のハイライト版を観覧できます。",
    jaHighlights: [
      "毎夜奉納の神楽・面舞",
      "天照大神伝説を再現する舞台",
      "ユネスコ無形文化遺産の伝統芸能",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Takachiho,_Miyazaki",
    wikiTitle: "Takachiho, Miyazaki",
    notesEn:
      "Admission ¥1,000. Nightly performances 20:00–21:00 at Takachiho Shrine. No photography or video during the dance. Arrive by 19:30 for good seats. English pamphlet explains the four dance stories performed each night.",
    notesJa:
      "拝観料1,000円。高千穂神社で毎夜20:00～21:00に公演。演舞中の写真・ビデオ撮影は禁止。良い席のため19:30頃の到着推奨。英語解説パンフレットあり。",
  },

  // ---- YAKUSHIMA TOWN (+3) ----
  {
    id: "jomon-sugi-yakushima",
    name: "Jomon Sugi Cedar",
    nameJa: "縄文杉",
    hubId: "yakushima-town",
    prefecture: "Kagoshima",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Hiking", "UNESCO", "Forest", "Yakushima"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/b/b8/Jhomonsugi_in_Yaku_Island_Japan_001.JPG",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Jhomonsugi_in_Yaku_Island_Japan_001.JPG",
    imageAttribution: "Yosemite",
    imageLicense: "CC BY-SA 3.0",
    coordinates: { lat: 30.3586, lng: 130.5283 },
    budgetMin: 3000,
    budgetRecommended: 8000,
    budgetMax: 15000,
    ticketCost: 0,
    transportOptions: { train: 400, shinkansen: 510 },
    totalTripHours: 10,
    recommendedVisitHours: { min: 8, max: 12 },
    walkingMin: 30000,
    indoorPercent: 0,
    ratings: {
      overall: 9.5,
      couple: 9.0,
      summer: 9.0,
      winter: 8.0,
      rain: 7.0,
      food: 7.0,
      photography: 9.8,
      relaxation: 8.0,
      value: 9.0,
      uniqueness: 9.8,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 7 },
    weatherDependence: "high",
    reservation: "Guided tours recommended; trail may close in heavy rain",
    parking: "Trailhead parking at Arakawa Dam",
    walkingIntensity: "high",
    walkingSunMin: 15000,
    walkingShadeMin: 15000,
    comfort: { heatTolerance: 5, rainFriendly: 4, walkingIntensity: 9 },
    officialWebsite: "https://www.yakushima.or.jp/",
    enDescription:
      "Jomon Sugi is the oldest and most famous cedar tree on Yakushima, estimated at 2,170–7,200 years old, and considered a symbol of the island's UNESCO World Heritage ancient forest. Reaching it requires an 8–10 hour round-trip hike through the mystical moss-covered forest that inspired Studio Ghibli's Princess Mononoke.",
    enHighlights: [
      "~7,200-year-old ancient cedar tree",
      "Epic 8-10h hike through UNESCO forest",
      "Inspiration for Princess Mononoke landscape",
    ],
    jaDescription:
      "縄文杉は屋久島を代表する最大最古の屋久杉で、推定樹齢2,170〜7,200年とされ、ユネスコ世界遺産の古代森林のシンボルです。スタジオジブリ『もののけ姫』の舞台にもなった苔むす神秘的な森の中を往復8〜10時間かけて訪ねるトレッキングは一生の思い出になります。",
    jaHighlights: [
      "推定樹齢7,000年の古代屋久杉",
      "往復8〜10時間のUNESCO森林トレッキング",
      "『もののけ姫』の舞台となった苔の森",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/J%C5%8Dmon_Sugi",
    wikiTitle: "Jōmon Sugi",
    notesEn:
      "A full-day round-trip hike (8–10 hours) from the Arakawa trailhead. Start before 5am to return before dark. Mountain hut available but no supplies — carry all food and water. Guide recommended for first-timers.",
    notesJa:
      "荒川登山口から往復8～10時間の本格登山。日没前帰還のために午前5時前に出発を。山小屋ありだが補給不可 — 食料と水は全量携行。初めての方はガイド推奨。",
  },
  {
    id: "shiratani-unsuikyo-ravine",
    name: "Shiratani Unsuikyo Ravine",
    nameJa: "白谷雲水峡",
    hubId: "yakushima-town",
    prefecture: "Kagoshima",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Hiking", "Forest", "Photography", "Yakushima"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/0/04/Shiratani_Unsuikyo_Ravine-_Part_I_-_ShirataniUnsuikyo326.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Shiratani_Unsuikyo_Ravine-_Part_I_-_ShirataniUnsuikyo326.jpg",
    imageAttribution: "lumoplank",
    imageLicense: "CC0",
    coordinates: { lat: 30.3617, lng: 130.5536 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 500,
    transportOptions: { train: 400, shinkansen: 510 },
    totalTripHours: 6,
    recommendedVisitHours: { min: 1.5, max: 4 },
    walkingMin: 15000,
    indoorPercent: 0,
    ratings: {
      overall: 9.3,
      couple: 9.0,
      summer: 9.0,
      winter: 8.5,
      rain: 7.5,
      food: 7.0,
      photography: 9.8,
      relaxation: 9.0,
      value: 9.3,
      uniqueness: 9.5,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 9, autumn: 9, winter: 8 },
    weatherDependence: "moderate",
    reservation: "None required; trail may be slippery after rain",
    parking: "Trailhead parking available (¥500/day)",
    walkingIntensity: "high",
    walkingSunMin: 8000,
    walkingShadeMin: 7000,
    comfort: { heatTolerance: 5, rainFriendly: 5, walkingIntensity: 8 },
    officialWebsite: null,
    enDescription:
      "Shiratani Unsuikyo is Yakushima's most accessible and photogenic moss forest, an ethereal landscape of ancient cedar trees draped in vibrant green moss, babbling streams, and misty ravines. The shorter trails are suitable for casual hikers and offer the iconic mossy forest scenes that inspired Princess Mononoke's dreamlike world.",
    enHighlights: [
      "Iconic moss forest of Princess Mononoke fame",
      "Moss-covered ancient cedars & boulders",
      "Variety of trails from 1h to 4h",
    ],
    jaDescription:
      "白谷雲水峡は屋久島で最もアクセスしやすい苔むす森で、鮮やかな緑の苔に覆われた屋久杉の巨木と渓流が織りなす幻想的な風景が広がります。短いコースから太鼓岩までのトレッキングまで、『もののけ姫』の世界そのままの神秘的な光景を楽しめます。",
    jaHighlights: [
      "『もののけ姫』のモデルとなった苔の森",
      "苔に覆われた屋久杉と巨岩の絶景",
      "1時間〜4時間の多様なトレッキングコース",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Yakushima",
    wikiTitle: "Yakushima",
    notesEn:
      "Admission ¥500 donation. Choose from 1-hour, 3-hour, or 5-hour trails. The mossy forest inspired Studio Ghibli's Princess Mononoke. Trail can be slippery — hiking boots essential. Bus from Miyanoura Port takes ~40 min.",
    notesJa:
      "協力金500円。1時間・3時間・5時間の3コースから選択。苔むす森はジブリ『もののけ姫』のインスピレーション源。滑りやすいので登山靴必須。宮之浦港からバス約40分。",
  },
  {
    id: "yakusugi-land-yakushima",
    name: "Yakusugi Land",
    nameJa: "ヤクスギランド",
    hubId: "yakushima-town",
    prefecture: "Kagoshima",
    kind: "nature",
    categories: ["Nature & Outdoors", "Sightseeing"],
    tags: ["Hiking", "Forest", "Cedar", "Yakushima"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/0/0e/Suspension_footbridge_in_Yakusugi_Land.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Suspension_footbridge_in_Yakusugi_Land.jpg",
    imageAttribution: "Grendelkhan",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 30.2922, lng: 130.5747 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 500,
    transportOptions: { train: 400, shinkansen: 510 },
    totalTripHours: 5,
    recommendedVisitHours: { min: 1, max: 4 },
    walkingMin: 12000,
    indoorPercent: 0,
    ratings: {
      overall: 9.0,
      couple: 8.8,
      summer: 8.8,
      winter: 8.3,
      rain: 7.3,
      food: 7.0,
      photography: 9.3,
      relaxation: 9.0,
      value: 9.3,
      uniqueness: 9.3,
    },
    crowd: { weekday: 3, weekend: 6, holiday: 7 },
    season: { spring: 9, summer: 9, autumn: 9, winter: 7 },
    weatherDependence: "moderate",
    reservation: "None required",
    parking: "Trailhead parking available",
    walkingIntensity: "medium",
    walkingSunMin: 6000,
    walkingShadeMin: 6000,
    comfort: { heatTolerance: 5, rainFriendly: 5, walkingIntensity: 7 },
    officialWebsite: "https://www.yakushima.or.jp/",
    enDescription:
      "Yakusugi Land is a managed nature park on Yakushima featuring well-maintained boardwalk trails through groves of thousand-year-old yakusugi cedars. With trails ranging from 30 minutes to 2.5 hours, it's the most accessible way to experience the island's ancient forest without the full-day Jomon Sugi commitment. Several massive named cedar trees are highlights along the paths.",
    enHighlights: [
      "Boardwalk trails through ancient cedar groves",
      "Several named 1,000+ year-old cedars",
      "Range of trails from 30min to 2.5h",
    ],
    jaDescription:
      "ヤクスギランドは屋久島の自然公園で、よく整備された遊歩道を歩きながら樹齢1,000年を超える屋久杉の巨木群を気軽に観賞できます。30分から2.5時間の多様なコースがあり、縄文杉ほどの体力がなくても屋久島の原生林の魅力を存分に味わえます。",
    jaHighlights: [
      "樹齢千年超の屋久杉を巡る遊歩道",
      "複数の銘木と原生林の散策",
      "30分〜2.5時間の選べるコース",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Yakushima",
    wikiTitle: "Yakushima",
    notesEn:
      "Admission ¥500 donation. Easier trails than Jomon Sugi or Shiratani, suitable for families. Several courses from 30 min to 2.5 hours with well-maintained boardwalks. Still wear hiking shoes. Accessible by bus from Anbo.",
    notesJa:
      "協力金500円。縄文杉や白谷より易しいトレイルで家族連れに最適。30分～2.5時間の複数コースあり。木道整備あり。それでも登山靴推奨。安房からバスでアクセス可。",
  },

  // ---- KITAKYUSHU CITY (+3) ----
  {
    id: "mojiko-retro-district",
    name: "Mojiko Retro District",
    nameJa: "門司港レトロ地区",
    hubId: "kitakyushu-city",
    prefecture: "Fukuoka",
    kind: "mixed",
    categories: ["Sightseeing", "History"],
    tags: ["Port", "Meiji", "Architecture", "Kitakyushu City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/6/60/Train%2C_Mojik%C5%8D_Retro_Scenic_Line_-_Jun_24%2C_2023.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Train,_Mojik%C5%8D_Retro_Scenic_Line_-_Jun_24,_2023.jpg",
    imageAttribution: "bryan...",
    imageLicense: "CC BY-SA 2.0",
    coordinates: { lat: 33.9483, lng: 130.9625 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 10000,
    ticketCost: 0,
    transportOptions: { train: 215, shinkansen: 315 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1.5, max: 4 },
    walkingMin: 5000,
    indoorPercent: 30,
    ratings: {
      overall: 8.8,
      couple: 9.0,
      summer: 8.5,
      winter: 8.3,
      rain: 8.0,
      food: 8.8,
      photography: 9.3,
      relaxation: 8.0,
      value: 8.8,
      uniqueness: 9.0,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 9, summer: 8, autumn: 9, winter: 8 },
    weatherDependence: "low",
    reservation: "None required",
    parking: "District parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 4 },
    officialWebsite: "https://mojiko-retro.jp/",
    enDescription:
      "Mojiko Retro District is a beautifully preserved Meiji-era port town along the Kanmon Strait, featuring brick warehouses, the 1914 Mojiko Station (a National Important Cultural Property), and the Mojiko Retro Observation Tower. The waterfront promenade offers views of the Kanmon Bridge and fresh seafood at the local market.",
    enHighlights: [
      "1914 Mojiko Station (Important Cultural Property)",
      "Meiji-era brick warehouses & promenade",
      "Seafood market & Kanmon Strait views",
    ],
    jaDescription:
      "門司港レトロ地区は関門海峡に面した明治時代の港湾街並みを保存した観光エリアで、1914年建築の門司港駅（重要文化財）や赤レンガ倉庫群、門司港レトロ展望室が立ち並びます。海峡プロムナードからは関門橋を望み、新鮮な海鮮も楽しめます。",
    jaHighlights: [
      "重要文化財・門司港駅（1914年築）",
      "明治レトロな赤レンガ倉庫とプロムナード",
      "関門海峡の海鮮市場と絶景",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Mojiko_Retro",
    wikiTitle: "Mojiko Retro",
    notesEn:
      "Free to walk the district. Individual museums charge separate admission (combination tickets available for Mojiko Retro Observation Room, Railway Museum, and former Customs Building). The illuminated buildings at dusk are stunning.",
    notesJa:
      "地区散策は無料。各博物館は別途入館料（門司港レトロ展望室・鉄道記念館・旧門司税関など共通券あり）。夕暮れ時の建物ライトアップが美しい。",
  },
  {
    id: "kitakyushu-manga-museum",
    name: "Kitakyushu Manga Museum",
    nameJa: "北九州市漫画ミュージアム",
    hubId: "kitakyushu-city",
    prefecture: "Fukuoka",
    kind: "museum",
    categories: ["Museum & Art", "Entertainment"],
    tags: ["Museum", "Manga", "Culture", "Kitakyushu City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/1/11/Kitakyushu_Manga_Museum_entrance.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kitakyushu_Manga_Museum_entrance.jpg",
    imageAttribution: "Bmazerolles",
    imageLicense: "CC BY 4.0",
    coordinates: { lat: 33.8831, lng: 130.8833 },
    budgetMin: 1500,
    budgetRecommended: 4000,
    budgetMax: 7000,
    ticketCost: 500,
    transportOptions: { train: 220, shinkansen: 320 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1, max: 2.5 },
    walkingMin: 3000,
    indoorPercent: 85,
    ratings: {
      overall: 8.3,
      couple: 8.0,
      summer: 8.5,
      winter: 8.3,
      rain: 8.8,
      food: 7.3,
      photography: 8.0,
      relaxation: 7.8,
      value: 8.5,
      uniqueness: 8.8,
    },
    crowd: { weekday: 3, weekend: 6, holiday: 7 },
    season: { spring: 8, summer: 8, autumn: 8, winter: 8 },
    weatherDependence: "low",
    reservation:
      "None required; special exhibitions may require advance booking",
    parking: "ARUARU CITY building parking",
    walkingIntensity: "low",
    walkingSunMin: 500,
    walkingShadeMin: 2500,
    comfort: { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 3 },
    officialWebsite: "https://www.ktqmm.jp/",
    enDescription:
      "The Kitakyushu Manga Museum celebrates the region's rich manga heritage, honoring artists like Leiji Matsumoto (Galaxy Express 999) and other creators born in Kitakyushu. Located in the ARUARU CITY entertainment complex, the museum features original artwork, interactive drawing stations, and a reading library of 50,000+ manga volumes.",
    enHighlights: [
      "Leiji Matsumoto & local manga artist exhibits",
      "50,000+ volume manga reading library",
      "Interactive drawing & creation stations",
    ],
    jaDescription:
      "北九州市漫画ミュージアムは松本零士（『銀河鉄道999』）をはじめ北九州市ゆかりの漫画家の功績を紹介する文化施設です。ARUARU CITY内にあり、原画展示や体験型の作画コーナー、5万冊以上の漫画が読めるライブラリーを備えています。",
    jaHighlights: [
      "松本零士と北九州ゆかりの漫画家展示",
      "5万冊以上の漫画ライブラリー",
      "体験型作画コーナーと企画展",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kitakyushu_Manga_Museum",
    wikiTitle: "Kitakyushu Manga Museum",
    notesEn:
      "Admission ¥480. A hands-on museum where you can read thousands of manga, draw your own, and learn about manga history. Great rainy-day activity. All ages welcome.",
    notesJa:
      "入館料480円。数千冊の漫画を読める体験型博物館。自分で漫画を描けるコーナーも。雨の日のアクティビティに最適。全年齢歓迎。",
  },
  {
    id: "kawachi-wisteria-garden",
    name: "Kawachi Wisteria Garden",
    nameJa: "河内藤園",
    hubId: "kitakyushu-city",
    prefecture: "Fukuoka",
    kind: "garden",
    categories: ["Gardens", "Sightseeing"],
    tags: ["Garden", "Flowers", "Photography", "Kitakyushu City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/f/f0/Wisteria_Tunnel_in_Kawachi_Wisteria_Garden_20150509-2.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Wisteria_Tunnel_in_Kawachi_Wisteria_Garden_20150509-2.jpg",
    imageAttribution: "そらみみ (Soramimi)",
    imageLicense: "CC BY-SA 4.0",
    coordinates: { lat: 33.8722, lng: 130.8297 },
    budgetMin: 2000,
    budgetRecommended: 5000,
    budgetMax: 8000,
    ticketCost: 500,
    transportOptions: { train: 230, shinkansen: 330 },
    totalTripHours: 4,
    recommendedVisitHours: { min: 1, max: 2.5 },
    walkingMin: 4000,
    indoorPercent: 5,
    ratings: {
      overall: 9.3,
      couple: 9.5,
      summer: 8.5,
      winter: 7.0,
      rain: 6.5,
      food: 7.3,
      photography: 9.8,
      relaxation: 9.0,
      value: 8.5,
      uniqueness: 9.5,
    },
    crowd: { weekday: 6, weekend: 9, holiday: 10 },
    season: { spring: 10, summer: 6, autumn: 6, winter: 4 },
    weatherDependence: "moderate",
    reservation:
      "Advance tickets required during peak bloom (late April–early May)",
    parking: "Garden parking available",
    walkingIntensity: "medium",
    walkingSunMin: 2500,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 7, rainFriendly: 5, walkingIntensity: 4 },
    officialWebsite: "https://kawachi-fujien.com/",
    enDescription:
      "Kawachi Wisteria Garden is a private hillside garden famous for its spectacular 80m and 110m long tunnels of cascading wisteria blossoms in shades of purple, pink, and white. The garden is open only during wisteria season (late April to mid-May) and autumn foliage season. Reservations are essential during peak bloom.",
    enHighlights: [
      "110m & 80m wisteria flower tunnels",
      "Spectacular April–May bloom season",
      "Hilltop panoramic views over the garden",
    ],
    jaDescription:
      "河内藤園は丘陵地に広がるプライベートガーデンで、全長80mと110mの藤のトンネルが圧巻です。紫、ピンク、白の藤が咲き乱れる4月下旬〜5月中旬の藤シーズンと秋の紅葉シーズンのみ開園。ピーク時は事前予約制です。",
    jaHighlights: [
      "全長110mと80mの藤の花トンネル",
      "4月下旬〜5月中旬の絶景フラワーシーズン",
      "丘の上の藤棚とパノラマ展望",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/Kawachi_Wisteria_Garden",
    wikiTitle: "Kawachi Wisteria Garden",
    notesEn:
      "Only open during wisteria season (late Apr–early May) and autumn colours (mid-Nov–early Dec). Advance reservation required during peak season. The twin wisteria tunnels are the most photographed spot.",
    notesJa:
      "藤シーズン（4月下旬～5月上旬）と紅葉期（11月中旬～12月上旬）のみ開園。ピーク時は事前予約必須。二本の藤トンネルが最も有名なフォトスポット。",
  },
  {
    id: "toto-museum-kitakyushu",
    name: "TOTO Museum",
    nameJa: "TOTOミュージアム",
    hubId: "kitakyushu-city",
    prefecture: "Fukuoka",
    kind: "museum",
    categories: ["Museum & Art", "Culture"],
    tags: ["Museum", "Industrial", "Architecture", "Kitakyushu City"],
    heroImage:
      "https://upload.wikimedia.org/wikipedia/commons/c/c3/Kitakyushu_%28%E5%8C%97%E4%B9%9D%E5%B7%9E%29%2C_Fukuoka_Prefecture%2C_Japan_February_2026_-_TOTO_Museum.jpg",
    commonsFilePage:
      "https://commons.wikimedia.org/wiki/File:Kitakyushu_(%E5%8C%97%E4%B9%9D%E5%B7%9E),_Fukuoka_Prefecture,_Japan_February_2026_-_TOTO_Museum.jpg",
    imageAttribution: "Sharon Hahn Darlin",
    imageLicense: "CC BY 4.0",
    coordinates: { lat: 33.8711, lng: 130.8803 },
    budgetMin: 500,
    budgetRecommended: 1500,
    budgetMax: 3000,
    ticketCost: 0,
    transportOptions: { train: 200 },
    totalTripHours: 3,
    recommendedVisitHours: { min: 1.5, max: 3 },
    walkingMin: 2000,
    indoorPercent: 95,
    ratings: {
      overall: 8.5,
      couple: 7.5,
      summer: 9.0,
      winter: 9.0,
      rain: 9.5,
      food: 6.0,
      photography: 8.0,
      relaxation: 7.5,
      value: 9.5,
      uniqueness: 9.0,
    },
    crowd: { weekday: 4, weekend: 7, holiday: 8 },
    season: { spring: 8, summer: 9, autumn: 8, winter: 9 },
    weatherDependence: "low",
    reservation:
      "Individual visitors: no reservation needed. Groups of 10+: advance reservation required. Free guided tours in Japanese (English audio guide available) — check official site for tour schedule.",
    parking: "Free parking available",
    walkingIntensity: "low",
    walkingSunMin: 500,
    walkingShadeMin: 1500,
    comfort: { heatTolerance: 9, rainFriendly: 10, walkingIntensity: 3 },
    officialWebsite: "https://jp.toto.com/knowledge/visit/en_museum/",
    enDescription:
      "The TOTO Museum celebrates the centennial of the renowned sanitary ware manufacturer. Located in Kitakyushu, the museum showcases the evolution of plumbing technology, innovative toilet designs, and cultural changes in Japanese bathing and hygiene.",
    enHighlights: [
      "Evolution of Japanese toilets and sanitary ware",
      "Futuristic architectural design",
      "Historical artifacts from TOTO's founding",
    ],
    jaDescription:
      "TOTOミュージアムは、北九州市に位置するTOTO創立100周年記念施設です。日本の水まわり文化の変遷や、衛生陶器・ウォシュレットの技術進化を実物展示とともに学べる、世界的にも珍しい博物館です。",
    jaHighlights: [
      "衛生陶器と水まわり製品の歴史展示",
      "目を引く斬新な建築デザイン",
      "TOTOの歴史的な製品群",
    ],
    wikiUrl: "https://en.wikipedia.org/wiki/TOTO_(company)",
    wikiTitle: "TOTO (company)",
    notesEn:
      "Free admission. Closed Mondays (or Tuesday if Monday is a public holiday), summer holidays, and year-end/New Year holidays. Last admission at 16:30. English pamphlet available at reception. The museum is a 10-minute walk from JR Space World Station.",
    notesJa:
      "入館無料。休館日は月曜日（祝日の場合は翌平日）、夏季休暇、年末年始。最終入館は16:30。受付で英語パンフレットあり。JRスペースワールド駅から徒歩10分。写真撮影可（一部展示除く）。",
  },
];

function assertInvariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// Deep equal helper for idempotency and preservation checks
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function applyKyushuExpansion(
  input: DestinationRecord[],
  runDate: string,
): DestinationRecord[] {
  const data = (
    JSON.parse(JSON.stringify(input)) as DestinationRecord[]
  ).filter((r) => r.id !== "marinoa-city-fukuoka");

  for (const record of data) {
    if (record.region !== "Kyushu") continue;

    let changed = false;

    // Hub nameJa
    if (record.role === "hub") {
      if (hubNameJa[record.id] && !record.nameJa) {
        record.nameJa = hubNameJa[record.id];
        if (!record.aliases) record.aliases = [record.name];
        if (!record.aliases.includes(hubNameJa[record.id])) {
          record.aliases.push(hubNameJa[record.id]);
        }
        changed = true;
      }
      if (record.status !== "published") {
        record.status = "published";
        changed = true;
      }
    }

    // Non-hub records
    if (record.role !== "hub") {
      const hubId = parentHubMap[record.id];

      // Gateway (amami-iriomote-natural-site — stays standalone)
      if (record.id === "amami-iriomote-natural-site") {
        const backfill = jaBackfill[record.id];
        if (
          backfill &&
          (!record.content?.ja || !record.content.ja.description)
        ) {
          if (!record.content) record.content = {};
          record.content.ja = {
            name: record.nameJa || record.name,
            description: backfill.description,
            highlights: backfill.highlights,
          };
          changed = true;
        }
        if (record.status !== "published") {
          record.status = "published";
          changed = true;
        }
        // Apply gateway backfill notes
        if (backfill) {
          if (backfill.notesEn && record.notes !== backfill.notesEn) {
            record.notes = backfill.notesEn;
            changed = true;
          }
          if (backfill.notesJa && record.notesJa !== backfill.notesJa) {
            record.notesJa = backfill.notesJa;
            changed = true;
          }
        }

        if (!record.editorial) record.editorial = {};
        if (
          !record.editorial.sources ||
          record.editorial.sources.length === 0
        ) {
          record.editorial.sources = [
            {
              type: "wikipedia",
              url: backfill.wikiUrl,
              title: backfill.wikiTitle,
              accessedAt: runDate,
            },
          ];
          changed = true;
        }
      } else {
        if (hubId) {
          if (!record.relationships) record.relationships = {};
          if (record.relationships.parentDestinationId !== hubId) {
            record.relationships.parentDestinationId = hubId;
            changed = true;
          }
        }

        if (
          record.role === "standalone" ||
          record.role === "no-role" ||
          !record.role
        ) {
          record.role = "poi";
          changed = true;
        }

        if (record.status !== "published") {
          record.status = "published";
          changed = true;
        }

        const backfill = jaBackfill[record.id];
        if (
          backfill &&
          (!record.content?.ja || !record.content.ja.description)
        ) {
          if (!record.content) record.content = {};
          record.content.ja = {
            name: record.nameJa || record.name,
            description: backfill.description,
            highlights: backfill.highlights,
          };
          changed = true;
        }

        // Apply jaBackfill notes if present
        if (backfill) {
          if (backfill.notesEn && record.notes !== backfill.notesEn) {
            record.notes = backfill.notesEn;
            changed = true;
          }
          if (backfill.notesJa && record.notesJa !== backfill.notesJa) {
            record.notesJa = backfill.notesJa;
            changed = true;
          }
        }

        if (
          !record.editorial?.sources ||
          record.editorial.sources.length === 0
        ) {
          if (backfill) {
            if (!record.editorial) record.editorial = {};
            record.editorial.sources = [
              {
                type: "wikipedia",
                url: backfill.wikiUrl,
                title: backfill.wikiTitle,
                accessedAt: runDate,
              },
            ];
            changed = true;
          }
        }

        if (!record.municipalityId && hubId && hubMun[hubId]) {
          record.municipalityId = hubMun[hubId];
          changed = true;
        }
      }
    }

    if (changed) {
      if (!record.editorial) record.editorial = {};
      record.editorial.lifecycle = "published";
      record.editorial.freshness = "current";
      record.editorial.checkedAt = runDate;
      record.editorial.reviewedAt = runDate;
      record.editorial.reviewedBy = "Kyushu Regional Editorial Batch";
    }

    // Apply opening hours
    const hours = kyushuOpeningHours[record.id];
    if (hours) {
      if (record.openingHours !== hours.en) {
        record.openingHours = hours.en;
        changed = true;
      }
      if (record.openingHoursJa !== hours.ja) {
        record.openingHoursJa = hours.ja;
        changed = true;
      }
      const newMetadata = {
        verifiedAt: "2026-08-05",
        sourceUrl: hours.sourceUrl,
        ...(hours.lastAdmission && { lastAdmission: hours.lastAdmission }),
        ...(hours.closedDays && { closedDays: hours.closedDays }),
      };
      if (
        !record.openingHoursMetadata ||
        JSON.stringify(record.openingHoursMetadata) !==
          JSON.stringify(newMetadata)
      ) {
        record.openingHoursMetadata = newMetadata;
        changed = true;
      }
      if (record.content?.en && record.content.en.openingHours !== hours.en) {
        record.content.en.openingHours = hours.en;
        changed = true;
      }
      if (record.content?.ja && record.content.ja.openingHours !== hours.ja) {
        record.content.ja.openingHours = hours.ja;
        changed = true;
      }
    }

    // Remove contradictory legacy businessHours (openingHours is canonical)
    if ("businessHours" in record) {
      delete (record as Record<string, unknown>).businessHours;
      changed = true;
    }
  }

  // Step 2: Add new POIs
  for (const poiDef of newPois) {
    const existingIdx = data.findIndex((r) => r.id === poiDef.id);
    if (existingIdx !== -1) {
      data[existingIdx] = Object.assign(
        {},
        data[existingIdx],
        buildPoi(poiDef),
      );
      continue;
    }
    const rec = buildPoi(poiDef);
    if (hubMun[poiDef.hubId]) {
      rec.municipalityId = hubMun[poiDef.hubId];
    }
    data.push(rec);
  }

  return data;
}

// ==========================================================================
// EXECUTE & ASSERT
// ==========================================================================

const nonKyushuBefore = data.filter((r) => r.region !== "Kyushu");

const pass1 = applyKyushuExpansion(data, EXPANSION_DATE);
const pass2 = applyKyushuExpansion(pass1, EXPANSION_DATE);

if (!deepEqual(pass1, pass2)) {
  for (let i = 0; i < pass1.length; i++) {
    if (!deepEqual(pass1[i], pass2[i])) {
      console.log(`Diff at index ${i}:`, pass1[i].id);
      fs.writeFileSync("pass1.json", JSON.stringify(pass1[i], null, 2));
      fs.writeFileSync("pass2.json", JSON.stringify(pass2[i], null, 2));
      break;
    }
  }
}

// Assertion 1: Idempotency
assertInvariant(
  deepEqual(pass1, pass2),
  "Idempotency failed: applying transformation twice produced different results",
);
console.log("✓ Real idempotency verified");

// Assertion 2: Non-Kyushu preservation
const nonKyushuAfter = pass1.filter((r) => r.region !== "Kyushu");
assertInvariant(
  deepEqual(nonKyushuBefore, nonKyushuAfter),
  "Non-Kyushu records were modified during transformation",
);
console.log("✓ Non-Kyushu records preserved");

// Assertion 3: Exactly 38 new unique IDs (using explicit list)
const expectedNewIds = new Set(newPois.map((p) => p.id));
const finalIds = pass1.map((r) => r.id);
const finalIdSet = new Set(finalIds);

for (const id of expectedNewIds) {
  assertInvariant(
    finalIdSet.has(id),
    `Expected new POI ${id} is missing from final catalog`,
  );
}
console.log("✓ Exactly 38 expected new POI IDs are present");

assertInvariant(
  finalIds.length === finalIdSet.size,
  "Duplicate IDs exist in the final catalogue",
);
console.log("✓ No duplicate IDs exist");

// Check the 38 new POIs properties
for (const id of expectedNewIds) {
  const r = pass1.find((rec) => rec.id === id)!;

  assertInvariant(
    !!r.content?.ja?.description && !!r.content?.ja?.highlights?.length,
    `POI ${id} missing Japanese description or highlights`,
  );

  assertInvariant(
    !!r.transportOptions && Object.keys(r.transportOptions).length > 0,
    `POI ${id} missing transportOptions`,
  );

  assertInvariant(!!r.municipalityId, `POI ${id} missing municipalityId`);

  assertInvariant(
    !!r.relationships?.parentDestinationId,
    `POI ${id} missing parentDestinationId`,
  );

  assertInvariant(r.status === "published", `POI ${id} is not published`);
}
console.log(
  "✓ All 38 POIs have expected Japanese content, transportOptions, municipalityId, parentDestinationId, and published status",
);

// Check that every expected parent hub exists
for (const id of expectedNewIds) {
  const r = pass1.find((rec) => rec.id === id)!;
  const parentId = r.relationships?.parentDestinationId;
  const parent = pass1.find((rec) => rec.id === parentId);
  assertInvariant(
    !!parent && parent.role === "hub",
    `Parent hub ${parentId} for POI ${id} does not exist or is not a hub`,
  );
}
console.log("✓ Every expected parent hub exists");

// Total catalogue count is 665
assertInvariant(
  pass1.length === 665,
  `Expected total catalogue count 665, got ${pass1.length}`,
);
console.log("✓ Total catalogue count is 665");

// Kyushu records assertions
const kyushuRecords = pass1.filter((r) => r.region === "Kyushu");
assertInvariant(
  kyushuRecords.length === 71,
  `Expected 71 Kyushu records, got ${kyushuRecords.length}`,
);
console.log("✓ Kyushu record count is exactly 71");

const kyushuHubs = kyushuRecords.filter((r) => r.role === "hub");
const kyushuDestinations = kyushuRecords.filter((r) => r.role !== "hub");
assertInvariant(
  kyushuHubs.length === 12 && kyushuDestinations.length === 59,
  `Expected 12 Kyushu hubs and 59 non-hubs, got ${kyushuHubs.length} hubs and ${kyushuDestinations.length} non-hubs`,
);
console.log("✓ Kyushu contains exactly 12 hubs and 59 non-hubs");

for (const r of kyushuRecords) {
  assertInvariant(!!r.openingHours, `Record ${r.id} missing openingHours`);
  assertInvariant(!!r.openingHoursJa, `Record ${r.id} missing openingHoursJa`);
  assertInvariant(
    !!r.openingHoursMetadata?.verifiedAt,
    `Record ${r.id} missing verifiedAt`,
  );
  assertInvariant(
    !!r.openingHoursMetadata?.sourceUrl?.startsWith("https://"),
    `Record ${r.id} missing valid HTTPS sourceUrl`,
  );
  assertInvariant(
    !r.openingHoursMetadata.sourceUrl.includes("wikipedia") &&
      !r.openingHoursMetadata.sourceUrl.includes("blog") &&
      !r.openingHoursMetadata.sourceUrl.includes("tripadvisor"),
    `Record ${r.id} uses unsupported aggregator URL`,
  );

  if (r.role === "hub") {
    assertInvariant(
      r.openingHours.includes("No fixed opening hours"),
      `Hub ${r.id} should not have attraction-style facility hours`,
    );
  }
}
console.log("✓ Opening hours fields validated on all Kyushu records");

// Assert no heroImage points to video or audio media
const VIDEO_AUDIO_EXTS = /\.(webm|mp4|mov|avi|mkv|gifv|ogg|ogv)$/i;
for (const r of pass1) {
  assertInvariant(
    !VIDEO_AUDIO_EXTS.test(r.heroImage ?? ""),
    `Destination ${r.id} has a video/audio heroImage: ${r.heroImage}`,
  );
}
console.log("✓ No heroImage points to video or audio media");

// Write

// 4. HARDEN THE TRANSFORMATION SCRIPT
const EXPECTED_NEW_POI_IDS = [
  "hakata-station-area",
  "fukuoka-city-museum",
  "fukuoka-paypay-dome",
  "nagasaki-peace-park",
  "glover-garden-nagasaki",
  "dejima-nagasaki",
  "chinatown-nagasaki",
  "meganebashi-bridge-nagasaki",
  "suizenji-garden-kumamoto",
  "kumamoto-prefectural-art-museum",
  "takegawara-onsen-beppu",
  "kannawa-onsen-district",
  "beppu-tower",
  "kinrin-lake-yufuin",
  "yufuin-floral-village",
  "yufuin-onsen-ryokan-district",
  "dazaifu-tenmangu",
  "kyushu-national-museum",
  "komyozenji-temple-dazaifu",
  "sengan-en-garden-kagoshima",
  "kagoshima-city-aquarium",
  "nakadake-crater-aso",
  "kusasenri-meadow-aso",
  "daikanbo-viewpoint-aso",
  "aso-volcanic-museum",
  "aoshima-island-miyazaki",
  "heiwadai-park-miyazaki",
  "miyazaki-jingu-shrine",
  "takachiho-gorge",
  "amanoiwato-shrine",
  "takachiho-kagura-dance",
  "jomon-sugi-yakushima",
  "shiratani-unsuikyo-ravine",
  "yakusugi-land-yakushima",
  "mojiko-retro-district",
  "kitakyushu-manga-museum",
  "kawachi-wisteria-garden",
  "toto-museum-kitakyushu",
];

if (EXPECTED_NEW_POI_IDS.length !== 38)
  throw new Error(
    "Expected exactly 38 new POI IDs, got " + EXPECTED_NEW_POI_IDS.length,
  );

const expectedSet = new Set(EXPECTED_NEW_POI_IDS);
for (const id of EXPECTED_NEW_POI_IDS) {
  if (!pass1.find((r) => r.id === id))
    throw new Error("Missing new POI: " + id);
}

// Transport validation for all published Kyushu destinations
for (const r of pass1) {
  if (r.region === "Kyushu" && r.status === "published") {
    if (
      !r.transportOptions ||
      Object.values(r.transportOptions).reduce((a, b) => a + b, 0) <= 0
    ) {
      throw new Error(
        "Missing transport validation for published Kyushu destination: " +
          r.id,
      );
    }
  }
}

// Robust video/audio heroImage check (.webm, .mp4, etc. case-insensitive)
const videoExts = [".webm", ".mp4", ".mov", ".avi", ".mkv"];
for (const r of pass1) {
  if (r.heroImage) {
    const ext = r.heroImage
      .substring(r.heroImage.lastIndexOf("."))
      .toLowerCase();
    if (videoExts.includes(ext))
      throw new Error("Video hero image not allowed: " + r.heroImage);
  }
}

// Assert all 71 Kyushu records have opening hours, non-empty EN & JA, valid HTTPS sourceUrl, no generic/Wikipedia sources, no placeholders, no attraction-style facility hours on hubs.
const kyushuRecordsAssertion = pass1.filter((r) => r.region === "Kyushu");
if (kyushuRecordsAssertion.length !== 71)
  throw new Error(
    "Expected exactly 71 Kyushu records, got " + kyushuRecordsAssertion.length,
  );
for (const r of kyushuRecordsAssertion) {
  if (!r.openingHours || !r.openingHoursJa)
    throw new Error("Missing opening hours for " + r.id);
  if (
    !r.openingHoursMetadata ||
    !r.openingHoursMetadata.sourceUrl.startsWith("https://")
  )
    throw new Error("Invalid HTTPS sourceUrl for " + r.id);
  if (r.openingHoursMetadata.sourceUrl.includes("wikipedia"))
    throw new Error("Wikipedia sourceUrl not allowed for " + r.id);
  if (
    r.openingHours === "Open 24 hours" &&
    (r.id === "aso-volcanic-museum" ||
      r.id === "beppu-hells-oita" ||
      r.id === "toto-museum-kitakyushu")
  )
    throw new Error("Placeholder opening hours for " + r.id);
  if (r.role === "hub" && !r.openingHours.includes("No fixed opening hours"))
    throw new Error("Attraction-style facility hours on hub " + r.id);
}

// Assert all 38 new POIs have bilingual useful notes, no forbidden internal terms, no internal release tags
const forbiddenTerms = [
  "Kyushu regional expansion",
  "regional expansion",
  "Kyushu Expansion",
  "PR 12C",
  "editorial batch",
  "v2.0.0-beta",
  "migration",
  "generated",
];
for (const id of EXPECTED_NEW_POI_IDS) {
  const r = pass1.find((rec) => rec.id === id);
  if (!r) throw new Error("POI missing: " + id);
  if (!r.notes || !r.notesJa)
    throw new Error("Missing notes for new POI " + id);
  const checkString = (
    r.notes +
    r.notesJa +
    r.description +
    r.jaDescription +
    r.highlights?.join("") +
    r.jaHighlights?.join("") +
    JSON.stringify(r.content) +
    r.reservation +
    r.parking +
    r.openingHours +
    r.openingHoursJa +
    r.tags?.join("")
  ).toLowerCase();
  for (const term of forbiddenTerms) {
    if (checkString.includes(term.toLowerCase()))
      throw new Error(`Forbidden term '${term}' found in POI ` + id);
  }
  if (
    r.tags &&
    (r.tags.includes("Kyushu Expansion") || r.tags.includes("v2.0.0-beta.1"))
  )
    throw new Error("Internal release tags found in POI " + id);
}

// Harden: reject embedded constant names inside strings
const EMBEDDED_CONSTANTS = ["EXPANSION_DATE", "HOURS_VERIFIED_AT"];
for (const r of pass1) {
  if (r.region !== "Kyushu") continue;
  const serialized = JSON.stringify(r);
  for (const c of EMBEDDED_CONSTANTS) {
    if (serialized.includes(c))
      throw new Error(`Embedded constant name '${c}' found in record ${r.id}`);
  }
}
console.log("✓ No embedded constant names in Kyushu records");

// Harden: reject zero/non-finite individual transport values (Kyushu records only)
for (const r of pass1) {
  if (r.region !== "Kyushu") continue;
  if (!r.transportOptions) continue;
  for (const [mode, value] of Object.entries(r.transportOptions)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      throw new Error(
        `Non-finite/zero transport value '${mode}': ${value} in record ${r.id}`,
      );
  }
}
console.log("✓ All Kyushu transport values are finite and greater than zero");

// Harden: reject repeated boilerplate notes
const BOILERPLATE_EN =
  "Make sure to check the official website for the latest updates before visiting.";
const BOILERPLATE_JA = "訪問前に必ず公式サイトで最新情報を確認してください。";
for (const r of pass1) {
  if (r.notes === BOILERPLATE_EN)
    throw new Error(`Boilerplate English notes found in record ${r.id}`);
  if (r.notesJa === BOILERPLATE_JA)
    throw new Error(`Boilerplate Japanese notes found in record ${r.id}`);
}
console.log("✓ No boilerplate notes detected");

// Harden: reject unsupported placeholder facility hours
const PLACEHOLDER_HOURS_PATTERNS = [
  /09:30\s*-\s*17:00\s*\(Closed Mondays\)/i,
  /09:00\s*-\s*17:00\s*\(Daily\)/i,
  /To be confirmed/i,
  /TBD/i,
];
for (const r of pass1) {
  if (r.region !== "Kyushu") continue;
  for (const pattern of PLACEHOLDER_HOURS_PATTERNS) {
    if (pattern.test(r.openingHours ?? ""))
      throw new Error(
        `Placeholder facility hours in record ${r.id}: ${r.openingHours}`,
      );
    if (pattern.test(r.openingHoursJa ?? ""))
      throw new Error(
        `Placeholder facility hours (JA) in record ${r.id}: ${r.openingHoursJa}`,
      );
    if (pattern.test(r.businessHours ?? ""))
      throw new Error(
        `Placeholder businessHours in record ${r.id}: ${r.businessHours}`,
      );
  }
}
console.log("✓ No unsupported placeholder facility hours");

fs.writeFileSync(INDEX_PATH, JSON.stringify(pass1, null, 2) + "\n");
console.log("✓ Wrote successfully validated data to", INDEX_PATH);
