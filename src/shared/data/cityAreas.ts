export interface CityArea {
  id: string;
  parentDestinationId: string;
  name: { en: string; ja: string };
}

export const CITY_AREAS: readonly CityArea[] = [
  {
    id: "omiya",
    parentDestinationId: "saitama-city",
    name: { en: "Omiya", ja: "大宮" },
  },
  {
    id: "urawa",
    parentDestinationId: "saitama-city",
    name: { en: "Urawa", ja: "浦和" },
  },
  {
    id: "saitama-shintoshin",
    parentDestinationId: "saitama-city",
    name: { en: "Saitama-Shintoshin", ja: "さいたま新都心" },
  },
  {
    id: "iwatsuki",
    parentDestinationId: "saitama-city",
    name: { en: "Iwatsuki", ja: "岩槻" },
  },
  {
    id: "central-kawasaki",
    parentDestinationId: "kawasaki-city",
    name: { en: "Central Kawasaki", ja: "川崎駅周辺" },
  },
  {
    id: "ikuta",
    parentDestinationId: "kawasaki-city",
    name: { en: "Ikuta", ja: "生田" },
  },
  {
    id: "todoroki",
    parentDestinationId: "kawasaki-city",
    name: { en: "Todoroki", ja: "等々力" },
  },
  {
    id: "central-chiba",
    parentDestinationId: "chiba-city",
    name: { en: "Central Chiba", ja: "千葉中心部" },
  },
  {
    id: "chiba-port",
    parentDestinationId: "chiba-city",
    name: { en: "Chiba Port", ja: "千葉港" },
  },
  {
    id: "kaihin-makuhari",
    parentDestinationId: "chiba-city",
    name: { en: "Kaihin-Makuhari", ja: "海浜幕張" },
  },
  {
    id: "inage",
    parentDestinationId: "chiba-city",
    name: { en: "Inage", ja: "稲毛" },
  },
  {
    id: "central-kamakura",
    parentDestinationId: "kamakura-city",
    name: { en: "Central Kamakura", ja: "鎌倉中心部" },
  },
  {
    id: "hase",
    parentDestinationId: "kamakura-city",
    name: { en: "Hase", ja: "長谷" },
  },
  {
    id: "kita-kamakura",
    parentDestinationId: "kamakura-city",
    name: { en: "Kita-Kamakura", ja: "北鎌倉" },
  },
  {
    id: "shonan-coast",
    parentDestinationId: "kamakura-city",
    name: { en: "Shonan Coast", ja: "湘南海岸" },
  },
  {
    id: "enoshima",
    parentDestinationId: "fujisawa-city",
    name: { en: "Enoshima", ja: "江の島" },
  },
  {
    id: "katase",
    parentDestinationId: "fujisawa-city",
    name: { en: "Katase", ja: "片瀬" },
  },
  {
    id: "tsujido",
    parentDestinationId: "fujisawa-city",
    name: { en: "Tsujido", ja: "辻堂" },
  },
  {
    id: "central-fujisawa",
    parentDestinationId: "fujisawa-city",
    name: { en: "Central Fujisawa", ja: "藤沢中心部" },
  },
  {
    id: "kurazukuri",
    parentDestinationId: "kawagoe-city",
    name: { en: "Warehouse District", ja: "蔵造り地区" },
  },
  {
    id: "central-kawagoe",
    parentDestinationId: "kawagoe-city",
    name: { en: "Central Kawagoe", ja: "川越中心部" },
  },
  {
    id: "naritasan",
    parentDestinationId: "narita-city",
    name: { en: "Naritasan", ja: "成田山" },
  },
  {
    id: "narita-airport",
    parentDestinationId: "narita-city",
    name: { en: "Narita Airport", ja: "成田空港" },
  },
  {
    id: "central-kyoto",
    parentDestinationId: "kyoto-city",
    name: { en: "Central Kyoto", ja: "京都中心部" },
  },
  {
    id: "higashiyama",
    parentDestinationId: "kyoto-city",
    name: { en: "Higashiyama", ja: "東山" },
  },
  {
    id: "gion",
    parentDestinationId: "kyoto-city",
    name: { en: "Gion", ja: "祇園" },
  },
  {
    id: "fushimi",
    parentDestinationId: "kyoto-city",
    name: { en: "Fushimi", ja: "伏見" },
  },
  {
    id: "northern-kyoto",
    parentDestinationId: "kyoto-city",
    name: { en: "Northern Kyoto", ja: "洛北" },
  },
  {
    id: "arashiyama",
    parentDestinationId: "kyoto-city",
    name: { en: "Arashiyama", ja: "嵐山" },
  },
  {
    id: "umeda-kita",
    parentDestinationId: "osaka-city",
    name: { en: "Umeda & Kita", ja: "梅田・キタ" },
  },
  {
    id: "namba-minami",
    parentDestinationId: "osaka-city",
    name: { en: "Namba & Minami", ja: "難波・ミナミ" },
  },
  {
    id: "osaka-castle",
    parentDestinationId: "osaka-city",
    name: { en: "Osaka Castle", ja: "大阪城周辺" },
  },
  {
    id: "tennoji-abeno",
    parentDestinationId: "osaka-city",
    name: { en: "Tennoji & Abeno", ja: "天王寺・阿倍野" },
  },
  {
    id: "bay-area",
    parentDestinationId: "osaka-city",
    name: { en: "Bay Area", ja: "ベイエリア" },
  },
  {
    id: "nakanoshima",
    parentDestinationId: "osaka-city",
    name: { en: "Nakanoshima", ja: "中之島" },
  },
  {
    id: "sannomiya",
    parentDestinationId: "kobe-city",
    name: { en: "Sannomiya", ja: "三宮" },
  },
  {
    id: "kobe-waterfront",
    parentDestinationId: "kobe-city",
    name: { en: "Kobe Waterfront", ja: "神戸ウォーターフロント" },
  },
  {
    id: "kitano",
    parentDestinationId: "kobe-city",
    name: { en: "Kitano", ja: "北野" },
  },
  {
    id: "rokko",
    parentDestinationId: "kobe-city",
    name: { en: "Rokko", ja: "六甲" },
  },
  {
    id: "hakata",
    parentDestinationId: "fukuoka-city",
    name: { en: "Hakata", ja: "博多" },
  },
  {
    id: "tenjin",
    parentDestinationId: "fukuoka-city",
    name: { en: "Tenjin", ja: "天神" },
  },
  {
    id: "ohori-maizuru",
    parentDestinationId: "fukuoka-city",
    name: { en: "Ohori & Maizuru", ja: "大濠・舞鶴" },
  },
  {
    id: "momochi",
    parentDestinationId: "fukuoka-city",
    name: { en: "Momochi", ja: "百道" },
  },
  {
    id: "central-nagoya",
    parentDestinationId: "nagoya-city",
    name: { en: "Central Nagoya", ja: "名古屋中心部" },
  },
  {
    id: "sakae",
    parentDestinationId: "nagoya-city",
    name: { en: "Sakae", ja: "栄" },
  },
  {
    id: "osu",
    parentDestinationId: "nagoya-city",
    name: { en: "Osu", ja: "大須" },
  },
  {
    id: "atsuta",
    parentDestinationId: "nagoya-city",
    name: { en: "Atsuta", ja: "熱田" },
  },
  {
    id: "central-sendai",
    parentDestinationId: "sendai-city",
    name: { en: "Central Sendai", ja: "仙台中心部" },
  },
  {
    id: "aoba",
    parentDestinationId: "sendai-city",
    name: { en: "Aoba", ja: "青葉" },
  },
  {
    id: "miyagino",
    parentDestinationId: "sendai-city",
    name: { en: "Miyagino", ja: "宮城野" },
  },
  {
    id: "central-sapporo",
    parentDestinationId: "sapporo-city",
    name: { en: "Central Sapporo", ja: "札幌中心部" },
  },
  {
    id: "susukino",
    parentDestinationId: "sapporo-city",
    name: { en: "Susukino", ja: "すすきの" },
  },
  {
    id: "maruyama",
    parentDestinationId: "sapporo-city",
    name: { en: "Maruyama", ja: "円山" },
  },
  {
    id: "moiwa",
    parentDestinationId: "sapporo-city",
    name: { en: "Moiwa", ja: "藻岩" },
  },
  {
    id: "ueno",
    parentDestinationId: "taito-city",
    name: { en: "Ueno", ja: "上野" },
  },
  {
    id: "yanaka",
    parentDestinationId: "taito-city",
    name: { en: "Yanaka", ja: "谷中" },
  },
  {
    id: "central-shinjuku",
    parentDestinationId: "shinjuku-city",
    name: { en: "Central Shinjuku", ja: "新宿中心部" },
  },
  {
    id: "kagurazaka",
    parentDestinationId: "shinjuku-city",
    name: { en: "Kagurazaka", ja: "神楽坂" },
  },
  {
    id: "ikebukuro",
    parentDestinationId: "toshima-city",
    name: { en: "Ikebukuro", ja: "池袋" },
  },
  {
    id: "toyosu",
    parentDestinationId: "koto-city",
    name: { en: "Toyosu", ja: "豊洲" },
  },
  {
    id: "odaiba",
    parentDestinationId: "koto-city",
    name: { en: "Odaiba", ja: "お台場" },
  },
  {
    id: "gotokuji",
    parentDestinationId: "setagaya-city",
    name: { en: "Gotokuji", ja: "豪徳寺" },
  },
] as const;

const AREA_BY_ID = new Map(CITY_AREAS.map((area) => [area.id, area]));

export function getCityArea(areaId: string | undefined) {
  return areaId ? AREA_BY_ID.get(areaId) : undefined;
}
