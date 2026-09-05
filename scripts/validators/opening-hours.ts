import type { ValidatorModule } from "./types";
import { getOpeningHoursAssessment } from "../../src/shared/services/recommendation/OpeningHoursPolicy";
import type { Destination } from "../../src/shared/types/destination";
import openingHoursAllowlistJson from "./opening-hours-allowlist.json";

/**
 * Kinds that describe open areas rather than a single gated facility.
 * A specific window ("09:00 - 17:00") claimed for these kinds is
 * semantically suspect unless it is verified to a real facility.
 */
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

const SPECIFIC_WINDOW = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/;

function loadAllowlist(): Set<string> {
  return new Set(openingHoursAllowlistJson);
}

function hasFreshMetadata(destination: Destination): boolean {
  const meta = destination.openingHoursMetadata;
  if (!meta?.sourceUrl || !meta.verifiedAt) return false;
  const verifiedDate = new Date(meta.verifiedAt);
  if (Number.isNaN(verifiedDate.getTime())) return false;
  const ageDays = (Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24);
  return ageDays >= 0 && ageDays <= 180;
}

export const openingHoursValidator: ValidatorModule = {
  name: "Opening Hours Integrity",
  description:
    "Validates businessHours shape, kind fit, and verification metadata for the catalogue.",
  purpose:
    "Prevent blanket or unverified opening windows on open-area destinations and malformed hours metadata.",
  guarantees: [
    "Specific-window businessHours on open-area kinds carry fresh metadata or are allowlisted debt",
    "openingHoursMetadata.verifiedAt is a valid past date when present",
  ],
  doesNotValidate: [
    "Editorial truthfulness of verified hours (source review is human)",
  ],
  async validate({ catalog }) {
    const allowlist = loadAllowlist();
    const issues: Array<{
      severity: "error" | "warning" | "info";
      code: string;
      message: string;
      targetId?: string;
    }> = [];
    let warnings = 0;
    let infos = 0;

    for (const destination of catalog.destinations) {
      const id = destination.id;
      const hours = destination.businessHours;
      const meta = destination.openingHoursMetadata;
      const assessment = getOpeningHoursAssessment(destination);

      // Malformed verification metadata is always an error (new defect).
      if (meta?.verifiedAt) {
        const verifiedDate = new Date(meta.verifiedAt);
        if (
          Number.isNaN(verifiedDate.getTime()) ||
          verifiedDate.getTime() > Date.now()
        ) {
          issues.push({
            severity: "error",
            code: "MALFORMED_HOURS_METADATA",
            message: `Destination '${id}' has an invalid or future openingHoursMetadata.verifiedAt (${meta.verifiedAt}).`,
            targetId: id,
          });
        }
      }

      if (
        assessment.status !== "not_required" &&
        OPEN_AREA_KINDS.has(destination.kind ?? "") &&
        hours &&
        SPECIFIC_WINDOW.test(hours) &&
        !hasFreshMetadata(destination)
      ) {
        if (allowlist.has(id)) {
          warnings += 1;
          issues.push({
            severity: "warning",
            code: "OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED",
            message: `Destination '${id}' (${destination.kind}) carries specific-window hours '${hours}' with no fresh verification; allowlisted debt (see issue #335).`,
            targetId: id,
          });
        } else {
          issues.push({
            severity: "error",
            code: "OPEN_AREA_SPECIFIC_WINDOW_UNVERIFIED",
            message: `Destination '${id}' (${destination.kind}) carries specific-window hours '${hours}' with no fresh verification metadata. Verify via a source URL (openingHoursMetadata.sourceUrl + verifiedAt) or use open-area wording.`,
            targetId: id,
          });
        }
        continue;
      }

      if (
        hours &&
        !OPEN_AREA_KINDS.has(destination.kind ?? "") &&
        meta &&
        (!meta.sourceUrl || !meta.verifiedAt) &&
        assessment.status === "unverified"
      ) {
        warnings += 1;
        issues.push({
          severity: "warning",
          code: "HOURS_METADATA_INCOMPLETE",
          message: `Destination '${id}' has openingHoursMetadata without sourceUrl+verifiedAt; hours remain unverified.`,
          targetId: id,
        });
      }

      if (hours && !meta && assessment.status !== "not_required") {
        infos += 1;
        issues.push({
          severity: "info",
          code: "HOURS_WITHOUT_METADATA",
          message: `Destination '${id}' shows businessHours with no verification metadata.`,
          targetId: id,
        });
      }
    }

    const errors = issues.filter((i) => i.severity === "error");
    return {
      name: "Opening Hours Integrity",
      passed: errors.length === 0,
      issues,
      metrics: {
        totalChecked: catalog.destinations.length,
        errorsCount: errors.length,
        warningsCount: warnings,
        infoCount: infos,
        durationMs: 0,
      },
    };
  },
};
