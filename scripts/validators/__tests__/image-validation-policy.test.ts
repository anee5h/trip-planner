import { describe, expect, it } from "vitest";
import {
  renderImageValidationSummary,
  shouldFailValidation,
  shouldFailValidationRun,
} from "../image-validation-policy";
import type { ValidationResult } from "../types";

function result(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    name: "Catalog Images",
    passed: true,
    issues: [],
    metrics: {
      totalChecked: 1,
      errorsCount: 0,
      warningsCount: 0,
      infoCount: 0,
      durationMs: 1,
    },
    ...overrides,
  };
}

describe("image validation CI policy", () => {
  it("does not block on inconclusive remote results and does not call them passed", () => {
    const inconclusive = result({
      passed: false,
      status: "inconclusive",
      metrics: {
        totalChecked: 10,
        errorsCount: 0,
        warningsCount: 4,
        infoCount: 0,
        durationMs: 1,
      },
    });

    expect(shouldFailValidation(inconclusive)).toBe(false);
    expect(shouldFailValidationRun([inconclusive])).toBe(false);
  });

  it("blocks confirmed broken images with actionable findings", () => {
    const broken = result({
      passed: false,
      status: "failed",
      issues: [
        {
          severity: "error",
          code: "IMAGE_FETCH_BROKEN",
          message:
            "Destination 'harbor' (heroImage) image confirmed broken: HTTP 404 -> https://upload.wikimedia.org/harbor.jpg",
          targetId: "harbor",
        },
      ],
      metrics: {
        totalChecked: 1,
        errorsCount: 1,
        warningsCount: 0,
        infoCount: 0,
        durationMs: 1,
      },
    });

    expect(shouldFailValidation(broken)).toBe(true);
    expect(shouldFailValidationRun([broken])).toBe(true);
  });

  it("keeps deterministic validator errors blocking even beside inconclusive images", () => {
    const inconclusive = result({
      passed: false,
      status: "inconclusive",
      metrics: {
        totalChecked: 1,
        errorsCount: 0,
        warningsCount: 1,
        infoCount: 0,
        durationMs: 1,
      },
    });
    const deterministicFailure = result({
      name: "Catalog Destinations",
      passed: false,
      status: "failed",
      issues: [
        {
          severity: "error",
          code: "INVALID_DESTINATION",
          message: "Required deterministic field is missing.",
          targetId: "harbor",
        },
      ],
      metrics: {
        totalChecked: 1,
        errorsCount: 1,
        warningsCount: 0,
        infoCount: 0,
        durationMs: 1,
      },
    });

    expect(shouldFailValidationRun([inconclusive, deterministicFailure])).toBe(
      true,
    );
  });

  it("reports counts and makes incomplete verification explicit", () => {
    const summary = renderImageValidationSummary(
      result({
        passed: false,
        status: "inconclusive",
        diagnostics: {
          uniqueUrlsChecked: 10,
          verifiedUrls: 4,
          brokenUrls: 0,
          inconclusiveUrls: 6,
          inconclusiveRateLimitedUrls: 5,
          inconclusiveTimeoutUrls: 1,
          inconclusiveTransient5xxUrls: 0,
          inconclusiveNetworkUrls: 0,
          inconclusiveOtherUrls: 0,
        },
      }),
      "all",
    );

    expect(summary).toContain("## Catalog image validation — INCOMPLETE");
    expect(summary).toContain("429 / rate limited: 5");
    expect(summary).toContain("Unverified URLs are not counted as verified");
    expect(summary).not.toContain("All checked image URLs were verified");
  });
});
