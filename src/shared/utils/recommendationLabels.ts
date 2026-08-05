import i18n from "@/i18n";
import type { MatchReason } from "@/shared/services/recommendation/RecommendationTypes";

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
  return {
    title: translate(
      `recommendation.reasons.${reason.code}.title`,
      reason.params,
    ),
    description: translate(
      `recommendation.reasons.${reason.code}.description`,
      reason.params,
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
