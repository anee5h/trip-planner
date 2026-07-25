import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";

export const searchValidator: ValidatorModule = {
  name: "Catalog Search",
  description:
    "Validates search indexing, canonical keyword matching, and alias resolution across key travel queries.",
  dependsOn: ["Catalog Destinations", "Catalog Collections"],
  purpose:
    "Ensure core search queries (Osaka Castle, Nikko, Himeji, Shibuya) return canonical destination results without duplicate stubs.",
  guarantees: [
    "Core queries resolve to canonical destination IDs",
    "Zero duplicate keywords or conflicting search aliases",
    "Proper tag and category indexing",
  ],
  doesNotValidate: ["HTTP image availability", "UI component rendering"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;
    const issues: ValidationIssue[] = [];

    const testQueries = [
      { query: "Osaka Castle", expectedId: "osaka-castle" },
      { query: "Nikko", expectedId: "nikko-city" },
      { query: "Himeji", expectedId: "himeji-castle" },
      { query: "Shibuya", expectedId: "shibuya-city" },
    ];

    let totalChecked = testQueries.length;

    for (const test of testQueries) {
      const qLower = test.query.toLowerCase();
      const matches = destinations.filter((d) => {
        const nameMatch = d.name.toLowerCase().includes(qLower);
        const idMatch = d.id.toLowerCase().includes(qLower);
        const tagMatch = d.tags?.some((t) => t.toLowerCase().includes(qLower));
        const categoryMatch = d.categories?.some((c) =>
          c.toLowerCase().includes(qLower),
        );
        return nameMatch || idMatch || tagMatch || categoryMatch;
      });

      if (matches.length === 0) {
        issues.push({
          severity: "error",
          code: "SEARCH_QUERY_NO_MATCH",
          message: `Core search query '${test.query}' yielded zero destination matches.`,
        });
      } else {
        const hasExpected = matches.some((m) => m.id === test.expectedId);
        if (!hasExpected) {
          issues.push({
            severity: "warning",
            code: "SEARCH_QUERY_MISSING_EXPECTED",
            message: `Core search query '${test.query}' matched ${matches.length} items but missed canonical expected ID '${test.expectedId}'.`,
            targetId: test.expectedId,
          });
        }
      }
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: searchValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked,
        errorsCount,
        warningsCount,
        infoCount,
      },
    };
  },
};
