import fs from "node:fs";
import path from "node:path";
import destinations from "../src/shared/data/destinations-index.json";
import type { Destination } from "../src/shared/types/destination";

const places = destinations as Destination[];
const alerts = places.filter((place) => {
  const freshness = place.editorial?.freshness;
  return (
    place.editorial?.lifecycle === "published" &&
    (!freshness || freshness !== "current")
  );
});

const summary = {
  generatedAt: new Date().toISOString(),
  totalPlaces: places.length,
  published: places.filter(
    (place) => place.editorial?.lifecycle === "published",
  ).length,
  alerts: alerts.map((place) => ({
    id: place.id,
    name: place.name,
    freshness: place.editorial?.freshness || "missing",
    checkedAt: place.editorial?.checkedAt || null,
  })),
};

const reportsDir = path.join(process.cwd(), "reports");
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(
  path.join(reportsDir, "editorial-freshness.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(reportsDir, "editorial-freshness.md"),
  [
    "# Editorial Freshness Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Published places: ${summary.published}/${summary.totalPlaces}`,
    `Freshness alerts: ${summary.alerts.length}`,
    "",
    ...summary.alerts.map(
      (alert) =>
        `- ${alert.id}: ${alert.freshness} (checked ${alert.checkedAt || "never"})`,
    ),
    "",
  ].join("\n"),
);

console.log(
  `Editorial freshness report: ${summary.alerts.length} published places need review.`,
);
