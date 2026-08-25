import i18n from "@/i18n";
import type { MatchReason } from "@/shared/services/recommendation/RecommendationTypes";
import type { TravelConditionEvaluation } from "@/shared/services/recommendation/TravelConditions";
import {
  formatTravelConditionParams,
  formatTravelDateShort,
  formatTravelMonth,
} from "@/shared/services/recommendation/TravelConditions";
import type { DayForecastData } from "@/shared/services/weather/WeatherTabService";

export {
  formatTravelDateShort,
  formatTravelMonth,
  formatTravelConditionParams,
} from "@/shared/services/recommendation/TravelConditions";

export function localizeTravelConditionReason(
  reason: MatchReason,
  locale: "en" | "ja",
) {
  const t = i18n.getFixedT(locale, "common");
  const params = formatTravelConditionParams(reason.params, locale);
  const translate = (key: string) =>
    (t as (key: string, options?: Record<string, unknown>) => string)(
      key,
      params,
    );
  return {
    title: translate(`recommendation.reasons.${reason.code}.title`),
    description: translate(`recommendation.reasons.${reason.code}.description`),
  };
}

/**
 * One-line summary of a destination's condition evaluation: the first
 * non-forecast reason, or for mixed evidence the seasonal/unknown label
 * ("Typical conditions for November"). Forecast reasons are never shown
 * here: the live forecast is weather at the selected origin, not
 * destination weather, so cards never claim "Forecast for …" from it.
 */
export function localizeTravelConditionSummary(
  evaluation: TravelConditionEvaluation,
  locale: "en" | "ja",
): string {
  const reasons = evaluation.reasons.filter(
    (reason) =>
      reason.code !== "conditionForecastDay" &&
      reason.code !== "conditionForecastRange",
  );
  if (reasons.length === 0) return "";
  const [first, second] = reasons;
  const firstLabel = localizeTravelConditionReason(first, locale).title;
  if (evaluation.source === "mixed" && second) {
    return `${firstLabel} · ${localizeTravelConditionReason(second, locale).title}`;
  }
  return firstLabel;
}

/**
 * Date-level (destination-independent) summary of the selected dates for
 * the Destinations explorer header: forecast label inside the forecast
 * window, typical-conditions label beyond it, mixed when only one day of a
 * 2D1N trip has a forecast.
 */
export function localizeDateConditionSummary(
  dates: readonly string[],
  forecastMap: ReadonlyMap<string, DayForecastData> | undefined,
  locale: "en" | "ja",
): string {
  const t = i18n.getFixedT(locale, "common");
  const translate = (key: string, params?: Record<string, unknown>) =>
    (t as (key: string, options?: Record<string, unknown>) => string)(
      key,
      params,
    );
  const forecastDays = dates.filter((iso) => forecastMap?.has(iso) ?? false);
  const missing = dates.filter((iso) => !(forecastMap?.has(iso) ?? false));

  if (forecastDays.length === dates.length) {
    return dates.length === 1
      ? translate("destination.dateCondition.forecastSingle", {
          day: formatTravelDateShort(dates[0], locale),
        })
      : translate("destination.dateCondition.forecastRange", {
          day1: formatTravelDateShort(dates[0], locale),
          day2: formatTravelDateShort(dates[1], locale),
        });
  }
  const month = formatTravelMonth(missing[0].slice(0, 7), locale);
  if (forecastDays.length === 0) {
    return translate("destination.dateCondition.seasonal", { month });
  }
  return translate("destination.dateCondition.mixed", {
    day: formatTravelDateShort(forecastDays[0], locale),
    month,
  });
}

const labels: Record<string, string> = {
  "Match Confidence": "マッチ度",
  "Why this matches you:": "あなたにおすすめの理由",
  "Why This Matches You": "あなたにおすすめの理由",
  "Match Reasons": "おすすめの理由",
  "Matched Preferences": "一致した条件",
  "Great Value": "お得な旅",
  "Fast Train Access": "電車でアクセス便利",
  "Cool Mountain Air": "涼しい空気",
  "Within Budget": "予算内",
  "Top-tier Food Scene": "食の魅力",
  "Nature Escape": "自然を満喫",
  "Deep History": "豊かな歴史",
  "Rich in Art & Culture": "芸術と文化",
  "Coastal Vibe": "海辺の魅力",
  "Cool Retreat": "涼しい避暑地",
  "Theme Park Fun": "テーマパーク",
  "Highly Rated Choice": "高評価の目的地",
  "Solid Match": "おすすめの目的地",
  budget: "予算",
  transport: "交通",
  food: "グルメ",
  nature: "自然",
  history: "歴史",
  art: "アート",
  sea: "海",
  cool: "涼しさ",
  themepark: "テーマパーク",
};

export function localizeRecommendationReason(
  reason: MatchReason,
  locale: "en" | "ja",
) {
  const t = i18n.getFixedT(locale, "common");
  // i18next's typed overloads require a defaultValue for non-literal keys;
  // reason codes are template literals, so use the untyped options form.
  const translate = (key: string, params?: Record<string, unknown>) =>
    (t as (key: string, options?: Record<string, unknown>) => string)(
      key,
      params,
    );
  const params = formatTravelConditionParams(reason.params, locale);
  return {
    title: translate(`recommendation.reasons.${reason.code}.title`, params),
    description: translate(
      `recommendation.reasons.${reason.code}.description`,
      params,
    ),
  };
}

export function localizeRecommendationPreference(
  preference: string,
  locale: "en" | "ja",
) {
  return i18n.getFixedT(locale, "common")(
    `recommendation.preferences.${preference}`,
    { defaultValue: preference },
  );
}

export function localizeRecommendationText(value: string, locale: "en" | "ja") {
  if (locale === "en") return value;
  if (labels[value]) return labels[value];
  return value
    .replace(
      /^Well under budget \(est\. ¥(.+)\)$/,
      "予算を大きく下回ります（目安 ¥$1）",
    )
    .replace(/^Only (.+)m by train$/, "電車で$1分")
    .replace(
      /^A cool escape from the hot city temperatures$/,
      "暑い都市を離れて涼しく過ごせます",
    );
}
