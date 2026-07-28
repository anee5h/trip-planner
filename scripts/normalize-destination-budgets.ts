import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);

function main() {
  const destinations = JSON.parse(
    fs.readFileSync(indexPath, "utf-8"),
  ) as Destination[];
  let recommendedCount = 0;
  let normalizedCount = 0;

  for (const destination of destinations) {
    const expectedRecommended = Math.round(
      (destination.budgetMin + destination.budgetMax) / 2,
    );
    if (destination.budgetRecommended !== expectedRecommended) {
      destination.budgetRecommended = expectedRecommended;
      recommendedCount++;
    }

    const breakdown = destination.budgetBreakdown;
    if (!breakdown) continue;

    const currentTotal =
      breakdown.transport + breakdown.tickets + breakdown.food + breakdown.cafe;
    const recommended = expectedRecommended;
    if (!currentTotal || currentTotal === recommended) continue;

    const scale = recommended / currentTotal;
    const transport = Math.round(breakdown.transport * scale);
    const tickets = Math.round(breakdown.tickets * scale);
    const food = Math.round(breakdown.food * scale);
    const cafe = recommended - transport - tickets - food;

    destination.budgetBreakdown = { transport, tickets, food, cafe };
    normalizedCount++;
  }

  fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
  console.log(
    `Normalized ${recommendedCount} recommended budgets and ${normalizedCount} budget breakdowns.`,
  );
}

main();
