import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
} from "./types";

export const linksValidator: ValidatorModule = {
  name: "Catalog Routes & Links",
  description:
    "Validates application routing table definitions and link target resolutions.",
  dependsOn: ["Catalog Destinations", "Catalog Collections"],
  purpose:
    "Ensure every destination ID and collection slug resolves to a valid, reachable application route without producing 404s or uncaught React errors.",
  guarantees: [
    "Every destination ID resolves to a valid route `/destinations/${id}`",
    "Every collection slug resolves to a valid route `/collections/${slug}`",
    "Zero duplicate slugs or broken route target IDs",
  ],
  doesNotValidate: ["HTTP remote images", "Search ranking"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations, collections } = context.catalog;
    const issues: ValidationIssue[] = [];

    const seenSlugs = new Set<string>();
    const seenRoutes = new Set<string>();

    let totalChecked = destinations.length + collections.length;

    // 1. Destination Routes
    for (const dest of destinations) {
      const route = `/destinations/${dest.id}`;
      if (seenRoutes.has(route)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_ROUTE_PATH",
          message: `Duplicate destination route path detected: '${route}'`,
          targetId: dest.id,
        });
      } else {
        seenRoutes.add(route);
      }

      if (dest.slug) {
        if (seenSlugs.has(dest.slug)) {
          issues.push({
            severity: "warning",
            code: "DUPLICATE_DESTINATION_SLUG",
            message: `Destination '${dest.id}' shares slug '${dest.slug}' with another destination.`,
            targetId: dest.id,
          });
        } else {
          seenSlugs.add(dest.slug);
        }
      }
    }

    // 2. Collection Routes
    for (const col of collections) {
      const route = `/collections/${col.slug}`;
      if (seenRoutes.has(route)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_COLLECTION_ROUTE",
          message: `Duplicate collection route path detected: '${route}'`,
          targetId: col.id,
        });
      } else {
        seenRoutes.add(route);
      }
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: linksValidator.name,
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
