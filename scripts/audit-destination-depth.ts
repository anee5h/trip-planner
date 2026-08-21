/**
 * Run the deterministic destination-depth audit.
 *
 * The command reads the canonical catalogue and writes advisory reports under
 * reports/. It never edits catalogue or generated public destination data.
 *
 * Usage: npm run audit:destination-depth
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Destination } from "../src/shared/types/destination.js";
import {
  buildDestinationDepthReport,
  renderDestinationDepthMarkdown,
} from "./audit/destination-depth.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, "..");
const indexPath = path.join(
  rootDirectory,
  "src/shared/data/destinations-index.json",
);
const reportsDirectory = path.join(rootDirectory, "reports");

const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf8"),
) as Destination[];
const report = buildDestinationDepthReport(destinations);

fs.mkdirSync(reportsDirectory, { recursive: true });
fs.writeFileSync(
  path.join(reportsDirectory, "destination-depth-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(reportsDirectory, "destination-depth-audit.md"),
  renderDestinationDepthMarkdown(report),
);

console.log(
  `destination-depth-audit: catalog=${report.catalogSize} prefectures=${report.prefectureCount} score=${report.national.depthScore ?? "n/a"}`,
);
console.log("wrote reports/destination-depth-audit.json and .md");
