import type {
  AdmissionDayType,
  AdmissionPricingBasis,
  AdmissionPriceOption,
  AdmissionPriceSelection,
} from "@/shared/types/destination";
import { isValidCheckedAtDate } from "./factValidation";
import { getJapanHolidayStatus } from "@/shared/data/busyPeriodCues";
import { getJapanWeekday } from "@/shared/utils/season";

export type AdmissionPricingResolution =
  | {
      readonly kind: "bounded";
      readonly min: number;
      readonly max: number;
      readonly basis: AdmissionPricingBasis;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "price_variable_by_date"
        | "price_variable_by_time"
        | "price_variable_by_product";
    };

const ADMISSION_BASIS_RANK: Record<AdmissionPricingBasis, number> = {
  fixed_price: 0,
  selected_date: 1,
  supported_range: 2,
};

export function weakerAdmissionPricingBasis(
  first: AdmissionPricingBasis | undefined,
  second: AdmissionPricingBasis | undefined,
): AdmissionPricingBasis | undefined {
  if (!first) return second;
  if (!second) return first;
  return ADMISSION_BASIS_RANK[first] >= ADMISSION_BASIS_RANK[second]
    ? first
    : second;
}

/** Drop a stored adult/child split when the live party no longer matches it. */
export function selectionForPartySize(
  selection: AdmissionPriceSelection | undefined,
  partySize: number,
): AdmissionPriceSelection | undefined {
  if (!selection) return undefined;
  const { adultCount, childCount, ...ticketChoices } = selection;
  if (adultCount === undefined && childCount === undefined) return selection;
  if (
    Number.isInteger(adultCount) &&
    Number.isInteger(childCount) &&
    adultCount! >= 0 &&
    childCount! >= 0 &&
    adultCount! + childCount! === partySize
  ) {
    return selection;
  }
  return Object.keys(ticketChoices).length ? ticketChoices : undefined;
}

/** Apply a chosen child count while preserving ticket-specific choices. */
export function selectionWithPartyComposition(
  selection: AdmissionPriceSelection | undefined,
  partySize: number,
  childCount: number | null | undefined,
): AdmissionPriceSelection | undefined {
  const normalized = selectionForPartySize(selection, partySize);
  if (childCount === undefined) return normalized;
  const {
    adultCount,
    childCount: previousChildCount,
    ...ticketChoices
  } = normalized ?? {};
  if (childCount === null) {
    return adultCount === undefined && previousChildCount === undefined
      ? normalized
      : Object.keys(ticketChoices).length
        ? ticketChoices
        : undefined;
  }
  if (
    !Number.isInteger(childCount) ||
    childCount < 0 ||
    childCount > partySize ||
    !Number.isInteger(partySize) ||
    partySize < 1
  ) {
    return normalized;
  }
  return {
    ...ticketChoices,
    adultCount: partySize - childCount,
    childCount,
  };
}

interface PriceVariant {
  readonly options: readonly AdmissionPriceOption[];
}

function visitDateBoundsApply(option: AdmissionPriceOption, visitDate: string) {
  if (
    (option.validFrom && visitDate < option.validFrom) ||
    (option.validUntil && visitDate > option.validUntil)
  ) {
    return false;
  }
  return true;
}

function dayTypesForDate(
  visitDate: string,
): readonly AdmissionDayType[] | undefined {
  const weekday = getJapanWeekday(visitDate);
  const isWeekend = weekday === 0 || weekday === 6;
  const holidayStatus = getJapanHolidayStatus(visitDate);
  if (holidayStatus === "unknown") return undefined;

  const types: AdmissionDayType[] = [];
  if (holidayStatus === "holiday") types.push("holiday");
  if (isWeekend) types.push("weekend");
  if (!isWeekend && holidayStatus !== "holiday") types.push("weekday");
  return types;
}

function dayTypeApplies(
  option: AdmissionPriceOption,
  dayTypes: readonly AdmissionDayType[],
) {
  if (!option.dayType) return true;
  if (option.dayType === "weekend_or_holiday") {
    return dayTypes.includes("weekend") || dayTypes.includes("holiday");
  }
  return dayTypes.includes(option.dayType);
}

function optionMatchesSelection(
  option: AdmissionPriceOption,
  selection: AdmissionPriceSelection,
  optional: boolean,
  productId?: string,
) {
  if (Boolean(option.optional) !== optional) return false;
  if (productId && option.productId !== productId) return false;
  if (
    !optional &&
    selection.productId &&
    option.productId !== selection.productId
  ) {
    return false;
  }
  if (
    selection.channel &&
    option.channel !== undefined &&
    option.channel !== selection.channel
  ) {
    return false;
  }
  if (
    selection.timeSlot &&
    option.timeSlot !== undefined &&
    option.timeSlot !== selection.timeSlot
  ) {
    return false;
  }
  return true;
}

function groupVariants(
  options: readonly AdmissionPriceOption[],
): PriceVariant[] {
  const groups = new Map<string, AdmissionPriceOption[]>();
  for (const option of options) {
    const key = [option.productId, option.variantId].join("\u0000");
    const group = groups.get(key) ?? [];
    group.push(option);
    groups.set(key, group);
  }
  return Array.from(groups.values(), (options) => ({ options }));
}

function resolveOptionSet(
  options: readonly AdmissionPriceOption[],
  visitDate: string | undefined,
  selection: AdmissionPriceSelection,
  optional: boolean,
  productId?: string,
): AdmissionPricingResolution {
  const relevantOptions = options.filter((option) =>
    optionMatchesSelection(option, selection, optional, productId),
  );
  if (
    !visitDate &&
    relevantOptions.some(
      (option) =>
        option.validFrom !== undefined ||
        option.validUntil !== undefined ||
        option.dayType !== undefined,
    )
  ) {
    return { kind: "unavailable", reason: "price_variable_by_date" };
  }
  const dateRelevantOptions = visitDate
    ? relevantOptions.filter((option) =>
        visitDateBoundsApply(option, visitDate),
      )
    : relevantOptions;
  const dayTypes =
    visitDate && dateRelevantOptions.some((option) => option.dayType)
      ? dayTypesForDate(visitDate)
      : [];
  if (dayTypes === undefined) {
    return { kind: "unavailable", reason: "price_variable_by_date" };
  }
  const applicable = visitDate
    ? dateRelevantOptions.filter((option) => dayTypeApplies(option, dayTypes))
    : dateRelevantOptions;
  const variants = groupVariants(applicable);
  if (variants.length === 0) {
    return {
      kind: "unavailable",
      reason: selection.timeSlot
        ? "price_variable_by_time"
        : visitDate
          ? "price_variable_by_date"
          : "price_variable_by_product",
    };
  }

  if (
    selection.adultCount === undefined ||
    selection.childCount === undefined
  ) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }

  const totals: Array<{ min: number; max: number }> = [];
  for (const variant of variants) {
    let min = 0;
    let max = 0;
    for (const [category, count] of [
      ["adult", selection.adultCount],
      ["child", selection.childCount],
    ] as const) {
      if (count === 0) continue;
      const option = variant.options.find((item) => item.category === category);
      if (!option) {
        return {
          kind: "unavailable",
          reason: "price_variable_by_product",
        };
      }
      min += option.min * count;
      max += option.max * count;
    }
    totals.push({ min, max });
  }

  const dateSpecific = variants[0]?.options.some(
    (option) =>
      option.validFrom !== undefined ||
      option.validUntil !== undefined ||
      option.dayType !== undefined,
  );
  const singleTotal = totals.length === 1 && totals[0].min === totals[0].max;
  const exactSelection = visitDate !== undefined && dateSpecific && singleTotal;
  return {
    kind: "bounded",
    min: Math.min(...totals.map((total) => total.min)),
    max: Math.max(...totals.map((total) => total.max)),
    basis: exactSelection
      ? "selected_date"
      : totals.length !== 1 || !singleTotal
        ? "supported_range"
        : "fixed_price",
  };
}

/**
 * Resolves reviewed ticket variants for an explicitly composed party.
 * Optional products enter the total only when explicitly selected.
 */
export function resolveAdmissionPricing(
  options: readonly AdmissionPriceOption[],
  partySize: number,
  visitDate?: string,
  selection: AdmissionPriceSelection = {},
): AdmissionPricingResolution {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }
  if (visitDate !== undefined && !isValidCheckedAtDate(visitDate)) {
    return { kind: "unavailable", reason: "price_variable_by_date" };
  }
  if (!Number.isInteger(partySize) || partySize < 1) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }
  if (
    (selection.productId !== undefined &&
      (typeof selection.productId !== "string" ||
        selection.productId.trim() === "")) ||
    (selection.channel !== undefined &&
      selection.channel !== "online" &&
      selection.channel !== "counter") ||
    (selection.timeSlot !== undefined &&
      (typeof selection.timeSlot !== "string" ||
        selection.timeSlot.trim() === ""))
  ) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }
  const hasAdultCount = selection.adultCount !== undefined;
  const hasChildCount = selection.childCount !== undefined;
  if (hasAdultCount !== hasChildCount) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }
  if (!hasAdultCount) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }
  if (
    hasAdultCount &&
    (!Number.isInteger(selection.adultCount) ||
      !Number.isInteger(selection.childCount) ||
      selection.adultCount! < 0 ||
      selection.childCount! < 0 ||
      selection.adultCount! + selection.childCount! !== partySize)
  ) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }

  const requiredProductIds = new Set(
    options
      .filter((option) => !option.optional)
      .map((option) => option.productId),
  );
  if (!selection.productId && requiredProductIds.size > 1) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }

  const addOnProductIds = selection.addOnProductIds ?? [];
  if (
    !Array.isArray(addOnProductIds) ||
    addOnProductIds.some((id) => typeof id !== "string" || id.trim() === "") ||
    new Set(addOnProductIds).size !== addOnProductIds.length
  ) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }

  if (addOnProductIds.length > 0) {
    const selectedAddOnOptions = options.filter(
      (option) => option.optional && addOnProductIds.includes(option.productId),
    );
    if (
      selectedAddOnOptions.some((option) => option.channel !== undefined) &&
      selection.channel === undefined
    ) {
      return { kind: "unavailable", reason: "price_variable_by_product" };
    }
    if (
      selectedAddOnOptions.some((option) => option.timeSlot !== undefined) &&
      selection.timeSlot === undefined
    ) {
      return { kind: "unavailable", reason: "price_variable_by_time" };
    }
    if (
      selectedAddOnOptions.some(
        (option) =>
          option.validFrom !== undefined ||
          option.validUntil !== undefined ||
          option.dayType !== undefined,
      ) &&
      visitDate === undefined
    ) {
      return { kind: "unavailable", reason: "price_variable_by_date" };
    }
  }

  const base = resolveOptionSet(options, visitDate, selection, false);
  if (base.kind === "unavailable") return base;

  let min = base.min;
  let max = base.max;
  let basis = base.basis;
  for (const productId of addOnProductIds) {
    const addOn = resolveOptionSet(
      options,
      visitDate,
      selection,
      true,
      productId,
    );
    if (addOn.kind === "unavailable") return addOn;
    min += addOn.min;
    max += addOn.max;
    const combinedBasis = weakerAdmissionPricingBasis(basis, addOn.basis);
    if (combinedBasis) basis = combinedBasis;
  }

  return { kind: "bounded", min, max, basis };
}
