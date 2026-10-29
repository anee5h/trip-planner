import type {
  AdmissionPriceOption,
  AdmissionPriceSelection,
} from "@/shared/types/destination";
import { isValidCheckedAtDate } from "./factValidation";

export type AdmissionPricingResolution =
  | {
      readonly kind: "bounded";
      readonly min: number;
      readonly max: number;
      readonly basis: "selected_date" | "supported_range";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "price_variable_by_date"
        | "price_variable_by_time"
        | "price_variable_by_product";
    };

interface PriceVariant {
  readonly options: readonly AdmissionPriceOption[];
}

function visitDateApplies(option: AdmissionPriceOption, visitDate: string) {
  if (
    (option.validFrom && visitDate < option.validFrom) ||
    (option.validUntil && visitDate > option.validUntil)
  ) {
    return false;
  }
  if (option.dayType) {
    const weekday = new Date(visitDate + "T00:00:00.000Z").getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    if (option.dayType !== (isWeekend ? "weekend" : "weekday")) return false;
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
  partySize: number,
  visitDate: string | undefined,
  selection: AdmissionPriceSelection,
  optional: boolean,
  productId?: string,
): AdmissionPricingResolution {
  const applicable = options.filter((option) => {
    if (Boolean(option.optional) !== optional) return false;
    if (productId && option.productId !== productId) return false;
    if (
      !optional &&
      selection.productId &&
      option.productId !== selection.productId
    )
      return false;
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
    return !visitDate || visitDateApplies(option, visitDate);
  });
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

  const hasComposition =
    selection.adultCount !== undefined && selection.childCount !== undefined;
  const categoriesKnown = new Set(applicable.map((option) => option.category));
  if (!hasComposition && !categoriesKnown.has("adult")) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }

  const totals: Array<{ min: number; max: number }> = [];
  for (const variant of variants) {
    if (hasComposition) {
      let min = 0;
      let max = 0;
      for (const [category, count] of [
        ["adult", selection.adultCount!],
        ["child", selection.childCount!],
      ] as const) {
        if (count === 0) continue;
        const option = variant.options.find(
          (item) => item.category === category,
        );
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
      continue;
    }

    const requiredCategories = categoriesKnown.has("child")
      ? (["adult", "child"] as const)
      : (["adult"] as const);
    const categoryOptions = requiredCategories.map((category) =>
      variant.options.find((option) => option.category === category),
    );
    if (categoryOptions.some((option) => !option)) {
      return { kind: "unavailable", reason: "price_variable_by_product" };
    }
    totals.push({
      min:
        Math.min(...categoryOptions.map((option) => option!.min)) * partySize,
      max:
        Math.max(...categoryOptions.map((option) => option!.max)) * partySize,
    });
  }

  const exactSelection =
    visitDate !== undefined &&
    totals.length === 1 &&
    (hasComposition || categoriesKnown.size === 1);
  return {
    kind: "bounded",
    min: Math.min(...totals.map((total) => total.min)),
    max: Math.max(...totals.map((total) => total.max)),
    basis: exactSelection ? "selected_date" : "supported_range",
  };
}

/**
 * Resolves reviewed ticket variants to one party range. Without enough
 * selection context, it returns the envelope of compatible published prices;
 * optional products enter the total only when explicitly selected.
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

  const addOnProductIds = selection.addOnProductIds ?? [];
  if (
    !Array.isArray(addOnProductIds) ||
    addOnProductIds.some((id) => typeof id !== "string" || id.trim() === "") ||
    new Set(addOnProductIds).size !== addOnProductIds.length
  ) {
    return { kind: "unavailable", reason: "price_variable_by_product" };
  }

  if (addOnProductIds.length > 0) {
    const selectedProducts = options.filter((option) =>
      option.optional
        ? addOnProductIds.includes(option.productId)
        : !selection.productId || option.productId === selection.productId,
    );
    const baseProductIds = new Set(
      selectedProducts
        .filter((option) => !option.optional)
        .map((option) => option.productId),
    );
    if (!selection.productId && baseProductIds.size > 1) {
      return { kind: "unavailable", reason: "price_variable_by_product" };
    }
    if (
      selectedProducts.some((option) => option.channel !== undefined) &&
      selection.channel === undefined
    ) {
      return { kind: "unavailable", reason: "price_variable_by_product" };
    }
    if (
      selectedProducts.some((option) => option.timeSlot !== undefined) &&
      selection.timeSlot === undefined
    ) {
      return { kind: "unavailable", reason: "price_variable_by_time" };
    }
    if (
      selectedProducts.some(
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

  const base = resolveOptionSet(
    options,
    partySize,
    visitDate,
    selection,
    false,
  );
  if (base.kind === "unavailable") return base;

  let min = base.min;
  let max = base.max;
  let basis = base.basis;
  for (const productId of addOnProductIds) {
    const addOn = resolveOptionSet(
      options,
      partySize,
      visitDate,
      selection,
      true,
      productId,
    );
    if (addOn.kind === "unavailable") return addOn;
    min += addOn.min;
    max += addOn.max;
    if (addOn.basis === "supported_range") basis = "supported_range";
  }

  return { kind: "bounded", min, max, basis };
}
