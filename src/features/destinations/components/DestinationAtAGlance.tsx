import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  JapaneseYen,
  MapPin,
  Navigation,
} from "lucide-react";
import type { TripCostResult } from "@/shared/services/budget/budgetV2";
import type { TripEstimateResult } from "@/shared/services/budget/tripEstimateEngine";
import { formatTravellerEstimateRange } from "@/shared/services/budget/BudgetService";

export interface DestinationAtAGlanceLabels {
  travelTime: string;
  visitDuration: string;
  onSiteCost: string;
  transportExcluded: string;
  free: string;
  locatedIn: string;
  bestSeason: string;
  openingHours?: string;
  hoursNotVerified?: string;
  officialWebsite?: string;
}

export interface DestinationAtAGlanceFact {
  label: string;
  value: string;
  Icon: LucideIcon;
  tone?: "default" | "positive";
  detail?: string;
  href?: string;
  directions?: { href: string; label: string };
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
  openingHoursUnverified?: boolean;
  officialWebsite?: string;
  directionsHref?: string;
  directionsLabel?: string;
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
  const quality =
    "estimateQuality" in result ? result.estimateQuality : undefined;
  return formatTravellerEstimateRange([total.min, total.max], quality, locale);
}

/**
 * Wide-value heuristic: values that render wider than a compact grid cell
 * (long opening-hours prose, verbose JA explanations, long website
 * hostnames) span the full fact row instead of squeezing into a half-column
 * box. CJK glyphs render roughly double the width of ASCII, so they are
 * weighted accordingly. This is a presentation rule only — no source data
 * changes.
 */
function isWideFact(value: string, href?: string): boolean {
  const asciiWidth = value.replace(/[^\x00-\x7F]/g, "xx").length;
  // Long hostnames wrap badly inside a half-column cell — give them the
  // full row so the link stays on one line.
  if (href && asciiWidth >= 26) return true;
  return asciiWidth >= 40;
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
  openingHoursUnverified = false,
  officialWebsite,
  directionsHref,
  directionsLabel,
}: DestinationAtAGlanceProps) {
  const onSiteCostLabel = getOnSiteCostLabel(onSiteCost, locale, labels);
  const facts: DestinationAtAGlanceFact[] = [
    ...(travelTime
      ? [
          {
            label: labels.travelTime,
            value: travelTime,
            Icon: Clock3,
            directions:
              directionsHref && directionsLabel
                ? { href: directionsHref, label: directionsLabel }
                : undefined,
          },
        ]
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
            detail: openingHoursUnverified
              ? labels.hoursNotVerified
              : undefined,
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
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4 lg:gap-x-5">
        {facts.map(
          ({
            label,
            value,
            Icon,
            tone = "default",
            detail,
            href,
            directions,
          }) => {
            const wide = isWideFact(value, href) || Boolean(href);
            return (
              <div
                key={label}
                data-at-a-glance-fact={wide ? "wide" : "compact"}
                className={`min-w-0 ${wide ? "col-span-2 lg:col-span-4" : ""}`}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icon
                    aria-hidden="true"
                    className={`mt-0.5 size-4 shrink-0 ${tone === "positive" ? "text-emerald-600 dark:text-emerald-300" : "text-slate-500 dark:text-slate-300"}`}
                  />
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {label}
                    </dt>
                    <dd className="break-words text-sm font-bold leading-snug text-slate-900 dark:text-white">
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
                    </dd>
                    {detail && (
                      <dd className="mt-0.5 break-words text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                        {detail}
                      </dd>
                    )}
                    {directions && (
                      <dd className="mt-1.5">
                        <a
                          href={directions.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/30 bg-emerald-700/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-700/20 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-300 dark:hover:bg-emerald-300/20"
                        >
                          <Navigation className="size-3 shrink-0" />
                          <span>{directions.label}</span>
                          <ArrowRight className="size-3 shrink-0" />
                        </a>
                      </dd>
                    )}
                  </div>
                </div>
              </div>
            );
          },
        )}
      </dl>
    </div>
  );
}
