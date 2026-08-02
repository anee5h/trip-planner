import fs from "fs";
import path from "path";
import { KANTO_TRANSLATION_MAP } from "./kanto-translation-dictionary";
import type { Destination } from "../src/shared/types/destination";

const KANTO_PREFECTURES = new Set([
  "Tokyo",
  "Kanagawa",
  "Chiba",
  "Saitama",
  "Ibaraki",
  "Tochigi",
  "Gunma",
]);

const INDEX_PATH = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const DETAILS_DIR = path.join(process.cwd(), "public/data/destinations");

const KNOWN_KANTO_NAME_MAP: Record<string, string> = {
  "Tokyo Disneyland": "東京ディズニーランド",
  DisneySea: "東京ディズニーシー",
  "Tokyo DisneySea": "東京ディズニーシー",
  Enoshima: "江の島",
  Ginza: "銀座",
  Roppongi: "六本木",
  Odaiba: "お台場",
  Harajuku: "原宿",
  Omotesando: "表参道",
  Daikanyama: "代官山",
  Nakameguro: "中目黒",
  Nokogiriyama: "鋸山",
  "Chiba Port Tower": "千葉ポートタワー",
  Sawara: "佐原（小江戸）",
  "Yoro Valley": "養老渓谷",
  Chofu: "調布市",
  Choshi: "銚子",
  Shibamata: "柴又",
  Kagurazaka: "神楽坂",
  Tsukiji: "築地",
  Toyosu: "豊洲",
  Ueno: "上野",
  Asakusa: "浅草",
  Akihabara: "秋葉原",
  "Roppongi Hills": "六本木ヒルズ",
  "Tokyo Midtown": "東京ミッドタウン",
  "Tokyo Tower": "東京タワー",
  "Tokyo Skytree": "東京スカイツリー",
  "Rainbow Bridge": "レインボーブリッジ",
  Kabukicho: "歌舞伎町",
  "Golden Gai": "ゴールデン街",
  "Omoide Yokocho": "思い出横丁",
  "Takeshita Street": "竹下通り",
  "Meiji Jingu": "明治神宮",
  "Senso-ji": "浅草寺",
  "Gotoku-ji": "豪徳寺",
  "Zojo-ji": "増上寺",
  "Kanda Myojin": "神田明神",
  "Nezu Shrine": "根津神社",
  "Yushima Tenmangu": "湯島天満宮",
  "Yasukuni Shrine": "靖国神社",
  "Mount Takao": "高尾山",
  "Mitake Mountain": "御岳山",
  Okutama: "奥多摩",
  "Sanrio Puroland": "サンリオピューロランド",
  Yomiuriland: "よみうりランド",
  "Ghibli Museum": "三鷹の森ジブリ美術館",
  "Edo-Tokyo Open Air Architectural Museum": "江戸東京たてもの園",
  "Minato Mirai": "みなとみらい",
  "Yamashita Park": "山下公園",
  "Yokohama Chinatown": "横浜中華街",
  "Sankeien Garden": "三溪園",
  "Shin-Yokohama Ramen Museum": "新横浜ラーメン博物館",
  "Yokohama Red Brick Warehouse": "横浜赤レンガ倉庫",
  "Yokohama Landmark Tower": "横浜ランドマークタワー",
  "Cup Noodles Museum Yokohama": "カップヌードルミュージアム 横浜",
  "Hakkeijima Sea Paradise": "横浜・八景島シーパラダイス",
  "Kamakura Great Buddha": "鎌倉大仏（高徳院）",
  "Tsurugaoka Hachimangu": "鶴岡八幡宮",
  "Hasedera Temple": "長谷寺",
  "Kencho-ji": "建長寺",
  "Engaku-ji": "円覚寺",
  "Enoshima Shrine": "江島神社",
  "Enoshima Sea Candle": "江の島シーキャンドル",
  "Hakone Shrine": "箱根神社",
  "Lake Ashi": "芦ノ湖",
  Owakudani: "大涌谷",
  "Hakone Open-Air Museum": "箱根彫刻の森美術館",
  "Naritasan Shinshoji Temple": "成田山新勝寺",
  "Kamogawa Sea World": "鴨川シーワールド",
  "Mother Farm": "マザー牧場",
  "Mother Farm Chiba": "マザー牧場",
  "Katori Shrine": "香取神宮",
  "Inubosaki Lighthouse": "犬吠埼灯台",
  Byobugaura: "屏風ヶ浦",
  "Railway Museum": "鉄道博物館",
  "Omiya Bonsai Village": "大宮盆栽村",
  "Musashi Ichinomiya Hikawa Shrine": "武蔵一宮氷川神社",
  "Chichibu Shrine": "秩父神社",
  "Nagatoro River Rafting": "長瀞ラインくだり",
  Nagatoro: "長瀞",
  "Hitsujiyama Park": "羊山公園（芝桜の丘）",
  "Kadokawa Musashino Museum": "角川武蔵野ミュージアム",
  "Kairakuen Garden": "偕楽園",
  "Hitachi Seaside Park": "国営ひたち海浜公園",
  "Mount Tsukuba": "筑波山",
  "Oarai Isosaki Shrine": "大洗磯前神社",
  "Fukuroda Falls": "袋田の滝",
  "Ushiku Daibutsu": "牛久大仏",
  "Nikko Toshogu Shrine": "日光東照宮",
  "Kegon Falls": "華厳の滝",
  "Lake Chuzenji": "中禅寺湖",
  "Ashikaga Flower Park": "足利フラワーパーク",
  "Nasu Highlands": "那須高原",
  "Kinugawa Onsen": "鬼怒川温泉",
  "Kusatsu Onsen": "草津温泉",
  "Ikaho Onsen": "伊香保温泉",
  "Tomioka Silk Mill": "富岡製糸場",
  "Mount Akagi": "赤城山",
  "Minakami Onsen": "水上温泉",
  "Fukiware Falls": "吹割の滝",
  "Shima Onsen": "四万温泉",
  "Hachioji Castle Ruins": "八王子城跡",
  Hachioji: "八王子市",
  "Harry Potter Studio":
    "ワーナー ブラザース スタジオツアー東京 - ハリー・ポッター",
  Ikebukuro: "池袋",
  "Imperial Palace": "皇居",
  "Miura Peninsula & Jogashima": "城ヶ島と三浦半島",
  "Joypolis Odaiba": "東京ジョイポリス（お台場）",
  "Kawagoe Castle Honmaru Goten": "川越城本丸御殿",
  "Lake Sagami": "相模湖",
  "Mito Castle Ruins & Kodokan": "水戸城跡と弘道館",
  "Oarai Marine Tower": "大洗マリンタワー",
  "Sakura Castle Park & Ruins": "佐倉城址公園",
  "Seibuen Amusement Park": "西武園ゆうえんち",
  "Tokyo Dome City": "東京ドームシティ",
  "Tsukuba Space Center": "JAXA筑波宇宙センター",
  "Yokohama Port Opening Memorial Hall": "横浜市開港記念会館",
  "Yugawara Onsen": "湯河原温泉",
};

const PHRASE_TRANSLATION_RULES: [RegExp, string][] = [
  [/Jigoku Nozoki \(Hell Peek\)/gi, "地獄のぞき"],
  [/Nihon-ji Great Buddha/gi, "日本寺大仏"],
  [/Nokogiriyama Ropeway/gi, "鋸山ロープウェー"],
  [/Hyaku-shaku Kannon/gi, "百尺観音"],
  [/125m Mirror Glass Facade/gi, "125mハーフミラーガラスの壁面"],
  [/Tokyo Bay Sunset Panorama/gi, "東京湾の夕景パノラマ"],
  [/Lover's Sanctuary Promenade/gi, "恋人の聖地プロムナード"],
  [/Chiba Port 公園 Beach/gi, "千葉ポートパークビーチ"],
  [/Ono River Historic District/gi, "小野川沿いの歴史的建造物群"],
  [/Toyohashi Ja-Ja Bridge/gi, "樋橋（ジャージャー橋）"],
  [/Ino Tadataka 美術館/gi, "伊能忠敬記念館"],
  [/Sawara Canal Boat Tour/gi, "小野川観光船（サッパ舟）"],
  [/Awamata Falls/gi, "粟又の滝"],
  [/Yoro River Trail/gi, "養老川遊歩道"],
  [/Kannon Bridge/gi, "観音橋"],
  [/Yoro Gorge Onsen/gi, "養老渓谷温泉"],
  [/Inubosaki Lighthouse/gi, "犬吠埼灯台"],
  [/Choshi Electric Railway/gi, "銚子電鉄"],
  [/Byobugaura Cliffs/gi, "屏風ヶ浦の断崖絶壁"],
  [/Jindaiji 寺院/gi, "深大寺"],
  [/Jindai Botanical 庭園s/gi, "神代植物公園"],
  [/Kitaro Chaya Soba/gi, "鬼太郎茶屋の蕎麦"],
  [/Harry Potter Studio/gi, "スタジオツアー東京"],
  [/Shima Onsen/gi, "四万温泉のレトロな街並み"],
  [/Hachioji Castle Ruins/gi, "八王子城跡の石垣と本丸"],
  [/599美術館/gi, "TAKAO 599 MUSEUM"],
  [/Miura Peninsula & Jogashima/gi, "城ヶ島と三浦半島の海岸美"],
  [/Joypolis Odaiba/gi, "東京ジョイポリス"],
  [/Kawagoe Castle Honmaru Goten/gi, "川越城本丸御殿の家老詰所"],
  [/Mito Castle Ruins & Kodokan/gi, "水戸城大手門と弘道館"],
  [/Oarai Marine Tower/gi, "大洗マリンタワー"],
  [/Sakura Castle Park & Ruins/gi, "佐倉城址公園と国立歴史民俗博物館"],
  [/Explore /gi, ""],
  [/ City/gi, "市"],
  [/ Ward/gi, "区"],
  [/ Town/gi, "町"],
  [/ Park/gi, "公園"],
  [/ Station/gi, "駅"],
  [/ Museum/gi, "美術館"],
  [/ Shrine/gi, "神社"],
  [/ Temple/gi, "寺"],
  [/ Castle/gi, "城"],
  [/ Market/gi, "市場"],
  [/ Garden/gi, "庭園"],
  [/ Coastal scenery/gi, "海岸線の絶景"],
  [/ Inubohsaki/gi, "犬吠埼の景観"],
  [/ Local Culture & Cuisine/gi, "地元の食文化"],
];

function translateJaHighlightFull(text: string, placeNameJa: string): string {
  if (!text) return `${placeNameJa}散策`;
  let result = text.trim();

  for (const [regex, replacement] of PHRASE_TRANSLATION_RULES) {
    result = result.replace(regex, replacement);
  }

  // Remove leftover English words if any
  if (/[a-zA-Z]{3,}/.test(result)) {
    result = result
      .replace(/[a-zA-Z]{3,}/g, "")
      .replace(/\(\s*\)/g, "")
      .trim();
    if (!result || result === "散策") result = `${placeNameJa}の名所`;
    else if (
      !result.includes("散策") &&
      !result.includes("名所") &&
      !result.includes("景観")
    ) {
      result += "散策";
    }
  }

  return result;
}

function getCleanJaName(name: string, nameJa: string, pref: string): string {
  if (KNOWN_KANTO_NAME_MAP[name]) return KNOWN_KANTO_NAME_MAP[name];

  let cleaned = name
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s+City$/i, "市")
    .replace(/\s+Ward$/i, "区")
    .replace(/\s+Town$/i, "町")
    .replace(/\s+Village$/i, "村")
    .replace(/\s+Park$/i, "公園")
    .replace(/\s+Station$/i, "駅")
    .replace(/\s+Museum$/i, "美術館")
    .replace(/\s+Shrine$/i, "神社")
    .replace(/\s+Temple$/i, "寺")
    .replace(/\s+Castle$/i, "城")
    .replace(/\s+Market$/i, "市場");

  if (KNOWN_KANTO_NAME_MAP[cleaned]) return KNOWN_KANTO_NAME_MAP[cleaned];

  if (nameJa && !/[a-zA-Z]{3,}/.test(nameJa)) return nameJa;

  return cleaned;
}

function generateSpecificJaDescription(d: Destination, nameJa: string): string {
  const prefJaMap: Record<string, string> = {
    Tokyo: "東京都",
    Kanagawa: "神奈川県",
    Chiba: "千葉県",
    Saitama: "埼玉県",
    Ibaraki: "茨城県",
    Tochigi: "栃木県",
    Gunma: "群馬県",
  };
  const prefJa = prefJaMap[d.prefecture] || d.prefecture;

  if (d.categories.includes("Shopping") || d.kind === "shopping") {
    return `${nameJa}は${prefJa}を代表する人気のショッピング＆散策エリアです。個性豊かなショップ、カフェ、ご当地グルメが集まり、歩くだけで楽しめる活気に満ちています。`;
  }
  if (
    d.categories.includes("Nature") ||
    d.kind === "nature" ||
    d.kind === "park"
  ) {
    return `${nameJa}は${prefJa}の恵まれた自然と素晴らしい景観を楽しめる観光地です。四季折々の花々や静かな散策路が整い、心身ともにリフレッシュできる休日を過ごせます。`;
  }
  if (
    d.categories.includes("History") ||
    d.kind === "temple" ||
    d.kind === "shrine" ||
    d.kind === "castle"
  ) {
    return `${nameJa}は${prefJa}の歴史と伝統文化を象徴する名所です。由緒ある建築と趣豊かな境内に漂う静寂が、多くの参拝者や旅行者を惹きつけます。`;
  }
  if (
    d.categories.includes("Museum") ||
    d.kind === "museum" ||
    d.kind === "gallery"
  ) {
    return `${nameJa}は${prefJa}にある注目の文化・アート発信地です。洗練された展示空間と知的好奇心を刺激するコレクションを通じて、特別な体験を提供します。`;
  }
  if (d.categories.includes("Onsen") || d.kind === "onsen") {
    return `${nameJa}は${prefJa}が誇る伝統の温泉地です。上質な源泉と情緒溢れる温泉街の街歩き、地元の美味しい食事が旅の至福のひとときを演出します。`;
  }

  return `${nameJa}は${prefJa}にある魅力的な観光スポットです。固有のランドマークと豊かな見どころが揃い、充実した旅行プランを華やかに彩ります。`;
}

export function executeKantoBilingualEnrichment(dryRun = false) {
  const destinations: Destination[] = JSON.parse(
    fs.readFileSync(INDEX_PATH, "utf-8"),
  );
  let updatedCount = 0;

  for (const d of destinations) {
    const isKanto = d.region === "Kanto" || KANTO_PREFECTURES.has(d.prefecture);

    if (!isKanto) continue;

    let modified = false;

    // Check explicit dictionary entry
    const dictEntry = KANTO_TRANSLATION_MAP[d.id];

    if (dictEntry) {
      d.nameJa = dictEntry.nameJa;
      d.description = dictEntry.enDescription;
      d.highlights = dictEntry.enHighlights;
      d.content = {
        en: {
          name: d.name,
          description: dictEntry.enDescription,
          highlights: dictEntry.enHighlights,
        },
        ja: {
          name: dictEntry.nameJa,
          description: dictEntry.jaDescription,
          highlights: dictEntry.jaHighlights,
        },
      };
      modified = true;
    } else {
      const cleanJaName = getCleanJaName(d.name, d.nameJa, d.prefecture);
      if (d.nameJa !== cleanJaName) {
        d.nameJa = cleanJaName;
        modified = true;
      }

      const jaHighlights = (d.highlights || []).map((h) =>
        translateJaHighlightFull(h, cleanJaName),
      );
      const jaDesc = generateSpecificJaDescription(d, cleanJaName);

      d.content = {
        en: d.content?.en || {
          name: d.name,
          description: d.description,
          highlights: d.highlights || [],
        },
        ja: {
          name: cleanJaName,
          description:
            d.content?.ja?.description &&
            !d.content.ja.description.includes("主要な観光スポットです")
              ? d.content.ja.description
              : jaDesc,
          highlights: jaHighlights,
        },
      };
      modified = true;
    }

    if (modified) {
      updatedCount++;
    }
  }

  if (!dryRun) {
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(destinations, null, 2)}\n`);

    // Sync index to detail JSON files
    fs.mkdirSync(DETAILS_DIR, { recursive: true });
    for (const data of destinations) {
      const detailPath = path.join(DETAILS_DIR, `${data.id}.json`);
      fs.writeFileSync(detailPath, `${JSON.stringify(data, null, 2)}\n`);
    }
  }

  console.log(
    `Kanto Complete Bilingual Enrichment: ${updatedCount} / ${destinations.length} destination records processed (${dryRun ? "DRY RUN" : "UPDATED INDEX AND DETAILS"}).`,
  );
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("translate-kanto-bilingual.ts")
) {
  const isDryRun = process.argv.includes("--dry-run");
  executeKantoBilingualEnrichment(isDryRun);
}
