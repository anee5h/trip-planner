import fs from "fs";
import path from "path";
import { generateEditorialQualityReport } from "../src/shared/services/editorial/EditorialQualityAnalytics";

const report = generateEditorialQualityReport();
const reportsDir = path.join(process.cwd(), "reports");
fs.mkdirSync(reportsDir, { recursive: true });

fs.writeFileSync(
  path.join(reportsDir, "editorial-quality.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

const csvRows = [
  "id,name,region,prefecture,lifecycle,method,riskReasons",
  ...report.reviewQueue.map(
    (item) =>
      `"${item.id}","${item.name}","${item.region}","${item.prefecture}","${item.lifecycle}","${item.method}","${item.riskReasons.join(";")}"`,
  ),
];

fs.writeFileSync(
  path.join(reportsDir, "editorial-quality.csv"),
  `${csvRows.join("\n")}\n`,
);

console.log(`Editorial Quality Report generated:`);
console.log(`- Total Places: ${report.totalPlaces}`);
console.log(`- Published: ${report.lifecycleCounts.published || 0}`);
console.log(`- Review Queue Items: ${report.reviewQueue.length}`);
console.log(`- High Risk Hubs: ${report.issues.highRiskHubCount}`);
