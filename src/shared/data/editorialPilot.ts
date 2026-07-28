import type {
  LocalizedPlaceContent,
  SourceReference,
} from "../types/destination";

export const EDITORIAL_PILOT_IDS = [
  "sapporo-city",
  "hakodate-city",
  "sendai-city",
  "chiyoda-city",
  "yokohama-city",
  "hakone-town",
  "nikko-city",
  "nagoya-city",
  "matsumoto-city",
  "kyoto-city",
  "osaka-city",
  "kobe-city",
  "nara-city",
  "hiroshima-city",
  "takamatsu-city",
  "fukuoka-city",
  "nagasaki-city",
  "kumamoto-city",
  "kagoshima-city",
  "naha-city",
] as const;

type PilotRecord = { ja: LocalizedPlaceContent; source: SourceReference };

const reviewedAt = "2026-07-28";
const wikipedia = (title: string): SourceReference => ({
  type: "wikipedia",
  title: `${title} — Wikipedia`,
  url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  accessedAt: reviewedAt,
});

export const EDITORIAL_PILOT: Record<string, PilotRecord> = {
  "sapporo-city": {
    ja: {
      name: "札幌",
      description: "北海道の中心都市。食、雪まつり、都市観光の拠点です。",
      highlights: ["大通公園", "札幌グルメ"],
    },
    source: wikipedia("Sapporo"),
  },
  "hakodate-city": {
    ja: {
      name: "函館",
      description: "歴史的な港町で、夜景と新鮮な海産物で知られます。",
      highlights: ["函館山の夜景", "朝市"],
    },
    source: wikipedia("Hakodate"),
  },
  "sendai-city": {
    ja: {
      name: "仙台",
      description: "杜の都として親しまれる東北の主要都市です。",
      highlights: ["仙台城跡", "牛たん"],
    },
    source: wikipedia("Sendai"),
  },
  "chiyoda-city": {
    ja: {
      name: "千代田",
      description: "皇居、東京駅、秋葉原を含む東京の中心エリアです。",
      highlights: ["皇居", "東京駅"],
    },
    source: wikipedia("Chiyoda, Tokyo"),
  },
  "yokohama-city": {
    ja: {
      name: "横浜",
      description: "港、異国情緒、文化施設が集まる首都圏の大都市です。",
      highlights: ["みなとみらい", "中華街"],
    },
    source: wikipedia("Yokohama"),
  },
  "hakone-town": {
    ja: {
      name: "箱根",
      description: "温泉、芦ノ湖、富士山の眺めを楽しめる代表的な保養地です。",
      highlights: ["温泉", "芦ノ湖"],
    },
    source: wikipedia("Hakone"),
  },
  "nikko-city": {
    ja: {
      name: "日光",
      description: "世界遺産の社寺と豊かな山岳景観で知られる歴史都市です。",
      highlights: ["日光東照宮", "華厳滝"],
    },
    source: wikipedia("Nikko"),
  },
  "nagoya-city": {
    ja: {
      name: "名古屋",
      description: "城、ものづくり文化、独自の食文化を持つ中部の大都市です。",
      highlights: ["名古屋城", "なごやめし"],
    },
    source: wikipedia("Nagoya"),
  },
  "matsumoto-city": {
    ja: {
      name: "松本",
      description: "国宝松本城と北アルプスへの玄関口として知られる城下町です。",
      highlights: ["松本城", "城下町"],
    },
    source: wikipedia("Matsumoto"),
  },
  "kyoto-city": {
    ja: {
      name: "京都",
      description: "寺社、伝統文化、四季の景観が集まる日本有数の歴史都市です。",
      highlights: ["寺社巡り", "伝統文化"],
    },
    source: wikipedia("Kyoto"),
  },
  "osaka-city": {
    ja: {
      name: "大阪",
      description:
        "食、エンターテインメント、商業文化が魅力の関西最大の都市です。",
      highlights: ["大阪城", "食文化"],
    },
    source: wikipedia("Osaka"),
  },
  "kobe-city": {
    ja: {
      name: "神戸",
      description: "港町の景観、異人館、山と海に近い都市文化を楽しめます。",
      highlights: ["港", "神戸牛"],
    },
    source: wikipedia("Kobe"),
  },
  "nara-city": {
    ja: {
      name: "奈良",
      description: "古都の寺社、鹿、世界遺産が残る日本史の中心地です。",
      highlights: ["東大寺", "奈良公園"],
    },
    source: wikipedia("Nara, Nara"),
  },
  "hiroshima-city": {
    ja: {
      name: "広島",
      description: "平和の歴史と瀬戸内の食文化を学べる中国地方の中心都市です。",
      highlights: ["平和記念公園", "広島焼き"],
    },
    source: wikipedia("Hiroshima"),
  },
  "takamatsu-city": {
    ja: {
      name: "高松",
      description: "瀬戸内海の島々と讃岐うどんへの玄関口です。",
      highlights: ["栗林公園", "讃岐うどん"],
    },
    source: wikipedia("Takamatsu"),
  },
  "fukuoka-city": {
    ja: {
      name: "福岡",
      description: "屋台、海辺、九州各地への交通の良さが魅力の都市です。",
      highlights: ["屋台", "博多文化"],
    },
    source: wikipedia("Fukuoka"),
  },
  "nagasaki-city": {
    ja: {
      name: "長崎",
      description: "国際交流の歴史、坂の街並み、港の景観が特徴です。",
      highlights: ["平和公園", "港町"],
    },
    source: wikipedia("Nagasaki"),
  },
  "kumamoto-city": {
    ja: {
      name: "熊本",
      description: "熊本城と豊かな地下水文化を持つ九州の城下町です。",
      highlights: ["熊本城", "地下水"],
    },
    source: wikipedia("Kumamoto"),
  },
  "kagoshima-city": {
    ja: {
      name: "鹿児島",
      description: "桜島を望む南九州の都市で、温泉と食文化が魅力です。",
      highlights: ["桜島", "温泉"],
    },
    source: wikipedia("Kagoshima"),
  },
  "naha-city": {
    ja: {
      name: "那覇",
      description: "沖縄の文化、食、離島観光の玄関口となる県都です。",
      highlights: ["国際通り", "琉球文化"],
    },
    source: wikipedia("Naha"),
  },
};
