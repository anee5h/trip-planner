import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyApprovedChanges,
  buildGovernanceReport,
  loadActualGovernanceReport,
  manualReviewCandidateSha256,
  manualReviewEvidenceSha256,
  publishApprovedCatalogue,
  promoteManualReview,
  reportSha256,
  restoreCatalogueBackup,
  stableJson,
} from "../kai-324-admission-governance";
import { parseJpyText } from "../kai-323-admission-pilot";
import type {
  ApprovalArtifact,
  BuildReportInput,
  GovernanceExtraction,
  KAI323ProposalRecord,
} from "../kai-324-admission-governance";
import type { SourceRegistryEntry } from "../kai-323-admission-pilot";

type JsonObject = Record<string, unknown>;

const SOURCE_URL = "https://official.example.test/tickets";

function makeInput(
  options: {
    state?: string;
    cost?: JsonObject;
    extraction?: Partial<GovernanceExtraction>;
    action?: string;
    destinationId?: string;
    sourceUrl?: string;
    technicalStatus?: number | null;
  } = {},
): BuildReportInput {
  const destinationId = options.destinationId ?? "fixture-attraction";
  const state = options.state ?? "verified_paid";
  const cost = options.cost ?? { kind: "bounded", min: 1000, max: 1000 };
  const sourceUrl = options.sourceUrl ?? SOURCE_URL;
  const extraction: GovernanceExtraction = {
    destinationId,
    sourceUrl,
    sourceLanguage: "ja",
    collectedAt: "2026-09-23",
    currency: "JPY",
    originalPriceText: "大人 ¥1,000（消費税込み）",
    adultPrice: 1000,
    childPrice: null,
    onlinePrice: null,
    counterPrice: null,
    minimumPrice: 1000,
    maximumPrice: 1000,
    validFrom: null,
    validUntil: null,
    weekdayOrWeekend: null,
    timeSlotConditions: "standard adult admission",
    ticketProduct: "general admission",
    extractionStatus: "verified",
    failureReason: null,
    manualVerified: true,
    admissionScope: "general_entry",
    visitorCategory: "adult",
    taxBasis: "tax_inclusive",
    verificationDate: "2026-09-23",
    ...options.extraction,
  };
  const proposal: KAI323ProposalRecord = {
    destinationId,
    existing: {
      state,
      provenance: state === "not_applicable" ? "none" : "verified_source",
      reasonCode:
        state === "unavailable"
          ? "source_missing"
          : state === "not_applicable"
            ? "no_single_admission_product"
            : null,
      costKind: cost.kind,
      minimumPrice: cost.min ?? null,
      maximumPrice: cost.max ?? null,
      scope: "general_entry",
      sourceUrls: [SOURCE_URL],
      checkedAt: "2026-09-01",
      basis:
        state === "verified_free"
          ? "Official page states admission is free; no entry fee."
          : "Official source checked.",
    },
    extracted: {
      status: extraction.extractionStatus,
      sourceUrl: extraction.sourceUrl,
      ticketProduct: extraction.ticketProduct,
      adultPrice: extraction.adultPrice,
      childPrice: extraction.childPrice,
      onlinePrice: extraction.onlinePrice,
      counterPrice: extraction.counterPrice,
      minimumPrice: extraction.minimumPrice,
      maximumPrice: extraction.maximumPrice,
      originalPriceText: extraction.originalPriceText,
      conditions: extraction.timeSlotConditions,
      failureReason: extraction.failureReason,
      manualVerified: extraction.manualVerified,
      verificationNote: extraction.verificationNote,
    },
    proposedAction: options.action ?? "review_required_conflict_or_scope",
    productionCatalogueChanged: false,
  };
  const registry: SourceRegistryEntry = {
    destinationId,
    sourceUrl: SOURCE_URL,
    sourceLanguage: "ja",
    robotsUrl: "https://official.example.test/robots.txt",
    robotsStatus: 200,
    robotsBlockedAll: false,
    technicalStatus:
      options.technicalStatus !== undefined ? options.technicalStatus : 200,
    technicalResult: "price_text_retrieved",
    termsStatus: "not_located",
    automationEligibility: "manual_review_required",
  };
  const destination: JsonObject = {
    id: destinationId,
    name: "Fixture attraction",
    admission: {
      state,
      provenance: state === "not_applicable" ? "none" : "verified_source",
      ...(state === "unavailable" ? { reasonCode: "source_missing" } : {}),
      ...(state === "not_applicable"
        ? { reasonCode: "no_single_admission_product" }
        : {}),
      cost,
      scope: "general_entry",
      ticketProduct: "general admission",
      visitorCategory: "adult",
      taxBasis: "tax_inclusive",
      basis:
        state === "verified_free"
          ? "Official page states admission is free; no entry fee."
          : "Official source checked.",
      sourceUrls: [SOURCE_URL],
      checkedAt: "2026-09-01",
    },
  };
  return {
    catalogue: [destination],
    baseline: {
      schemaVersion: 1,
      ticket: "KAI-323",
      baseSha: "a94556fcf2718a05a90c69df878c7c2b44779492",
      readOnly: true,
      cohortSize: 1,
      records: [{ destinationId, currentAdmission: proposal.existing }],
    },
    proposalsArtifact: {
      schemaVersion: 1,
      ticket: "KAI-323",
      baseSha: "a94556fcf2718a05a90c69df878c7c2b44779492",
      readOnly: true,
      cohortSize: 1,
      counts: {
        [options.action ?? "review_required_conflict_or_scope"]: 1,
      },
      records: [proposal],
    },
    proposals: [proposal],
    extractions: [extraction],
    registry: [registry],
  };
}

function approvedFixtureInput(): BuildReportInput {
  return makeInput();
}

function approvedFixtureReport() {
  const report = buildGovernanceReport(approvedFixtureInput());
  report.catalogueBaseVerified = true;
  return report;
}

function manualArtifactFor(
  report: ReturnType<typeof buildGovernanceReport>,
  input: BuildReportInput,
) {
  const record = report.records[0];
  const reviewableCodes = new Set([
    "ticket_product_conflict",
    "pricing_scope_requires_review",
    "kai323_scope_review_required",
  ]);
  return {
    schemaVersion: 1 as const,
    ticket: "KAI-324" as const,
    reportSha256: reportSha256(report),
    catalogueSha256: report.catalogueSha256,
    reviewedAt: "2026-09-23",
    reviewedBy: "manual reviewer",
    explicitManualApproval: true as const,
    decisions: [
      {
        destinationId: record.destinationId,
        sourceUrl: record.sourceEvidence.sourceUrl,
        evidenceSha256: manualReviewEvidenceSha256(record),
        candidateSha256: manualReviewCandidateSha256(record),
        revalidatedAt: "2026-09-23",
        reviewerNote:
          "Revalidated the exact candidate against the cited evidence.",
        resolvedIssues: record.reasonCodes
          .filter((reasonCode) => reviewableCodes.has(reasonCode))
          .map((reasonCode) => ({
            reasonCode,
            resolution: `Resolved ${reasonCode} against ${input.proposals[0].destinationId}.`,
          })),
      },
    ],
  };
}

describe("KAI-324 merged KAI-323 dry run", () => {
  it("keeps all eight accepted research results out of automatic approval", () => {
    const report = loadActualGovernanceReport();
    expect(report.counts).toEqual({
      total: 25,
      approved: 0,
      heldForReview: 11,
      rejected: 14,
      kai323AcceptedCandidates: 8,
      currentFactsUntouched: 25,
    });
    expect(
      report.records.filter((record) => record.manualVerified),
    ).toHaveLength(8);
    expect(report.records.every((record) => record.currentFactUntouched)).toBe(
      true,
    );
    expect(
      report.records.some((record) => record.decision === "approved"),
    ).toBe(false);
  });

  it("executes the checked actual KAI-323 outcome fixture", () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "qa/kai-324/fixtures/governance-fixtures.json",
        ),
        "utf8",
      ),
    ) as {
      actualKAI323Outcomes: Array<{
        destinationId: string;
        priorAction: string;
        expectedDecision: string;
        reasonCodes: string[];
      }>;
      syntheticSemantics: string[];
    };
    const report = loadActualGovernanceReport();
    expect(fixture.actualKAI323Outcomes).toHaveLength(report.records.length);
    expect(
      new Set(fixture.actualKAI323Outcomes.map((item) => item.destinationId)),
    ).toEqual(new Set(report.records.map((record) => record.destinationId)));
    for (const expected of fixture.actualKAI323Outcomes) {
      const record = report.records.find(
        (candidate) => candidate.destinationId === expected.destinationId,
      );
      expect(record?.priorKAI323Action).toBe(expected.priorAction);
      expect(record?.decision).toBe(expected.expectedDecision);
      expect(record?.reasonCodes).toEqual(expected.reasonCodes);
    }
    expect(fixture.syntheticSemantics).toEqual(
      expect.arrayContaining([
        "fixed_verified_paid",
        "bounded_variable_price",
        "date_dependent_price",
        "verified_free",
        "not_applicable_preservation",
        "unknown_preservation",
        "japanese_yen_formats",
        "category_conflict",
        "product_conflict",
        "source_failure",
        "duplicate_input",
        "idempotent_publish",
        "rollback",
        "partial_failure_safety",
      ]),
    );
  });

  it.each([
    ["fixed", "verified_paid", { kind: "bounded", min: 1000, max: 1000 }],
    ["variable", "variable_price", { kind: "variable" }],
    ["free", "verified_free", { kind: "bounded", min: 0, max: 0 }],
    ["not applicable", "not_applicable", { kind: "not_applicable" }],
    ["unknown", "unavailable", { kind: "unavailable" }],
  ])(
    "preserves the existing %s state on a failed refresh",
    (_label, state, cost) => {
      const report = buildGovernanceReport(
        makeInput({
          state,
          cost,
          extraction: {
            extractionStatus: "failed",
            adultPrice: null,
            originalPriceText: null,
            failureReason: "official source unavailable",
          },
          action:
            state === "unavailable"
              ? "remain_unknown"
              : "no_new_evidence_keep_current",
        }),
      );
      const record = report.records[0];
      expect(record.decision).toBe("rejected");
      expect(record.proposedFieldChanges).toHaveLength(0);
      expect(record.currentFactUntouched).toBe(true);
      expect(record.reasonCodes).toContain("source_failure_or_unresolved");
    },
  );

  it("holds equal numeric prices when ticket scope is incompatible", () => {
    const report = buildGovernanceReport(
      makeInput({
        extraction: {
          ticketProduct: "combined admission bundle",
          timeSlotConditions: "premium bundle and separate optional surcharge",
        },
        action: "price_matches_review_scope",
      }),
    );
    expect(report.records[0].decision).toBe("held_for_review");
    expect(report.records[0].reasonCodes).toEqual(
      expect.arrayContaining([
        "pricing_scope_requires_review",
        "kai323_scope_review_required",
      ]),
    );
  });

  it("holds variable and date-dependent prices instead of inventing a range", () => {
    const report = buildGovernanceReport(
      makeInput({
        state: "variable_price",
        cost: { kind: "variable" },
        extraction: {
          extractionStatus: "verified_variable",
          adultPrice: 3600,
          minimumPrice: null,
          maximumPrice: null,
          ticketProduct: "date-selected entrance pass",
          timeSlotConditions:
            "date and time slot selected; on-site surcharge applies",
        },
        action: "review_required_variable_product",
      }),
    );
    const record = report.records[0];
    expect(record.decision).toBe("held_for_review");
    expect(record.proposedValue?.cost).toEqual({ kind: "variable" });
    expect(record.reasonCodes).toContain("variable_or_date_dependent");
  });

  it("requires explicit evidence before converting unknown to free", () => {
    const report = buildGovernanceReport(
      makeInput({
        state: "unavailable",
        cost: { kind: "unavailable" },
        extraction: {
          adultPrice: 0,
          originalPriceText: "Adult price 0",
          ticketProduct: "general admission",
        },
      }),
    );
    const record = report.records[0];
    expect(record.decision).toBe("held_for_review");
    expect(record.proposedValue?.state).toBe("verified_paid");
    expect(record.reasonCodes).toContain("zero_without_explicit_free_evidence");
  });

  it("auto-approves only a complete fixed-price equivalence record", () => {
    const report = approvedFixtureReport();
    expect(report.counts.approved).toBe(1);
    expect(report.records[0].decision).toBe("approved");
    expect(report.records[0].reviewerOrRule).toBe(
      "KAI-324 automatic-equivalence-rule-v1",
    );
  });

  it("auto-approves explicit free evidence without treating missing data as free", () => {
    const report = buildGovernanceReport(
      makeInput({
        state: "verified_free",
        cost: { kind: "bounded", min: 0, max: 0 },
        extraction: {
          adultPrice: 0,
          originalPriceText: "入場無料（no entry fee）",
          ticketProduct: "general admission",
        },
      }),
    );
    expect(report.records[0].decision).toBe("approved");
    expect(report.records[0].proposedValue?.state).toBe("verified_free");
  });

  it("detects source URL drift and degraded access", () => {
    const report = buildGovernanceReport(
      makeInput({
        sourceUrl: "https://official.example.test/moved-tickets",
        technicalStatus: 404,
      }),
    );
    expect(report.records[0].decision).toBe("held_for_review");
    expect(report.records[0].reasonCodes).toEqual(
      expect.arrayContaining(["source_url_drift", "source_access_degraded"]),
    );
  });

  it("holds category and product conflicts", () => {
    const categoryConflict = buildGovernanceReport(
      makeInput({ extraction: { visitorCategory: "child" } }),
    );
    expect(categoryConflict.records[0].decision).toBe("held_for_review");
    expect(categoryConflict.records[0].reasonCodes).toContain(
      "visitor_category_conflict",
    );

    const productConflict = buildGovernanceReport(
      makeInput({ extraction: { ticketProduct: "premium bundle" } }),
    );
    expect(productConflict.records[0].decision).toBe("held_for_review");
    expect(productConflict.records[0].reasonCodes).toContain(
      "ticket_product_conflict",
    );
  });

  it("promotes an eligible held candidate only with a bound manual decision", () => {
    const input = makeInput({
      extraction: { ticketProduct: "premium bundle" },
    });
    const report = buildGovernanceReport(input);
    report.catalogueBaseVerified = true;
    const record = report.records[0];
    expect(record.decision).toBe("held_for_review");
    const artifact = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "manual reviewer",
      explicitManualApproval: true as const,
      decisions: [
        {
          destinationId: record.destinationId,
          sourceUrl: record.sourceEvidence.sourceUrl,
          evidenceSha256: manualReviewEvidenceSha256(record),
          candidateSha256: manualReviewCandidateSha256(record),
          revalidatedAt: "2026-09-23",
          reviewerNote: "Revalidated the exact product and conditions.",
          resolvedIssues: [
            {
              reasonCode: "ticket_product_conflict",
              resolution:
                "The reviewed product is the exact general admission product.",
            },
            {
              reasonCode: "pricing_scope_requires_review",
              resolution:
                "The reviewed price is base admission without a bundle or surcharge.",
            },
          ],
        },
      ],
    };
    const promoted = promoteManualReview(report, input.catalogue, artifact);
    expect(promoted.counts).toMatchObject({
      approved: 1,
      heldForReview: 0,
      rejected: 0,
    });
    expect(promoted.records[0].decision).toBe("approved");
    expect(promoted.records[0].decisionHistory.at(-1)?.event).toBe(
      "kai324_manual_approval",
    );
    expect(report.records[0].decision).toBe("held_for_review");
  });

  it("permits a fixed-price product/scope resolution recorded against exact evidence", () => {
    const input = makeInput({
      extraction: { ticketProduct: "premium bundle" },
    });
    const report = buildGovernanceReport(input);
    report.catalogueBaseVerified = true;
    const promoted = promoteManualReview(
      report,
      input.catalogue,
      manualArtifactFor(report, input),
    );
    expect(promoted.records[0].decision).toBe("approved");
    expect(promoted.records[0].reasonCodes).toEqual(
      expect.arrayContaining(["manual_review_revalidated"]),
    );
    expect(promoted.records[0].decisionHistory.at(-1)).toMatchObject({
      event: "kai324_manual_approval",
      actorOrRule: "manual:manual reviewer",
      evidenceSha256: manualReviewEvidenceSha256(report.records[0]),
      candidateSha256: manualReviewCandidateSha256(report.records[0]),
      resolvedIssues: expect.arrayContaining([
        expect.objectContaining({ reasonCode: "ticket_product_conflict" }),
        expect.objectContaining({
          reasonCode: "pricing_scope_requires_review",
        }),
      ]),
    });
  });

  it("rejects manual promotion when the source URL drifted", () => {
    const input = makeInput({
      sourceUrl: "https://official.example.test/moved-tickets",
    });
    const report = buildGovernanceReport(input);
    report.catalogueBaseVerified = true;
    expect(() =>
      promoteManualReview(
        report,
        input.catalogue,
        manualArtifactFor(report, input),
      ),
    ).toThrow("manual review hard blockers require new or corrected evidence");
    expect(report.records[0].reasonCodes).toContain("source_url_drift");
  });

  it("rejects manual promotion when evidence has expired", () => {
    const input = makeInput({
      extraction: { validUntil: "2026-09-22" },
    });
    const report = buildGovernanceReport(input);
    report.catalogueBaseVerified = true;
    expect(() =>
      promoteManualReview(
        report,
        input.catalogue,
        manualArtifactFor(report, input),
      ),
    ).toThrow("manual review hard blockers require new or corrected evidence");
    expect(report.records[0].reasonCodes).toContain("source_validity_expired");
  });

  it("keeps a teamLab Planets-style date-selected current price variable", () => {
    const input = makeInput({
      destinationId: "teamlab-planets",
      extraction: {
        ticketProduct: "date-selected entrance pass",
        timeSlotConditions:
          "date and time slot selected; current displayed price",
        originalPriceText: "Current displayed adult price ¥3,600",
        adultPrice: 3600,
      },
    });
    const report = buildGovernanceReport(input);
    report.catalogueBaseVerified = true;
    const record = report.records[0];
    expect(record.proposedValue?.state).toBe("variable_price");
    expect(record.proposedValue?.cost).toEqual({ kind: "variable" });
    expect(record.reasonCodes).toContain("variable_or_date_dependent");
    expect(() =>
      promoteManualReview(
        report,
        input.catalogue,
        manualArtifactFor(report, input),
      ),
    ).toThrow("manual review hard blockers require new or corrected evidence");
  });

  it("cannot promote rejected records or an unbound manual decision", () => {
    const input = makeInput({
      extraction: {
        extractionStatus: "failed",
        adultPrice: null,
        originalPriceText: null,
        failureReason: "source failed",
      },
    });
    const report = buildGovernanceReport(input);
    report.catalogueBaseVerified = true;
    const record = report.records[0];
    const artifact = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "manual reviewer",
      explicitManualApproval: true as const,
      decisions: [
        {
          destinationId: record.destinationId,
          sourceUrl: record.sourceEvidence.sourceUrl,
          evidenceSha256: manualReviewEvidenceSha256(record),
          candidateSha256: manualReviewCandidateSha256(record),
          revalidatedAt: "2026-09-23",
          reviewerNote: "Attempted promotion without new evidence.",
          resolvedIssues: [],
        },
      ],
    };
    expect(() =>
      promoteManualReview(report, input.catalogue, artifact),
    ).toThrow("rejected records require new evidence");
    expect(() =>
      promoteManualReview(report, input.catalogue, {
        ...artifact,
        reportSha256: "0".repeat(64),
      }),
    ).toThrow("manual review artifact snapshot does not match");
  });

  it("runs the canonical admission validator and records source permission boundaries", () => {
    const invalid = buildGovernanceReport(
      makeInput({
        extraction: {
          adultPrice: 0,
          originalPriceText: "Adult price 0",
        },
      }),
    );
    expect(invalid.records[0].decision).toBe("held_for_review");
    expect(invalid.records[0].reasonCodes).toContain(
      "canonical_admission_invalid:verified_paid_zero_range",
    );

    const blocked = buildGovernanceReport(makeInput({ technicalStatus: null }));
    expect(blocked.records[0].sourceEvidence.collectionPermission).toBe(
      "unknown_or_blocked",
    );
    expect(blocked.records[0].reasonCodes).toContain(
      "source_not_eligible_for_auto_approval",
    );
    const eligible = buildGovernanceReport(makeInput());
    expect(eligible.records[0].sourceEvidence.collectionPermission).toBe(
      "manual_one_time_only",
    );
    expect(eligible.records[0].sourceEvidence.termsStatus).toBe("not_located");
  });

  it("holds stale and expired evidence", () => {
    const stale = buildGovernanceReport(
      makeInput({ extraction: { verificationDate: "2024-01-01" } }),
    );
    expect(stale.records[0].reasonCodes).toContain("source_evidence_stale");

    const expired = buildGovernanceReport(
      makeInput({ extraction: { validUntil: "2026-09-22" } }),
    );
    expect(expired.records[0].reasonCodes).toContain("source_validity_expired");
  });

  it("rejects catalogue-change claims and proposal/extraction mismatches", () => {
    const changed = makeInput();
    changed.proposals[0].productionCatalogueChanged = true;
    const changedReport = buildGovernanceReport(changed);
    expect(changedReport.records[0].decision).toBe("rejected");
    expect(changedReport.records[0].currentFactUntouched).toBe(false);
    expect(changedReport.records[0].reasonCodes).toContain(
      "input_claims_catalogue_changed",
    );

    const malformed = makeInput();
    (
      malformed.extractions[0] as unknown as { manualVerified: unknown }
    ).manualVerified = "false";
    expect(() => buildGovernanceReport(malformed)).toThrow(
      "KAI-323 extraction IDs or manual flags are malformed",
    );

    const mismatched = makeInput();
    mismatched.proposals[0].extracted.adultPrice = 999;
    const mismatchReport = buildGovernanceReport(mismatched);
    expect(mismatchReport.records[0].reasonCodes).toContain(
      "kai323_adultPrice_mismatch",
    );
  });

  it("rejects duplicate inputs before producing a report", () => {
    const input = makeInput();
    expect(() =>
      buildGovernanceReport({
        ...input,
        proposals: [...input.proposals, input.proposals[0]],
      }),
    ).toThrow("KAI-323 proposals contains duplicate IDs");
  });

  it("parses Japanese yen formats without treating extrema as an admission range", () => {
    const parsed = parseJpyText("大人：￥1,200、子ども：800円、JPY 2,000");
    expect(parsed.values).toEqual([800, 1200, 2000]);
    expect(parsed.observedMinimum).toBe(800);
    expect(parsed.observedMaximum).toBe(2000);
    expect(parsed.semantics).toBe("observed_currency_tokens_only");
  });
});

describe("KAI-324 reviewed publish boundary", () => {
  it("requires the exact reviewed report and is idempotent with rollback", () => {
    const report = approvedFixtureReport();
    const approval = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "fixture reviewer",
      explicitPublishConfirmation: true as const,
      approvedDestinationIds: ["fixture-attraction"],
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kai324-"));
    const cataloguePath = path.join(directory, "catalogue.json");
    const outputPath = path.join(directory, "published.json");
    const backupPath = path.join(directory, "catalogue.backup.json");
    const original = approvedFixtureInput().catalogue;
    fs.writeFileSync(cataloguePath, stableJson(original), "utf8");

    const first = publishApprovedCatalogue({
      cataloguePath,
      outputPath,
      backupPath,
      catalogue: original,
      report,
      approval,
    });
    const published = JSON.parse(
      fs.readFileSync(outputPath, "utf8"),
    ) as JsonObject[];
    expect(first.changed).toBe(true);
    expect(first.backupCreated).toBe(true);
    expect(published[0].admission).toEqual(report.records[0].proposedValue);

    const second = publishApprovedCatalogue({
      cataloguePath,
      outputPath,
      backupPath,
      catalogue: original,
      report,
      approval,
    });
    expect(second.changed).toBe(false);
    expect(fs.readFileSync(outputPath, "utf8")).toBe(stableJson(published));

    restoreCatalogueBackup(outputPath, backupPath);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it("rejects malformed or mismatched approval artifacts", () => {
    const report = approvedFixtureReport();
    const baseApproval = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "fixture reviewer",
      explicitPublishConfirmation: true as const,
      approvedDestinationIds: ["fixture-attraction"],
    };
    const cases = [
      [
        { ...baseApproval, reportSha256: "0".repeat(64) },
        "approval artifact does not match the decision report",
      ],
      [
        { ...baseApproval, catalogueSha256: "0".repeat(64) },
        "approval artifact does not match the catalogue snapshot",
      ],
      [
        { ...baseApproval, explicitPublishConfirmation: false },
        "explicit publish confirmation is required",
      ],
      [
        { ...baseApproval, reviewedBy: "" },
        "reviewer and valid review date are required",
      ],
      [
        { ...baseApproval, approvedDestinationIds: [] },
        "approval IDs must exactly match automatic approvals",
      ],
    ] as Array<[Record<string, unknown>, string]>;
    for (const [approval, message] of cases) {
      expect(() =>
        applyApprovedChanges(
          approvedFixtureInput().catalogue,
          report,
          approval as unknown as ApprovalArtifact,
        ),
      ).toThrow(message);
    }
    const unverified = structuredClone(report);
    (
      unverified as unknown as { catalogueBaseVerified: boolean }
    ).catalogueBaseVerified = false;
    const unverifiedApproval = {
      ...baseApproval,
      reportSha256: reportSha256(unverified),
    };
    expect(() =>
      applyApprovedChanges(
        approvedFixtureInput().catalogue,
        unverified,
        unverifiedApproval,
      ),
    ).toThrow("decision report is not a verified read-only report");

    const nonReadOnly = structuredClone(report) as unknown as {
      readOnly: boolean;
      catalogueBaseVerified: boolean;
    } & Omit<typeof report, "readOnly" | "catalogueBaseVerified">;
    nonReadOnly.readOnly = false;
    const nonReadOnlyApproval = {
      ...baseApproval,
      reportSha256: reportSha256(nonReadOnly as unknown as typeof report),
    };
    expect(() =>
      applyApprovedChanges(
        approvedFixtureInput().catalogue,
        nonReadOnly as unknown as typeof report,
        nonReadOnlyApproval,
      ),
    ).toThrow("decision report is not a verified read-only report");
  });

  it("rejects a changed catalogue snapshot before any write", () => {
    const report = approvedFixtureReport();
    const approval = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "fixture reviewer",
      explicitPublishConfirmation: true as const,
      approvedDestinationIds: ["fixture-attraction"],
    };
    const changed = structuredClone(approvedFixtureInput().catalogue);
    (changed[0].admission as JsonObject).cost = {
      kind: "bounded",
      min: 999,
      max: 999,
    };
    expect(() => applyApprovedChanges(changed, report, approval)).toThrow(
      "catalogue input does not match the approved snapshot",
    );
  });

  it("restores an existing output target", () => {
    const report = approvedFixtureReport();
    const approval = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "fixture reviewer",
      explicitPublishConfirmation: true as const,
      approvedDestinationIds: ["fixture-attraction"],
    };
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "kai324-existing-"),
    );
    const cataloguePath = path.join(directory, "catalogue.json");
    const outputPath = path.join(directory, "published.json");
    const backupPath = path.join(directory, "catalogue.backup.json");
    const original = approvedFixtureInput().catalogue;
    const priorOutput = [
      { id: "prior-output", admission: { state: "unavailable" } },
    ];
    fs.writeFileSync(cataloguePath, stableJson(original), "utf8");
    fs.writeFileSync(outputPath, stableJson(priorOutput), "utf8");

    publishApprovedCatalogue({
      cataloguePath,
      outputPath,
      backupPath,
      catalogue: original,
      report,
      approval,
    });
    const publishedText = fs.readFileSync(outputPath, "utf8");
    const changedOutput = JSON.parse(publishedText) as JsonObject[];
    changedOutput[0].id = "subsequent-edit";
    fs.writeFileSync(outputPath, stableJson(changedOutput), "utf8");
    expect(() => restoreCatalogueBackup(outputPath, backupPath)).toThrow(
      "published output changed since approval",
    );
    fs.writeFileSync(outputPath, publishedText, "utf8");
    restoreCatalogueBackup(outputPath, backupPath);
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toEqual(
      priorOutput,
    );
  });

  it("rejects malformed backup content before restore", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kai324-backup-"));
    const targetPath = path.join(directory, "target.json");
    const backupPath = path.join(directory, "backup.json");
    fs.writeFileSync(
      backupPath,
      stableJson({
        schemaVersion: 1,
        targetPath: path.resolve(targetPath),
        existed: true,
        content: [{}],
        contentSha256: "0".repeat(64),
      }),
      "utf8",
    );
    expect(() => restoreCatalogueBackup(targetPath, backupPath)).toThrow(
      "catalogue backup content is malformed",
    );
  });

  it("blocks production and symlink publish targets", () => {
    const report = approvedFixtureReport();
    const approval = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(report),
      catalogueSha256: report.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "fixture reviewer",
      explicitPublishConfirmation: true as const,
      approvedDestinationIds: ["fixture-attraction"],
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kai324-path-"));
    const cataloguePath = path.join(directory, "catalogue.json");
    const backupPath = path.join(directory, "backup.json");
    const original = approvedFixtureInput().catalogue;
    fs.writeFileSync(cataloguePath, stableJson(original), "utf8");
    expect(() =>
      publishApprovedCatalogue({
        cataloguePath,
        outputPath: path.resolve("src/shared/data/destinations-index.json"),
        backupPath,
        catalogue: original,
        report,
        approval,
      }),
    ).toThrow("production catalogue publish is disabled in KAI-324");

    const symlinkPath = path.join(directory, "symlink.json");
    const targetPath = path.join(directory, "target.json");
    fs.writeFileSync(targetPath, "{}", "utf8");
    fs.symlinkSync(targetPath, symlinkPath);
    expect(() =>
      publishApprovedCatalogue({
        cataloguePath,
        outputPath: symlinkPath,
        backupPath,
        catalogue: original,
        report,
        approval,
      }),
    ).toThrow("symlink path components are not allowed");

    const linkedParent = path.join(directory, "linked-parent");
    fs.symlinkSync(directory, linkedParent, "dir");
    expect(() =>
      publishApprovedCatalogue({
        cataloguePath,
        outputPath: path.join(linkedParent, "nested-output.json"),
        backupPath,
        catalogue: original,
        report,
        approval,
      }),
    ).toThrow("symlink path components are not allowed");

    const danglingPath = path.join(directory, "dangling.json");
    fs.symlinkSync(path.join(directory, "missing.json"), danglingPath);
    expect(() =>
      publishApprovedCatalogue({
        cataloguePath,
        outputPath: danglingPath,
        backupPath,
        catalogue: original,
        report,
        approval,
      }),
    ).toThrow("symlink path components are not allowed");

    const hardlinkPath = path.join(directory, "catalogue-hardlink.json");
    fs.linkSync(
      path.resolve("src/shared/data/destinations-index.json"),
      hardlinkPath,
    );
    expect(() =>
      publishApprovedCatalogue({
        cataloguePath,
        outputPath: hardlinkPath,
        backupPath,
        catalogue: original,
        report,
        approval,
      }),
    ).toThrow("hard-link publish targets must not alias production data");
  });

  it("validates every approved change before writing, preventing partial failure", () => {
    const report = approvedFixtureReport();
    const tampered = structuredClone(report);
    tampered.records[0].proposedFieldChanges = [];
    const approval = {
      schemaVersion: 1 as const,
      ticket: "KAI-324" as const,
      reportSha256: reportSha256(tampered),
      catalogueSha256: tampered.catalogueSha256,
      reviewedAt: "2026-09-23",
      reviewedBy: "fixture reviewer",
      explicitPublishConfirmation: true as const,
      approvedDestinationIds: ["fixture-attraction"],
    };
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kai324-fail-"));
    const cataloguePath = path.join(directory, "catalogue.json");
    const outputPath = path.join(directory, "published.json");
    const backupPath = path.join(directory, "catalogue.backup.json");
    const original = approvedFixtureInput().catalogue;
    fs.writeFileSync(cataloguePath, stableJson(original), "utf8");

    expect(() =>
      publishApprovedCatalogue({
        cataloguePath,
        outputPath,
        backupPath,
        catalogue: original,
        report: tampered,
        approval,
      }),
    ).toThrow("approved destination has invalid field changes");
    expect(fs.existsSync(outputPath)).toBe(false);
    expect(fs.existsSync(backupPath)).toBe(false);
    expect(JSON.parse(fs.readFileSync(cataloguePath, "utf8"))).toEqual(
      original,
    );
  });
});
