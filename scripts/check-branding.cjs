const fs = require("fs");
const path = require("path");

const publicFiles = [
  "README.md",
  "index.html",
  "src/features/destinations/DestinationDetails.tsx",
  "src/features/help/Help.tsx",
  "src/features/legal/Cookies.tsx",
  "src/features/legal/Privacy.tsx",
  "src/features/legal/Terms.tsx",
  "src/features/profile/Profile.tsx",
  "src/features/search/SearchDialog.tsx",
  "src/features/settings/Settings.tsx",
  "src/shared/components/auth/AuthModal.tsx",
  "src/shared/components/feedback/FeedbackModal.tsx",
  "src/shared/components/layout/Footer.tsx",
  "src/shared/components/layout/Navbar.tsx",
  "src/shared/components/profile/PreferencesModal.tsx",
  "src/shared/components/ui/ReleaseNotesModal.tsx",
];

const legacyBrand = /\btabi[\s-]?map\b/i;
const preservedIdentifiers = ["tabimap-showcase-badges"];
const failures = publicFiles.filter((file) => {
  let contents = fs.readFileSync(path.resolve(file), "utf8");
  preservedIdentifiers.forEach((identifier) => {
    contents = contents.replaceAll(identifier, "");
  });
  return legacyBrand.test(contents);
});

if (failures.length) {
  console.error("Legacy public brand found in:");
  failures.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log(`Brand consistency passed: ${publicFiles.length} public files.`);
