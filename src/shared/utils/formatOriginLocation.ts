import type { AppLocale } from "@/shared/context/LocaleContext";
import { formatPrefecture } from "@/shared/utils/placeLabels";

export interface OriginLocationParts {
  stationName: string;
  prefectureName?: string;
}

const PREFECTURE_SHORT_JA: Record<string, string> = {
  Hokkaido: "北海道",
  Aomori: "青森",
  Iwate: "岩手",
  Miyagi: "宮城",
  Akita: "秋田",
  Yamagata: "山形",
  Fukushima: "福島",
  Ibaraki: "茨城",
  Tochigi: "栃木",
  Gunma: "群馬",
  Saitama: "埼玉",
  Chiba: "千葉",
  Tokyo: "東京",
  Kanagawa: "神奈川",
  Niigata: "新潟",
  Toyama: "富山",
  Ishikawa: "石川",
  Fukui: "福井",
  Yamanashi: "山梨",
  Nagano: "長野",
  Gifu: "岐阜",
  Shizuoka: "静岡",
  Aichi: "愛知",
  Mie: "三重",
  Shiga: "滋賀",
  Kyoto: "京都",
  Osaka: "大阪",
  Hyogo: "兵庫",
  Nara: "奈良",
  Wakayama: "和歌山",
  Tottori: "鳥取",
  Shimane: "島根",
  Okayama: "岡山",
  Hiroshima: "広島",
  Yamaguchi: "山口",
  Tokushima: "徳島",
  Kagawa: "香川",
  Ehime: "愛媛",
  Kochi: "高知",
  Fukuoka: "福岡",
  Saga: "佐賀",
  Nagasaki: "長崎",
  Kumamoto: "熊本",
  Oita: "大分",
  Miyazaki: "宮崎",
  Kagoshima: "鹿児島",
  Okinawa: "沖縄",
};

const KNOWN_STATION_MAP: Record<string, { en: string; ja: string }> = {
  "Tokyo Station": { en: "Tokyo Station", ja: "東京駅" },
  Tokyo: { en: "Tokyo Station", ja: "東京駅" },
  "Hakata Station": { en: "Hakata Station", ja: "博多駅" },
  Hakata: { en: "Hakata Station", ja: "博多駅" },
  "Osaka Station": { en: "Osaka Station", ja: "大阪駅" },
  Osaka: { en: "Osaka Station", ja: "大阪駅" },
  "Shin-Osaka Station": { en: "Shin-Osaka Station", ja: "新大阪駅" },
  "Kyoto Station": { en: "Kyoto Station", ja: "京都駅" },
  "Nagoya Station": { en: "Nagoya Station", ja: "名古屋駅" },
  "Sapporo Station": { en: "Sapporo Station", ja: "札幌駅" },
  "Sendai Station": { en: "Sendai Station", ja: "仙台駅" },
  "Hiroshima Station": { en: "Hiroshima Station", ja: "広島駅" },
  "Shin-Yokohama Station": { en: "Shin-Yokohama Station", ja: "新横浜駅" },
  "Yokohama Station": { en: "Yokohama Station", ja: "横浜駅" },
  "Nakayama Station": { en: "Nakayama Station", ja: "中山駅" },
  "Shinjuku Station": { en: "Shinjuku Station", ja: "新宿駅" },
  "Shibuya Station": { en: "Shibuya Station", ja: "渋谷駅" },
  "Shinagawa Station": { en: "Shinagawa Station", ja: "品川駅" },
  "Ueno Station": { en: "Ueno Station", ja: "上野駅" },
  "Ikebukuro Station": { en: "Ikebukuro Station", ja: "池袋駅" },
  "Omiya Station": { en: "Omiya Station", ja: "大宮駅" },
  "Chiba Station": { en: "Chiba Station", ja: "千葉駅" },
  "Sannomiya Station": { en: "Sannomiya Station", ja: "三ノ宮駅" },
  "Kobe Station": { en: "Kobe Station", ja: "神戸駅" },
  "Nara Station": { en: "Nara Station", ja: "奈良駅" },
  "Kanazawa Station": { en: "Kanazawa Station", ja: "金沢駅" },
  "Takamatsu Station": { en: "Takamatsu Station", ja: "高松駅" },
  "Matsuyama Station": { en: "Matsuyama Station", ja: "松山駅" },
  "Kochi Station": { en: "Kochi Station", ja: "高知駅" },
  "Kumamoto Station": { en: "Kumamoto Station", ja: "熊本駅" },
  "Kagoshima-Chuo Station": {
    en: "Kagoshima-Chuo Station",
    ja: "鹿児島中央駅",
  },
  "Naha Station": { en: "Naha Station", ja: "那覇駅" },
  Naha: { en: "Naha Station", ja: "那覇駅" },
};

const JAPANESE_STATION_MAP: Record<string, { en: string; ja: string }> = {};
for (const entry of Object.values(KNOWN_STATION_MAP)) {
  JAPANESE_STATION_MAP[entry.ja] = entry;
}

export function formatOriginLocation(
  origin: string | undefined | null,
  locale: AppLocale,
): OriginLocationParts {
  if (!origin || !origin.trim()) {
    return locale === "ja"
      ? { stationName: "東京駅", prefectureName: "東京" }
      : { stationName: "Tokyo Station", prefectureName: "Tokyo" };
  }

  const value = origin.trim();

  // Extract prefecture if present after comma
  const commaIndex = value.lastIndexOf(", ");
  let stationPart = commaIndex >= 0 ? value.slice(0, commaIndex).trim() : value;
  let prefPart = commaIndex >= 0 ? value.slice(commaIndex + 2).trim() : "";

  // Handle default "Tokyo Station" string
  if (value === "Tokyo Station") {
    stationPart = "Tokyo Station";
    prefPart = prefPart || "Tokyo";
  }

  // Check parenthetical match: "Hakata Station (博多駅)"
  const parentheticalMatch = stationPart.match(
    /^(.*?)\s*\(([^()]*[\u3040-\u30ff\u3400-\u9fff][^()]*)\)$/u,
  );

  let enName: string | undefined;
  let jaName: string | undefined;

  if (parentheticalMatch) {
    enName = parentheticalMatch[1].trim();
    jaName = parentheticalMatch[2].trim();
  } else if (KNOWN_STATION_MAP[stationPart]) {
    enName = KNOWN_STATION_MAP[stationPart].en;
    jaName = KNOWN_STATION_MAP[stationPart].ja;
  } else if (JAPANESE_STATION_MAP[stationPart]) {
    enName = JAPANESE_STATION_MAP[stationPart].en;
    jaName = JAPANESE_STATION_MAP[stationPart].ja;
  } else if (/[\u3040-\u30ff\u3400-\u9fff]/.test(stationPart)) {
    jaName = stationPart;
  } else {
    enName = stationPart;
  }

  if (locale === "ja") {
    const stationName = jaName || "現在地";
    const prefectureName = prefPart
      ? PREFECTURE_SHORT_JA[prefPart] ||
        formatPrefecture(prefPart, "ja").replace(/(県|府|都)$/, "")
      : undefined;
    return { stationName, prefectureName };
  } else {
    const stationName = enName || stationPart;
    const prefectureName = prefPart
      ? formatPrefecture(prefPart, "en")
      : undefined;
    return { stationName, prefectureName };
  }
}

/**
 * Returns a locale-specific station display label (e.g. "Hakata Station, Fukuoka" in English, "福岡・博多駅" in Japanese).
 */
export function getLocalizedStationLabel(
  origin: string | undefined | null,
  locale: AppLocale,
): string {
  if (!origin || !origin.trim()) {
    return locale === "ja" ? "現在地" : "your origin";
  }
  const parts = formatOriginLocation(origin, locale);
  if (locale === "ja") {
    if (!parts.stationName || parts.stationName === "現在地") {
      return "現在地";
    }
    return parts.prefectureName
      ? `${parts.prefectureName}・${parts.stationName}`
      : parts.stationName;
  } else {
    if (!parts.stationName) return "your origin";
    return parts.prefectureName
      ? `${parts.stationName}, ${parts.prefectureName}`
      : parts.stationName;
  }
}

/**
 * Returns only the station name for option listings in requested locale without parenthetical text or prefecture.
 */
export function getLocalizedStationNameOnly(
  rawName: string | undefined | null,
  locale: AppLocale,
): string {
  if (!rawName) return locale === "ja" ? "現在地" : "your origin";
  const parentheticalMatch = rawName.match(
    /^(.*?)\s*\(([^()]*[\u3040-\u30ff\u3400-\u9fff][^()]*)\)$/u,
  );
  if (parentheticalMatch) {
    return locale === "ja"
      ? parentheticalMatch[2].trim()
      : parentheticalMatch[1].trim();
  }
  const known = KNOWN_STATION_MAP[rawName] || JAPANESE_STATION_MAP[rawName];
  if (known) {
    return locale === "ja" ? known.ja : known.en;
  }
  if (locale === "ja") {
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(rawName) ? rawName : "現在地";
  }
  return rawName;
}
