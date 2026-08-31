import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  JapaneseYen,
  MapPin,
} from "lucide-react";
import type { TripCostResult } from "@/shared/services/budget/budgetV2";
import type { TripEstimateResult } from "@/shared/services/budget/tripEstimateEngine";
import { formatLocalizedJPYRange } from "@/shared/services/budget/BudgetService";

export interface DestinationAtAGlanceLabels {
  travelTime: string;
  visitDuration: string;
  onSiteCost: string;
  transportExcluded: string;
  free: string;
  locatedIn: string;
  bestSeason: string;
  openingHours?: string;
  officialWebsite?: string;
}

export interface DestinationAtAGlanceFact {
  label: string;
  value: string;
  Icon: LucideIcon;
  tone?: "default" | "positive";
  detail?: string;
  href?: string;
}

interface DestinationAtAGlanceProps {
  locale: "en" | "ja";
  travelTime?: string;
  visitDuration?: string;
  onSiteCost?: TripCostResult | TripEstimateResult;
  labels: DestinationAtAGlanceLabels;
  parentLabel?: string;
  headerExposesLocation?: boolean;
  seasonLabel?: string;
  openingHours?: string;
  officialWebsite?: string;
}

function getOfficialWebsiteLabel(website: string): string {
  try {
    return new URL(website).hostname.replace(/^www\./i, "");
  } catch {
    return website.replace(/^https?:\/\//i, "").split("/")[0];
  }
}

/**
 * Render only a numeric on-site result from the canonical Budget v2 result.
 * The result is expected to have been calculated with origin travel excluded;
 * no legacy budget fields are consulted here.
 */
function getOnSiteCostLabel(
  result: TripCostResult | TripEstimateResult | undefined,
  locale: "en" | "ja",
  labels: Pick<DestinationAtAGlanceLabels, "free">,
): string | undefined {
  const total = result && "total" in result ? result.total : undefined;
  if (!result || !total) return undefined;

  const numericOnSiteComponent = result.components.some(
    (component) =>
      component.evidence.scope !== "origin_travel" &&
      component.cost.kind === "bounded" &&
      component.evidence.state !== "not_applicable",
  );
  if (!numericOnSiteComponent) return undefined;

  if (total.min === 0 && total.max === 0) {
    return labels.free;
  }
  return formatLocalizedJPYRange([total.min, total.max], locale);
}

export function DestinationAtAGlance({
  locale,
  travelTime,
  visitDuration,
  onSiteCost,
  labels,
  parentLabel,
  headerExposesLocation = false,
  seasonLabel,
  openingHours,
  officialWebsite,
}: DestinationAtAGlanceProps) {
  const onSiteCostLabel = getOnSiteCostLabel(onSiteCost, locale, labels);
  const facts: DestinationAtAGlanceFact[] = [
    ...(travelTime
      ? [{ label: labels.travelTime, value: travelTime, Icon: Clock3 }]
      : []),
    ...(visitDuration
      ? [{ label: labels.visitDuration, value: visitDuration, Icon: MapPin }]
      : []),
    ...(openingHours
      ? [
          {
            label:
              labels.openingHours ||
              (locale === "ja" ? "営業時間" : "Opening hours"),
            value: openingHours,
            Icon: Clock3,
          },
        ]
      : []),
    ...(officialWebsite
      ? [
          {
            label:
              labels.officialWebsite ||
              (locale === "ja" ? "公式サイト" : "Official website"),
            value: getOfficialWebsiteLabel(officialWebsite),
            Icon: ExternalLink,
            href: officialWebsite,
          },
        ]
      : []),
    ...(onSiteCostLabel
      ? [
          {
            label: labels.onSiteCost,
            value: onSiteCostLabel,
            detail: labels.transportExcluded,
            Icon: JapaneseYen,
            tone: "positive" as const,
          },
        ]
      : []),
    ...(parentLabel && !headerExposesLocation
      ? [
          {
            label: labels.locatedIn,
            value: parentLabel,
            Icon: MapPin,
          },
        ]
      : []),
    ...(seasonLabel
      ? [
          {
            label: labels.bestSeason,
            value: seasonLabel,
            Icon: CheckCircle2,
          },
        ]
      : []),
  ];

  return (
    <div
      data-testid="destination-at-a-glance"
      className="border-t border-slate-100 pt-4 dark:border-slate-800"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {facts.map(({ label, value, Icon, tone = "default", detail, href }) => (
          <div
            key={label}
            className="flex min-w-0 items-start gap-2.5 rounded-lg border border-slate-200/70 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:py-0"
          >
            <Icon
              aria-hidden="true"
              className={`mt-0.5 size-4 shrink-0 ${tone === "positive" ? "text-emerald-600 dark:text-emerald-300" : "text-slate-500 dark:text-slate-300"}`}
            />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {label}
              </div>
              <div className="break-words text-sm font-bold leading-snug text-slate-900 dark:text-white">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                  >
                    <span className="break-all">{value}</span>
                    <ExternalLink
                      aria-hidden="true"
                      className="size-3 shrink-0"
                    />
                  </a>
                ) : (
                  value
                )}
              </div>
              {detail && (
                <div className="mt-0.5 break-words text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                  {detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
