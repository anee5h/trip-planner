import fs from "node:fs";
import path from "node:path";
import catalogJson from "../src/shared/data/destinations-index.json";
import type { Destination } from "../src/shared/types/destination";

const catalog = catalogJson as Destination[];
const reportDirectory = path.join(process.cwd(), "reports");
const reportPath = path.join(reportDirectory, "v192-expansion-audit.json");
const auditSummary =
  "Canonicalized type, localized categories, budgets, ratings, and transport semantics";

const issues = catalog
  .filter((destination) => destination.tags?.includes("v1.9.2"))
  .map((destination) => {
    const findings: string[] = [
      "Assisted beta record requires editorial review",
    ];
    if ((destination.transportOptions?.train ?? 0) > 120)
      findings.push("Long train estimate requires source verification");
    if (
      destination.ratings.rain >= 8 &&
      ((destination.comfort?.rainFriendly ?? 5) <= 3 ||
        destination.indoorPercent <= 20)
    )
      findings.push("Rain suitability conflicts with comfort data");
    if (
      destination.content?.ja.highlights.join("|") !==
      destination.highlights.map((highlight) => highlight).join("|")
    )
      findings.push("Localized highlights require editorial parity review");
    if (
      destination.budgetBreakdown?.tickets &&
      ["district", "market", "shopping", "street", "beach", "park"].includes(
        destination.kind || "",
      )
    )
      findings.push("Admission estimate requires source verification");
    if (
      (destination.editorial?.changes || []).filter(
        (change) => change.summary === auditSummary,
      ).length > 1
    )
      findings.push("Duplicate audit history entry");
    return { id: destination.id, findings };
  });

fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalRecords: issues.length,
      records: issues,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Reported ${issues.length} v1.9.2 expansion records to ${reportPath}.`,
);
