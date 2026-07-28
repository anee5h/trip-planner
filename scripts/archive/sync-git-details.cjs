const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * TabiMap Git Schema Details Synchronization Script
 *
 * Restores and merges rich fields (gallery, budgetBreakdown, reservation, etc.)
 * from previous git commits back into the central destinations-index.json.
 */

const indexPath = path.join(
  __dirname,
  "../src/shared/data/destinations-index.json",
);
const indexData = JSON.parse(fs.readFileSync(indexPath, "utf8"));

let mergedCount = 0;

indexData.forEach((dest) => {
  try {
    const oldContentStr = execSync(
      `git show HEAD~1:public/data/destinations/${dest.id}.json`,
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      },
    );

    if (oldContentStr) {
      const oldContent = JSON.parse(oldContentStr);
      const fieldsToMerge = [
        "gallery",
        "budgetBreakdown",
        "reservation",
        "parking",
        "itineraries",
        "restaurants",
        "cafes",
        "notes",
      ];

      fieldsToMerge.forEach((field) => {
        if (oldContent[field] !== undefined) {
          dest[field] = oldContent[field];
        }
      });

      if (oldContent.description && oldContent.description.length > 5) {
        if (
          !dest.description ||
          oldContent.description.length > dest.description.length
        ) {
          dest.description = oldContent.description;
        }
      }

      if (oldContent.highlights && oldContent.highlights.length > 0) {
        if (
          !dest.highlights ||
          oldContent.highlights.length > dest.highlights.length
        ) {
          dest.highlights = oldContent.highlights;
        }
      }

      dest.schemaVersion = 2;
      mergedCount++;
    }
  } catch (e) {
    // Expected for brand new destinations not present in previous commits
  }
});

fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2) + "\n");
console.log(
  `Successfully merged rich details for ${mergedCount} destinations from git history into destinations-index.json.`,
);
