const fs = require("fs");
const path = require("path");

const roots = ["src", "public", ".github"];
const rootFiles = [
  "README.md",
  "index.html",
  "package.json",
  "package-lock.json",
];
const extensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".json",
  ".jsx",
  ".md",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const historicalCatalogDirectories = new Set([
  "public/data",
  "src/shared/data",
]);
const legacyBrand = /tabimap/gi;
const preservedIdentifiers = new Set([
  "tabimap-qa-image-overrides",
  "tabimap-qa-website-overrides",
  "tabimap-showcase-badges",
  "tabimap_analytics_event_queue",
  "tabimap_analytics_opt_out",
  "tabimap_analytics_session_id",
  "tabimap_dismissed_preferences_prompt",
  "tabimap_experiment_overrides",
  "tabimap_experiment_session_id",
  "tabimap_feedback_history",
  "tabimap_image_qa_overrides",
  "tabimap_itinerary_groups_v1",
  "tabimap_official_website_qa",
  "tabimap_personalization_settings",
  "tabimap_phase-one-editorial-worklist",
  "tabimap_qa_state",
  "tabimap_recently_viewed_destinations",
  "tabimap_theme",
]);

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path
      .relative(process.cwd(), file)
      .replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      if (
        ignoredDirectories.has(entry.name) ||
        historicalCatalogDirectories.has(relative)
      ) {
        return [];
      }
      return collectFiles(file);
    }
    return extensions.has(path.extname(entry.name)) ? [file] : [];
  });
}

const files = [
  ...rootFiles,
  ...roots.flatMap((root) => collectFiles(path.resolve(root))),
];
const failures = [];

for (const file of files) {
  const contents = fs.readFileSync(file, "utf8");
  for (const match of contents.matchAll(legacyBrand)) {
    const start = match.index;
    const identifier = contents
      .slice(start)
      .match(/^tabimap(?:[_-][a-z0-9]+)+/i)?.[0];
    if (!identifier || !preservedIdentifiers.has(identifier.toLowerCase())) {
      failures.push(`${path.relative(process.cwd(), file)}:${start + 1}`);
    }
  }
}

if (failures.length) {
  console.error("Legacy public brand found in:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Brand consistency passed: ${files.length} public files.`);
