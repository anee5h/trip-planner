import type { AppLocale } from "@/shared/context/LocaleContext";
import { formatPrefecture } from "@/shared/utils/placeLabels";

export interface OriginLocationParts {
  stationName: string;
  prefectureName?: string;
}

const DEFAULT_ORIGINS: Record<AppLocale, OriginLocationParts> = {
  en: { stationName: "Tokyo Station", prefectureName: "Tokyo" },
  ja: { stationName: "東京駅", prefectureName: "東京都" },
};

export function formatOriginLocation(
  origin: string,
  locale: AppLocale,
): OriginLocationParts {
  const value = origin.trim();
  if (!value || value === "Tokyo Station") return DEFAULT_ORIGINS[locale];

  const commaIndex = value.lastIndexOf(", ");
  const prefecture = commaIndex >= 0 ? value.slice(commaIndex + 2) : "";
  const hasKnownPrefecture =
    prefecture !== "" && formatPrefecture(prefecture, "ja") !== prefecture;
  const station = hasKnownPrefecture ? value.slice(0, commaIndex) : value;
  const localizedMatch = station.match(
    /^(.*?)\s*\(([^()]*(?:[\u3040-\u30ff\u3400-\u9fff])[^()]*)\)$/u,
  );
  const stationName =
    locale === "ja" && localizedMatch
      ? localizedMatch[2].trim()
      : (localizedMatch?.[1].trim() ?? station);

  return {
    stationName,
    prefectureName: hasKnownPrefecture
      ? formatPrefecture(prefecture, locale)
      : undefined,
  };
}
