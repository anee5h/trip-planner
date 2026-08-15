const fs = require("node:fs");
const path = require("node:path");

const resourcesDir = path.join(process.cwd(), "src/i18n/resources");
const read = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(resourcesDir, locale, "common.json"), "utf8"),
  );

const getLeafEntries = (value, prefix = "") => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [[prefix, value]] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    getLeafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
};

const enEntries = new Map(getLeafEntries(read("en")));
const jaEntries = new Map(getLeafEntries(read("ja")));

const enKeys = new Set(enEntries.keys());
const jaKeys = new Set(jaEntries.keys());

const missingInJa = [...enKeys].filter((key) => !jaKeys.has(key));
const missingInEn = [...jaKeys].filter((key) => !enKeys.has(key));

let hasErrors = false;

if (missingInJa.length || missingInEn.length) {
  console.error("Translation resource key parity failed.");
  if (missingInJa.length)
    console.error(`Missing in ja: ${missingInJa.join(", ")}`);
  if (missingInEn.length)
    console.error(`Missing in en: ${missingInEn.join(", ")}`);
  hasErrors = true;
}

// Check placeholder parity
const extractPlaceholders = (str) => {
  if (typeof str !== "string") return [];
  const matches = str.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))].sort();
};

const placeholderMismatches = [];
for (const key of enKeys) {
  if (!jaEntries.has(key)) continue;
  const enVal = enEntries.get(key);
  const jaVal = jaEntries.get(key);
  const enPlaceholders = extractPlaceholders(enVal);
  const jaPlaceholders = extractPlaceholders(jaVal);
  if (JSON.stringify(enPlaceholders) !== JSON.stringify(jaPlaceholders)) {
    placeholderMismatches.push({
      key,
      enPlaceholders,
      jaPlaceholders,
      enVal,
      jaVal,
    });
  }
}

if (placeholderMismatches.length) {
  console.error(
    `Translation placeholder parity failed (${placeholderMismatches.length} mismatches):`,
  );
  for (const m of placeholderMismatches) {
    console.error(
      `  - ${m.key}: EN has [${m.enPlaceholders.join(", ")}] ("${m.enVal}"), JA has [${m.jaPlaceholders.join(", ")}] ("${m.jaVal}")`,
    );
  }
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
}

console.log(
  `Translation resource parity passed: ${enKeys.size} keys, 0 placeholder mismatches.`,
);
