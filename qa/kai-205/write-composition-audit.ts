import fs from "node:fs";
import path from "node:path";
import { output } from "./reproduce-composition";

const outputPath = path.resolve("qa/kai-205/composition-audit.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
