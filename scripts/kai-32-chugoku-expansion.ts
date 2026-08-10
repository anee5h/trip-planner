/**
 * KAI-32 — Chugoku beta expansion (PR3).
 *
 * Deepens the Chugoku catalogue to credible beta depth with 30 new
 * bilingual POIs across 11 target municipalities:
 *
 *   Okayama City (4):     okayama-castle, kibitsu-shrine,
 *                         hayashibara-museum-of-art, orient-museum
 *   Kurashiki City (4):   ohara-museum-of-art, bikan-historical-quarter,
 *                         kojima-denim-street, kurashiki-museum-of-folkcraft
 *   Takahashi City (2):   raikyuji-temple, fukiya-village
 *   Hiroshima City (4):   genbaku-dome, hiroshima-peace-memorial-park,
 *                         hiroshima-national-peace-memorial-hall, hondori
 *   Hatsukaichi (5):      miyajima-omotesando, daisho-in,
 *                         miyajima-gojunoto, senjokaku, momijidani-park
 *   Matsue City (5):      matsue-vogel-park, lafcadio-hearn-memorial-museum,
 *                         horikawa-pleasure-boat, tanabe-museum-matsue,
 *                         gessho-ji-temple-matsue
 *   Izumo City (2):       inasa-beach-izumo, hinomisaki-lighthouse-izumo
 *   Iwami Town (1):       uradome-coast (gateway via tottori-city)
 *   Shimonoseki City (1): karato-market-shimonoseki
 *   Mine City (1):        akiyoshidai-plateau
 *   Iwakuni City (1):     iwakuni-castle
 *
 * plus evidence-backed corrections to existing Chugoku records:
 *
 *   1. kurashiki-city.featuredDestinationIds contained korakuen-okayama
 *      (Korakuen is in Okayama City) — false cross-municipality featured.
 *   2. miyajima-itsukushima carried Okinawa leftovers (nearbyDestinationIds
 *      naha/nago/motobu; notes "Miyakojima City travel hub in Okinawa") and
 *      fabricated Tokyo-origin static train/shinkansen/car options for an
 *      island that is ferry-only. Marked kind "island" with no rail static
 *      options; resolution now returns "unknown" instead of a mainland rail
 *      corridor (see Kai32Containment.test.ts).
 *   3. hiroshima-peace-memorial conflated the Genbaku Dome with the Peace
 *      Memorial Museum; it is now the museum record and genbaku-dome is a
 *      separate record.
 *   4. Six Hiroshima expansion records carried "Shinjuku City" template
 *      notes, fabricated train:205 transport options, wrong businessHours,
 *      and some wrong officialWebsite links — corrected with source-backed
 *      values.
 *   5. izumo-taisha notes contained an Iwate copy-paste ("Rikuchū Kaigan
 *      National Park…2011 earthquake") and a nearbyDestinationIds link to
 *      ryusendo-cave-iwate (~1,300 km away) — both removed; hours corrected
 *      to the shrine's actual precinct hours.
 *   6. tsunoshima-bridge pointed its officialWebsite at Yamaguchi City's
 *      site (a different city) — corrected to Shimonoseki tourism.
 *   7. matsue-castle notes were a hub copy-paste; hours corrected.
 *   8. iwami-ginzan image license corrected (CC BY-SA 4.0, Naokijp) and
 *      hours split between the Mabu tunnel and the World Heritage Center.
 *   9. tottori-sand-dunes, kintai-bridge, akiyoshido-cave, motonosumi
 *      shrine: wrong universal "09:00-17:00 (Daily)" hours corrected to
 *      their actual open-access/seasonal operation.
 *  10. korakuen-okayama: 3840px hero thumbnail normalized to the repo's
 *      1280px convention and image metadata added (CC BY-SA 4.0, 663highland).
 *  11. Missing nameJa added for 11 Chugoku municipal hubs (okayama-city
 *      already had 岡山市).
 *
 * Transport truthfulness: no new train/ferry durations, fares, or bus
 * times are invented. New POIs carry transportOptions {} and their access
 * is described in notes; Miyajima island POIs are declared
 * transportZoneId "unknown" (non-routable until a ferry route exists).
 * The Miyajima ferry registry gap is recorded in qa/kai-32/KAI32_DATA_AUDIT.md.
 *
 * Idempotence: records are keyed by id; running twice produces zero diff.
 * Usage: tsx scripts/kai-32-chugoku-expansion.ts
 */

import fs from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";
import type { Destination } from "../src/shared/types/destination";

const INDEX_PATH = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Destination[];
const byId = new Map(index.map((d) => [d.id, d]));
const AUDIT_DATE = "2026-08-10";

const OPENING_HOURS_JA: Record<string, string> = {
  "okayama-castle":
    "9:00〜17:30（最終入場17:00）／休城日：12月29日〜12月31日※荒天・点検による臨時休城の場合あり。",
  "kibitsu-shrine":
    "開門5:00〜閉門18:00（参拝自由）／御祈祷・御朱印受付は9:00〜14:00頃。",
  "hayashibara-museum-of-art":
    "10:00〜17:00（入館受付16:30まで）／休館日：毎週月曜日（祝日の場合は翌日）、年末年始、展示替期間。",
  "orient-museum":
    "9:00〜17:00（入館16:30まで）／休館日：毎週月曜日（祝日の場合は翌平日）、12月28日〜1月4日、展示替期間。",
  "ohara-museum-of-art":
    "3月〜11月 9:00〜17:00（最終入館16:30）、12月〜2月 9:00〜15:00（最終入館14:30）／休館日：毎週月曜日（祝日は開館）、年末／8月は無休。",
  "bikan-historical-quarter":
    "町並みは終日散策可能（店舗・施設により異なる）／川舟流しは目安9:30〜17:00、約30分間隔で出航（季節により変動）。",
  "kojima-denim-street":
    "商店街は終日通行可能（店舗により営業時間・定休日が異なります。土日祝は10:00〜18:00を目安）。",
  "kurashiki-museum-of-folkcraft":
    "10:00〜17:00（入館受付16:30まで）／休館日：月曜日（祝日は開館、GW・お盆期間は開館）、12月29日〜1月1日。",
  "raikyuji-temple": "庭園拝観 9:00〜17:00（年中無休）。",
  "fukiya-village":
    "町並みは自由に散策可能（ベンガラ館・笹畝坑道などの施設はそれぞれ開館時間が異なります。吹屋観光協会でご確認ください）。",
  "genbaku-dome": "屋外施設のため、常時見学可能・無料。",
  "hiroshima-peace-memorial-park":
    "公園は24時間開放・無料。8月6日の平和記念式典前後は一部立入制限あり。",
  "hiroshima-national-peace-memorial-hall":
    "3月〜7月 8:30〜18:00、8月 8:30〜19:00（8月5・6日は20:00まで）、9月〜11月 8:30〜18:00、12月〜2月 8:30〜17:00。入館無料。12月30・31日は休館。",
  hondori:
    "アーケード全体の定時はありません。各店舗ごとに異なり、多くは10:00〜20:00、飲食店は22:00頃まで営業します。",
  "miyajima-omotesando":
    "店舗により異なりますが、多くは9:00〜17:30〜18:00頃。冬期は早めに閉まる店もあります。",
  "daisho-in": "毎日 8:00〜17:00。拝観無料。",
  "miyajima-gojunoto":
    "外観は2026年12月頃まで保存修理工事中のため、足場・シートに覆われており見学できません（工事終了後に再開予定）。内部は非公開。",
  senjokaku: "毎日 8:30〜16:30。拝観料 大人100円・小中学生50円。",
  "momijidani-park":
    "公園：無料・常時開放。ロープウエー：上り9:00〜16:00、下り最終16:30（季節・天候により変動、強風・雷雨時運休）。往復 大人2,000円・子供1,000円。",
  "matsue-vogel-park":
    "9:00〜17:00（最終入園16:00）。12月〜3月の第2・第4金曜日は休園。イベント開催時は延長営業の場合あり。",
  "lafcadio-hearn-memorial-museum":
    "4月〜9月 9:00〜18:00（最終入館17:30）。10月〜3月 9:00〜17:00（最終入館16:30）。年中無休ですが、年に数回臨時休館があります。",
  "horikawa-pleasure-boat":
    "3月1日〜6月30日 9:00〜17:00、7月1日〜8月15日 9:00〜18:00、8月16日〜10月10日 9:00〜17:00、10月11日〜11月30日 9:00〜16:00、12月1日〜2月末 9:00〜16:00。3〜11月は20分間隔、12〜2月は30分間隔で出発。荒天時は運休となる場合があります。",
  "tanabe-museum-matsue":
    "9:00〜17:00（最終入館16:30）。月曜休館（祝日の場合は開館）。年末年始・展示替えによる臨時休館あり。",
  "gessho-ji-temple-matsue":
    "10:00〜16:00（最終受付15:30）。6月のみ8:30〜17:30（最終受付17:00）。年中無休。入場料は現金のみ。",
  "inasa-beach-izumo": "終日開放。",
  "hinomisaki-lighthouse-izumo":
    "通年 9:00〜12:00。午後は3月〜9月 平日13:00〜16:30・土日祝13:00〜17:00、10月〜2月 13:00〜16:30。入場は終了20分前まで。荒天時は参観中止の場合あり。",
  "uradome-coast": "海岸は終日開放。遊覧船は季節運航（おおむね3月〜11月）。",
  "karato-market-shimonoseki":
    "卸売場は月〜土の早朝（4時頃）から。活きいき馬関街は金・土 8:00〜15:00、日・祝 7:00〜15:00。営業カレンダーを公式サイトでご確認ください。",
  "akiyoshidai-plateau":
    "終日開放。山焼きは毎年2月に開催（日程は公式サイトで要確認）。",
  "iwakuni-castle":
    "天守 9:00〜16:45（入館16:30まで）。ロープウェイ 9:00〜17:00（15分間隔、最終17:00）。1月〜2月の点検期間は運休・休館あり。",
};

// ---------------------------------------------------------------------------
// Shared record template
// ---------------------------------------------------------------------------

function poil(
  id: string,
  name: string,
  nameJa: string,
  municipalityId: string,
  parent: string,
  coords: [number, number],
  kind: Destination["kind"],
  categories: string[],
  tags: string[],
  description: string,
  descriptionJa: string,
  jaHighlights: string[],
  enHighlights: string[],
  budget: [number, number, number],
  breakdown: { transport: number; tickets: number; food: number; cafe: number },
  transportOptions: Destination["transportOptions"],
  visitHours: { min: number; max: number },
  walking: [number, number, number],
  indoorPercent: number,
  crowd: Destination["crowd"],
  season: Destination["season"],
  bestMonths: number[],
  bestSeason: string,
  weatherDependence: "low" | "moderate" | "high",
  comfort: {
    heatTolerance: number;
    rainFriendly: number;
    walkingIntensity: number;
  },
  ratings: Destination["ratings"],
  officialWebsite: string,
  businessHours: string,
  reservation: string,
  parking: string,
  notes: string,
  sources: {
    type: Destination["editorial"]["sources"][number]["type"];
    url: string;
    title: string;
  }[],
  image: {
    url: string;
    license: string;
    attribution: string;
    sourceUrl: string;
  },
  aliases: string[] = [],
  openingHoursMetadata?: Destination["openingHoursMetadata"],
  transportZoneId?: string,
  relationships?: { gatewayHubId?: string },
): Destination {
  const sum =
    breakdown.transport + breakdown.tickets + breakdown.food + breakdown.cafe;
  const recommended = budget[1];
  if (sum !== recommended) {
    throw new Error(
      `${id}: budget breakdown sum ${sum} != recommended ${recommended}`,
    );
  }
  const [walkingMin, walkingSunMin, walkingShadeMin] = walking;
  if (walkingSunMin + walkingShadeMin > walkingMin) {
    throw new Error(`${id}: walkingSunMin+walkingShadeMin > walkingMin`);
  }
  // walkingMin is metres of on-site walking; sanity-cap at a brisk 5 km/h.
  if (walkingMin > visitHours.max * 5000) {
    throw new Error(`${id}: walkingMin > visitHours.max*5000`);
  }
  const openingHoursJa = OPENING_HOURS_JA[id];
  if (!openingHoursJa) {
    throw new Error(`${id}: missing audited Japanese opening hours`);
  }
  return {
    id,
    name,
    nameJa,
    kind,
    role: "poi",
    placeType: "destination",
    aliases,
    municipalityId,
    prefecture: municipalityId.split(":")[0],
    region: "Chugoku",
    coordinates: { lat: coords[0], lng: coords[1] },
    categories,
    tags,
    description,
    highlights: enHighlights,
    status: "published",
    travelEstimate: { confidence: "beta" },
    collections: [],
    transportOptions,
    transportZoneId,
    budgetMin: budget[0],
    budgetRecommended: budget[1],
    budgetMax: budget[2],
    budgetBreakdown: breakdown,
    heroImage: image.url,
    image: image.url,
    imageMetadata: {
      source: "Wikimedia Commons",
      license: image.license,
      attribution: image.attribution,
      sourceUrl: image.sourceUrl,
    },
    openingHoursMetadata,
    recommendedVisitHours: visitHours,
    walkingMin,
    walkingSunMin,
    walkingShadeMin,
    walkingIntensity:
      comfort.walkingIntensity <= 3
        ? "low"
        : comfort.walkingIntensity <= 6
          ? "medium"
          : "high",
    indoorPercent,
    comfort,
    ratings,
    ratingsSchemaVersion: 2,
    crowd,
    season,
    bestMonths,
    bestSeason,
    weatherDependence,
    reservation,
    parking,
    notes,
    notesJa: `【見どころ】${nameJa}は中国地方の観光スポットです。訪問前に公式サイトで最新の営業情報をご確認ください。`,
    reservationJa: "【予約】最新の予約・受付情報は公式サイトをご確認ください。",
    parkingJa: "【駐車場】公式サイトで最新の駐車場情報をご確認ください。",
    openingHoursJa,
    businessHours,
    officialWebsite,
    content: {
      en: {
        name,
        description,
        highlights: enHighlights,
      },
      ja: {
        name: nameJa,
        description: descriptionJa,
        highlights: jaHighlights,
      },
    },
    editorial: {
      lifecycle: "published",
      sources: sources.map((s) => ({ ...s, accessedAt: AUDIT_DATE })),
      reviewedAt: AUDIT_DATE,
      reviewedBy: "Meguruto editorial",
      checkedAt: AUDIT_DATE,
      freshness: "current",
      changeSummary: "KAI-32 Chugoku beta expansion",
      changes: [
        {
          changedAt: AUDIT_DATE,
          changedBy: "Meguruto editorial",
          summary: "Added source-backed KAI-32 Chugoku POI",
          method: "assisted",
        },
      ],
    },
    ratingMetadata: {
      rubricVersion: 1,
      method: "assisted",
      confidence: "low",
    },
    relationships: relationships?.gatewayHubId
      ? { gatewayHubId: relationships.gatewayHubId }
      : { parentDestinationId: parent },
    schemaVersion: 2,
  };
}

// ---------------------------------------------------------------------------
// New records
// ---------------------------------------------------------------------------

const newRecords: Destination[] = [];

// --- Okayama City (4) ---
newRecords.push(
  poil(
    "okayama-castle",
    "Okayama Castle (Crow Castle)",
    "岡山城",
    "Okayama:okayama",
    "okayama-city",
    [34.6653, 133.9361],
    "castle",
    ["History", "Culture", "Sightseeing"],
    [
      "Ujo (Crow Castle)",
      "Reconstructed Keep",
      "Ukita Hideie",
      "Japan 100 Castles",
    ],
    "Okayama Castle's black keep, nicknamed Ujo (Crow Castle) for its dark exterior, was built by daimyo Ukita Hideie with the keep completed in 1597. The original keep was destroyed in an air raid in 1945, and the present concrete reconstruction was completed in 1966. From the top floor visitors overlook Korakuen Garden and the Asahi River.",
    "岡山城は、黒い外観から「烏城（うじょう）」の愛称で知られる城で、慶長2年（1597年）に宇喜多秀家によって天守が完成しました。天守は1945年の空襲で焼失し、現在の天守は1966年に再建されたものです。最上階からは後楽園や旭川を一望できます。",
    [
      "五重の天守に登り、後楽園と旭川を一望",
      "不等辺五角形の独特な天守の姿を観賞",
      "後楽園との共通入場券（800円）で効率よく周遊",
    ],
    [
      "Climb the reconstructed five-story keep for views over Korakuen and the Asahi River",
      "See the scalene pentagonal keep design unique to Okayama Castle",
      "Combine entry with Korakuen Garden using the ¥800 combined ticket",
    ],
    [3500, 7000, 12000],
    { transport: 2000, tickets: 500, food: 3000, cafe: 1500 },
    {},
    { min: 1.5, max: 3 },
    [2500, 1500, 1000],
    60,
    { weekday: 3, weekend: 4, holiday: 5 },
    { spring: 8, summer: 6, autumn: 8, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "low",
    { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 5 },
    {
      overall: 8.4,
      couple: 8,
      summer: 7.6,
      winter: 7.8,
      rain: 7.2,
      food: 8,
      photography: 8.6,
      relaxation: 7.8,
      value: 8.4,
      uniqueness: 8.2,
    },
    "https://okayama-castle.jp/",
    "09:00–17:30 (last admission 17:00); closed Dec 29–31; occasional closure for weather/inspection",
    "None required for individuals; group visitors (20+) advised to notify in advance",
    "No dedicated castle parking; nearest is Ujo Park parking (¥300 first hour, +¥100/30 min, ¥150 discount for castle visitors with validated ticket); ~15 min walk to keep",
    "Adult admission ¥500 from Apr 2026 (was ¥400); junior high and under free. Combined Korakuen ticket ¥800. Access: tram (Higashiyama line) ~5 min to Shiroshita + ~10 min walk, or bus to Kenchomae + ~5 min walk.",
    [
      {
        type: "official",
        url: "https://okayama-castle.jp/guide/",
        title: "利用案内 | 岡山城公式ウェブサイト",
      },
      {
        type: "official",
        url: "https://okayama-castle.jp/learn-history/",
        title: "岡山城を知る｜歴史",
      },
      {
        type: "government",
        url: "https://online.bunka.go.jp/heritages/detail/202586",
        title: "岡山城跡 文化遺産オンライン",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Okayama_Castle%2C_November_2016_-02.jpg/1280px-Okayama_Castle%2C_November_2016_-02.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Martin Falbisoner, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Okayama_Castle,_November_2016_-02.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "kibitsu-shrine",
    "Kibitsu Shrine",
    "吉備津神社",
    "Okayama:okayama",
    "okayama-city",
    [34.6707, 133.8508],
    "shrine",
    ["Culture", "History", "Spiritual"],
    [
      "National Treasure",
      "Kibi-zukuri Architecture",
      "Momotaro Legend",
      "398m Covered Corridor",
    ],
    "Kibitsu Shrine, the ichinomiya (first shrine) of Bitchu Province, enshrines Okibitsuhiko-no-Mikoto, the deity associated with the Momotaro legend. Its main hall and worship hall, rebuilt in 1425, are a National Treasure and the only surviving example of the kibi-zukuri architectural style. A 398-meter covered corridor connects the main hall to the Kamado Shrine, site of the famous Nakama-gama rice-cooking divination rite.",
    "吉備津神社は備中国の一宮で、桃太郎伝説のモデルとされる大吉備津彦大神を祀ります。1425年に再建された本殿・拝殿は国宝に指定され、「吉備津造」と呼ばれる独自の様式を今に伝える唯一の例です。全長約398メートルの廻廊は本殿から御竈殿まで続き、御竈殿では古くから知られる「鳴釜神事」が行われています。",
    [
      "全長約398mの廻廊を歩く",
      "吉備津造唯一の遺構である国宝本殿を見学",
      "境内のあじさい（6月中旬）とぼたん（4月下旬〜5月上旬）を鑑賞",
    ],
    [
      "Walk the 398m covered corridor, one of Japan's longest shrine corridors",
      "View the National Treasure main hall, sole survivor of the kibi-zukuri style",
      "See hydrangeas (mid-June) and peonies (late April–early May) in the grounds",
    ],
    [1000, 3000, 6000],
    { transport: 2000, tickets: 0, food: 600, cafe: 400 },
    {},
    { min: 1, max: 2 },
    [2500, 1200, 1300],
    25,
    { weekday: 2, weekend: 3, holiday: 4 },
    { spring: 9, summer: 7, autumn: 9, winter: 6 },
    [4, 5, 6, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 5 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 7.8,
      winter: 7.6,
      rain: 6.8,
      food: 7,
      photography: 9,
      relaxation: 9,
      value: 9.2,
      uniqueness: 9,
    },
    "https://www.kibitujinja.com/",
    "Grounds open 05:00–18:00 daily; prayer/goshuin office approx 09:00–14:00",
    "Not required; prayers (kito) by application, from ¥5,000",
    "Free shrine parking available; wheelchair-accessible spaces at the auto-purification area",
    "No admission fee. 398m corridor length per Okayama City official page (some sources say ~360m/400m). Access: JR Kibi Line to Kibitsu Station (~10 min walk).",
    [
      {
        type: "official",
        url: "https://www.kibitujinja.com/faq/",
        title: "よくあるご質問｜吉備津神社",
      },
      {
        type: "government",
        url: "https://www.city.okayama.jp/life/0000041642.html",
        title: "吉備津神社回廊｜岡山市",
      },
      {
        type: "tourism_board",
        url: "https://okayama-kanko.jp/spot/detail_10047.html",
        title: "吉備津神社｜岡山観光WEB",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/250505_Kibitsu-jinja_Okayama_Japan01s3.jpg/1280px-250505_Kibitsu-jinja_Okayama_Japan01s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:250505_Kibitsu-jinja_Okayama_Japan01s3.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "hayashibara-museum-of-art",
    "Hayashibara Museum of Art",
    "林原美術館",
    "Okayama:okayama",
    "okayama-city",
    [34.6636, 133.9333],
    "museum",
    ["Museum", "Culture", "Art"],
    [
      "Ikeda Daimyo Collection",
      "National Treasures",
      "Swords & Noh Costumes",
      "Okayama Castle Moat Area",
    ],
    "Opened in 1964 inside the former guesthouse site of Okayama Castle's ninomaru, Hayashibara Museum of Art displays the collection of entrepreneur Hayashibara Ichiro together with treasures of the Ikeda family, the daimyo of Bizen-Okayama. The roughly 9,000 works include three National Treasures and 26 Important Cultural Properties spanning swords, armor, paintings, and Noh masks and costumes. There is no permanent gallery; works rotate through themed exhibitions.",
    "林原美術館は1964年に開館し、岡山城二の丸の対面所跡に位置します。岡山の実業家・林原一郎氏の蒐集品と、備前岡山藩主・池田家に伝わる大名調度品を中心に、刀剣・武具・絵画・能面・能装束など約9,000件を収蔵し、そのうち国宝3件・重要文化財26件を含みます。常設展示はなく、テーマを変えた企画展・特別展で作品を公開しています。",
    [
      "池田家伝来の国宝・重要文化財を鑑賞",
      "岡山城の客殿跡という風情ある館内で刀剣・能装束を鑑賞",
      "岡山城・後楽園との3館共通券（1,280円）で周遊",
    ],
    [
      "See National Treasure and Important Cultural Property works from the Ikeda daimyo collection",
      "Admire swords, armor, and Noh costumes in a former castle-guesthouse setting",
      "Pair with Okayama Castle and Korakuen via the ¥1,280 three-site ticket",
    ],
    [2000, 4000, 8000],
    { transport: 1000, tickets: 600, food: 1600, cafe: 800 },
    {},
    { min: 1, max: 2 },
    [1500, 700, 800],
    95,
    { weekday: 2, weekend: 3, holiday: 4 },
    { spring: 7, summer: 6, autumn: 7, winter: 6 },
    [3, 4, 5, 9, 10, 11],
    "All Year (indoor)",
    "low",
    { heatTolerance: 9, rainFriendly: 9, walkingIntensity: 3 },
    {
      overall: 8.2,
      couple: 8,
      summer: 8,
      winter: 8,
      rain: 8.4,
      food: 7.4,
      photography: 7,
      relaxation: 8.2,
      value: 8,
      uniqueness: 8.4,
    },
    "https://www.hayashibara-museumofart.jp/",
    "10:00–17:00 (last entry 16:30); closed Mondays (or following day if Monday is a holiday), year-end/New Year, and between exhibitions",
    "Not required; group guide requests by prior application",
    "Small on-site lot (7 standard cars); otherwise nearby paid parking",
    "General admission ¥600 from April 2026 (was ¥500); middle-school students and under free. Walk from Okayama Castle ~10 min.",
    [
      {
        type: "official",
        url: "https://www.hayashibara-museumofart.jp/data/guide/",
        title: "利用案内｜林原美術館",
      },
      {
        type: "official",
        url: "https://www.hayashibara-museumofart.jp/data/en/",
        title: "Hayashibara Museum of Art (English)",
      },
      {
        type: "tourism_board",
        url: "https://www.okayama-kanko.jp/spot/detail_10115.html",
        title: "林原美術館｜岡山観光WEB",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/160319_Hayashibara_Museum_of_Art_Okayama_Japan02n.jpg/1280px-160319_Hayashibara_Museum_of_Art_Okayama_Japan02n.jpg",
      license: "CC BY 2.5",
      attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:160319_Hayashibara_Museum_of_Art_Okayama_Japan02n.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "orient-museum",
    "Okayama Orient Museum",
    "岡山市立オリエント美術館",
    "Okayama:okayama",
    "okayama-city",
    [34.6664, 133.93],
    "museum",
    ["Museum", "Culture", "Art"],
    ["Ancient Near East", "Yasuhara Collection", "Est. 1979", "City Museum"],
    "Okayama Orient Museum opened in April 1979 to house the Yasuhara Collection of ancient Near Eastern art donated to the city, the first municipal museum in Japan dedicated to the Orient. Its collection spans Mesopotamia, Persia, Egypt, and Central Asia, including Assyrian reliefs and Persian pottery. The museum is a 15-minute walk from Okayama Station.",
    "岡山市立オリエント美術館は、1979年4月に開館した、日本で初めてオリエント（中近東）に特化した市立美術館です。学校法人岡山学園の安原真二郎氏が収集した「安原コレクション」の岡山市への寄贈を機に設立され、メソポタミアやペルシア、エジプト、中央アジアの美術・考古資料を収蔵しています。JR岡山駅から徒歩約15分です。",
    [
      "アッシリアの浮き彫りなど古代オリエントの資料を鑑賞",
      "1979年の開館時に市へ寄贈された安原コレクションを観覧",
      "駅から徒歩約15分、雨の日にも便利な低料金の市立美術館",
    ],
    [
      "View Assyrian reliefs and ancient Near Eastern artifacts in a dedicated city museum",
      "See the Yasuhara Collection, donated to the city at the museum's 1979 founding",
      "Stop by on a rainy day — 15-min walk from Okayama Station, low-cost admission",
    ],
    [1000, 2500, 5000],
    { transport: 1000, tickets: 310, food: 800, cafe: 390 },
    {},
    { min: 1, max: 2 },
    [1500, 700, 800],
    95,
    { weekday: 2, weekend: 3, holiday: 4 },
    { spring: 7, summer: 6, autumn: 7, winter: 6 },
    [3, 4, 5, 9, 10, 11],
    "All Year (indoor)",
    "low",
    { heatTolerance: 9, rainFriendly: 9, walkingIntensity: 3 },
    {
      overall: 7.8,
      couple: 7.4,
      summer: 7.6,
      winter: 7.6,
      rain: 8.2,
      food: 7.2,
      photography: 7.4,
      relaxation: 7.8,
      value: 8.8,
      uniqueness: 8.6,
    },
    "https://www.city.okayama.jp/orientmuseum/",
    "09:00–17:00 (last entry 16:30); closed Mondays (or next weekday if Monday is a holiday), Dec 28–Jan 4, and during exhibition changes",
    "Not required",
    "No dedicated parking; Tenjin-cho municipal lot nearby (¥100 discount ticket issued at the museum counter)",
    "General ¥310 / high school & university ¥210 / elementary & junior high ¥100. ~15-min walk from JR Okayama Station (official).",
    [
      {
        type: "government",
        url: "https://www.city.okayama.jp/orientmuseum/0000022022.html",
        title: "ご利用案内｜岡山市立オリエント美術館",
      },
      {
        type: "government",
        url: "https://www.city.okayama.jp/orientmuseum/0000022216.html",
        title: "オリエント美術館とは｜岡山市",
      },
      {
        type: "tourism_board",
        url: "https://www.okayama-kanko.jp/spot/detail_10009.html",
        title: "岡山市立オリエント美術館｜岡山観光WEB",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/160319_Okayama_Orient_Museum_Okayama_Japan02n.jpg/1280px-160319_Okayama_Orient_Museum_Okayama_Japan02n.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:160319_Okayama_Orient_Museum_Okayama_Japan02n.jpg",
    },
  ),
);

// --- Kurashiki City (4) ---
newRecords.push(
  poil(
    "ohara-museum-of-art",
    "Ohara Museum of Art",
    "大原美術館",
    "Okayama:kurashiki",
    "kurashiki-city",
    [34.5962, 133.7707],
    "museum",
    ["Museum", "Culture", "Art"],
    [
      "First Western-Art Museum in Japan",
      "El Greco & Monet",
      "Ohara Magosaburo",
      "Bikan Quarter",
    ],
    "Founded in 1930 by industrialist Ohara Magosaburo, the Ohara Museum of Art was Japan's first museum devoted to Western art and remains the country's best-known private art museum. Its collection includes El Greco's Annunciation, works by Monet, Gauguin, and Picasso, and Japanese Western-style paintings. The museum comprises the Main Gallery, the Crafts & Oriental Gallery, and the Kojima Torajiro Memorial Hall beside the Kurashiki canal.",
    "大原美術館は1930年、実業家・大原孫三郎によって創立された、日本初の西洋美術を中心とする私立美術館です。エル・グレコの「受胎告知」をはじめ、モネ、ゴーギャン、ピカソなどの作品と、日本近代洋画を収蔵しています。倉敷川畔に本館、工芸・東洋館、児島虎次郎記念館の3館が並びます。",
    [
      "日本初の西洋美術館でエル・グレコ「受胎告知」やモネを鑑賞",
      "美観地区の倉敷川畔に並ぶ3つの館を巡る",
      "8月無休の時期を利用してゆったり鑑賞",
    ],
    [
      "See El Greco's Annunciation and works by Monet and Gauguin at Japan's first Western-art museum",
      "Walk the three galleries beside the Bikan quarter canal",
      "Visit during the annual August no-closed-day period for flexible scheduling",
    ],
    [3500, 7000, 13000],
    { transport: 1000, tickets: 2000, food: 2500, cafe: 1500 },
    {},
    { min: 1.5, max: 3 },
    [2500, 1200, 1300],
    80,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "low",
    { heatTolerance: 8, rainFriendly: 8, walkingIntensity: 4 },
    {
      overall: 9.2,
      couple: 9,
      summer: 8.8,
      winter: 8.6,
      rain: 8.8,
      food: 7.6,
      photography: 8.4,
      relaxation: 8.8,
      value: 8.2,
      uniqueness: 9.4,
    },
    "https://www.ohara.or.jp/",
    "Mar–Nov 09:00–17:00 (last entry 16:30); Dec–Feb 09:00–15:00 (last entry 14:30); closed Mondays (open when Monday is a holiday), open every day in August, closed over year-end",
    "Not required for individuals; group arrival notice smoothens ticket issuance; wheelchair/stroller rental by prior form",
    "No dedicated lot; use paid parking around the Bikan quarter",
    "Closed for facility renovation Feb 9–Apr 24, 2026; reopened Apr 25, 2026. Annex long-term closed. Audio guide ¥600. ~15-min walk from JR Kurashiki Station through the Bikan quarter.",
    [
      {
        type: "official",
        url: "https://www.ohara.or.jp/visitor_info/",
        title: "入館案内｜大原美術館",
      },
      {
        type: "official",
        url: "https://www.ohara.or.jp/faq/",
        title: "よくある質問｜大原美術館",
      },
      {
        type: "tourism_board",
        url: "https://www.kurashiki-tabi.jp/see/see-154/",
        title: "大原美術館｜倉敷観光WEB",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Ohara_Museum_of_Art_20190324.jpg/1280px-Ohara_Museum_of_Art_20190324.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Suicasmo, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Ohara_Museum_of_Art_20190324.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "bikan-historical-quarter",
    "Kurashiki Bikan Historical Quarter",
    "倉敷美観地区",
    "Okayama:kurashiki",
    "kurashiki-city",
    [34.5966, 133.7717],
    "district",
    ["District", "History", "Sightseeing"],
    [
      "Important Preservation District",
      "White-Walled Warehouses",
      "Canal & Willow Trees",
      "Kurashiki River Boat",
    ],
    "The Bikan Historical Quarter preserves a townscape of white-walled kura storehouses, namako plaster walls, and willow-lined canals that grew from Kurashiki's Edo-period rice-trading prosperity. In 1979 the Kurashiki River waterfront area was designated a national Important Preservation District for Groups of Traditional Buildings. Visitors stroll the streets, shop for Kurashiki canvas and washi tape, and ride the Kurashiki River boat along the canal.",
    "倉敷美観地区は、江戸時代の米の集散地として栄えた倉敷に残る、白壁の蔵屋敷やなまこ壁、柳並木の町並みです。1979年（昭和54年）に倉敷川畔一帯が国の重要伝統的建造物群保存地区に選定されました。町歩きのほか、倉敷帆布やマスキングテープのショップ、倉敷川を巡る「くらしき川舟流し」が楽しめます。",
    [
      "倉敷川の川舟流しに乗船（700円・約20分）",
      "白壁の蔵屋敷となまこ壁の町並みを散策（1979年・国選定）",
      "倉敷帆布やマスキングテープなどの地元クラフトを買い物",
    ],
    [
      "Ride the Kurashiki River boat along the willow-lined canal (¥700, ~20 min)",
      "Wander streets of white-walled storehouses and namako walls, nationally preserved since 1979",
      "Shop local crafts: Kurashiki canvas, washi tape, and jeans",
    ],
    [2000, 5000, 10000],
    { transport: 1000, tickets: 700, food: 2000, cafe: 1300 },
    {},
    { min: 2, max: 4 },
    [4000, 2500, 1500],
    30,
    { weekday: 4, weekend: 7, holiday: 8 },
    { spring: 9, summer: 7, autumn: 9, winter: 7 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 4 },
    {
      overall: 9.4,
      couple: 9.4,
      summer: 8.6,
      winter: 8.8,
      rain: 7.8,
      food: 9,
      photography: 9.6,
      relaxation: 9,
      value: 8.8,
      uniqueness: 9.4,
    },
    "https://www.kurashiki-tabi.jp/standard/kurashiki-bikan-historical-quarter/",
    "Open access (streets); individual shops/museums have their own hours; river boat operates approx 09:30–17:00, departures every ~30 min (seasonal)",
    "River boat: day-of tickets at Kurashiki-kan Tourist Information Center (¥700 adult / ¥350 child); partial web reservation from Oct 2026",
    "Paid coin parking around the district (no dedicated large lot)",
    "Night illumination by designer Motoko Ishii; events: Heartland Kurashiki (summer), Kurashiki Haruyoi Akari (spring). ~15-min walk from JR Kurashiki Station.",
    [
      {
        type: "tourism_board",
        url: "https://www.kurashiki-tabi.jp/standard/kurashiki-bikan-historical-quarter/",
        title: "倉敷美観地区｜倉敷観光WEB",
      },
      {
        type: "government",
        url: "https://kunishitei.bunka.go.jp/bsys/maindetails/103/24",
        title:
          "倉敷市倉敷川畔伝統的建造物群保存地区｜国指定文化財等データベース",
      },
      {
        type: "tourism_board",
        url: "https://www.kurashiki-tabi.jp/see/see-3598/",
        title: "くらしき川舟流し｜倉敷観光WEB",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Kurashiki_Bikan_historical_quarter_20190324-3.jpg/1280px-Kurashiki_Bikan_historical_quarter_20190324-3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Suicasmo, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kurashiki_Bikan_historical_quarter_20190324-3.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "kojima-denim-street",
    "Kojima Jeans Street",
    "児島ジーンズストリート",
    "Okayama:kurashiki",
    "kurashiki-city",
    [34.4702, 133.8025],
    "street",
    ["Street", "Shopping", "Culture"],
    ["Denim Birthplace", "Local Manufacturers", "Kojima Ward", "Japan Blue"],
    "Kojima Jeans Street is an approximately 400-meter shopping street in the Ajino district of Kojima, Kurashiki — the area recognized as the birthplace of Japanese denim. Local jeans manufacturers operate shops along the retro arcade, where visitors can buy selvedge denim and custom items. The street is about a 15-minute walk from JR Kojima Station on the Seto-Ohashi Line, or a short ride on the themed Jeans Bus (Fri–Sun/holidays).",
    "児島ジーンズストリートは、国産ジーンズ発祥の地として知られる倉敷市児島・味野地区にある、全長約400メートルの商店街です。レトロな雰囲気のアーケード沿いに地元ジーンズメーカーのショップが軒を連ね、セルビッチデニムやオーダーメイドの製品を購入できます。JR児島駅から徒歩約15分、金・土・日・祝日には「ジーンズバス」も運行しています。",
    [
      "全長約400mのアーケードで地元メーカーのセルビッチデニムを購入",
      "金・土・日・祝日運行のジーンズバスに乗車（200円）",
      "旧野﨑家住宅など児島の歴史スポットと合わせて周遊",
    ],
    [
      "Shop selvedge denim directly from local manufacturers along the 400m arcade",
      "Ride the Jeans Bus (Fri–Sun/holidays, ¥200) dressed in denim-themed livery",
      "Combine with a visit to the former Nozaki residence, a Kurashiki City-designated historic house",
    ],
    [3000, 8000, 20000],
    { transport: 1000, tickets: 0, food: 2500, cafe: 4500 },
    {},
    { min: 1.5, max: 3 },
    [3000, 2000, 1000],
    40,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 4 },
    {
      overall: 8.4,
      couple: 8,
      summer: 8,
      winter: 7.8,
      rain: 7,
      food: 8.2,
      photography: 8.6,
      relaxation: 7.6,
      value: 8.6,
      uniqueness: 9,
    },
    "http://jeans-street.com/",
    "Open-air street, accessible anytime; shop hours vary by store (many Sat/Sun/holidays 10:00–18:00; some closed on weekdays)",
    "Not required",
    "Free dedicated lot (10 spaces, at Kojima Mino 1-13-10) plus municipal parking (¥100/hour, Kojima Mino 2-2-38); ¥3,000+ purchase at member shops earns parking validation",
    "Kojima is a ward of Kurashiki City (official address: Kurashiki-shi, Kojima, Ajino). Jeans Bus ¥200 adult one ride / ¥620 day pass, 6 departures/day, ~35-min loop, Fri–Sun & holidays (daily during Obon).",
    [
      {
        type: "official",
        url: "http://www.jeans-street.com/access/index.html",
        title: "アクセスマップ｜児島ジーンズストリート",
      },
      {
        type: "tourism_board",
        url: "https://www.kojima-cci.or.jp/sightseeing/look/jeansstreet.html",
        title: "児島ジーンズストリート｜児島商工会議所",
      },
      {
        type: "government",
        url: "https://www.callcenter-kurashiki-city.jp/faq/detail.aspx?id=2585",
        title: "ジーンズストリート駐車場FAQ｜倉敷市",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Kojima_Jeans_Street_2021-08_ac_%285%29.jpg/1280px-Kojima_Jeans_Street_2021-08_ac_%285%29.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Asturio Cantabrio, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Kojima_Jeans_Street_2021-08_ac_(5).jpg",
    },
  ),
);

newRecords.push(
  poil(
    "kurashiki-museum-of-folkcraft",
    "Kurashiki Museum of Folkcraft",
    "倉敷民藝館",
    "Okayama:kurashiki",
    "kurashiki-city",
    [34.5955, 133.7716],
    "museum",
    ["Museum", "Culture", "Art"],
    ["Mingei Movement", "Folkcraft", "Kurashiki Bikan", "Warehouse Museum"],
    "Housed in a former storehouse in the Bikan quarter, the Kurashiki Museum of Folkcraft displays everyday craft objects — ceramics, textiles, woodwork, and lacquerware — collected in the spirit of the mingei (folk craft) movement. The collection spans works by Shoji Hamada and Kanjiro Kawai alongside traditional crafts from Japan and abroad. Kurashiki is known as a city of mingei, and this museum is its centerpiece.",
    "倉敷民藝館は、美観地区内の旧倉庫を改装した建物で、民藝運動の理念に基づいて蒐集された日常の工芸品を展示する美術館です。柳宗悦らが評価した浜田庄司や河井寛次郎の作品をはじめ、国内外の陶磁器・染織・木工・漆芸などを収蔵しています。「民藝のまち」倉敷を代表する施設です。",
    [
      "浜田庄司・河井寛次郎らの作品を旧倉庫の館内で鑑賞",
      "国内外の日用品の工芸を民藝の視点で観覧",
      "美観地区の川畔・大原美術館から徒歩圏",
    ],
    [
      "View folkcraft by Hamada Shoji and Kawai Kanjiro in a converted warehouse",
      "See daily-use crafts from across Japan and abroad through the mingei lens",
      "Short walk from the canal and Ohara Museum in the Bikan quarter",
    ],
    [2500, 5000, 9000],
    { transport: 1000, tickets: 1200, food: 1800, cafe: 1000 },
    {},
    { min: 1, max: 2 },
    [1800, 900, 900],
    90,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 9, 10, 11],
    "All Year (indoor)",
    "low",
    { heatTolerance: 9, rainFriendly: 9, walkingIntensity: 3 },
    {
      overall: 8.2,
      couple: 8,
      summer: 8,
      winter: 8,
      rain: 8.6,
      food: 7.6,
      photography: 7.6,
      relaxation: 8.4,
      value: 8.4,
      uniqueness: 8.8,
    },
    "https://kurashiki-mingeikan.com/",
    "10:00–17:00 (last entry 16:30); closed Mondays (open on holidays; open during GW and Obon), Dec 29–Jan 1; shop entrance free",
    "Groups of 20+ asked to reserve in advance; max 35 per group at one entry",
    "None — use paid parking around the Bikan quarter",
    "Hours changed from 09:00 to 10:00 opening since Sep 2023; admission general ¥1,200 / high school & university ¥500 / elementary & junior high ¥300.",
    [
      {
        type: "official",
        url: "https://kurashiki-mingeikan.com/welcome.html",
        title: "来館案内｜倉敷民藝館公式ホームページ",
      },
      {
        type: "government",
        url: "https://www.city.kurashiki.okayama.jp/kosodate/youth/1013063/1013064/1013067/1007503/1015025/1007511.html",
        title: "倉敷民藝館｜倉敷市公式ホームページ",
      },
      {
        type: "tourism_board",
        url: "https://www.kurashiki-tabi.jp/see/see-1214/",
        title: "倉敷民藝館｜倉敷観光WEB",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/211203_Kurashiki_Museum_of_Folkcraft_Kurashiki_Okayama_pref_Japan01s3.jpg/1280px-211203_Kurashiki_Museum_of_Folkcraft_Kurashiki_Okayama_pref_Japan01s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:211203_Kurashiki_Museum_of_Folkcraft_Kurashiki_Okayama_pref_Japan01s3.jpg",
    },
  ),
);

// --- Takahashi City (2) ---
newRecords.push(
  poil(
    "raikyuji-temple",
    "Raikyuji Temple",
    "頼久寺",
    "Okayama:takahashi",
    "takahashi-city",
    [34.7973, 133.6189],
    "temple",
    ["Temple", "Garden", "Culture"],
    [
      "Kobori Enshu Garden",
      "National Scenic Spot",
      "Crane & Turtle Garden",
      "Bitchu-Takahashi",
    ],
    "Raikyuji is a Rinzai Zen temple in Takahashi, revived in 1339 by Ashikaga Takauji as one of the Ankokuji temples. Its dry landscape garden, created around 1605 by garden master Kobori Enshu during his time as governor of Bitchu Province, is a nationally designated Place of Scenic Beauty known as the Crane and Turtle Garden for its island rock arrangements. The garden uses Mt. Atago as borrowed scenery and features large clipped azalea mounds.",
    "頼久寺は高梁市にある臨済宗永源寺派の寺院で、暦応2年（1339年）に足利尊氏により安国寺の一つとして再興されました。慶長5年（1600年）頃に備中国奉行として赴任した小堀遠州が作庭したと伝わる庭園は、国の名勝に指定され、「鶴亀の庭」と呼ばれる蓬莱式枯山水庭園です。愛宕山を借景とし、サツキの大刈込みで大海の波を表現しています。",
    [
      "小堀遠州作と伝わる国指定名勝の枯山水庭園を鑑賞",
      "4月下旬〜5月下旬に見頃を迎えるサツキの大刈込みを観賞",
      "備中松山城・武家屋敷との3館共通券（1,000円）で周遊",
    ],
    [
      "Contemplate the nationally designated dry garden attributed to Kobori Enshu",
      "See azaleas in bloom late April–late May (about 1,000 sq m of clipped mounds)",
      "Visit as part of the Takahashi three-site ticket (¥1,000 with castle and samurai residences)",
    ],
    [2000, 4500, 8000],
    { transport: 2500, tickets: 400, food: 1200, cafe: 400 },
    {},
    { min: 0.8, max: 1.5 },
    [1500, 700, 800],
    40,
    { weekday: 1, weekend: 2, holiday: 3 },
    { spring: 9, summer: 6, autumn: 8, winter: 5 },
    [4, 5, 10, 11],
    "Spring (azaleas) & Autumn (foliage)",
    "moderate",
    { heatTolerance: 7, rainFriendly: 6, walkingIntensity: 4 },
    {
      overall: 8.6,
      couple: 8.8,
      summer: 7.4,
      winter: 7.2,
      rain: 6.6,
      food: 7.4,
      photography: 9,
      relaxation: 9.2,
      value: 8.8,
      uniqueness: 8.8,
    },
    "https://raikyuji.com/",
    "Garden open 09:00–17:00, open every day of the year",
    "Not required",
    "Free parking available",
    "Garden admission ¥400 adults / ¥200 middle & high school; elementary and under free. National Scenic Spot designated under the Cultural Properties law. ~15-min walk from JR Bitchu-Takahashi Station.",
    [
      {
        type: "government",
        url: "https://www.city.takahashi.lg.jp/soshiki/9/raikyuuji4240131.html",
        title: "頼久寺（庭園）｜高梁市公式ホームページ",
      },
      {
        type: "tourism_board",
        url: "https://takahasikanko.or.jp/modules/spot/index.php?content_id=2",
        title: "頼久寺庭園｜備中たかはし",
      },
      {
        type: "official",
        url: "https://raikyuji.com/",
        title: "天柱山 頼久寺",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/220101_Raikyuji_Takahashi_Okayama_pref_Japan09s3.jpg/1280px-220101_Raikyuji_Takahashi_Okayama_pref_Japan09s3.jpg",
      license: "CC BY-SA 4.0",
      attribution: "663highland, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:220101_Raikyuji_Takahashi_Okayama_pref_Japan09s3.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "fukiya-village",
    "Fukiya Village (Fukiya Furusato Village)",
    "吹屋ふるさと村",
    "Okayama:takahashi",
    "takahashi-city",
    [34.862, 133.469],
    "district",
    ["District", "History", "Culture"],
    [
      "Bengara Red Pigment",
      "Copper Mining Town",
      "Important Preservation District",
      "Japan Heritage",
    ],
    "Fukiya is a mountain village at about 550 meters elevation in the Nariwa area of Takahashi City, which prospered from copper mining and the production of bengara (red iron-oxide pigment). Its unified townscape of red-ocher facades and sekishu-tile roofs was designated a national Important Preservation District for Groups of Traditional Buildings in 1977 and a Japan Heritage site in 2020. Visitors can tour the Bengara-kan museum, the restored Sasanoe mine tunnel, and a bengara pottery studio.",
    "吹屋ふるさと村は、高梁市成羽町の標高約550メートルの山間にある集落で、銅山の開発と「ベンガラ（紅色顔料）」の生産で栄えました。ベンガラ色の外壁と石州瓦の屋根で統一された町並みは、1977年に国の重要伝統的建造物群保存地区に選定され、2020年には日本遺産に認定されました。ベンガラ館や復元された笹畝坑道、ベンガラ陶芸館などを見学できます。",
    [
      "1977年選定の国重伝建地区・ベンガラ色の統一された町並みを散策",
      "ベンガラ館と復元された笹畝坑道を見学",
      "隣接するベンガラ陶芸館でベンガラ絵付けを体験",
    ],
    [
      "Walk the unified red-ocher streetscape, a national preservation district since 1977",
      "Tour the Bengara-kan museum and the restored Sasanoe copper-mine tunnel",
      "Try bengara pottery painting at the adjacent pottery hall",
    ],
    [3000, 6000, 11000],
    { transport: 1600, tickets: 1000, food: 2000, cafe: 1400 },
    {},
    { min: 2, max: 4 },
    [4000, 3000, 1000],
    30,
    { weekday: 1, weekend: 2, holiday: 3 },
    { spring: 8, summer: 7, autumn: 9, winter: 5 },
    [4, 5, 6, 10, 11],
    "Autumn",
    "high",
    { heatTolerance: 5, rainFriendly: 4, walkingIntensity: 6 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 7.6,
      winter: 6.8,
      rain: 5.8,
      food: 7.8,
      photography: 9.4,
      relaxation: 8.6,
      value: 8.6,
      uniqueness: 9.6,
    },
    "https://sites.google.com/site/fukiyakankou/home",
    "Village streets open access; individual facilities (Bengara-kan, Sasanoe tunnel) have their own hours — check the tourism association site",
    "Not required for the village; confirm facility hours before visiting",
    "Village parking: 85 spaces incl. 5 buses (at old Fukiya Elementary School area)",
    "Bus service is infrequent (~3 departures/day outbound); plan around the timetable. Bihoku Bus from Takahashi Bus Center ~58 min, ¥800 one way. Part of Japan Heritage Japan Red story since 2020.",
    [
      {
        type: "government",
        url: "https://www.city.takahashi.lg.jp/soshiki/9/fukiya4240131.html",
        title: "吹屋ふるさと村｜高梁市公式ホームページ",
      },
      {
        type: "government",
        url: "https://www.japan-heritage.bunka.go.jp/ja/culturalproperties/result/5402/",
        title: "高梁市吹屋伝統的建造物群保存地区｜日本遺産ポータルサイト",
      },
      {
        type: "tourism_board",
        url: "https://takahasikanko.or.jp/modules/spot/index.php?content_id=21",
        title: "吹屋ふるさと村｜備中たかはし",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Fukiya01s3200.jpg/1280px-Fukiya01s3200.jpg",
      license: "CC BY 2.5",
      attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Fukiya01s3200.jpg",
    },
  ),
);

// --- Hiroshima City (4) ---
newRecords.push(
  poil(
    "genbaku-dome",
    "Atomic Bomb Dome (Genbaku Dome)",
    "原爆ドーム",
    "Hiroshima:hiroshima",
    "hiroshima-city",
    [34.3956, 132.4536],
    "monument" as Destination["kind"],
    ["UNESCO World Heritage", "History", "Landmark"],
    ["Genbaku Dome", "UNESCO", "Hiroshima Peace Memorial", "Open-air"],
    "The Atomic Bomb Dome is the skeletal remains of the Hiroshima Prefectural Industrial Promotion Hall, one of the few structures left standing after the atomic bomb exploded nearly directly above it on August 6, 1945. It was inscribed on the UNESCO World Heritage List in 1996 (criterion vi) as the Hiroshima Peace Memorial and is preserved exactly as it was after the bombing. The monument stands beside the Motoyasu River and is freely viewable at any time.",
    "原爆ドームは、1945年8月6日の原爆投下直上にあった広島県産業奨励館の残骸で、爆心地近くで倒壊を免れた数少ない建物の一つです。1996年に「広島平和記念碑（原爆ドーム）」としてUNESCO世界遺産に登録され、被爆当時の姿のまま保存されています。元安川沿いに位置し、いつでも無料で見学できます。",
    [
      "1996年登録の世界遺産",
      "被爆当時の姿を残す平和の象徴",
      "元安川対岸からの眺望",
    ],
    [
      "UNESCO World Heritage (inscribed 1996)",
      "Symbol of peace preserved as it was after 1945",
      "Best views from the Motoyasu riverbank and Peace Park side",
    ],
    [0, 1000, 2000],
    { transport: 200, tickets: 0, food: 600, cafe: 200 },
    {},
    { min: 0.5, max: 1.5 },
    [600, 300, 300],
    0,
    { weekday: 3, weekend: 4, holiday: 5 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 4, rainFriendly: 4, walkingIntensity: 2 },
    {
      overall: 9.8,
      couple: 8.8,
      summer: 8.5,
      winter: 8,
      rain: 7,
      food: 5,
      photography: 9.5,
      relaxation: 7,
      value: 9.5,
      uniqueness: 10,
    },
    "https://www.city.hiroshima.lg.jp/english/peace/1029869/1009932.html",
    "Open-air monument; accessible 24 hours, free of charge.",
    "None required.",
    "No on-site lot; use Peace Park area parking or public transport (Hiroden tram: Genbaku Dome-mae).",
    "UNESCO World Heritage since 1996. Do NOT conflate with the Peace Memorial Museum (separate record).",
    [
      {
        type: "government",
        url: "https://whc.unesco.org/en/list/775",
        title: "UNESCO WHC – Hiroshima Peace Memorial (Genbaku Dome)",
      },
      {
        type: "government",
        url: "https://www.city.hiroshima.lg.jp/english/peace/1029869/1009932.html",
        title: "Hiroshima City – Atomic Bomb Dome",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Genbaku_Dome04-r.JPG/1280px-Genbaku_Dome04-r.JPG",
      license: "CC BY 2.5",
      attribution: "Oilstreet, CC BY 2.5, via Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Genbaku_Dome04-r.JPG",
    },
  ),
);

newRecords.push(
  poil(
    "hiroshima-peace-memorial-park",
    "Hiroshima Peace Memorial Park",
    "広島平和記念公園",
    "Hiroshima:hiroshima",
    "hiroshima-city",
    [34.3932, 132.4523],
    "park",
    ["Park", "History", "Memorial", "Sightseeing"],
    ["Peace Park", "Cenotaph", "Flame of Peace", "Children's Peace Monument"],
    "Hiroshima Peace Memorial Park is the riverside green space at the former Nakajima district, the epicenter of the atomic bombing on August 6, 1945. It contains the Memorial Cenotaph, the Flame of Peace, the Children's Peace Monument and the Peace Memorial Museum, arranged on a single axis from the Cenotaph to the Genbaku Dome. The park is open 24 hours and free, with access restrictions only around the August 6 Peace Memorial Ceremony.",
    "広島平和記念公園は、1945年8月6日の原爆投下の爆心地となった旧中島地区に整備された河畔公園です。原爆死没者慰霊碑、平和の灯、原爆の子の像、平和記念資料館が一直線上に配置され、原爆ドームへと続きます。年中無休・入場無料で、8月6日の平和記念式典の前後に一部立ち入り制限があります。",
    ["原爆死没者慰霊碑と平和の灯", "原爆の子の像", "24時間無料の屋外公園"],
    [
      "Memorial Cenotaph and Flame of Peace",
      "Children's Peace Monument (Sadako Sasaki)",
      "Free, open-air, 24-hour access",
    ],
    [0, 800, 1500],
    { transport: 200, tickets: 0, food: 400, cafe: 200 },
    {},
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    5,
    { weekday: 3, weekend: 4, holiday: 5 },
    { spring: 8, summer: 7, autumn: 8, winter: 6 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 4, rainFriendly: 4, walkingIntensity: 3 },
    {
      overall: 9,
      couple: 8.5,
      summer: 8,
      winter: 7.5,
      rain: 6.5,
      food: 5,
      photography: 9,
      relaxation: 8.5,
      value: 9.5,
      uniqueness: 8.5,
    },
    "https://www.city.hiroshima.lg.jp/english/peace/1029871/1009572.html",
    "Park open 24 hours, free. Access may be restricted during the Aug 6 Peace Memorial Ceremony.",
    "None.",
    "Paid lots around the park (Heiwa Odori, Chuo Park); limited on Aug 6.",
    "Contains Cenotaph, Flame of Peace, Children's Peace Monument; connects Museum and Dome.",
    [
      {
        type: "government",
        url: "https://www.city.hiroshima.lg.jp/english/peace/1029871/1009572.html",
        title: "Hiroshima City – Peace Memorial Park",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Hiroshima_Peace_Memorial_Park_cenotaph.jpg/1280px-Hiroshima_Peace_Memorial_Park_cenotaph.jpg",
      license: "CC0",
      attribution: "TimMilesWright, CC0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hiroshima_Peace_Memorial_Park_cenotaph.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "hiroshima-national-peace-memorial-hall",
    "Hiroshima National Peace Memorial Hall for the Atomic Bomb Victims",
    "国立広島原爆死没者追悼平和祈念館",
    "Hiroshima:hiroshima",
    "hiroshima-city",
    [34.3933, 132.4535],
    "memorial" as Destination["kind"],
    ["Memorial", "History", "Museum", "Indoor"],
    ["National Peace Memorial Hall", "Genbaku", "Free admission"],
    "The National Peace Memorial Hall, opened in 2002, remembers the atomic-bomb victims with a Hall of Remembrance whose panoramic image shows the city at the moment of the bombing. Personal records of more than 20,000 victims are on display, and visitors can search a digital archive of survivors' memories. Admission is free; it stands at the south end of Peace Memorial Park near the museum.",
    "国立広島原爆死没者追悼平和祈念館は2002年に開館し、被爆時刻の広島市街を再現したパノラマ映像で知られる追悼施設です。2万人を超える原爆死没者の名簿を収蔵・展示し、被爆体験記のデジタル検索もできます。入館無料で、平和記念公園の南端に位置します。",
    [
      "被爆時刻を再現した追悼の間",
      "死没者名簿と体験記アーカイブ",
      "入館無料・雨天でも安心",
    ],
    [
      "Hall of Remembrance with panorama of the bombing moment",
      "Victims' name registers and digital memory archive",
      "Free admission, rain-friendly",
    ],
    [0, 700, 1200],
    { transport: 200, tickets: 0, food: 300, cafe: 200 },
    {},
    { min: 1, max: 2 },
    [1000, 400, 600],
    95,
    { weekday: 2, weekend: 3, holiday: 4 },
    { spring: 6, summer: 7, autumn: 6, winter: 6 },
    [3, 4, 5, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 1 },
    {
      overall: 8,
      couple: 7,
      summer: 8,
      winter: 7.5,
      rain: 8.5,
      food: 5,
      photography: 6,
      relaxation: 6.5,
      value: 9,
      uniqueness: 7.5,
    },
    "https://www.hiro-tsuitokinenkan.go.jp/en/",
    "Mar–Jul 08:30–18:00; Aug 08:30–19:00 (until 20:00 Aug 5–6); Sep–Nov 08:30–18:00; Dec–Feb 08:30–17:00. Free. Closed Dec 30–31.",
    "None required.",
    "No dedicated lot; use Peace Park area parking.",
    "Free national memorial; pairs with Museum and Park in one itinerary.",
    [
      {
        type: "government",
        url: "https://www.hiro-tsuitokinenkan.go.jp/en/visit/index.html",
        title: "National Peace Memorial Hall – Visit (hours, fees)",
      },
      {
        type: "government",
        url: "https://www.hiro-tsuitokinenkan.go.jp/en/",
        title: "National Peace Memorial Hall – Home",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Hiroshima_National_Peace_Memorial_Hall_for_the_Atomic_Bomb_Victims_20170310.jpg/1280px-Hiroshima_National_Peace_Memorial_Hall_for_the_Atomic_Bomb_Victims_20170310.jpg",
      license: "CC BY-SA 4.0",
      attribution: "そらみみ, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hiroshima_National_Peace_Memorial_Hall_for_the_Atomic_Bomb_Victims_20170310.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "hondori",
    "Hondori Shopping Arcade",
    "本通商店街",
    "Hiroshima:hiroshima",
    "hiroshima-city",
    [34.3932, 132.457],
    "district",
    ["Shopping", "Food", "Experience", "District"],
    ["Hondori", "Arcade", "Okonomiyaki", "Rain-friendly"],
    "Hondori is Hiroshima's 577-meter covered shopping arcade running through the Kamiyacho–Hatchobori area, with roughly 200 shops including department stores (Sogo, Parco), souvenir shops, cafes and restaurants. The arcade connects to Kamiyacho Shareo and leads toward Okonomimura, making it the city's main covered shopping and dining spine. Each shop sets its own hours; most open around 10:00 and close 20:00–22:00.",
    "本通商店街は、広島の紙屋町・八丁堀エリアを東西に貫く全長約577メートルのアーケード商店街です。そごう・パルコなどの百貨店をはじめ約200店舗が軒を連ね、カミヤチョウ・シェアオとも直結します。お好み村にも近く、広島の買い物と食の中心です。営業時間は店舗ごとに異なり、多くは10時頃から20〜22時までです。",
    [
      "全長約577m・約200店舗のアーケード",
      "そごう・パルコ・シェアオ・お好み村と直結",
      "雨天でも楽しめる買い物とグルメ",
    ],
    [
      "~577 m covered arcade, ~200 shops",
      "Connects Sogo/Parco, Kamiyacho Shareo, Okonomimura",
      "Rain-friendly shopping and street food",
    ],
    [1000, 2500, 6000],
    { transport: 200, tickets: 0, food: 1600, cafe: 700 },
    {},
    { min: 1, max: 3 },
    [1600, 200, 1400],
    90,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 7, summer: 6, autumn: 7, winter: 7 },
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "All Year",
    "low",
    { heatTolerance: 8, rainFriendly: 9, walkingIntensity: 2 },
    {
      overall: 7.5,
      couple: 7,
      summer: 7.5,
      winter: 7.5,
      rain: 8.5,
      food: 8.5,
      photography: 6.5,
      relaxation: 6.5,
      value: 8,
      uniqueness: 6.5,
    },
    "https://www.hondori.or.jp/en/",
    "No arcade-wide hours; each shop sets its own. Most shops 10:00–20:00, restaurants often until 22:00.",
    "None.",
    "No arcade parking; use Kamiyacho/Hatchobori paid lots or Hiroden tram (Kamiyacho-nishi, Hatchobori).",
    "City's main covered arcade; walk to Okonomimura and Peace Park.",
    [
      {
        type: "tourism_board",
        url: "https://www.hondori.or.jp/en/",
        title: "Hiroshima Hondori Shopping Street (official)",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Hiroshima-Hondori_Shopping_Street_at_dusk.jpg/1280px-Hiroshima-Hondori_Shopping_Street_at_dusk.jpg",
      license: "CC BY-SA 4.0",
      attribution: "そらみみ, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hiroshima-Hondori_Shopping_Street_at_dusk.jpg",
    },
  ),
);

// --- Hatsukaichi / Miyajima (5, all ferry-access) ---
newRecords.push(
  poil(
    "miyajima-omotesando",
    "Miyajima Omotesando",
    "宮島表参道商店街",
    "Hiroshima:hatsukaichi",
    "hatsukaichi-city",
    [34.2956, 132.3193],
    "district",
    ["Shopping", "Food", "Experience", "District"],
    ["Omotesando", "Momiji manju", "Oysters", "Deer"],
    "Miyajima Omotesando is the island's main shopping street running from the ferry pier to the Itsukushima Shrine approach. It is lined with momiji-manju sweet shops, oyster (kaki) restaurants, souvenir stores and the famous fried momiji-manju stalls. Wild sika deer roam freely along the street — the tourist association warns they are wild, may bite, and must not be fed.",
    "宮島表参道商店街は、宮島港から厳島神社の参道へと続く島のメインストリートです。もみじ饅頭のお店やかき料理店、土産物店が軒を連ね、揚げもみじ饅頭の屋台も人気です。野生のシカが街中を歩いており、宮島観光協会は「野生のため噛むことがあり、餌を与えないでください」と呼びかけています。",
    [
      "もみじ饅頭と揚げもみじ饅頭",
      "広島かきの名店",
      "野生のシカ（餌やり禁止）",
    ],
    [
      "Momiji-manju and fried momiji-manju stalls",
      "Fresh Hiroshima oysters (kaki) at restaurants",
      "Wild deer — don't feed them (official warning)",
    ],
    [1000, 2500, 5000],
    { transport: 200, tickets: 0, food: 1800, cafe: 500 },
    {},
    { min: 1, max: 2 },
    [900, 450, 450],
    60,
    { weekday: 4, weekend: 6, holiday: 7 },
    { spring: 8, summer: 6, autumn: 8, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 3 },
    {
      overall: 8,
      couple: 8,
      summer: 7.5,
      winter: 7.5,
      rain: 7,
      food: 9,
      photography: 7.5,
      relaxation: 6.5,
      value: 8,
      uniqueness: 7.5,
    },
    "https://www.miyajima.or.jp/english/",
    "No fixed hours; shops generally 09:00–17:30–18:00, some later on weekends; stalls close earlier in winter.",
    "None.",
    "No cars on Miyajima. Access by ferry (JR West Miyajima Ferry or Matsudai) from Miyajimaguchi.",
    "Wild deer are protected; feeding banned per Miyajima Tourist Association. Island is in Hatsukaichi City.",
    [
      {
        type: "tourism_board",
        url: "https://www.miyajima.or.jp/english/nature/nature_animal.html",
        title: "Miyajima Tourist Assoc – Deer warning",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Evening_shops%2C_Miyajima_-_DSC02522.JPG/1280px-Evening_shops%2C_Miyajima_-_DSC02522.JPG",
      license: "CC0",
      attribution: "Daderot, CC0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Evening_shops,_Miyajima_-_DSC02522.JPG",
    },
    [],
    undefined,
    "unknown",
  ),
);

newRecords.push(
  poil(
    "daisho-in",
    "Daisho-in Temple",
    "大聖院",
    "Hiroshima:hatsukaichi",
    "hatsukaichi-city",
    [34.2919, 132.3185],
    "temple",
    ["Temple", "History", "Culture", "Nature"],
    ["Daisho-in", "Shingon", "Mt Misen", "Henro"],
    "Daisho-in is the head temple of Shingon Buddhism on Miyajima, founded in 806 by Kukai and long the temple overseeing Mount Misen's sacred grounds. Its hillside complex includes the Kannon Hall, the Henjokutsu cave lined with 88 small statues echoing the Shikoku pilgrimage, and lantern-lined corridors. It is free to enter and open daily, and sits on the route up toward Mount Misen.",
    "大聖院は宮島の真言宗の本山で、806年に弘法大師空海が開いたと伝わる古刹です。観音堂や、四国遍路を模した88体の石仏が並ぶ「遍照窟」、灯籠が連なる回廊などがあり、弥山参詣の道に位置します。入堂無料で毎日8:00〜17:00に拝観できます。",
    [
      "806年創建・空海ゆかりの真言宗本山",
      "88体の石仏が並ぶ遍照窟",
      "無料拝観・静かな山あいの境内",
    ],
    [
      "Founded 806; Kukai's Shingon head temple on Miyajima",
      "Henjokutsu cave with 88 Shikoku-style statues",
      "Free entry; quiet forest setting",
    ],
    [0, 1000, 2000],
    { transport: 200, tickets: 0, food: 600, cafe: 200 },
    {},
    { min: 1, max: 2 },
    [2000, 1200, 800],
    40,
    { weekday: 3, weekend: 4, holiday: 5 },
    { spring: 8, summer: 7, autumn: 8, winter: 6 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 6, walkingIntensity: 5 },
    {
      overall: 8.5,
      couple: 8,
      summer: 8,
      winter: 7.5,
      rain: 7,
      food: 5.5,
      photography: 8.5,
      relaxation: 8.5,
      value: 9,
      uniqueness: 8.5,
    },
    "https://daisho-in.com/",
    "Daily 08:00–17:00. Free admission.",
    "None for general entry; experience programs (e.g. sutra copying) may need booking.",
    "No cars on Miyajima; walk from Miyajima pier (~15 min) or via Omotesando.",
    "On the Mt Misen trailhead route; combine with ropeway/Momijidani.",
    [
      {
        type: "official",
        url: "https://daisho-in.com/keidaiannai.html",
        title: "大聖院 境内案内 (hours)",
      },
      {
        type: "official",
        url: "https://daisho-in.com/",
        title: "大聖院 公式サイト",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/%E5%A4%A7%E8%81%96%E9%99%A2.jpg/1280px-%E5%A4%A7%E8%81%96%E9%99%A2.jpg",
      license: "CC0",
      attribution: "Syced, CC0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:%E5%A4%A7%E8%81%96%E9%99%A2.jpg",
    },
    [],
    undefined,
    "unknown",
  ),
);

newRecords.push(
  poil(
    "miyajima-gojunoto",
    "Five-Story Pagoda (Gojunoto)",
    "五重塔",
    "Hiroshima:hatsukaichi",
    "hatsukaichi-city",
    [34.2972, 132.3207],
    "tower",
    ["Landmark", "History", "Culture"],
    [
      "Gojunoto",
      "Five-story pagoda",
      "Important Cultural Property",
      "Miyajima",
    ],
    "The vermilion Five-Story Pagoda beside Senjokaku dates to 1407 and is designated an Important Cultural Property of Japan (not a National Treasure). Its interior is normally closed to the public. NOTE: the pagoda is currently hidden under full scaffolding and sheeting for restoration work through December 2026, so the exterior is not viewable until the work ends.",
    "千畳閣に隣接する朱塗りの五重塔は1407年の建立で、日本の重要文化財に指定されています（国宝ではありません）。内部は通常非公開です。※現在は保存修理工事のため全面足場とシートで覆われており、2026年12月頃までの工事期間中は外観も見学できません。",
    [
      "1407年建立の朱塗りの塔",
      "重要文化財（国宝ではない）",
      "2026年12月頃まで修理工事中のため見学不可",
    ],
    [
      "Built 1407; vermilion landmark beside Senjokaku",
      "Important Cultural Property (not National Treasure)",
      "Fully scaffolded for restoration through Dec 2026 — not viewable until work ends",
    ],
    [0, 800, 1500],
    { transport: 200, tickets: 0, food: 400, cafe: 200 },
    {},
    { min: 0.5, max: 1 },
    [500, 300, 200],
    0,
    { weekday: 4, weekend: 5, holiday: 6 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 5, rainFriendly: 5, walkingIntensity: 3 },
    {
      overall: 8,
      couple: 8,
      summer: 7.5,
      winter: 7,
      rain: 5.5,
      food: 5,
      photography: 8.5,
      relaxation: 7,
      value: 7.5,
      uniqueness: 8,
    },
    "https://www.miyajima.or.jp/sightseeing/ss_goju.html",
    "Exterior not viewable during restoration: full scaffolding and sheeting from 2026 through ~Dec 2026 (official notice); interior normally closed. Check the association page before visiting.",
    "None.",
    "No cars on Miyajima; walk from shrine precincts.",
    "Heritage status: Important Cultural Property, NOT National Treasure (Senjokaku and pagoda both).",
    [
      {
        type: "tourism_board",
        url: "https://www.miyajima.or.jp/sightseeing/ss_goju.html",
        title: "宮島観光協会 – 五重塔（工事情報）",
      },
      {
        type: "government",
        url: "https://www.pref.hiroshima.lg.jp/uploaded/attachment/655530.pdf",
        title: "広島県 – 文化財指定（重要文化財）",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Autumnal_leaves_and_Itsukushima_shrine_five-storied_pagoda.jpg/1280px-Autumnal_leaves_and_Itsukushima_shrine_five-storied_pagoda.jpg",
      license: "CC BY-SA 4.0",
      attribution: "さかおり, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Autumnal_leaves_and_Itsukushima_shrine_five-storied_pagoda.jpg",
    },
    [],
    undefined,
    "unknown",
  ),
);

newRecords.push(
  poil(
    "senjokaku",
    "Senjokaku (Toyokuni Shrine)",
    "千畳閣（豊国神社）",
    "Hiroshima:hatsukaichi",
    "hatsukaichi-city",
    [34.2973, 132.3203],
    "shrine",
    ["Shrine", "History", "Culture", "Landmark"],
    [
      "Senjokaku",
      "Toyokuni Shrine",
      "Important Cultural Property",
      "Hideyoshi",
    ],
    "Senjokaku, the thousand-mat hall, is a vast unfinished hall begun in 1587 at Toyotomi Hideyoshi's order to recite sutras for fallen warriors; it was never completed. It is designated an Important Cultural Property (not a National Treasure) and houses a large image of Hideyoshi plus a sacred mount. It is managed by nearby Toyokuni Shrine; admission is ¥100 (¥50 for children), open 08:30–16:30.",
    "千畳閣は、1587年に豊臣秀吉が戦没者供養のために建立を命じた未完成の大広間で、畳千枚分の広さからその名がつきました。重要文化財に指定され、内部には秀吉の木像や神輿を安置します。豊国神社が管理し、拝観料は大人100円・小中学生50円、8:30〜16:30に拝観できます。",
    [
      "秀吉が建立を命じた未完成の大広間",
      "畳千枚の内部と秀吉像",
      "重要文化財・拝観100円",
    ],
    [
      "Unfinished 1587 hall built by Hideyoshi's order",
      "Thousand-mat interior with Hideyoshi statue",
      "Important Cultural Property; ¥100 entry",
    ],
    [100, 900, 1500],
    { transport: 200, tickets: 100, food: 400, cafe: 200 },
    {},
    { min: 0.5, max: 1 },
    [400, 200, 200],
    60,
    { weekday: 4, weekend: 5, holiday: 6 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 7, walkingIntensity: 2 },
    {
      overall: 8,
      couple: 7.5,
      summer: 7.5,
      winter: 7,
      rain: 7.5,
      food: 5,
      photography: 8,
      relaxation: 7,
      value: 8,
      uniqueness: 8,
    },
    "https://itsukushimajinja.jp/en/admission.html",
    "Daily 08:30–16:30. Admission ¥100 adult, ¥50 elementary/junior-high.",
    "None.",
    "No cars on Miyajima; beside the Five-Story Pagoda in the shrine precincts.",
    "Managed by Toyokuni Shrine; combined visit with pagoda and Itsukushima Shrine.",
    [
      {
        type: "official",
        url: "https://itsukushimajinja.jp/en/admission.html",
        title: "Itsukushima Shrine – Admission (Senjokaku hours/fees)",
      },
      {
        type: "government",
        url: "https://www.pref.hiroshima.lg.jp/uploaded/attachment/655530.pdf",
        title: "広島県 – 文化財指定（重要文化財）",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Senjokaku_2011.JPG/1280px-Senjokaku_2011.JPG",
      license: "CC BY 3.0",
      attribution: "Taisyo, CC BY 3.0, via Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Senjokaku_2011.JPG",
    },
    [],
    undefined,
    "unknown",
  ),
);

newRecords.push(
  poil(
    "momijidani-park",
    "Momijidani Park & Miyajima Ropeway to Mt. Misen",
    "紅葉谷公園・宮島ロープウエー",
    "Hiroshima:hatsukaichi",
    "hatsukaichi-city",
    [34.2938, 132.325],
    "park",
    ["Park", "Nature", "Viewpoint", "Experience"],
    ["Momijidani", "Maple valley", "Ropeway", "Mt Misen", "Autumn"],
    "Momijidani (Maple Valley) Park is a free maple-forest park at the foot of Mount Misen and the starting point of the Miyajima Ropeway, with a free shuttle from the park entrance. The ropeway runs 09:00–16:00 uphill (last down 16:30, weather permitting; round trip ¥2,000 adults / ¥1,000 children) to Shishiiwa, near the 535 m summit of Mount Misen with views over the Seto Inland Sea. The park is famous for autumn foliage.",
    "紅葉谷公園は弥山の麓にある無料のカエデ林の公園で、宮島ロープウエーの乗り場があります（園内入口から無料シャトルバス）。ロープウエーは9:00〜16:00に上り運行（下り最終16:30、荒天時運休、往復大人2,000円・子供1,000円）で、標高535mの弥山山頂近くの獅子岩へ向かいます。紅葉の名所としても知られます。",
    [
      "無料の紅葉谷・秋の紅葉名所",
      "弥山山頂方面へのロープウエー（往復2,000円）",
      "獅子岩から瀬戸内海を一望",
    ],
    [
      "Free maple-valley park, famous autumn foliage",
      "Ropeway to Mt. Misen summit area (¥2,000 round trip)",
      "Views over Seto Inland Sea from Shishiiwa",
    ],
    [0, 2500, 4500],
    { transport: 2000, tickets: 0, food: 300, cafe: 200 },
    {},
    { min: 2, max: 5 },
    [3500, 2000, 1500],
    10,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 7, summer: 7, autumn: 9, winter: 5 },
    [10, 11],
    "Autumn",
    "high",
    { heatTolerance: 5, rainFriendly: 4, walkingIntensity: 6 },
    {
      overall: 8.5,
      couple: 9,
      summer: 8,
      winter: 6.5,
      rain: 5,
      food: 6,
      photography: 9,
      relaxation: 8.5,
      value: 8,
      uniqueness: 8.5,
    },
    "https://miyajima-ropeway.info/english/",
    "Park: free, always open. Ropeway: uphill 09:00–16:00, last downhill 16:30 (varies by season/weather; suspended in strong wind/storm). Round trip ¥2,000 adult, ¥1,000 child.",
    "Not required; same-day tickets at Momijidani Station or the pier Information Center.",
    "No cars on Miyajima; free shuttle bus runs from the park entrance to Momijidani Station (not during 12:05–13:10).",
    "Mt. Misen primeval forest registered as World Heritage in 1996 (part of Itsukushima inscription); ropeway weather-dependent.",
    [
      {
        type: "official",
        url: "https://miyajima-ropeway.info/english/fare/",
        title: "Miyajima Ropeway – Hours, Fares & Facilities",
      },
      {
        type: "official",
        url: "https://miyajima-ropeway.info/english/access/",
        title: "Miyajima Ropeway – Access & Free Shuttle Bus",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Momijidani_park2.jpg",
      license: "CC BY-SA 4.0",
      attribution: "耕太郎, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Momijidani_park2.jpg",
    },
    [],
    undefined,
    "unknown",
  ),
);

// --- Matsue City (5) ---
newRecords.push(
  poil(
    "matsue-vogel-park",
    "Matsue Vogel Park",
    "松江フォーゲルパーク",
    "Shimane:matsue",
    "matsue-city",
    [35.47625, 132.94403],
    "park",
    ["Nature", "Family", "Attraction"],
    [
      "Bird Park",
      "Penguin Parade",
      "Lake Shinji",
      "Flower Greenhouse",
      "Matsue",
    ],
    "Matsue Vogel Park is an aviary and flower park on the north shore of Lake Shinji, opened in 1997. It features one of Japan's largest greenhouses with year-round flowers and walk-through tropical bird aviaries. The park is famous for its daily costumed penguin parades and owl flight shows.",
    "松江フォーゲルパークは、宍道湖の北岸に1997年に開園した鳥と花のテーマパークです。日本有数の規模を誇る大温室では一年中花を楽しめ、熱帯の鳥たちが放し飼いにされたアビアリを歩いて見学できます。毎日行われるペンギンのお散歩とフクロウのフライトショーが人気です。",
    [
      "かわいいペンギンのお散歩（1日複数回）",
      "熱帯の鳥が放し飼いのアビアリ体験",
      "日本有数の大温室の花々",
    ],
    [
      "Costumed penguin parade (multiple daily shows)",
      "Walk-through tropical bird aviaries",
      "Japan's largest-class flower greenhouse",
    ],
    [1200, 3500, 6000],
    { transport: 1000, tickets: 1750, food: 500, cafe: 250 },
    {},
    { min: 2, max: 4 },
    [4000, 2500, 1500],
    45,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 9, summer: 7, autumn: 9, winter: 8 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 2 },
    {
      overall: 8.6,
      couple: 8.2,
      summer: 8.4,
      winter: 8,
      rain: 8.4,
      food: 7.5,
      photography: 8.8,
      relaxation: 8.6,
      value: 8.4,
      uniqueness: 9,
    },
    "https://www.ichibata.co.jp/vogelpark/",
    "9:00–17:00 (last entry 16:00); closed 2nd & 4th Friday Dec–Mar; event-period extensions possible",
    "None required",
    "Free parking on site",
    "Verified hours/admission from official site. Adult admission ¥1,750.",
    [
      {
        type: "official",
        url: "https://www.ichibata.co.jp/vogelpark/info",
        title: "開園時間・入園料・アクセス — 松江フォーゲルパーク",
      },
      {
        type: "tourism_board",
        url: "https://www.kankou-shimane.com/en/destinations/9300",
        title: "Matsue Vogel Park — Shimane Tourism",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Matsue_Vogel_Park_-_Center_Greenhouse_2.jpg/1280px-Matsue_Vogel_Park_-_Center_Greenhouse_2.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Tzu-hsun Hsu, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Matsue_Vogel_Park_-_Center_Greenhouse_2.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "lafcadio-hearn-memorial-museum",
    "Lafcadio Hearn Memorial Museum",
    "小泉八雲記念館",
    "Shimane:matsue",
    "matsue-city",
    [35.47917, 133.04917],
    "museum",
    ["Culture", "Museum", "History"],
    [
      "Lafcadio Hearn",
      "Koizumi Yakumo",
      "Literature",
      "Shiomi Nawate",
      "Matsue",
    ],
    "The Lafcadio Hearn Memorial Museum, established in 1933, honors Lafcadio Hearn (Koizumi Yakumo), the writer who taught English in Matsue from 1890 to 1891 and later chronicled Japan. The collection includes his personal belongings, manuscripts and materials on his life, with about 150,000 visitors a year. Hearn's former residence, a National Historic Site on Shiomi Nawate, stands next door.",
    "小泉八雲記念館は1933年に開館し、1890年から1891年に松江で英語教師を務めた文筆家ラフカディオ・ハーン（小泉八雲）を顕彰する文学館です。遺品や原稿など約1,500点を収蔵し、年間約15万人が訪れます。隣接する旧居（塩見縄手）は国の史跡に指定されています。",
    [
      "八雲の遺品・原稿・初版本の展示",
      "隣接する国史跡・小泉八雲旧居",
      "堀沿いの武家町・塩見縄手の風情",
    ],
    [
      "Hearn's personal belongings, manuscripts and first editions",
      "Adjacent National Historic Site former residence (Shiomi Nawate)",
      "Samurai-street setting on the castle moat",
    ],
    [1000, 3000, 5000],
    { transport: 900, tickets: 800, food: 800, cafe: 500 },
    {},
    { min: 1, max: 2 },
    [2500, 1500, 1000],
    85,
    { weekday: 3, weekend: 5, holiday: 6 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 7, rainFriendly: 9, walkingIntensity: 2 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 7.8,
      winter: 8.4,
      rain: 9,
      food: 7,
      photography: 8.6,
      relaxation: 8.2,
      value: 8.6,
      uniqueness: 9,
    },
    "https://www.hearn-museum-matsue.jp/",
    "Apr–Sep 9:00–18:00 (last entry 17:30); Oct–Mar 9:00–17:00 (last entry 16:30); open year-round except occasional maintenance closures",
    "None required",
    "No dedicated parking; use nearby public lots or buses",
    "Fees/hours verified from official site. Adult ¥600; former residence admission separate (adult ¥300) or common ticket ¥800.",
    [
      {
        type: "official",
        url: "https://www.hearn-museum-matsue.jp/english.html",
        title: "Lafcadio Hearn Memorial Museum — Official (EN)",
      },
      {
        type: "official",
        url: "https://www.hearn-museum-matsue.jp/userguide.html",
        title: "入館料・利用案内 — 小泉八雲記念館",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Lafcadio_Hearn_Memorial_Hall01st3200.jpg/1280px-Lafcadio_Hearn_Memorial_Hall01st3200.jpg",
      license: "CC BY 2.5",
      attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Lafcadio_Hearn_Memorial_Hall01st3200.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "horikawa-pleasure-boat",
    "Horikawa Pleasure Boat",
    "堀川遊覧船",
    "Shimane:matsue",
    "matsue-city",
    [35.4767, 133.0496],
    "cruise" as Destination["kind"],
    ["Sightseeing", "Boat Tour", "History"],
    ["Moat Cruise", "Matsue Castle", "Samurai Town", "Boat Tour"],
    "The Horikawa Pleasure Boat is a low-roofed sightseeing boat that cruises Matsue's moats and canals for about 50 minutes, passing under low bridges where passengers duck below the roof. Boats depart roughly every 20 minutes from March to November and every 30 minutes in winter from landings near Matsue Castle. A one-day pass allows unlimited rides.",
    "堀川遊覧船は、松江城周辺の堀や運河を約50分かけて巡る屋根の低い遊覧船です。橋の下では屋根を下げてくぐり抜けます。3月〜11月は約20分間隔、冬期（12〜2月）は約30分間隔で出発し、1日乗船券で何度でも乗船できます。",
    [
      "橋の下をくぐる約50分の堀めぐり",
      "水面上から見る城下町の風景",
      "1日乗船券で乗り放題",
    ],
    [
      "50-minute moat cruise with duck-under bridges",
      "Castle-town views from water level",
      "One-day pass for unlimited rides",
    ],
    [1000, 3500, 6000],
    { transport: 800, tickets: 2000, food: 500, cafe: 200 },
    {},
    { min: 1, max: 2 },
    [1500, 900, 600],
    10,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 9, summer: 7, autumn: 9, winter: 6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "high",
    { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 1 },
    {
      overall: 8.6,
      couple: 9,
      summer: 8,
      winter: 7,
      rain: 4.5,
      food: 7,
      photography: 8.8,
      relaxation: 8.8,
      value: 8.6,
      uniqueness: 8.8,
    },
    "https://www.matsue-horikawameguri.jp/",
    "Mar 1–Jun 30 9:00–17:00; Jul 1–Aug 15 9:00–18:00; Aug 16–Oct 10 9:00–17:00; Oct 11–Nov 30 9:00–16:00; Dec 1–Feb 28 9:00–16:00; departures every ~20 min (30 min Dec–Feb); may suspend in severe weather",
    "None required (boarding on day; arrive 5 min early)",
    "Public lots near Matsue Castle",
    "Coordinates are Matsue Castle moat reference (landing area); exact landings vary. Adult ¥2,000 day pass per the operator's current booking page (tourist-board pages list ¥1,500/¥1,600 legacy rates; booking page is authoritative).",
    [
      {
        type: "official",
        url: "https://matsue-horikawameguri-kankou.book.ntmg.com/",
        title: "堀川遊覧船 公式予約（乗船料）",
      },
      {
        type: "official",
        url: "https://www.matsue-horikawameguri.jp/language/en/",
        title: "Horikawa Pleasure Boat (EN) — hours",
      },
      {
        type: "tourism_board",
        url: "https://www.kankou-shimane.com/en/destinations/9294",
        title: "Horikawa Pleasure Boat — Shimane Tourism (hours)",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Matsue_Horikawa_Pleasure_Boat_ac.jpg/1280px-Matsue_Horikawa_Pleasure_Boat_ac.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Asturio Cantabrio, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Matsue_Horikawa_Pleasure_Boat_ac.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "tanabe-museum-matsue",
    "Tanabe Museum of Art",
    "田部美術館",
    "Shimane:matsue",
    "matsue-city",
    [35.47913, 133.04984],
    "museum",
    ["Culture", "Museum", "Art"],
    ["Tea Ceremony", "Matsudaira Fumai", "Izumo Crafts", "Art Museum"],
    "The Tanabe Museum of Art, opened in 1979 on a former samurai residence block in Matsue, displays tea-ceremony utensils associated with Lord Matsudaira Fumai and crafts from the Izumo region. The collection was built up over 24 generations of the Tanabe family, including calligraphy, ceramics and lacquerware. Three exhibition rooms rotate seasonal tea-theme displays roughly every two months.",
    "田部美術館は1979年、松江の旧武家屋敷地に開館しました。松平不昧公ゆかりの茶道具や出雲地方の美術工芸品を中心に、田部家24代にわたり伝来した調度品を収蔵・展示しています。3つの展示室では季節ごとに茶道具の組み合わせ展示が行われます。",
    [
      "松平不昧公ゆかりの茶道具",
      "出雲の焼物・漆器コレクション",
      "旧武家屋敷街の立地",
    ],
    [
      "Tea utensils connected to Lord Matsudaira Fumai",
      "Izumo ceramics and lacquerware collection",
      "Former samurai residence district setting",
    ],
    [1000, 2800, 4500],
    { transport: 900, tickets: 700, food: 700, cafe: 500 },
    {},
    { min: 1, max: 1.5 },
    [2000, 1200, 800],
    90,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 8, summer: 7, autumn: 8, winter: 7 },
    [3, 4, 5, 9, 10, 11],
    "All Year",
    "low",
    { heatTolerance: 7, rainFriendly: 9, walkingIntensity: 1 },
    {
      overall: 8.2,
      couple: 8,
      summer: 7.6,
      winter: 8.2,
      rain: 8.8,
      food: 7.2,
      photography: 8.2,
      relaxation: 8.4,
      value: 8,
      uniqueness: 8.6,
    },
    "https://www.tanabe-museum.or.jp/",
    "9:00–17:00 (last entry 16:30); closed Mondays (open if Monday is a public holiday); year-end/New Year and temporary closures",
    "None required",
    "No dedicated parking (city center)",
    "Verified hours/fees from official site. Adult ¥700; special exhibitions extra.",
    [
      {
        type: "official",
        url: "https://www.tanabe-museum.or.jp/information/",
        title: "ご利用案内 — 田部美術館",
      },
      {
        type: "official",
        url: "https://www.tanabe-museum.or.jp/guide/",
        title: "常設展 — 田部美術館",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/%E7%94%B0%E9%83%A8%E7%BE%8E%E8%A1%93%E9%A4%A8_-_panoramio.jpg/1280px-%E7%94%B0%E9%83%A8%E7%BE%8E%E8%A1%93%E9%A4%A8_-_panoramio.jpg",
      license: "CC BY 3.0",
      attribution: "Yoshio Kohara, CC BY 3.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:田部美術館_-_panoramio.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "gessho-ji-temple-matsue",
    "Gessho-ji Temple",
    "月照寺",
    "Shimane:matsue",
    "matsue-city",
    [35.47158, 133.03986],
    "temple",
    ["Culture", "History", "Temple"],
    ["Matsudaira Clan", "Matsue Domain", "Graves of Daimyo", "Fumai"],
    "Gessho-ji is the family temple of the Matsudaira clan, lords of Matsue Domain, where nine generations of daimyo are buried in large stone-terraced compounds. Established in the 17th century, the Jodo-sect temple takes its name from Gessho-in, mother of the first lord Matsudaira Naomasa. The grounds hold ornate mausoleum gates, stone lanterns and the famous Great Turtle of Gessho-ji described by Lafcadio Hearn.",
    "月照寺は、松江藩を治めた松平家の菩提寺で、歴代藩主9人の墓所が石段の上に整えられています。初代藩主松平直政の母・月照院にちなんで名付けられた浄土宗の寺院です。境内には精巧な廟門や石灯籠が立ち並び、ラフカディオ・ハーンの随筆にも登場する「月照寺の大亀」があります。",
    [
      "松平家歴代藩主9人の廟所",
      "ハーンの随筆にも登場する大亀",
      "静かな境内と庭園",
    ],
    [
      "Nine Matsudaira daimyo mausoleums",
      "The Great Turtle from Hearn's essays",
      "Quiet garden and temple grounds",
    ],
    [800, 2500, 4500],
    { transport: 900, tickets: 700, food: 600, cafe: 300 },
    {},
    { min: 1, max: 2 },
    [3000, 1800, 1200],
    25,
    { weekday: 2, weekend: 4, holiday: 5 },
    { spring: 9, summer: 7, autumn: 9, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 6, walkingIntensity: 2 },
    {
      overall: 8.4,
      couple: 8,
      summer: 7.6,
      winter: 7.8,
      rain: 6.8,
      food: 7,
      photography: 8.8,
      relaxation: 9,
      value: 8.2,
      uniqueness: 8.8,
    },
    "https://gesshoji-matsue.com/",
    "10:00–16:00 (last entry 15:30) Jan–May & Jul–Dec; June 8:30–17:30 (last entry 17:00); open year-round",
    "None required",
    "Small lot; cash only",
    "Verified hours/fees from official site. Adult ¥700; ¥600 groups 30+. Cash-only admission.",
    [
      {
        type: "official",
        url: "https://gesshoji-matsue.com/en/prices/",
        title: "Visit information — Gesshoji (EN)",
      },
      {
        type: "official",
        url: "https://gesshoji-matsue.com/introduction/history/",
        title: "歴史・伝承 — 月照寺",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/080720_Gessho-ji_Matsue_Shimane_pref_Japan13s5.jpg/1280px-080720_Gessho-ji_Matsue_Shimane_pref_Japan13s5.jpg",
      license: "CC BY 2.5",
      attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:080720_Gessho-ji_Matsue_Shimane_pref_Japan13s5.jpg",
    },
  ),
);

// --- Izumo City (2) ---
newRecords.push(
  poil(
    "inasa-beach-izumo",
    "Inasa Beach",
    "稲佐の浜",
    "Shimane:izumo",
    "izumo-city",
    [35.39578, 132.67361],
    "beach",
    ["Nature", "Beach", "Religion"],
    ["Inasa no Hama", "Izumo Taisha", "Kamiari Festival", "Bentenjima"],
    "Inasa Beach is the sacred beach west of Izumo Taisha, where during the Kamiari Festival each November all of Japan's Shinto deities are traditionally believed to arrive by sea before gathering at the shrine. The rocky islet Bentenjima stands just offshore with its own small shrine. It is about a 12-minute walk from the main hall of Izumo Taisha.",
    "稲佐の浜は出雲大社の西方に広がる神聖な砂浜で、毎年11月の神在祭には全国の神々がこの浜から上陸し、出雲大社へ向かうと伝えられています。沖には小さな祠のある弁天島が浮かびます。出雲大社本殿から徒歩約12分です。",
    [
      "神在祭で神々が上陸する神聖な浜",
      "沖に浮かぶ弁天島",
      "出雲大社のすぐそばで楽しむ夕日と日本海",
    ],
    [
      "Sacred arrival beach of the Kamiari Festival deities",
      "Bentenjima islet with its offshore shrine",
      "Sunset and Sea of Japan views from Izumo Taisha's doorstep",
    ],
    [0, 1000, 2500],
    { transport: 600, tickets: 0, food: 300, cafe: 100 },
    {},
    { min: 0.8, max: 1.5 },
    [3000, 2500, 500],
    0,
    { weekday: 2, weekend: 5, holiday: 6 },
    { spring: 8, summer: 9, autumn: 8, winter: 5 },
    [5, 6, 7, 8, 9, 10],
    "Summer",
    "high",
    { heatTolerance: 6, rainFriendly: 2, walkingIntensity: 2 },
    {
      overall: 8.4,
      couple: 8.6,
      summer: 9,
      winter: 5.5,
      rain: 3,
      food: 6.5,
      photography: 9,
      relaxation: 8.8,
      value: 9.4,
      uniqueness: 9,
    },
    "https://izumooyashiro.or.jp/en/",
    "Open access",
    "None",
    "Izumo Taisha area parking lots",
    "Coordinates from OSM (beach node). Kamiari Festival description kept conservative per shrine source.",
    [
      {
        type: "official",
        url: "https://izumooyashiro.or.jp/en/archives/religious/kamiari-festival-the-myriad-deities-arrive-at-izumo-oyashiro-shrine",
        title: "Kamiari Festival — Izumo Oyashiro Shrine (EN)",
      },
      {
        type: "tourism_board",
        url: "https://www.kankou-shimane.com/en/?destinations=inasa-no-hama-inasa-beach",
        title: "Inasa-no-hama Beach — Shimane Tourism",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Bentenjima_on_Inasa_Beach.jpg/1280px-Bentenjima_on_Inasa_Beach.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Qurren, CC BY-SA 3.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Bentenjima_on_Inasa_Beach.jpg",
    },
  ),
);

newRecords.push(
  poil(
    "hinomisaki-lighthouse-izumo",
    "Hinomisaki Lighthouse",
    "出雲日御碕灯台",
    "Shimane:izumo",
    "izumo-city",
    [35.43374, 132.62927],
    "tower",
    ["Landmark", "History", "Viewpoint"],
    ["Lighthouse", "Important Cultural Property", "Sea of Japan", "Sunset"],
    "Hinomisaki Lighthouse, completed in 1903 at the western tip of the Shimane Peninsula, is Japan's tallest stone lighthouse at 43.65 m. The white granite tower is an Important Cultural Property and was chosen among the world's 100 historic lighthouses. Visitors can climb the spiral staircase to the gallery for a panoramic view of the Sea of Japan.",
    "出雲日御碕灯台は1903年に島根半島の西端に完成した、高さ43.65mの日本一高い石造灯台です。白い花崗岩の塔は重要文化財に指定され、世界の歴史的灯台100選にも選ばれています。螺旋階段を上って回廊から日本海の絶景を眺められます。",
    ["日本一高い石造灯台（43.65m）", "重要文化財に指定", "日本海に沈む夕日"],
    [
      "Japan's tallest stone lighthouse (43.65 m)",
      "Important Cultural Property since 1998",
      "Sunset views over the Sea of Japan",
    ],
    [300, 1800, 4000],
    { transport: 900, tickets: 300, food: 400, cafe: 200 },
    {},
    { min: 1, max: 1.5 },
    [2500, 1800, 700],
    40,
    { weekday: 2, weekend: 5, holiday: 6 },
    { spring: 8, summer: 8, autumn: 9, winter: 6 },
    [4, 5, 6, 7, 8, 9, 10],
    "Autumn",
    "high",
    { heatTolerance: 6, rainFriendly: 4, walkingIntensity: 3 },
    {
      overall: 8.6,
      couple: 8.6,
      summer: 8.6,
      winter: 7,
      rain: 4.5,
      food: 6.8,
      photography: 9.2,
      relaxation: 8.2,
      value: 8.8,
      uniqueness: 9,
    },
    "https://www.city.izumo.shimane.jp/www/contents/1769395852119/index.html",
    "Year-round 9:00–12:00; afternoons Mar–Sep weekdays 13:00–16:30, weekends/holidays 13:00–17:00; Oct–Feb 13:00–16:30; last entry 20 min before close; may close in rough weather",
    "None required",
    "Free lots (first 65 cars, second 175 cars)",
    "Hours (from 2026-03-01 change) verified from Izumo City site. Observation donation ¥300 jr-high+, under 13 free.",
    [
      {
        type: "government",
        url: "https://www.city.izumo.shimane.jp/www/contents/1769395852119/index.html",
        title: "（3/1〜）出雲日御碕灯台 参観時間の変更について — 出雲市",
      },
      {
        type: "tourism_board",
        url: "https://www.kankou-shimane.com/destination/20253",
        title: "出雲日御碕灯台 — しまね観光ナビ",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Hinomisaki_lighthouse_Izumo01bs3200.jpg/1280px-Hinomisaki_lighthouse_Izumo01bs3200.jpg",
      license: "CC BY 2.5",
      attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hinomisaki_lighthouse_Izumo01bs3200.jpg",
    },
  ),
);

// --- Iwami Town, Tottori (1, gateway via Tottori City) ---
newRecords.push(
  poil(
    "uradome-coast",
    "Uradome Coast",
    "浦富海岸",
    "Tottori:iwami",
    "",
    [35.59038, 134.32622],
    "nature" as Destination["kind"],
    ["Nature", "Coast", "National Park"],
    ["San'in Kaigan Geopark", "Ria Coast", "Sea Caves", "Scenic Beauty"],
    "The Uradome Coast is a 15-kilometer ria coastline of eroded cliffs, sea caves, arches and white-sand coves on the Sea of Japan in Iwami, Tottori, known as the San'in Matsushima. It was nationally designated a Place of Scenic Beauty and Natural Monument in 1928 and is a major geosite of the San'in Kaigan Global Geopark. Glass-bottom sightseeing boats run from the Uradome fishing port in season (roughly March–November).",
    "浦富海岸は鳥取県岩美町の日本海に面した約15kmに及ぶリアス式海岸で、侵食された断崖や海食洞、白砂の入り江が続き「山陰の松島」と呼ばれます。1928年に国の名勝・天然記念物に指定され、山陰海岸ジオパークの主要ジオサイトです。浦富漁港からは季節により遊覧船が運航します（おおむね3月〜11月）。",
    [
      "海食洞や岩柱が続く「山陰の松島」",
      "国の名勝・天然記念物（1928年指定）",
      "季節運航の海中遊覧船",
    ],
    [
      "San'in Matsushima ria coastline with sea caves and arches",
      "Place of Scenic Beauty & Natural Monument (1928)",
      "Glass-bottom sightseeing boats in season",
    ],
    [0, 2500, 5000],
    { transport: 1500, tickets: 0, food: 700, cafe: 300 },
    {},
    { min: 2, max: 4 },
    [5000, 4000, 1000],
    5,
    { weekday: 2, weekend: 5, holiday: 6 },
    { spring: 8, summer: 9, autumn: 9, winter: 5 },
    [4, 5, 6, 7, 8, 9, 10],
    "Summer & Autumn",
    "high",
    { heatTolerance: 6, rainFriendly: 3, walkingIntensity: 3 },
    {
      overall: 8.8,
      couple: 8.8,
      summer: 9.2,
      winter: 5.5,
      rain: 3.5,
      food: 7,
      photography: 9.4,
      relaxation: 9,
      value: 8.8,
      uniqueness: 9.2,
    },
    "https://www.iwamikanko.org/",
    "Open access (coast); boats seasonal",
    "Boats: check port schedule in season",
    "Free lots near Uradome fishing port",
    "Coordinates from Wikipedia. Boat schedule UNKNOWN — do not state times. Iwami is a separate town from Tottori City; reached via gateway hub.",
    [
      {
        type: "tourism_board",
        url: "https://www.torican.jp/en/spot/detail_1052.html",
        title: "Uradome Coast — VISIT TOTTORI",
      },
      {
        type: "official",
        url: "https://www.japan.travel/en/spot/2278/",
        title: "Uradome Coast — JNTO",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Uradome_Kaigan_-01.jpg/1280px-Uradome_Kaigan_-01.jpg",
      license: "CC BY-SA 3.0",
      attribution: "Aimaimyi, CC BY-SA 3.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Uradome_Kaigan_-01.jpg",
    },
    [],
    undefined,
    undefined,
    { gatewayHubId: "tottori-city" },
  ),
);

// --- Shimonoseki City (1) ---
newRecords.push(
  poil(
    "karato-market-shimonoseki",
    "Karato Market",
    "唐戸市場",
    "Yamaguchi:shimonoseki",
    "shimonoseki-city",
    [33.95662, 130.94582],
    "market",
    ["Food", "Market", "Seafood"],
    ["Fugu", "Bakangai", "Seafood Market", "Karato"],
    "Karato Market is Shimonoseki's central fish market, whose Iki-iki Bakangai street stalls sell sushi and seafood boxes directly to visitors, a highlight of the city's fugu (blowfish) culture. The wholesale area operates from early morning on weekdays, while the Bakangai food stalls run on Fridays, weekends and public holidays.",
    "唐戸市場は下関市の中央卸売市場で、旬の魚介を使った寿司や海鮮丼をその場で味わえる「活きいき馬関街」が名物です。ふぐの街・下関の食文化を代表するスポットで、週末・祝日には鮮度抜群の寿司が並びます。",
    [
      "「活きいき馬関街」の新鮮な寿司（金・土・日祝）",
      "下関名物ふぐ料理",
      "早朝から活気づく市場",
    ],
    [
      "Iki-iki Bakangai fresh sushi stalls (Fri–Sun & holidays)",
      "Fugu dishes — Shimonoseki's signature",
      "Working wholesale market atmosphere from early morning",
    ],
    [1000, 2500, 5000],
    { transport: 500, tickets: 0, food: 1500, cafe: 500 },
    {},
    { min: 1, max: 2 },
    [2000, 1500, 500],
    60,
    { weekday: 2, weekend: 7, holiday: 8 },
    { spring: 8, summer: 8, autumn: 8, winter: 8 },
    [1, 2, 3, 10, 11, 12],
    "Winter (fugu)",
    "low",
    { heatTolerance: 7, rainFriendly: 8, walkingIntensity: 2 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 8.2,
      winter: 9.2,
      rain: 8.6,
      food: 9.6,
      photography: 8.6,
      relaxation: 7.4,
      value: 9,
      uniqueness: 8.8,
    },
    "https://www.karatoichiba.com/",
    "Wholesale Mon–Sat from 4:00; Iki-iki Bakangai stalls Fri–Sat 8:00–15:00, Sun & holidays 7:00–15:00 (check the published calendar; stall start/end times vary with fish supply)",
    "None",
    "Paid lots nearby (Karato district)",
    "Bakangai hours verified from the official 2026 calendar (Fri/Sat 08:00, Sun/holiday 07:00); wholesale times are morning-start, 5:00–8:00 busiest per official FAQ.",
    [
      {
        type: "official",
        url: "https://www.karatoichiba.com/calendars/",
        title: "営業カレンダー — 唐戸市場",
      },
      {
        type: "official",
        url: "https://www.karatoichiba.com/faq/",
        title: "よくあるご質問 — 唐戸市場",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/%E5%94%90%E6%88%B8%E5%B8%82%E5%A0%B4202309.jpg/1280px-%E5%94%90%E6%88%B8%E5%B8%82%E5%A0%B4202309.jpg",
      license: "CC BY-SA 4.0",
      attribution: "なしはな, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:唐戸市場202309.jpg",
    },
  ),
);

// --- Mine City (1) ---
newRecords.push(
  poil(
    "akiyoshidai-plateau",
    "Akiyoshidai Plateau",
    "秋吉台",
    "Yamaguchi:mine",
    "mine-city",
    [34.232, 131.3027],
    "nature" as Destination["kind"],
    ["Nature", "Geology", "National Park"],
    ["Karst", "Akiyoshidai Quasi-National Park", "Ramsar", "Yamayaki"],
    "Akiyoshidai is Japan's largest karst plateau: the Mine-Akiyoshidai Karst Plateau Geopark states its limestone area is approximately 100 square kilometers with more than 450 densely distributed limestone caves. It is a Quasi-National Park (est. 1955), and its groundwater system, together with the cave-dwelling creatures that inhabit it, is registered under the Ramsar Convention on Wetlands. The treeless grassland, dotted with limestone pinnacles, is burned each February in the traditional Yamayaki grass fire festival.",
    "秋吉台は日本最大のカルスト台地で、美祢市ジオパークの公式情報によると、石灰岩の広がりは約100平方キロメートル、450以上の鍾乳洞が密集して分布しています。1955年指定の国定公園で、地下水系とそこに生息する洞窟生物はラムサール条約湿地に登録されています。石灰岩の尖塔が点在する草原は、毎年2月に伝統行事「山焼き」で焼かれます。",
    [
      "日本最大のカルスト台地（約100km²）",
      "450以上の鍾乳洞と石灰岩の尖塔・ドリーネ",
      "ラムサール登録の地下水系と2月の山焼き",
    ],
    [
      "Japan's largest karst plateau (~100 km²)",
      "450+ limestone caves, pinnacles and dolines",
      "Ramsar-listed groundwater system; February Yamayaki festival",
    ],
    [0, 2000, 4000],
    { transport: 1200, tickets: 0, food: 500, cafe: 300 },
    {},
    { min: 2, max: 4 },
    [6000, 4500, 1500],
    10,
    { weekday: 2, weekend: 5, holiday: 6 },
    { spring: 9, summer: 7, autumn: 9, winter: 6 },
    [3, 4, 5, 9, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 7, rainFriendly: 4, walkingIntensity: 3 },
    {
      overall: 8.8,
      couple: 8.6,
      summer: 8.4,
      winter: 7,
      rain: 4.5,
      food: 6.5,
      photography: 9.4,
      relaxation: 8.8,
      value: 9,
      uniqueness: 9.4,
    },
    "https://en.mine-geo.com/",
    "Open access (parkland)",
    "None",
    "Free lots at Akiyoshidai resthouse/viewpoints",
    "Limestone area ~100 km² and 450+ caves per the official Mine-Akiyoshidai Karst Plateau Geopark (en.mine-geo.com); groundwater system and cave-dwelling creatures are Ramsar-registered. Quasi-National Park area is 45.02 km² per env.go.jp — the record describes the limestone plateau figure.",
    [
      {
        type: "official",
        url: "https://en.mine-geo.com/",
        title: "Mine-Akiyoshidai Karst Plateau Geopark — official (EN)",
      },
      {
        type: "official",
        url: "https://mine-geo.com/",
        title: "美祢市ジオパーク（公式）",
      },
      {
        type: "government",
        url: "https://www.env.go.jp/en/nature/nps/park/system/",
        title: "Akiyoshidai Quasi-National Park — Ministry of the Environment",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Akiyoshidai_001.jpg/1280px-Akiyoshidai_001.jpg",
      license: "CC BY 2.0",
      attribution: "monkist (Szabolcs Arany), CC BY 2.0, via Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Akiyoshidai_001.jpg",
    },
  ),
);

// --- Iwakuni City (1) ---
newRecords.push(
  poil(
    "iwakuni-castle",
    "Iwakuni Castle",
    "岩国城",
    "Yamaguchi:iwakuni",
    "iwakuni-city",
    [34.17526, 132.17423],
    "castle",
    ["History", "Castle", "Viewpoint"],
    ["100 Fine Castles", "Kikkawa Clan", "Ropeway", "Kintai Bridge"],
    "Iwakuni Castle was first built by Kikkawa Hiroie between 1601 and 1608, then dismantled under the 1615 one-castle-per-province rule. The present tower, reconstructed in 1962, stands on Shiro-yama above the Nishiki River with views over Kintai Bridge and the city, reached by ropeway or hiking trail. It was selected among Japan's 100 Fine Castles in 2006.",
    "岩国城は1601年から1608年にかけて吉川広家によって築かれましたが、1615年の一国一城令で取り壊されました。現在の天守は1962年に再建されたもので、錦川を見下ろす城山に立ち、錦帯橋や市街を一望できます。ロープウェイか徒歩で登れます。2006年には日本100名城に選定されました。",
    [
      "錦川を見下ろす1962年再建の天守",
      "頂上からの錦帯橋の絶景",
      "約3分のロープウェイ",
    ],
    [
      "Reconstructed 1962 keep above the Nishiki River",
      "Panoramic views of Kintai Bridge from the top",
      "Ropeway ride up Mt. Shiro (3 min)",
    ],
    [800, 2500, 4500],
    { transport: 830, tickets: 270, food: 900, cafe: 500 },
    {},
    { min: 1.5, max: 2.5 },
    [3500, 2500, 1000],
    30,
    { weekday: 3, weekend: 6, holiday: 7 },
    { spring: 9, summer: 7, autumn: 9, winter: 7 },
    [3, 4, 5, 10, 11],
    "Spring & Autumn",
    "moderate",
    { heatTolerance: 6, rainFriendly: 5, walkingIntensity: 3 },
    {
      overall: 8.4,
      couple: 8.4,
      summer: 7.8,
      winter: 8,
      rain: 6,
      food: 7.5,
      photography: 9,
      relaxation: 8,
      value: 8.4,
      uniqueness: 8.8,
    },
    "https://kankou.iwakuni-city.net/iwakunijyo.html",
    "Castle 9:00–16:45 (entry by 16:30); ropeway 9:00–17:00 every 15 min (last up 17:00); closed on ropeway inspection days (Jan–Feb period)",
    "None",
    "Paid lots near Kintai Bridge / ropeway base",
    "Fees/hours verified from Iwakuni City tourism. Castle ¥270; ropeway ¥560 round trip; set ticket ¥970. Ropeway final departure is 17:00 down.",
    [
      {
        type: "official",
        url: "https://kankou.iwakuni-city.net/iwakunijyo.html",
        title: "岩国城 — 岩国観光振興課",
      },
      {
        type: "official",
        url: "https://kankou.iwakuni-city.net/ropeway.html",
        title: "岩国城ロープウエー — 岩国観光振興課",
      },
    ],
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/20100724_Iwakuni_Castle_5262.jpg/1280px-20100724_Iwakuni_Castle_5262.jpg",
      license: "CC BY-SA 4.0",
      attribution: "Jakub Hałun, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:20100724_Iwakuni_Castle_5262.jpg",
    },
  ),
);

// ---------------------------------------------------------------------------
// Corrections to existing records
// ---------------------------------------------------------------------------

let added = 0;
let modified = 0;

for (const record of newRecords) {
  const existing = byId.get(record.id);
  if (!existing) {
    index.push(record);
    byId.set(record.id, record);
    added += 1;
  } else if (JSON.stringify(existing) !== JSON.stringify(record)) {
    const indexPosition = index.findIndex((d) => d.id === record.id);
    if (indexPosition < 0)
      throw new Error(`record index position missing: ${record.id}`);
    index[indexPosition] = record;
    byId.set(record.id, record);
    modified += 1;
    console.log(`  updated ${record.id}: regenerated audited KAI-32 record`);
  }
}

// Containment corrections (idempotent: apply only when the current value differs).
function patch(
  id: string,
  fn: (d: Destination) => void,
  description: string,
): void {
  const d = byId.get(id);
  if (!d) throw new Error(`patch target missing: ${id}`);
  const before = JSON.stringify(d);
  fn(d);
  if (JSON.stringify(d) !== before) {
    modified += 1;
    console.log(`  corrected ${id}: ${description}`);
  }
}

// --- Kurashiki City: remove false cross-municipality featured reference ---
patch(
  "kurashiki-city",
  (d) => {
    d.relationships = {
      ...(d.relationships ?? {}),
      featuredDestinationIds: (
        d.relationships?.featuredDestinationIds ?? []
      ).filter((id) => id !== "korakuen-okayama"),
    };
  },
  "Korakuen is in Okayama City, not Kurashiki; removed from featured",
);

// --- Miyajima: Okinawa leftovers, fabricated rail options, island marking ---
patch(
  "miyajima-itsukushima",
  (d) => {
    d.kind = "island";
    d.notes =
      "Miyajima (Itsukushima) Island is in Hatsukaichi City, Hiroshima Prefecture. Reached by ferry from Miyajimaguchi (JR West Miyajima Ferry or Matsudai); no private cars on the island.";
    d.transportOptions = {};
    // Island-marked records must never inherit a mainland rail zone; with no
    // ferry route in the registry this record stays non-routable (unknown)
    // until a Miyajima ferry route is added (recorded in KAI32_DATA_AUDIT.md).
    d.transportZoneId = "unknown";
    d.relationships = {
      ...(d.relationships ?? {}),
      nearbyDestinationIds: [],
    };
    d.businessHours =
      "Jan 1 00:00–18:30; Jan 2–3 06:30–18:30; Jan 4–Feb 06:30–17:30; Mar 1–Oct 14 06:30–18:00; Oct 15–Nov 30 06:30–17:30; Dec 06:30–17:00";
    d.openingHoursJa =
      "1月1日 0:00〜18:30、1月2〜3日 6:30〜18:30、1月4日〜2月 6:30〜17:30、3月1日〜10月14日 6:30〜18:00、10月15日〜11月30日 6:30〜17:30、12月 6:30〜17:00。";
    d.parking =
      "No private cars on Miyajima; use JR West Miyajima Ferry or Matsudai ferry from Miyajimaguchi, then walk or ride the local shuttle.";
    d.imageMetadata = {
      source: "Wikimedia Commons",
      license: "CC BY-SA 2.0",
      attribution: "redlegsfan21, CC BY-SA 2.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Itsukushima_Shrine_Torii_Gate_(13890465459).jpg",
    };
  },
  "removed Okinawa leftovers, fabricated rail options; island marked; ferry-only access documented",
);

// --- Hiroshima: repurpose hiroshima-peace-memorial as the museum record ---
patch(
  "hiroshima-peace-memorial",
  (d) => {
    d.name = "Hiroshima Peace Memorial Museum";
    d.nameJa = "広島平和記念資料館";
    d.kind = "museum";
    d.description =
      "The Hiroshima Peace Memorial Museum documents the atomic bombing of August 6, 1945 through artifacts, survivor testimony and reconstructed scenes of the devastated city. The permanent exhibition is in the East Building (the Main Building reopened in April 2019 after renovation). The museum stands inside Hiroshima Peace Memorial Park beside the Motoyasu River.";
    d.notes =
      "Permanent exhibition in East Building; Main Building reopened 2019. Adjacent to Peace Park and the Genbaku Dome. This record is the museum; the Genbaku Dome is a separate record (genbaku-dome).";
    d.businessHours =
      "Mar–Nov 07:30–19:00 (Aug until 20:00; Aug 5–6 until 21:00); Dec–Feb 07:30–18:00; last entry 30 min before close; closed Dec 30–31. Online reservation required for the 07:30–08:30 window and the last hour of the day.";
    d.openingHoursJa =
      "3月〜11月 7:30〜19:00（8月は20:00まで、8月5・6日は21:00まで）、12月〜2月 7:30〜18:00、入館は閉館30分前まで。12月30・31日休館。開館直後1時間と閉館前1時間はオンライン予約制。";
    d.reservation =
      "Online advance reservation required for the first hour after opening and the final hour before close; standard hours can be entered with a same-day ticket.";
    d.parking =
      "No dedicated visitor lot; nearest paid lots are around Peace Memorial Park (Heiwa Odori side). Use Hiroden tram to Genbaku Dome-mae or Hiroshima Bus.";
    d.heroImage =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Hiroshima_Peace_Memorial_Museum_2008_01.JPG/1280px-Hiroshima_Peace_Memorial_Museum_2008_01.JPG";
    d.image = d.heroImage;
    d.imageMetadata = {
      source: "Wikimedia Commons",
      license: "CC BY-SA 3.0",
      attribution: "Taisyo, CC BY-SA 3.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hiroshima_Peace_Memorial_Museum_2008_01.JPG",
    };
    d.budgetMin = 800;
    d.budgetRecommended = 1500;
    d.budgetMax = 2500;
    d.budgetBreakdown = { transport: 300, tickets: 200, food: 800, cafe: 200 };
    d.transportOptions = {};
    d.coordinates = { lat: 34.3916, lng: 132.4531 };
    d.tags = [
      "Hiroshima Peace Memorial Museum",
      "Genbaku",
      "Peace Park",
      "Museum",
    ];
    d.highlights = [
      "Artifacts and testimony documenting August 6, 1945",
      "East Building permanent exhibition (¥200)",
      "Peace education; exhibits on the August 6, 1945 bombing and its aftermath",
    ];
    d.collections = [];
    d.content = {
      en: {
        name: d.name,
        description: d.description,
        highlights: d.highlights,
      },
      ja: {
        name: d.nameJa,
        description:
          "広島平和記念資料館は、1945年8月6日の原爆投下の実相を、遺品・被爆者の証言・復元資料によって伝える施設です。常設展示は東館で行われており、本館は2019年4月に改修を終えて再開しました。広島平和記念公園の中にあり、原爆ドームから徒歩数分です。",
        highlights: [
          "原爆の実相を伝える遺品の展示",
          "被爆者の証言と平和学習",
          "東館の常設展示（200円）",
        ],
      },
    };
    d.categories = ["Museum", "History", "War Memorial", "Indoor"];
    d.recommendedVisitHours = { min: 2, max: 4 };
    d.notesJa =
      "【見どころ】広島平和記念資料館は中国地方の観光スポットです。訪問前に公式サイトで最新の営業情報をご確認ください。";
    d.status = "published";
    d.editorial = {
      lifecycle: "published",
      sources: [
        {
          type: "government",
          url: "https://www.city.hiroshima.lg.jp/english/peace/1029920/1009860.html",
          title: "Hiroshima City – Peace Memorial Museum",
        },
        {
          type: "government",
          url: "https://whc.unesco.org/en/list/775",
          title: "UNESCO WHC – Hiroshima Peace Memorial (Genbaku Dome)",
        },
      ],
      reviewedAt: AUDIT_DATE,
      reviewedBy: "Meguruto editorial",
      checkedAt: AUDIT_DATE,
      freshness: "current",
      changeSummary: "KAI-32 Chugoku beta expansion",
      changes: [
        {
          changedAt: AUDIT_DATE,
          changedBy: "Meguruto editorial",
          summary:
            "Split Genbaku Dome from the museum record; source-backed KAI-32 correction",
          method: "assisted",
        },
      ],
    };
  },
  "conflated record now is the museum; Genbaku Dome split into genbaku-dome",
);

// --- Six Hiroshima expansion records: template contamination + fabricated options ---
patch(
  "hiroshima-castle",
  (d) => {
    ((d.notes =
      "Main keep permanently closed since Mar 22, 2026 (exterior viewable only); ninomaru grounds remain open and free. In Hiroshima City's Chuo-ku."),
      (d.businessHours =
        "Ninomaru grounds Apr–Sep 09:00–17:30 (last entry 17:00), Oct–Mar 09:00–16:30 (last entry 16:00); closed Dec 8 & Dec 29–31. Keep interior closed."));
    d.openingHoursJa =
      "二の丸跡は4〜9月 9:00〜17:30（最終入場17:00）、10〜3月 9:00〜16:30（最終入場16:00）。12月8日・12月29日〜31日は休城。天守内部は2026年3月22日から長期閉鎖中（外観のみ見学可）。";
    d.transportOptions = {};
    d.officialWebsite = "https://www.rijo-castle.jp/rijo/";
  },
  "Shinjuku template notes removed; keep closure and real hours; fabricated train:205 removed",
);

patch(
  "shukkeien",
  (d) => {
    ((d.notes =
      "Edo-period strolling garden in Hiroshima City; admission ¥350 adult (from Apr 14, 2025), ¥150 university, free high school and under."),
      (d.businessHours =
        "09:00–18:00 (Mar 16–Sep 15); 09:00–17:00 (Sep 16–Mar 15); closed Dec 29–31."),
      (d.openingHoursJa =
        "3月16日〜9月15日 9:00〜18:00、9月16日〜3月15日 9:00〜17:00。12月29日〜31日は休園。"),
      (d.transportOptions = {}));
    d.budgetBreakdown = {
      transport: 1400,
      tickets: 350,
      food: 1400,
      cafe: 850,
    };
    d.budgetRecommended = 4000;
    d.imageMetadata = {
      source: "Wikimedia Commons",
      license: "Public domain",
      attribution: "Fg2, public domain, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Hiroshima_Shukkei-en_Pond.jpg",
    };
  },
  "Shinjuku template notes removed; real hours, fee, and image metadata added",
);

patch(
  "hiroshima-museum-art",
  (d) => {
    ((d.notes =
      "Opened 1978 in Hiroshima City; admission varies by exhibition (collection included). Closed Mondays."),
      (d.businessHours =
        "09:00–17:00, last entry 16:30; closed Mondays (open on holiday Mondays, closed following weekday) and New Year."),
      (d.openingHoursJa =
        "9:00〜17:00（入館は16:30まで）。休館日：毎週月曜日（月曜が祝日の場合は開館し翌平日休館）、年末年始。"),
      (d.transportOptions = {}));
  },
  "Shinjuku template notes removed; real hours and closure rule added",
);

patch(
  "mitaki-dera",
  (d) => {
    ((d.notes =
      "Historic temple in the mountains northwest of Hiroshima City; grounds generally open 08:00–17:00 with a ¥200 offering (third-party source; no official temple site exists)."),
      (d.businessHours =
        "Grounds open daily approx 08:00–17:00 (third-party source)."),
      (d.openingHoursJa =
        "境内は毎日おおむね8:00〜17:00まで拝観可能（公的な寺院サイトが存在しないため、第三者の情報による目安）。"),
      (d.transportOptions = {}));
    delete d.officialWebsite;
  },
  "Shinjuku template notes removed; dead official website removed; hours made conservative",
);

patch(
  "orizuru-tower",
  (d) => {
    ((d.notes =
      "Observation tower beside the Genbaku Dome in Hiroshima City; admission adult (18+) ¥2,200, 12–17 ¥1,400, 6–11 ¥900, 4–5 ¥600; orizuru wall ¥100 extra."),
      (d.businessHours = "10:00–18:00, last entry 17:30."),
      (d.openingHoursJa = "10:00〜18:00（最終入場17:30）。"),
      (d.transportOptions = {}));
    d.officialWebsite = "https://www.orizurutower.jp/";
    d.budgetBreakdown = { transport: 1400, tickets: 2200, food: 400, cafe: 0 };
    d.budgetRecommended = 4000;
  },
  "Shinjuku template notes removed; real hours, fee, and official website set",
);

patch(
  "okonomimura",
  (d) => {
    ((d.notes =
      "Multi-floor okonomiyaki food hall in Hiroshima City; each stall sets its own hours (most 11:00–22:00, some until late)."),
      (d.businessHours =
        "No building-wide hours; each stall sets its own (most 11:00–22:00, some to 01:00–02:00)."),
      (d.openingHoursJa =
        "ビル全体の定時はありません。各店舗ごとに異なり、多くは11:00〜22:00、深夜1:00〜2:00頃まで営業する店もあります。"),
      (d.transportOptions = {}));
    d.officialWebsite = "https://www.okonomimura.jp/";
  },
  "Shinjuku template notes removed; per-stall hours and official website set",
);

// --- Shimane corrections ---
patch(
  "izumo-taisha",
  (d) => {
    ((d.notes =
      "One of Japan's oldest and most important Shinto shrines; the main hall (rebuilt 1744) is a National Treasure. Deity: Okuninushi no Mikoto, god of enmusubi (relationships)."),
      (d.businessHours =
        "Precinct open 06:00–19:00 daily; area behind the Main Sanctuary closes at 16:30; Treasure Hall has separate hours."),
      (d.openingHoursJa =
        "境内は毎日6:00〜19:00まで参拝可。本殿背後は16:30まで。宝物殿は別時間（公式サイトで要確認）。"),
      (d.relationships = {
        ...(d.relationships ?? {}),
        nearbyDestinationIds: [],
      }));
    d.officialWebsite = "https://izumooyashiro.or.jp/";
    d.imageMetadata = {
      source: "Wikimedia Commons",
      license: "CC BY 2.5",
      attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Izumo-taisha14bs4592.jpg",
    };
  },
  "removed Iwate copy-paste notes and ryusendo-cave-iwate nearby link; corrected hours and website",
);

patch(
  "matsue-castle",
  (d) => {
    ((d.notes =
      "National Treasure keep, one of Japan's 12 surviving original wooden castle keeps (five of which are National Treasures, designated 2015); nicknamed Chidori-jo (Black Plover Castle). Adjacent to Horikawa moat and Shiomi Nawate samurai street."),
      (d.businessHours =
        "Apr 1–Sep 30: 08:30–18:00 (last entry 17:30); Oct 1–Mar 31: 08:30–17:00 (last entry 16:30). Open daily."),
      (d.openingHoursJa =
        "4月1日〜9月30日 8:30〜18:00（最終入場17:30）。10月1日〜3月31日 8:30〜17:00（最終入場16:30）。年中無休。"),
      (d.imageMetadata = {
        source: "Wikimedia Commons",
        license: "CC BY 2.5",
        attribution: "663highland, CC BY 2.5, via Wikimedia Commons",
        sourceUrl:
          "https://commons.wikimedia.org/wiki/File:080720_Matsue_Castle_Matsue_Shimane_pref_Japan01s.jpg",
      }));
  },
  "hub copy-paste notes replaced; hours corrected; image metadata added",
);

patch(
  "iwami-ginzan-shimane",
  (d) => {
    ((d.businessHours =
      "Ryugenji Mabu tunnel: 09:00–17:00 (Dec–Feb 09:00–16:00), last entry 10 min before close, closed Jan 1. World Heritage Center: 08:30–17:30 (exhibits 09:00–17:00, last 16:30), closed last Tue monthly + New Year."),
      (d.openingHoursJa =
        "龍源寺間歩：9:00〜17:00（12〜2月は9:00〜16:00）、最終入場は閉場10分前、1月1日休み。世界遺産センター：8:30〜17:30（展示は9:00〜17:00・最終16:30）、毎月最終火曜日と年末年始休館。"),
      (d.imageMetadata = {
        source: "Wikimedia Commons",
        license: "CC BY-SA 4.0",
        attribution: "Naokijp, CC BY-SA 4.0, via Wikimedia Commons",
        sourceUrl:
          "https://commons.wikimedia.org/wiki/File:Shimizudani_Refinery_Ruins_at_Iwami_Ginzan_Silver_Mine_001.jpg",
      }));
  },
  "image license corrected (CC BY-SA 4.0, Naokijp); hours split per facility",
);

// --- Tottori corrections ---
patch(
  "tottori-sand-dunes",
  (d) => {
    d.businessHours =
      "Open access (24 hours); the adjacent Sand Museum has its own hours (approx 09:00–17:00).";
    d.openingHoursJa =
      "砂丘自体は24時間・無料で開放。隣接する砂の美術館は別の開館時間（おおむね9:00〜17:00）。";
  },
  "misleading universal hours corrected to 24h open access",
);

// --- Yamaguchi corrections ---
patch(
  "kintai-bridge-yamaguchi",
  (d) => {
    ((d.businessHours =
      "Bridge passable 24 hours; toll booth 08:00–17:00 (extended 18:00 peak, 19:00 summer). Night lighting until 22:00."),
      (d.openingHoursJa =
        "橋は24時間通行可。渡橋料金所は8:00〜17:00（繁忙期は18:00、夏期は19:00まで延長）。ライトアップは22:00まで。"),
      (d.description =
        "An extraordinary five-arched wooden bridge built in 1673 (the current bridge is a 1953 reconstruction of the original design), spanning the Nishiki River in Iwakuni without using a single nail."));
  },
  "wrong universal hours corrected; 1953 reconstruction noted in description",
);

patch(
  "akiyoshido-cave-yamaguchi",
  (d) => {
    ((d.businessHours =
      "Regular season entry 09:00–16:30; Jul 1–Sep 30 09:00–17:30; GW & Obon dates 08:30–17:30. Open daily incl. year-end."),
      (d.openingHoursJa =
        "通常期は入場9:00〜16:30。7月1日〜9月30日は9:00〜17:30。GW・お盆期間は8:30〜17:30。年末年始も開洞。"),
      (d.description =
        "Japan's largest limestone cave, with over 10 km of surveyed passages (public course about 1 km) and soaring subterranean chambers, at the south edge of the Akiyoshidai karst plateau in Mine City."));
  },
  "wrong universal hours corrected; garbled passage claim fixed",
);

patch(
  "motonosumi-shrine-yamaguchi",
  (d) => {
    d.businessHours = "Shrine grounds open 24 hours, free of charge.";
    d.openingHoursJa = "神社境内は24時間・無料で参拝可能。";
  },
  "wrong universal hours corrected to 24h open access",
);

patch(
  "tsunoshima-bridge-yamaguchi",
  (d) => {
    d.businessHours = "Toll-free bridge open 24 hours.";
    d.openingHoursJa = "無料の橋で24時間通行可能。";
    d.officialWebsite = "https://shimonoseki.travel/about-en/";
  },
  "wrong website (Yamaguchi City) corrected to Shimonoseki tourism; 24h toll-free hours",
);

// --- Okayama corrections ---
patch(
  "korakuen-okayama",
  (d) => {
    d.heroImage =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/250505_Korakuen_Okayama_Japan06s3.jpg/1280px-250505_Korakuen_Okayama_Japan06s3.jpg";
    d.image = d.heroImage;
    d.imageMetadata = {
      source: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      attribution: "663highland, CC BY-SA 4.0, via Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:250505_Korakuen_Okayama_Japan06s3.jpg",
    };
    d.businessHours =
      "07:30–18:00 (Mar 20–Sep 30, last entry 17:45) / 08:00–17:00 (Oct 1–Mar 19, last entry 16:45); open every day of the year. Aug 1–23 summer night opening 07:30–21:30 (entry to 21:00).";
    d.openingHoursJa =
      "3月20日〜9月30日 7:30〜18:00（最終入園17:45）、10月1日〜3月19日 8:00〜17:00（最終入園16:45）。年中無休。8月1日〜23日は夜間開園 7:30〜21:30（入園21:00まで）。";
    d.notes =
      "Special Place of Scenic Beauty (designated 1952). Admission: adults (15–64) ¥500; 65+ ¥200; high-school students and under free until Mar 31, 2027. Combined Korakuen+Okayama Castle ¥800.";
  },
  "3840px hero normalized to 1280px; image metadata, summer night hours, and admission notes added",
);

// --- Municipal hub nameJa additions ---
const HUB_NAME_JA: Record<string, string> = {
  "kurashiki-city": "倉敷市",
  "takahashi-city": "高梁市",
  "hiroshima-city": "広島市",
  "hatsukaichi-city": "廿日市市",
  "onomichi-city": "尾道市",
  "matsue-city": "松江市",
  "izumo-city": "出雲市",
  "tottori-city": "鳥取市",
  "iwakuni-city": "岩国市",
  "mine-city": "美祢市",
  "shimonoseki-city": "下関市",
};
for (const [hubId, nameJa] of Object.entries(HUB_NAME_JA)) {
  patch(
    hubId,
    (d) => {
      d.nameJa = nameJa;
    },
    `nameJa set to ${nameJa}`,
  );
}

// --- Hub featured lists: only same-municipality children ---
const HUB_FEATURED: Record<string, string[]> = {
  "okayama-city": [
    "korakuen-okayama",
    "okayama-castle",
    "kibitsu-shrine",
    "hayashibara-museum-of-art",
    "orient-museum",
  ],
  "kurashiki-city": [
    "ohara-museum-of-art",
    "bikan-historical-quarter",
    "kojima-denim-street",
    "kurashiki-museum-of-folkcraft",
  ],
  "takahashi-city": [
    "bitchu-matsuyama-castle",
    "raikyuji-temple",
    "fukiya-village",
  ],
  "hiroshima-city": [
    "hiroshima-peace-memorial",
    "genbaku-dome",
    "hiroshima-peace-memorial-park",
    "hiroshima-national-peace-memorial-hall",
    "hiroshima-castle",
    "shukkeien",
    "hiroshima-museum-art",
    "mitaki-dera",
    "orizuru-tower",
    "okonomimura",
    "hondori",
  ],
  "hatsukaichi-city": [
    "miyajima-itsukushima",
    "miyajima-omotesando",
    "daisho-in",
    "miyajima-gojunoto",
    "senjokaku",
    "momijidani-park",
  ],
  "matsue-city": [
    "matsue-castle",
    "matsue-vogel-park",
    "lafcadio-hearn-memorial-museum",
    "horikawa-pleasure-boat",
    "tanabe-museum-matsue",
    "gessho-ji-temple-matsue",
  ],
  "izumo-city": [
    "izumo-taisha",
    "inasa-beach-izumo",
    "hinomisaki-lighthouse-izumo",
  ],
  "tottori-city": ["tottori-sand-dunes"],
  "iwakuni-city": ["kintai-bridge-yamaguchi", "iwakuni-castle"],
  "mine-city": ["akiyoshido-cave-yamaguchi", "akiyoshidai-plateau"],
  "shimonoseki-city": [
    "karato-market-shimonoseki",
    "tsunoshima-bridge-yamaguchi",
  ],
};
for (const [hubId, featured] of Object.entries(HUB_FEATURED)) {
  patch(
    hubId,
    (d) => {
      d.relationships = {
        ...(d.relationships ?? {}),
        featuredDestinationIds: featured,
      };
    },
    `featured list set to ${featured.length} same-municipality children`,
  );
}

// Prettier-format the index exactly like scripts/catalog/generate-outputs.ts
// formats the generated outputs, so a second run produces byte-identical
// output and the migration passes `format:check`.
async function formatIndex(content: string): Promise<string> {
  const config = (await resolveConfig(process.cwd())) ?? {};
  return format(content, { ...config, parser: "json" });
}

fs.writeFileSync(
  INDEX_PATH,
  await formatIndex(JSON.stringify(index, null, 2) + "\n"),
);
console.log(
  `KAI-32: added ${added} records, corrected ${modified} existing records.`,
);
