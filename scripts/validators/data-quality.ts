import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";
import {
  collectDestinationIssues,
  collectCollectionIssues,
  collectTransportClusters,
  buildMembershipMap,
  PREVENTIVE_CODES,
  type DestinationRuleContext,
} from "../audit/data-quality-rules";

/**
 * KAI-87 preventive data-quality validators (report §G, PR 6).
 *
 * The pure rules live in scripts/audit/data-quality-rules.ts and are shared
 * with the catalogue audit (check:catalog-warnings baseline gate) so the two
 * gating surfaces cannot drift apart.
 *
 * Severity split:
 *  - PREVENTIVE_CODES are ERRORS: deterministic violations, zero-debt in the
 *    catalogue after KAI-87 PR 1-5, so validate:catalog-fast fails on any
 *    new instance (island rail, QA-text leaks, version tags, placeholder
 *    sources, unknown transport keys, hero-license mismatch, off-union
 *    kind/status, missing travelEstimate, collection sortOrder/shape).
 *  - the remaining codes are WARNINGs: accepted-debt classes (legacy roles,
 *    missing season/budget/image metadata, template clusters, hours
 *    conflicts, collection count semantics) whose existing instances are
 *    baselined in check:catalog-warnings; new instances fail that gate.
 */

export const dataQualityValidator: ValidatorModule = {
  name: "KAI-87 Data Quality",
  description:
    "Preventive catalogue-quality checks: schema unions, transport-mode consistency, hours conflicts, seasonality sanity, completeness, image metadata, and collection integrity.",
  dependsOn: [
    "Catalog Destinations",
    "Catalog Collections",
    "Catalog Relationships",
  ],
  purpose:
    "Make known data-quality debt visible, fail the gate on new preventive violations, and stop regressions after the KAI-87 correction PRs.",
  guarantees: [
    "New island-rail claims, QA-text leaks, version tags, placeholder sources, unknown transport keys, and hero-license mismatches fail validate:catalog-fast",
    "Off-union kind/status and missing travelEstimate fail validate:catalog-fast",
    "Collection sortOrder collisions and membership-shape drift fail validate:catalog-fast",
    "Debt classes (season/budget/metadata gaps, clusters, hours conflicts) are surfaced as baselined warnings",
  ],
  doesNotValidate: [
    "HTTP image availability",
    "Fee values vs official sources",
    "Description factual accuracy",
  ],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const started = Date.now();
    const { destinations, collections } = context.catalog;
    const issues: ValidationIssue[] = [];

    const zoneLocalModes = new Map<string, readonly string[]>();
    try {
      const topology =
        await import("../../src/shared/data/transport-topology.json");
      for (const zone of (
        topology as unknown as {
          zones: Array<{ id: string; localModes: string[] }>;
        }
      ).zones) {
        zoneLocalModes.set(zone.id, zone.localModes);
      }
    } catch {
      // topology import is optional; island-rail check degrades gracefully
    }
    const ruleCtx: DestinationRuleContext = { zoneLocalModes };

    const membershipMap = buildMembershipMap(destinations);
    const collectionIssues = collectCollectionIssues(
      collections,
      membershipMap,
    );
    const clusterIssues = collectTransportClusters(destinations);
    const all: Array<{ code: string; message: string; targetId?: string }> = [];

    for (const d of destinations) {
      for (const issue of collectDestinationIssues(d, ruleCtx)) {
        all.push({ ...issue, targetId: d.id });
      }
    }
    all.push(...collectionIssues, ...clusterIssues);

    for (const finding of all) {
      issues.push({
        severity: PREVENTIVE_CODES.has(finding.code) ? "error" : "warning",
        code: finding.code,
        message: finding.message,
        targetId: finding.targetId,
      });
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    return {
      name: dataQualityValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked: destinations.length + collections.length,
        errorsCount,
        warningsCount,
        infoCount: 0,
        durationMs: Date.now() - started,
      },
    };
  },
};
