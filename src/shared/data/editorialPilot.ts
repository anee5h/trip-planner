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
      description:
        "北海道の政治・経済・観光の中心都市です。大通公園を軸に、近代建築、雪のイベント、海産物やラーメンなどの食文化を楽しめます。",
      highlights: [
        "大通公園と札幌市時計台",
        "さっぽろ雪まつり（冬）",
        "味噌ラーメンと海鮮",
      ],
    },
    source: wikipedia("Sapporo"),
  },
  "hakodate-city": {
    ja: {
      name: "函館",
      description:
        "開港の歴史を伝える港町です。異国情緒のある元町、函館山からの夜景、朝市の海産物まで、徒歩と市電で巡りやすい街です。",
      highlights: ["函館山からの夜景", "元町・ベイエリア", "函館朝市"],
    },
    source: wikipedia("Hakodate"),
  },
  "sendai-city": {
    ja: {
      name: "仙台",
      description:
        "並木と広瀬川に囲まれた東北最大級の都市で、「杜の都」として親しまれています。伊達政宗ゆかりの史跡と、牛たんをはじめとする食文化が魅力です。",
      highlights: ["仙台城跡", "定禅寺通", "牛たん"],
    },
    source: wikipedia("Sendai"),
  },
  "chiyoda-city": {
    ja: {
      name: "千代田",
      description:
        "皇居、東京駅、秋葉原などを含む東京の中枢エリアです。歴史的な官庁街と鉄道の玄関口、ポップカルチャーの街を一日で横断できます。",
      highlights: ["皇居東御苑", "東京駅・丸の内", "秋葉原"],
    },
    source: wikipedia("Chiyoda, Tokyo"),
  },
  "yokohama-city": {
    ja: {
      name: "横浜",
      description:
        "港を起点に発展した国際色豊かな都市です。みなとみらいの海辺の景観、山下公園、中華街など、開港の歴史と現代の街並みが共存します。",
      highlights: ["みなとみらい", "横浜中華街", "山下公園"],
    },
    source: wikipedia("Yokohama"),
  },
  "hakone-town": {
    ja: {
      name: "箱根",
      description:
        "温泉、芦ノ湖、火山地形が織りなす山の保養地です。美術館や旧街道もあり、天候がよければ湖畔や高台から富士山を望めます。",
      highlights: ["芦ノ湖", "温泉", "大涌谷"],
    },
    source: wikipedia("Hakone"),
  },
  "nikko-city": {
    ja: {
      name: "日光",
      description:
        "徳川家康をまつる日光東照宮をはじめとする世界遺産の社寺と、奥日光の自然を併せて訪ねられる都市です。季節ごとに滝、湖、紅葉の景観が変わります。",
      highlights: ["日光東照宮", "華厳滝", "中禅寺湖"],
    },
    source: wikipedia("Nikko"),
  },
  "nagoya-city": {
    ja: {
      name: "名古屋",
      description:
        "中部地方の交通・産業の中心都市です。名古屋城をはじめとする歴史資産と、ものづくりの文化、味噌かつやひつまぶしなどの食が旅の軸になります。",
      highlights: ["名古屋城", "熱田神宮", "なごやめし"],
    },
    source: wikipedia("Nagoya"),
  },
  "matsumoto-city": {
    ja: {
      name: "松本",
      description:
        "国宝松本城を中心に城下町の面影を残す高原都市です。美術館や湧水のある街歩きと、北アルプス方面への旅を組み合わせやすい拠点です。",
      highlights: ["国宝松本城", "中町通り", "北アルプスへの玄関口"],
    },
    source: wikipedia("Matsumoto"),
  },
  "kyoto-city": {
    ja: {
      name: "京都",
      description:
        "千年以上にわたり都として栄えた歴史都市です。寺社、庭園、町家、食文化が市内各地に残り、季節ごとに異なる表情を見せます。",
      highlights: ["清水寺・金閣寺", "祇園と町家", "嵐山"],
    },
    source: wikipedia("Kyoto"),
  },
  "osaka-city": {
    ja: {
      name: "大阪",
      description:
        "商人の街として育った関西最大の都市です。大阪城、道頓堀、梅田などに歴史・娯楽・商業が集まり、粉ものから市場の食まで気軽に楽しめます。",
      highlights: ["大阪城", "道頓堀", "大阪の食文化"],
    },
    source: wikipedia("Osaka"),
  },
  "kobe-city": {
    ja: {
      name: "神戸",
      description:
        "山と海に挟まれた港町で、開港以来の国際的な文化を受け継いでいます。異人館、港の夜景、洋食や神戸牛などを組み合わせて楽しめます。",
      highlights: ["北野異人館街", "神戸港", "神戸牛"],
    },
    source: wikipedia("Kobe"),
  },
  "nara-city": {
    ja: {
      name: "奈良",
      description:
        "古代日本の都として栄えた歴史都市です。奈良公園を中心に、東大寺や春日大社などの世界遺産と、鹿がいる広い緑地を歩いて巡れます。",
      highlights: ["東大寺", "奈良公園", "春日大社"],
    },
    source: wikipedia("Nara, Nara"),
  },
  "hiroshima-city": {
    ja: {
      name: "広島",
      description:
        "平和記念公園と原爆ドームを通じて平和の歴史を学べる中国地方の中心都市です。川辺の街並み、現代美術、牡蠣やお好み焼きも旅の魅力です。",
      highlights: ["平和記念公園", "原爆ドーム", "広島お好み焼き"],
    },
    source: wikipedia("Hiroshima"),
  },
  "takamatsu-city": {
    ja: {
      name: "高松",
      description:
        "瀬戸内海に面する香川の県都で、島々への船旅と市内観光の拠点です。大名庭園の栗林公園と、讃岐うどんの店巡りを楽しめます。",
      highlights: ["栗林公園", "高松港", "讃岐うどん"],
    },
    source: wikipedia("Takamatsu"),
  },
  "fukuoka-city": {
    ja: {
      name: "福岡",
      description:
        "九州の交通・商業の中心都市です。博多の歴史、屋台文化、海辺の再開発エリアが近く、九州各地へ向かう起点としても便利です。",
      highlights: ["博多旧市街", "屋台", "シーサイドももち"],
    },
    source: wikipedia("Fukuoka"),
  },
  "nagasaki-city": {
    ja: {
      name: "長崎",
      description:
        "海外との交流で育まれた独自の文化が残る港町です。坂道の景観、出島や教会群、平和を伝える場所を通して、多層的な歴史に触れられます。",
      highlights: ["出島", "平和公園", "グラバー園"],
    },
    source: wikipedia("Nagasaki"),
  },
  "kumamoto-city": {
    ja: {
      name: "熊本",
      description:
        "熊本城を中心に発展した九州の城下町です。湧水に支えられた暮らしと商店街、阿蘇方面へ向かう交通の利便性が旅の特徴です。",
      highlights: ["熊本城", "水前寺成趣園", "地下水文化"],
    },
    source: wikipedia("Kumamoto"),
  },
  "kagoshima-city": {
    ja: {
      name: "鹿児島",
      description:
        "錦江湾越しに桜島を望む南九州の都市です。市電で巡る市街地、温泉、火山と海の景観、黒豚や焼酎などの食文化を楽しめます。",
      highlights: ["桜島の眺望", "城山公園", "黒豚と焼酎"],
    },
    source: wikipedia("Kagoshima"),
  },
  "naha-city": {
    ja: {
      name: "那覇",
      description:
        "沖縄県の県都で、琉球王国の歴史と現代の商業が交わる都市です。首里エリア、国際通り、市場を巡りながら、島の食と文化に触れられます。",
      highlights: ["首里城公園", "国際通り", "第一牧志公設市場"],
    },
    source: wikipedia("Naha"),
  },
};
