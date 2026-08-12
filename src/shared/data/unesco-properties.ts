export interface UNESCOPropertyLabel {
  name: string;
  nameJa: string;
}

/**
 * Official UNESCO World Heritage property labels keyed by UNESCO list ID.
 * These labels are presentation metadata only; membership remains on each
 * destination's collection record and is grouped by its authoritative source.
 */
export const UNESCO_PROPERTY_LABELS: Readonly<
  Record<string, UNESCOPropertyLabel>
> = {
  "660": {
    name: "Buddhist Monuments in the Horyu-ji Area",
    nameJa: "法隆寺地域の仏教建造物",
  },
  "661": { name: "Himeji-jo", nameJa: "姫路城" },
  "662": { name: "Yakushima", nameJa: "屋久島" },
  "663": { name: "Shirakami-Sanchi", nameJa: "白神山地" },
  "688": {
    name: "Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities)",
    nameJa: "古都京都の文化財（京都市、宇治市、大津市）",
  },
  "734": {
    name: "Historic Villages of Shirakawa-go and Gokayama",
    nameJa: "白川郷・五箇山の合掌造り集落",
  },
  "775": {
    name: "Hiroshima Peace Memorial (Genbaku Dome)",
    nameJa: "広島平和記念碑（原爆ドーム）",
  },
  "776": { name: "Itsukushima Shinto Shrine", nameJa: "厳島神社" },
  "870": {
    name: "Historic Monuments of Ancient Nara",
    nameJa: "古都奈良の文化財",
  },
  "913": { name: "Shrines and Temples of Nikko", nameJa: "日光の社寺" },
  "972": {
    name: "Gusuku Sites and Related Properties of the Kingdom of Ryukyu",
    nameJa: "琉球王国のグスク及び関連遺産群",
  },
  "1142": {
    name: "Sacred Sites and Pilgrimage Routes in the Kii Mountain Range",
    nameJa: "紀伊山地の霊場と参詣道",
  },
  "1193": { name: "Shiretoko", nameJa: "知床" },
  "1246": {
    name: "Iwami Ginzan Silver Mine and its Cultural Landscape",
    nameJa: "石見銀山遺跡とその文化的景観",
  },
  "1277": {
    name: "Hiraizumi – Temples, Gardens and Archaeological Sites Representing the Buddhist Pure Land",
    nameJa: "平泉－仏国土（浄土）を表す建築・庭園及び考古学的遺跡群",
  },
  "1321": {
    name: "The Architectural Work of Le Corbusier, an Outstanding Contribution to the Modern Movement",
    nameJa: "ル・コルビュジエの建築作品－近代建築運動への顕著な貢献",
  },
  "1362": { name: "Ogasawara Islands", nameJa: "小笠原諸島" },
  "1418": {
    name: "Fujisan, sacred place and source of artistic inspiration",
    nameJa: "富士山－信仰の対象と芸術の源泉",
  },
  "1449": {
    name: "Tomioka Silk Mill and Related Sites",
    nameJa: "富岡製糸場と絹産業遺産群",
  },
  "1484": {
    name: "Sites of Japan's Meiji Industrial Revolution: Iron and Steel, Shipbuilding and Coal Mining",
    nameJa: "明治日本の産業革命遺産 製鉄・製鋼、造船、石炭産業",
  },
  "1495": {
    name: "Hidden Christian Sites in the Nagasaki Region",
    nameJa: "長崎と天草地方の潜伏キリシタン関連遺産",
  },
  "1535": {
    name: "Sacred Island of Okinoshima and Associated Sites in the Munakata Region",
    nameJa: "「神宿る島」宗像・沖ノ島と関連遺産群",
  },
  "1574": {
    name: "Amami-Oshima Island, Tokunoshima Island, Northern part of Okinawa Island, and Iriomote Island",
    nameJa: "奄美大島、徳之島、沖縄島北部及び西表島",
  },
  "1593": {
    name: "Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan",
    nameJa: "百舌鳥・古市古墳群－古代日本の墳墓群",
  },
  "1632": {
    name: "Jomon Prehistoric Sites in Northern Japan",
    nameJa: "北海道・北東北の縄文遺跡群",
  },
  "1698": { name: "Sado Island Gold Mines", nameJa: "佐渡島の金山" },
  "1757": {
    name: "Ancient Capitals of Asuka and Fujiwara",
    nameJa: "飛鳥・藤原の宮都",
  },
};

/** Extracts the stable UNESCO list ID from an English property URL. */
export function getUNESCOPropertyId(sourceUrl?: string): string | undefined {
  return sourceUrl?.match(/\/en\/list\/(\d+)(?:\/|$)/)?.[1];
}
