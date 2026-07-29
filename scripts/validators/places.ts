import {
  EDITORIAL_PILOT_IDS,
  PHASE_ONE_COHORT_IDS,
  YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS,
} from "../../src/shared/data/editorialPilot";
import { toCanonicalPlace } from "../../src/shared/services/place/PlaceCatalog";
import type {
  ValidationContext,
  ValidationIssue,
  ValidationResult,
  ValidatorModule,
} from "./types";

export const placesValidator: ValidatorModule = {
  name: "Canonical Places",
  description:
    "Validates v2 place type, editorial lifecycle, localized content, sources, and hub hierarchy.",
  purpose:
    "Ensure all catalog entries have a canonical foundation and reviewed pilots are traceable.",
  guarantees: [
    "Every catalog entry resolves to a hub or destination",
    "Published editorial records have a source and review metadata",
    "Pilot hubs have Japanese content and valid hierarchy",
  ],
  doesNotValidate: ["Translation quality", "Source URL reachability"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const places = context.catalog.destinations.map(toCanonicalPlace);
    const ids = new Set(places.map((place) => place.id));
    const pilotIds = new Set<string>(EDITORIAL_PILOT_IDS);
    const cohortIds = new Set<string>(PHASE_ONE_COHORT_IDS);
    const yokohamaDestinationIds = new Set<string>(
      YOKOHAMA_GOLD_STANDARD_DESTINATION_IDS,
    );

    for (const place of places) {
      if (place.placeType !== "hub" && place.placeType !== "destination") {
        issues.push({
          severity: "error",
          code: "INVALID_PLACE_TYPE",
          message: `Place '${place.id}' has an invalid type.`,
          targetId: place.id,
        });
      }
      if (!place.content.en.name || !place.content.en.description) {
        issues.push({
          severity: "error",
          code: "MISSING_ENGLISH_CONTENT",
          message: `Place '${place.id}' has incomplete English content.`,
          targetId: place.id,
        });
      }
      const parentId = place.relationships?.parentDestinationId;
      if (parentId && !ids.has(parentId)) {
        issues.push({
          severity: "error",
          code: "MISSING_PARENT_HUB",
          message: `Place '${place.id}' references missing hub '${parentId}'.`,
          targetId: place.id,
        });
      }
      if (
        place.editorial.lifecycle !== "legacy" &&
        place.editorial.sources.length === 0
      ) {
        issues.push({
          severity: "error",
          code: "PUBLISHED_WITHOUT_SOURCE",
          message: `Place '${place.id}' is editorially active without a source.`,
          targetId: place.id,
        });
      }
      if (
        place.editorial.lifecycle === "published" &&
        !place.editorial.reviewedAt
      ) {
        issues.push({
          severity: "error",
          code: "PUBLISHED_WITHOUT_REVIEW",
          message: `Place '${place.id}' is published without review history.`,
          targetId: place.id,
        });
      }
      if (
        place.editorial.lifecycle === "published" &&
        (!place.editorial.checkedAt || !place.editorial.freshness)
      ) {
        issues.push({
          severity: "warning",
          code: "PUBLISHED_WITHOUT_FRESHNESS",
          message: `Place '${place.id}' is published without freshness metadata.`,
          targetId: place.id,
        });
      }
      if (place.placeType === "destination") {
        if (!place.officialWebsite) {
          issues.push({
            severity: "warning",
            code: "DESTINATION_MISSING_OFFICIAL_WEBSITE",
            message: `Destination '${place.id}' is missing an official website; populate the editorial migration before promoting this check to an error.`,
            targetId: place.id,
          });
        } else {
          try {
            const url = new URL(place.officialWebsite);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              issues.push({
                severity: "error",
                code: "DESTINATION_INVALID_OFFICIAL_WEBSITE",
                message: `Destination '${place.id}' official website must use http or https.`,
                targetId: place.id,
              });
            }
          } catch {
            issues.push({
              severity: "error",
              code: "DESTINATION_INVALID_OFFICIAL_WEBSITE",
              message: `Destination '${place.id}' has an invalid official website URL.`,
              targetId: place.id,
            });
          }
        }
      }
      if (cohortIds.has(place.id)) {
        if (place.placeType !== "hub") {
          issues.push({
            severity: "error",
            code: "COHORT_NOT_HUB",
            message: `Phase 1 cohort place '${place.id}' must be a hub.`,
            targetId: place.id,
          });
        }
        if (place.editorial.lifecycle !== "published") {
          issues.push({
            severity: "error",
            code: "COHORT_NOT_PUBLISHED",
            message: `Phase 1 cohort place '${place.id}' is not published.`,
            targetId: place.id,
          });
        }
        if (!place.content.ja?.name || !place.content.ja.description) {
          issues.push({
            severity: "error",
            code: "COHORT_MISSING_JAPANESE",
            message: `Phase 1 cohort place '${place.id}' lacks Japanese content.`,
            targetId: place.id,
          });
        }
      }
      if (yokohamaDestinationIds.has(place.id)) {
        if (parentId !== "yokohama-city") {
          issues.push({
            severity: "error",
            code: "YOKOHAMA_CHILD_WRONG_PARENT",
            message: `Yokohama child '${place.id}' must belong to 'yokohama-city'.`,
            targetId: place.id,
          });
        }
        if (
          place.editorial.lifecycle !== "published" ||
          !place.content.ja?.name ||
          !place.content.ja.description
        ) {
          issues.push({
            severity: "error",
            code: "YOKOHAMA_CHILD_NOT_BILINGUAL_REVIEWED",
            message: `Yokohama child '${place.id}' must be published with Japanese content.`,
            targetId: place.id,
          });
        }
      }
      if (pilotIds.has(place.id)) {
        if (place.placeType !== "hub") {
          issues.push({
            severity: "error",
            code: "PILOT_NOT_HUB",
            message: `Pilot '${place.id}' must be a hub.`,
            targetId: place.id,
          });
        }
        if (!place.content.ja?.name || !place.content.ja.description) {
          issues.push({
            severity: "error",
            code: "PILOT_MISSING_JAPANESE",
            message: `Pilot '${place.id}' lacks reviewed Japanese content.`,
            targetId: place.id,
          });
        }
      }
    }

    for (const cohortId of cohortIds) {
      if (!ids.has(cohortId)) {
        issues.push({
          severity: "error",
          code: "MISSING_COHORT_PLACE",
          message: `Phase 1 cohort references missing place '${cohortId}'.`,
          targetId: cohortId,
        });
      }
    }
    for (const destinationId of yokohamaDestinationIds) {
      if (!ids.has(destinationId)) {
        issues.push({
          severity: "error",
          code: "MISSING_YOKOHAMA_CHILD",
          message: `Yokohama gold-standard list references missing place '${destinationId}'.`,
          targetId: destinationId,
        });
      }
    }

    const errorsCount = issues.filter(
      (issue) => issue.severity === "error",
    ).length;
    const warningsCount = issues.filter(
      (issue) => issue.severity === "warning",
    ).length;
    return {
      name: placesValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked: places.length,
        errorsCount,
        warningsCount,
        infoCount: 0,
        durationMs: 0,
      },
    };
  },
};
