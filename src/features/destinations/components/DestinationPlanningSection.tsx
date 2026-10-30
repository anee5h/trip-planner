import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  childCount?: number;
  onChildCountChange?: (childCount: number | undefined) => void;
  onAdmissionSelectionChange?: (
    selection: AdmissionPriceSelection | undefined,
  ) => void;
  onPartySizeChange?: (partySize: number) => void;
  /** Optional exact origin identity for the scheduled planner seam. */
  scheduledOriginProductId?: string;
  duration?: TripDuration;
  carRoute?: CarRoundTripRoute;
  carCostOptions?: PersonalCarCostOptions | RentalCarCostOptions;
  onSaveToItinerary: (plan?: DayPlan) => void;
  onPlanGenerated?: (plan: DayPlan | null) => void;
}

function getDistinctOptionValues<T extends string>(
  values: readonly (T | undefined)[],
): T[] {
  return [...new Set(values.filter((value): value is T => Boolean(value)))];
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
  childCount,
  onChildCountChange,
  onAdmissionSelectionChange,
  onPartySizeChange,
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
  const [childCountOverride, setChildCountOverride] = useState<{
    destinationId: string;
    value: number | null;
  } | null>(null);
  const [childCountDraft, setChildCountDraft] = useState(
    childCount === undefined ? "" : String(childCount),
  );
  const [selectionOverride, setSelectionOverride] = useState<{
    destinationId: string;
    value: AdmissionPriceSelection | undefined;
  } | null>(null);
  const childCountInputId = useId();
  const childCountHelpId = `${childCountInputId}-help`;
  const childCountErrorId = `${childCountInputId}-error`;
  const lastPublishedPlan = useRef<DayPlan | null>(null);
  const configuredTicketSelection =
    selectionOverride?.destinationId === destination.id
      ? selectionOverride.value
      : admissionSelection;
  const selectedChildCount =
    childCountOverride?.destinationId === destination.id
      ? childCountOverride.value
      : childCount;
  const ticketOptions = destination.admission?.priceOptions;
  const requiredProductIds = useMemo(
    () =>
      getDistinctOptionValues(
        (ticketOptions ?? [])
          .filter((option) => !option.optional)
          .map((option) => option.productId),
      ),
    [ticketOptions],
  );
  const channels = useMemo(
    () =>
      getDistinctOptionValues(
        (ticketOptions ?? []).map((option) => option.channel),
      ),
    [ticketOptions],
  );
  const timeSlots = useMemo(
    () =>
      getDistinctOptionValues(
        (ticketOptions ?? []).map((option) => option.timeSlot),
      ),
    [ticketOptions],
  );
  const addOnProductIds = useMemo(
    () =>
      getDistinctOptionValues(
        (ticketOptions ?? [])
          .filter((option) => option.optional)
          .map((option) => option.productId),
      ),
    [ticketOptions],
  );
  const selectedTicketSelection = useMemo(() => {
    const selection = {
      ...configuredTicketSelection,
      ...(requiredProductIds.length === 1 &&
      !configuredTicketSelection?.productId
        ? { productId: requiredProductIds[0] }
        : {}),
      ...(channels.length === 1 && !configuredTicketSelection?.channel
        ? { channel: channels[0] }
        : {}),
      ...(timeSlots.length === 1 && !configuredTicketSelection?.timeSlot
        ? { timeSlot: timeSlots[0] }
        : {}),
    };
    return Object.keys(selection).length ? selection : undefined;
  }, [configuredTicketSelection, requiredProductIds, channels, timeSlots]);

  useEffect(() => {
    setActivePartySize(partySize);
    setChildCountOverride(null);
    setChildCountDraft(childCount === undefined ? "" : String(childCount));
  }, [partySize, childCount]);

  useEffect(() => {
    setSelectionOverride(null);
  }, [destination.id, admissionSelection]);

  useEffect(() => {
    setChildCountOverride(null);
  }, [destination.id, childCount]);

  useEffect(() => {
    setChildCountDraft(
      selectedChildCount === undefined ? "" : String(selectedChildCount),
    );
  }, [destination.id, activePartySize, selectedChildCount]);

  const handlePartySizeChange = (nextPartySize: number) => {
    setActivePartySize(nextPartySize);
    setChildCountOverride({ destinationId: destination.id, value: null });
    setChildCountDraft("");
    onPartySizeChange?.(nextPartySize);
    onChildCountChange?.(undefined);
  };
  const activeAdmissionSelection = useMemo(
    () =>
      selectionWithPartyComposition(
        selectedTicketSelection,
        activePartySize,
        selectedChildCount,
      ),
    [selectedTicketSelection, activePartySize, selectedChildCount],
  );
  const effectiveChildCount = activeAdmissionSelection?.childCount;
  const liveChildCount =
    activeAdmissionSelection?.adultCount !== undefined &&
    effectiveChildCount !== undefined
      ? effectiveChildCount
      : null;

  const hasTicketOptions = Boolean(
    ticketOptions?.length ||
    generatedPlan?.steps.some(
      (step) => step.destination?.admission?.priceOptions?.length,
    ),
  );
  const childCountError =
    /^\d+$/.test(childCountDraft) && Number(childCountDraft) > activePartySize
      ? t("planner.admissionPartyComposition.exceedsPartySize")
      : /^-\d+$/.test(childCountDraft)
        ? t("planner.admissionPartyComposition.invalidCount")
        : undefined;
  const updateTicketSelection = (patch: Partial<AdmissionPriceSelection>) => {
    const nextSelection = { ...selectedTicketSelection, ...patch };
    setSelectionOverride({
      destinationId: destination.id,
      value: nextSelection,
    });
    onAdmissionSelectionChange?.(nextSelection);
  };

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
  const primaryAdmissionSelection = useMemo(
    () =>
      selectionWithPartyComposition(
        activeAdmissionSelection,
        activePartySize,
        liveChildCount,
      ),
    [activeAdmissionSelection, activePartySize, liveChildCount],
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
  const livePlan = useMemo(
    () =>
      generatedPlan
        ? {
            ...generatedPlan,
            travelDate,
            admissionSelection: activeAdmissionSelection,
          }
        : null,
    [generatedPlan, travelDate, activeAdmissionSelection],
  );

  useEffect(() => {
    if (!generatedPlan && !lastPublishedPlan.current) return;
    onPlanGenerated?.(livePlan);
    lastPublishedPlan.current = livePlan;
  }, [generatedPlan, livePlan, onPlanGenerated]);

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
      {hasTicketOptions && (
        <fieldset className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
          <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("planner.admissionPartyComposition.title")}
          </legend>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label
              htmlFor={childCountInputId}
              className="text-xs text-slate-600 dark:text-slate-300"
            >
              {t("planner.admissionPartyComposition.children")}
            </label>
            <input
              id={childCountInputId}
              type="text"
              inputMode="numeric"
              value={childCountDraft}
              aria-invalid={childCountError ? true : undefined}
              aria-describedby={`${childCountHelpId}${childCountError ? ` ${childCountErrorId}` : ""}`}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setChildCountDraft(value);
                if (/^\d+$/.test(value)) {
                  const count = Number(value);
                  if (Number.isSafeInteger(count) && count <= activePartySize) {
                    setChildCountOverride({
                      destinationId: destination.id,
                      value: count,
                    });
                    onChildCountChange?.(count);
                  }
                }
              }}
              onBlur={() => {
                if (childCountDraft === "") {
                  setChildCountOverride({
                    destinationId: destination.id,
                    value: null,
                  });
                  onChildCountChange?.(undefined);
                }
              }}
              className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <span
              id={childCountHelpId}
              aria-live="polite"
              className="text-xs text-slate-500 dark:text-slate-400"
            >
              {effectiveChildCount === undefined
                ? t("planner.admissionPartyComposition.assumingAdults")
                : t("planner.admissionPartyComposition.summary", {
                    adultCount: activePartySize - effectiveChildCount,
                    childCount: effectiveChildCount,
                  })}
            </span>
          </div>
          {childCountError && (
            <p
              id={childCountErrorId}
              role="alert"
              className="mt-1 text-xs text-red-700 dark:text-red-300"
            >
              {childCountError}
            </p>
          )}
          {requiredProductIds.length > 1 && (
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-200">
              {t("planner.admissionOptions.product")}
              <select
                aria-label={t("planner.admissionOptions.product")}
                value={selectedTicketSelection?.productId ?? ""}
                onChange={(event) =>
                  updateTicketSelection({
                    productId: event.currentTarget.value || undefined,
                  })
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">{t("planner.admissionOptions.choose")}</option>
                {requiredProductIds.map((productId) => (
                  <option key={productId} value={productId}>
                    {productId}
                  </option>
                ))}
              </select>
            </label>
          )}
          {channels.length > 1 && (
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-200">
              {t("planner.admissionOptions.channel")}
              <select
                aria-label={t("planner.admissionOptions.channel")}
                value={selectedTicketSelection?.channel ?? ""}
                onChange={(event) =>
                  updateTicketSelection({
                    channel: (event.currentTarget.value ||
                      undefined) as AdmissionPriceSelection["channel"],
                  })
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">{t("planner.admissionOptions.any")}</option>
                {channels.map((channel) => (
                  <option key={channel} value={channel}>
                    {t(`planner.admissionOptions.channels.${channel}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {timeSlots.length > 1 && (
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-200">
              {t("planner.admissionOptions.timeSlot")}
              <select
                aria-label={t("planner.admissionOptions.timeSlot")}
                value={selectedTicketSelection?.timeSlot ?? ""}
                onChange={(event) =>
                  updateTicketSelection({
                    timeSlot: event.currentTarget.value || undefined,
                  })
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">{t("planner.admissionOptions.any")}</option>
                {timeSlots.map((timeSlot) => (
                  <option key={timeSlot} value={timeSlot}>
                    {timeSlot}
                  </option>
                ))}
              </select>
            </label>
          )}
          {addOnProductIds.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {t("planner.admissionOptions.addOns")}
              </p>
              {addOnProductIds.map((productId) => (
                <label
                  key={productId}
                  className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    checked={
                      selectedTicketSelection?.addOnProductIds?.includes(
                        productId,
                      ) ?? false
                    }
                    onChange={(event) => {
                      const current =
                        selectedTicketSelection?.addOnProductIds ?? [];
                      const next = event.currentTarget.checked
                        ? [...current, productId]
                        : current.filter((selected) => selected !== productId);
                      updateTicketSelection({ addOnProductIds: next });
                    }}
                  />
                  {productId}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

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
                  ...livePlan!,
                  travelDate,
                  admissionSelection: activeAdmissionSelection,
                  totalBudgetRange: costBreakdown?.totalRange,
                }
              : undefined,
          )
        }
        onPlanGenerated={setGeneratedPlanState}
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
