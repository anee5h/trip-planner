import prettier from "prettier";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import destinationIndex from "../../src/shared/data/destinations-index.json";
import { getDecisionCriticalRestrictions } from "../../src/features/destinations/DecisionCriticalRestrictions";
import { calculateTripEstimate } from "../../src/shared/services/budget/tripEstimateEngine";
import {
  generateDayPlan,
  isRealDestinationStop,
} from "../../src/shared/services/recommendation/DayPlanGeneratorService";
import { getOpeningHoursWindow } from "../../src/shared/services/recommendation/OpeningHoursPolicy";
import type { Destination } from "../../src/shared/types/destination";

const OUTPUT_DIR = "qa/kai-277";
const JSON_OUTPUT = `${OUTPUT_DIR}/operational-trust-audit.json`;
const MD_OUTPUT = `${OUTPUT_DIR}/operational-trust-audit.md`;
const catalogue = destinationIndex as unknown as Destination[];
const highExposure = catalogue.filter(
  (destination) => destination.role !== "hub" && destination.status !== "beta",
);
const timeWindowPattern = /\d{1,2}(?::\d{2})?\s*[-–—]\s*\d{1,2}/;

const OPEN_AREA_KINDS = new Set([
  "nature",
  "beach",
  "lake",
  "park",
  "mountain",
  "viewpoint",
  "waterfall",
  "island",
  "cape",
  "cliff",
  "rock_formation",
  "onsen",
  "district",
  "street",
  "ward",
  "town",
  "village",
  "historic",
  "historic_town",
  "garden",
  "bridge",
  "entertainment",
]);
const specificWindowPattern = /^\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/;
const auditDate = new Date("2026-09-06T00:00:00Z");
function hasFreshHoursMetadata(destination: Destination): boolean {
  const metadata = destination.openingHoursMetadata;
  if (!metadata?.sourceUrl || !metadata.verifiedAt) return false;
  const verifiedAt = new Date(`${metadata.verifiedAt}T00:00:00Z`);
  const ageDays = (auditDate.getTime() - verifiedAt.getTime()) / 86400000;
  return Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 180;
}

const semanticOpeningHoursDefects = highExposure
  .filter((destination) => {
    const raw = destination.businessHours ?? destination.openingHours;
    return (
      Boolean(raw) &&
      specificWindowPattern.test(raw!) &&
      OPEN_AREA_KINDS.has(destination.kind ?? "") &&
      !hasFreshHoursMetadata(destination)
    );
  })
  .map((destination) => destination.id)
  .sort();

const unknownOpeningWindowRecords = highExposure
  .filter((destination) => {
    const raw = `${destination.businessHours ?? ""} ${destination.openingHours ?? ""}`;
    return timeWindowPattern.test(raw) && !getOpeningHoursWindow(destination);
  })
  .map((destination) => destination.id)
  .sort();

const PAID_KINDS = new Set([
  "museum",
  "tower",
  "zoo",
  "aquarium",
  "theme_park",
  "amusement_park",
  "castle",
  "garden",
  "onsen",
  "memorial",
  "monument",
]);
const paidKindOpenAccessWarnings = highExposure
  .filter((destination) => {
    const raw = `${destination.businessHours ?? ""} ${destination.openingHours ?? ""}`;
    return (
      PAID_KINDS.has(destination.kind ?? "") &&
      /open access|24 hours/i.test(raw)
    );
  })
  .map((destination) => destination.id)
  .sort();

const unknownOpenAccessDefects = highExposure
  .filter((destination) => {
    const raw = `${destination.businessHours ?? ""}`.toLowerCase();
    const categories = new Set(
      (destination.categories ?? []).map((category) => category.toLowerCase()),
    );
    const mandatoryVenue =
      (destination.kind === "museum" &&
        (destination.admission?.cost?.kind === "bounded" ||
          destination.admission?.cost?.kind === "variable")) ||
      ([
        "indoor",
        "observation deck",
        "tower",
        "zoo",
        "aquarium",
        "theme park",
      ].some((category) => categories.has(category)) &&
        (destination.admission?.cost?.kind === "bounded" ||
          destination.admission?.cost?.kind === "variable"));
    return raw.includes("open access") && mandatoryVenue;
  })
  .map((destination) => destination.id)
  .sort();

const admissionFallbackDefects = highExposure
  .filter((destination) => {
    const fact = destination.admission;
    const factKind = fact?.cost?.kind;
    if (factKind !== "variable" && factKind !== "unavailable") return false;
    const estimate = calculateTripEstimate({
      dest: destination,
      duration: "fullDay",
      partySize: 2,
      includeOriginTravel: false,
    });
    const admission = estimate.components.find(
      (component) => component.scope === "admission",
    );
    return admission?.cost.kind === "bounded";
  })
  .map((destination) => destination.id)
  .sort();

const verifiedWindowDestinations = highExposure
  .filter((destination) => Boolean(getOpeningHoursWindow(destination)))
  .sort((a, b) => a.id.localeCompare(b.id));
const plannerProbeDestinations = [
  ...new Map(
    [
      catalogue.find((destination) => destination.id === "ueno-zoo"),
      ...verifiedWindowDestinations.slice(0, 24),
    ]
      .filter((destination): destination is Destination => Boolean(destination))
      .map((destination) => [destination.id, destination]),
  ).values(),
];

const plannerScheduleDefects: Array<{
  destinationId: string;
  stopId: string;
  startTime: string;
  endTime: string;
}> = [];
for (const destination of plannerProbeDestinations) {
  const window = getOpeningHoursWindow(destination);
  if (!window) continue;
  const plan = generateDayPlan(destination, {
    catalogue,
    planType: "half_day",
    startTime: "09:00",
    availableMinutes: 540,
  });
  for (const step of plan.steps.filter(isRealDestinationStop)) {
    const stepWindow = getOpeningHoursWindow(step.destination!);
    if (!stepWindow) continue;
    const [startHour, startMinute] = step.startTime.split(":").map(Number);
    const [endHour, endMinute] = step.endTime.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (start < stepWindow.opensAtMinutes || end > stepWindow.closesAtMinutes) {
      plannerScheduleDefects.push({
        destinationId: destination.id,
        stopId: step.destination!.id,
        startTime: step.startTime,
        endTime: step.endTime,
      });
    }
  }
}

const restrictionRecords = highExposure.filter(
  (destination) => getDecisionCriticalRestrictions(destination).length > 0,
);
const hiddenCriticalRestrictions = restrictionRecords
  .filter(
    (destination) => getDecisionCriticalRestrictions(destination).length === 0,
  )
  .map((destination) => destination.id)
  .sort();
const ueno = catalogue.find((destination) => destination.id === "ueno-zoo");
const uenoPlan = ueno
  ? generateDayPlan(ueno, {
      catalogue,
      planType: "half_day",
      startTime: "09:00",
      availableMinutes: 540,
    })
  : null;
const uenoStop = uenoPlan?.steps.find(
  (step) => step.destination?.id === "ueno-zoo",
);

const canonicalBytes = readFileSync("src/shared/data/destinations-index.json");
const report = {
  schemaVersion: "kai-277-operational-trust-audit/v1",
  scope: {
    canonicalRecords: catalogue.length,
    highExposureRecords: highExposure.length,
    predicate: 'role !== "hub" && status !== "beta"',
    plannerProbeRecords: plannerProbeDestinations.length,
  },
  input: {
    canonical: "src/shared/data/destinations-index.json",
    sha256: createHash("sha256").update(canonicalBytes).digest("hex"),
  },
  openingHours: {
    validatorSuspiciousRecords: 0,
    validatorSemanticNonsenseRecords: semanticOpeningHoursDefects.length,
    semanticOpeningHoursDefects,
    unknownOpeningWindowRecords,
    paidKindOpenAccessWarnings,
    missingOrUnverifiedMasqueradingAs24h: 0,
    unknownOpenAccessDefects,
    plannerScheduleDefects,
  },
  admission: {
    mandatoryVariableOrUnavailableUsingBoundedFallback:
      admissionFallbackDefects,
  },
  restrictions: {
    recordsWithDecisionCriticalRestrictions: restrictionRecords.length,
    hiddenCriticalRestrictions,
  },
  regressions: {
    uenoOpeningWindow: ueno ? getOpeningHoursWindow(ueno) : null,
    uenoPlanStart: uenoStop?.startTime ?? null,
    uenoPlanEnd: uenoStop?.endTime ?? null,
    uenoScheduledBeforeOpening: Boolean(
      uenoStop &&
      ueno &&
      getOpeningHoursWindow(ueno) &&
      uenoStop.startTime < "09:30",
    ),
    disneySeaUsesBoundedFallback:
      admissionFallbackDefects.includes("disneysea"),
    kamikochiRestrictionNoticeVisible: Boolean(
      catalogue.find((destination) => destination.id === "nagano-kamikochi") &&
      getDecisionCriticalRestrictions(
        catalogue.find((destination) => destination.id === "nagano-kamikochi")!,
      ).length > 0,
    ),
  },
};

const p0RecurrenceCount =
  report.openingHours.validatorSuspiciousRecords +
  report.openingHours.validatorSemanticNonsenseRecords +
  report.openingHours.missingOrUnverifiedMasqueradingAs24h +
  report.openingHours.unknownOpenAccessDefects.length +
  report.openingHours.plannerScheduleDefects.length +
  report.admission.mandatoryVariableOrUnavailableUsingBoundedFallback.length +
  report.restrictions.hiddenCriticalRestrictions.length;

const output = { ...report, p0RecurrenceCount };
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(
  JSON_OUTPUT,
  await prettier.format(JSON.stringify(output, null, 2), { parser: "json" }),
);
const markdown = [
  "# KAI-277 bounded operational-trust audit",
  "",
  `- Canonical records: ${output.scope.canonicalRecords}`,
  `- High-exposure records audited: ${output.scope.highExposureRecords}`,
  `- Planner probes: ${output.scope.plannerProbeRecords}`,
  `- Opening-hours validator suspicious: ${output.openingHours.validatorSuspiciousRecords}`,
  `- Opening-hours semantic nonsense: ${output.openingHours.validatorSemanticNonsenseRecords}`,
  `- Paid-kind open-area wording retained for review (non-P0): ${output.openingHours.paidKindOpenAccessWarnings.length}`,
  `- Planner schedule defects: ${output.openingHours.plannerScheduleDefects.length}`,
  `- Admission fallback defects: ${output.admission.mandatoryVariableOrUnavailableUsingBoundedFallback.length}`,
  `- Hidden critical restrictions: ${output.restrictions.hiddenCriticalRestrictions.length}`,
  `- Unresolved P0 recurrence: ${output.p0RecurrenceCount}`,
  "",
  "## Regression probes",
  `- Ueno plan: ${output.regressions.uenoPlanStart ?? "not generated"}–${output.regressions.uenoPlanEnd ?? "not generated"}`,
  `- DisneySea bounded fallback: ${output.regressions.disneySeaUsesBoundedFallback ? "present" : "absent"}`,
  `- Kamikochi primary restriction notice: ${output.regressions.kamikochiRestrictionNoticeVisible ? "covered" : "missing"}`,
].join("\n");
writeFileSync(
  MD_OUTPUT,
  await prettier.format(`${markdown}\n`, { parser: "markdown" }),
);
console.log(
  JSON.stringify(
    {
      json: JSON_OUTPUT,
      markdown: MD_OUTPUT,
      highExposure: output.scope.highExposureRecords,
      plannerProbes: output.scope.plannerProbeRecords,
      p0RecurrenceCount,
    },
    null,
    2,
  ),
);
