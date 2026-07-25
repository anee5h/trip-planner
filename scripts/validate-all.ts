import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createValidationContext } from "./catalog/loader";
import { validators } from "./validators/registry";
import {
  QA_FRAMEWORK_VERSION,
  type ValidationResult,
  type ReleaseReportMetadata,
} from "./validators/types";

async function runAll() {
  console.log(`\n======================================================`);
  console.log(` 🎌 TabiMap Catalog QA Framework (v${QA_FRAMEWORK_VERSION}) `);
  console.log(`======================================================\n`);

  const context = await createValidationContext();
  const results: ValidationResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;

  for (const validator of validators) {
    console.log(`▶ Running [${validator.name}]...`);
    const startTime = performance.now();
    try {
      const res = await validator.validate(context);
      const durationMs = Math.round(performance.now() - startTime);
      res.metrics.durationMs = durationMs;

      results.push(res);

      totalErrors += res.metrics.errorsCount;
      totalWarnings += res.metrics.warningsCount;
      totalInfo += res.metrics.infoCount;

      const statusSymbol = res.passed ? "✅ PASSED" : "❌ FAILED";
      console.log(
        `  └─ ${statusSymbol} | Checked: ${res.metrics.totalChecked} | Errors: ${res.metrics.errorsCount} | Warnings: ${res.metrics.warningsCount} | Time: ${durationMs}ms\n`,
      );

      if (res.issues.length > 0) {
        for (const issue of res.issues) {
          const prefix =
            issue.severity === "error"
              ? "   [ERROR]"
              : issue.severity === "warning"
                ? "   [WARN] "
                : "   [INFO] ";
          console.log(`${prefix} (${issue.code}) ${issue.message}`);
        }
        console.log("");
      }
    } catch (err: any) {
      console.error(
        `❌ CRITICAL ERROR in validator '${validator.name}':`,
        err.message,
      );
      totalErrors++;
    }
  }

  // Get current git commit hash
  let gitCommit = "unknown";
  try {
    gitCommit = execSync("git rev-parse --short HEAD").toString().trim();
  } catch (e) {
    // Git not initialized or unavailable
  }

  const generatedAt = new Date().toISOString();
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"),
  );
  const appVersion = packageJson.version || "1.6.0";

  // Build dual reports
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 1. JSON Report
  const jsonReport: ReleaseReportMetadata = {
    version: appVersion,
    qaFrameworkVersion: QA_FRAMEWORK_VERSION,
    gitCommit,
    generatedAt,
    validators: results,
  };
  fs.writeFileSync(
    path.join(reportsDir, "release-report.json"),
    JSON.stringify(jsonReport, null, 2),
    "utf-8",
  );

  // 2. Markdown Report
  let mdReport = `# TabiMap v${appVersion} Data Quality Release Report\n\n`;
  mdReport += `- **Generated At**: \`${generatedAt}\`\n`;
  mdReport += `- **Git Commit**: \`${gitCommit}\`\n`;
  mdReport += `- **QA Framework Version**: \`v${QA_FRAMEWORK_VERSION}\`\n\n`;
  mdReport += `## Executive Summary\n\n`;
  mdReport += `| Validator | Status | Duration (ms) | Total Checked | Errors | Warnings | Info |\n`;
  mdReport += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const r of results) {
    const icon = r.passed ? "✅ PASSED" : "❌ FAILED";
    mdReport += `| ${r.name} | ${icon} | ${r.metrics.durationMs}ms | ${r.metrics.totalChecked} | ${r.metrics.errorsCount} | ${r.metrics.warningsCount} | ${r.metrics.infoCount} |\n`;
  }

  mdReport += `\n---\n\n## Issues Breakdown\n\n`;
  for (const r of results) {
    mdReport += `### ${r.name}\n\n`;
    if (r.issues.length === 0) {
      mdReport += `*Zero issues detected.*\n\n`;
    } else {
      for (const issue of r.issues) {
        const badge =
          issue.severity === "error"
            ? "🔴 ERROR"
            : issue.severity === "warning"
              ? "🟠 WARN"
              : "🔵 INFO";
        mdReport += `- **[${badge}]** \`${issue.code}\`: ${issue.message}\n`;
      }
      mdReport += `\n`;
    }
  }

  fs.writeFileSync(
    path.join(reportsDir, "release-report.md"),
    mdReport,
    "utf-8",
  );

  console.log(`======================================================`);
  console.log(` 📊 QA SUMMARY: ${totalErrors === 0 ? "PASSED" : "FAILED"}`);
  console.log(` Total Errors:   ${totalErrors}`);
  console.log(` Total Warnings: ${totalWarnings}`);
  console.log(` Reports saved to /reports/release-report.md & .json`);
  console.log(`======================================================\n`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

runAll();
