const fs = require("node:fs");
const path = require("node:path");

const resourcesDir = path.join(process.cwd(), "src/i18n/resources");
const read = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(resourcesDir, locale, "common.json"), "utf8"),
  );
const keys = (value, prefix = "") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
};

const en = new Set(keys(read("en")));
const ja = new Set(keys(read("ja")));
const missingInJa = [...en].filter((key) => !ja.has(key));
const missingInEn = [...ja].filter((key) => !en.has(key));
if (missingInJa.length || missingInEn.length) {
  console.error("Translation resource parity failed.");
  if (missingInJa.length)
    console.error(`Missing in ja: ${missingInJa.join(", ")}`);
  if (missingInEn.length)
    console.error(`Missing in en: ${missingInEn.join(", ")}`);
  process.exit(1);
}
console.log(`Translation resource parity passed: ${en.size} keys.`);
