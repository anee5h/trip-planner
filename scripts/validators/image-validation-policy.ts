import type { ValidationResult } from "./types";

/** Blocking means a deterministic finding, not an incomplete remote probe. */
export function shouldFailValidation(result: ValidationResult): boolean {
  return result.status === "failed" || result.metrics.errorsCount > 0;
}

export function shouldFailValidationRun(
  results: readonly ValidationResult[],
): boolean {
  return results.some(shouldFailValidation);
}

function count(diagnostics: Record<string, number> | undefined, key: string) {
  return diagnostics?.[key] ?? 0;
}

export function renderImageValidationSummary(
  result: ValidationResult,
  mode: string,
): string {
  const diagnostics = result.diagnostics;
  const status = result.status ?? (result.passed ? "passed" : "failed");
  const total = count(diagnostics, "uniqueUrlsChecked");
  const verified = count(diagnostics, "verifiedUrls");
  const broken = count(diagnostics, "brokenUrls");
  const inconclusive = count(diagnostics, "inconclusiveUrls");
  const lines = [
    `## Catalog image validation — ${status.toUpperCase()}`,
    "",
    `Mode: \`${mode}\``,
    "",
    "| URLs checked | Verified | Confirmed broken | Inconclusive |",
    "| ---: | ---: | ---: | ---: |",
    `| ${total} | ${verified} | ${broken} | ${inconclusive} |`,
    "",
    "Inconclusive causes: " +
      [
        `429 / rate limited: ${count(diagnostics, "inconclusiveRateLimitedUrls")}`,
        `timeout: ${count(diagnostics, "inconclusiveTimeoutUrls")}`,
        `transient 5xx: ${count(diagnostics, "inconclusiveTransient5xxUrls")}`,
        `network/DNS: ${count(diagnostics, "inconclusiveNetworkUrls")}`,
        `other: ${count(diagnostics, "inconclusiveOtherUrls")}`,
      ].join(" · "),
    "",
  ];

  if (status === "inconclusive") {
    lines.push(
      "> Remote verification is incomplete. Unverified URLs are not counted as verified; this monitoring result is non-blocking unless a deterministic or confirmed-broken finding exists.",
      "",
    );
  } else if (status === "not-run") {
    lines.push(
      count(diagnostics, "changedScopeSkipped") > 0
        ? "> No changed image URLs were in scope; remote verification was skipped."
        : "> Remote verification was not run. This result does not claim that the URLs are remotely verified.",
      "",
    );
  } else if (status === "passed") {
    lines.push(
      "All checked image URLs were verified and no broken URLs were found.",
      "",
    );
  }

  const blockingIssues = result.issues.filter(
    (issue) => issue.severity === "error",
  );
  if (blockingIssues.length > 0) {
    lines.push("### Blocking findings", "");
    for (const issue of blockingIssues) {
      lines.push(`- **${issue.code}** — ${issue.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
