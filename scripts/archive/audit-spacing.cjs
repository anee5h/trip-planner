const fs = require("fs");
const path = require("path");

/**
 * Scans src/ for Tailwind spacing classes that fall off the 8px grid or use deprecated tokens.
 * Usage: npm run audit-spacing
 */

const OFF_GRID_PATTERNS = [
  {
    name: "p-3/gap-3/space-3 (12px - off 8px grid)",
    regex: /\b([pm][xytblr]?-3|gap-3|space-[xy]-3)\b/g,
  },
  {
    name: "p-5/gap-5/space-5 (20px - off 8px grid)",
    regex: /\b([pm][xytblr]?-5|gap-5|space-[xy]-5)\b/g,
  },
  { name: "arbitrary pixel spacing", regex: /\b[pm][xytblr]?-\[\d+px\]\b/g },
  {
    name: "deprecated md token (12px)",
    regex: /\b([pm][xytblr]?-md|gap-md|space-[xy]-md)\b/g,
  },
  {
    name: "deprecated lg token (16px → use base)",
    regex: /\b([pm][xytblr]?-lg|gap-lg|space-[xy]-lg)\b/g,
  },
];

function scanDirectory(dir, results = {}) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath, results);
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        OFF_GRID_PATTERNS.forEach((pattern) => {
          pattern.regex.lastIndex = 0;
          const matches = line.match(pattern.regex);
          if (matches) {
            if (!results[pattern.name]) {
              results[pattern.name] = [];
            }
            results[pattern.name].push({
              file: path.relative(process.cwd(), fullPath),
              line: index + 1,
              content: line.trim(),
              matches,
            });
          }
        });
      });
    }
  }
  return results;
}

const srcDir = path.join(__dirname, "../src");
console.log("=== TabiMap Spacing & Token Audit ===\n");
const results = scanDirectory(srcDir);

let totalIssues = 0;
for (const [category, occurrences] of Object.entries(results)) {
  console.log(`\n📌 ${category} (${occurrences.length} occurrences):`);
  occurrences.forEach((item) => {
    totalIssues++;
    console.log(`   ${item.file}:${item.line} -> ${item.matches.join(", ")}`);
  });
}

console.log(`\n====================================`);
console.log(`Total items found: ${totalIssues}`);
console.log(`====================================\n`);
