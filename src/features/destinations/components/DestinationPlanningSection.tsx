import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AdmissionPriceSelection,
  Destination,
} from "@/shared/types/destination";
import { DayPlanWidget } from "./DayPlanWidget";
import { TripCostBreakdownWidget } from "./TripCostBreakdownWidget";
import type { DayPlan } from "@/shared/services/recommendation/DayPlanGeneratorService";
import { getPlanEligibility } from "@/shared/services/recommendation/DayPlanGeneratorService";
import {
  calculateGeneratedPlanCost,
  visitDateForStep,
} from "@/shared/services/budget/GeneratedPlanCostService";
import { selectionWithPartyComposition } from "@/shared/services/budget/admissionPricing";
import type { FerryTemporalContext } from "@/shared/services/transport/types";
import type { CarRoundTripRoute } from "@/shared/services/transport/CarRouteProvider";
import type {
  PersonalCarCostOptions,
  RentalCarCostOptions,
} from "@/shared/services/transport/carCostV2";
import { useFullCatalogue } from "@/shared/hooks/useFullCatalogue";
import type { TripDuration } from "@/shared/types/tripDuration";

interface DestinationPlanningSectionProps {
  destination: Destination;
  locale: "en" | "ja";
  partySize: number;
  homeCoords?: { lat: number; lng: number };
  /** null = no selected local transit mode; canonical profiles still apply. */
  selectedTransport: string | null;
  /** Hub pages keep an unavailable on-site fact compact instead of reserving
   *  the full itemized cost card. Non-hub callers retain the existing UI. */
  compactUnavailableCost?: boolean;
  /** Planned travel date for ferry availability. */
  ferryTemporal?: FerryTemporalContext;
  /** Optional selected travel date for represented closed weekdays. */
  travelDate?: string;
  admissionSelection?: AdmissionPriceSelection;
  /** Optional exact origin identity for the scheduled planner seam. */
  scheduledOriginProductId?: string;
  duration?: TripDuration;
  carRoute?: CarRoundTripRoute;
  carCostOptions?: PersonalCarCostOptions | RentalCarCostOptions;
  onSaveToItinerary: (plan?: DayPlan) => void;
  onPlanGenerated?: (plan: DayPlan | null) => void;
}

export function getPlannerTransportScopeNotice(
  locale: "en" | "ja",
  hasOrigin: boolean,
): string {
  if (locale === "ja") {
    return hasOrigin
      ? "計画時間には最初のスポットまでの移動時間を含みません。下の費用内訳で旅行全体の費用範囲を確認できます。"
      : "計画時間には最初のスポットまでの移動時間を含みません。現地費用の目安です。出発地を設定すると交通費も含まれます。";
  }
  return hasOrigin
    ? "Planning time excludes travel to the first stop. See the breakdown below for the canonical trip-cost scope."
    : "Planning time excludes travel to the first stop. On-site estimate — set an origin to include travel.";
}

export function DestinationPlanningSection({
  destination,
  locale,
  partySize,
  homeCoords,
  selectedTransport,
  compactUnavailableCost,
  ferryTemporal,
  travelDate,
  admissionSelection,
  scheduledOriginProductId,
  duration = "fullDay",
  carRoute,
  carCostOptions,
  onSaveToItinerary,
  onPlanGenerated,
}: DestinationPlanningSectionProps) {
  const { t } = useTranslation();
  const [generatedPlan, setGeneratedPlanState] = useState<DayPlan | null>(null);
  const [activePartySize, setActivePartySize] = useState(partySize);
  const [childCountOverride, setChildCountOverride] = useState<
    number | null | undefined
  >(undefined);

  useEffect(() => {
    setActivePartySize(partySize);
    setChildCountOverride(undefined);
  }, [partySize]);

  const handlePartySizeChange = (nextPartySize: number) => {
    setActivePartySize(nextPartySize);
    setChildCountOverride(undefined);
  };
  const activeAdmissionSelection = selectionWithPartyComposition(
    admissionSelection,
    activePartySize,
    childCountOverride,
  );
  const selectedChildCount = activeAdmissionSelection?.childCount;
  const liveChildCount =
    activeAdmissionSelection?.adultCount !== undefined &&
    selectedChildCount !== undefined
      ? selectedChildCount
      : null;

  // KAI-121: eligibility REQUIRES the full catalogue (nearby candidates).
  // "Catalogue not loaded yet" must never be interpreted as "destination
  // is ineligible" — while pending, the widget mounts in a loading state;
  // eligibility is recomputed once the full catalogue arrives. On failure
  // the widget shows the explicit retryable error state.
  const {
    loading: catalogueLoading,
    error: catalogueError,
    retry: retryCatalogue,
  } = useFullCatalogue();

  const { halfDay, fullDay } = useMemo(() => {
    // When the full catalogue is pending or failed, we cannot compute a
    // truthful eligibility verdict. Report pending (eligible=false with
    // a pending flag) so the widget renders its loading/error UI instead
    // of being hidden as "ineligible".
    if (catalogueLoading || catalogueError) {
      return {
        halfDay: { eligible: false, pending: true },
        fullDay: { eligible: false, pending: true },
      };
    }
    return {
      halfDay: getPlanEligibility(destination, { planType: "half_day" }),
      fullDay: getPlanEligibility(destination, { planType: "full_day" }),
    };
  }, [destination, catalogueLoading, catalogueError]);

  const eligible = halfDay.eligible || fullDay.eligible;
  const fullDayDisabled = !fullDay.eligible;

  const setGeneratedPlan = (plan: DayPlan | null) => {
    setGeneratedPlanState(plan);
    if (onPlanGenerated) {
      onPlanGenerated(plan);
    }
  };

  const hasValidGeneratedPlan = Boolean(
    generatedPlan && !generatedPlan.isUnfeasible,
  );
  // The primary step supplies the comparison date; planCostBreakdown below
  // still aggregates every distinct destination-day visit.
  const primaryPlanStep =
    destination.role !== "hub" && destination.kind !== "city"
      ? generatedPlan?.steps.find(
          (step) =>
            step.type === "destination" &&
            step.destination?.id === destination.id,
        )
      : undefined;
  const primaryPlanDay = primaryPlanStep?.day;
  const primaryAdmissionSelection = selectionWithPartyComposition(
    primaryPlanStep?.admissionSelection ?? activeAdmissionSelection,
    activePartySize,
    liveChildCount,
  );
  const firstPaidStopDay = generatedPlan?.steps.find(
    (step) =>
      step.type === "destination" &&
      step.destination &&
      step.destination.role !== "hub" &&
      step.destination.kind !== "city",
  )?.day;
  const costContextVisitDate = hasValidGeneratedPlan
    ? visitDateForStep(travelDate, { day: primaryPlanDay ?? firstPaidStopDay })
    : travelDate;

  // Origin transport is priced once when a saved origin is available; local
  // transit remains a separate profile/fact and is never inferred from an
  // origin fare.
  const localTransitMode: "car" | "train" | null =
    selectedTransport === "car" || selectedTransport === "my_car"
      ? "car"
      : selectedTransport === "train" || selectedTransport === "shinkansen"
        ? "train"
        : null;
  const costBreakdown =
    hasValidGeneratedPlan && generatedPlan
      ? calculateGeneratedPlanCost(
          generatedPlan,
          activePartySize,
          localTransitMode,
          Boolean(homeCoords),
          homeCoords,
          { travelDate, admissionSelection: activeAdmissionSelection },
        )
      : undefined;

  return (
    <div className="space-y-3 pb-2 md:pb-0">
      <fieldset className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
        <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
          {t("planner.admissionPartyComposition.title")}
        </legend>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label
            htmlFor="admission-child-count"
            className="text-xs text-slate-600 dark:text-slate-300"
          >
            {t("planner.admissionPartyComposition.children")}
          </label>
          <input
            id="admission-child-count"
            type="number"
            min={0}
            max={activePartySize}
            step={1}
            value={selectedChildCount ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "") {
                setChildCountOverride(null);
                return;
              }
              const count = Number(value);
              if (
                Number.isInteger(count) &&
                count >= 0 &&
                count <= activePartySize
              ) {
                setChildCountOverride(count);
              }
            }}
            className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedChildCount === undefined
              ? t("planner.admissionPartyComposition.assumingAdults")
              : t("planner.admissionPartyComposition.summary", {
                  adultCount: activePartySize - selectedChildCount,
                  childCount: selectedChildCount,
                })}
          </span>
        </div>
      </fieldset>

      {/* Unified Progressive Day Plan Generator */}
      <DayPlanWidget
        destination={destination}
        locale={locale}
        duration={duration}
        travelDate={travelDate}
        admissionSelection={activeAdmissionSelection}
        scheduledOriginProductId={scheduledOriginProductId}
        partySize={activePartySize}
        onPartySizeChange={handlePartySizeChange}
        eligible={eligible}
        catalogueLoading={catalogueLoading}
        catalogueError={catalogueError}
        onRetryCatalogue={retryCatalogue}
        defaultPlanType={fullDayDisabled ? "half_day" : undefined}
        fullDayDisabled={fullDayDisabled}
        onSaveToItinerary={() =>
          onSaveToItinerary(
            generatedPlan
              ? {
                  ...generatedPlan,
                  travelDate,
                  admissionSelection: activeAdmissionSelection,
                  steps: generatedPlan.steps.map((step) =>
                    step.admissionSelection
                      ? {
                          ...step,
                          admissionSelection: selectionWithPartyComposition(
                            step.admissionSelection,
                            activePartySize,
                            liveChildCount,
                          ),
                        }
                      : step,
                  ),
                  totalBudgetRange: costBreakdown?.totalRange,
                }
              : undefined,
          )
        }
        onPlanGenerated={(plan) => setGeneratedPlan(plan)}
      />

      <p
        data-testid="planner-transport-scope"
        className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-medium leading-relaxed text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300"
      >
        {getPlannerTransportScopeNotice(locale, Boolean(homeCoords))}
      </p>

      {/* Progressive Cost Breakdown */}
      <TripCostBreakdownWidget
        destination={destination}
        locale={locale}
        partySize={activePartySize}
        homeCoords={homeCoords}
        activeTransportMode={selectedTransport}
        carRoute={carRoute}
        carCostOptions={carCostOptions}
        compactUnavailableCost={compactUnavailableCost}
        ferryTemporal={ferryTemporal}
        duration={duration}
        visitDate={costContextVisitDate}
        admissionSelection={primaryAdmissionSelection}
        hasGeneratedPlan={hasValidGeneratedPlan}
        planCostBreakdown={costBreakdown}
      />
    </div>
  );
}
