#!/usr/bin/env node
/**
 * KAI-126: pre-publish privacy/secrets scan for the generated Allure report.
 *
 * Scans every file in the report tree for patterns that must NOT leak into
 * the private-but-shared dashboard: email addresses, JWT-shaped tokens,
 * Supabase service-role keys / publishable keys, auth headers, cookie
 * values, and obvious secrets. Fails (non-zero) if anything matches, so CI
 * blocks publishing until an owner has reviewed and either redacted or
 * explicitly allowed the match.
 *
 * Usage: node scripts/check-allure-privacy.mjs <report-dir>
 * Exit 0 = clean; exit 1 = matches found (list them).
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("usage: node scripts/check-allure-privacy.mjs <report-dir>");
  process.exit(2);
}

// --- Pattern list (deliberately conservative: fail closed on any hit) ---
const PATTERNS = [
  { name: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  {
    name: "JWT",
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: "supabase-service-role",
    re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/,
  },
  { name: "supabase-url", re: /https:\/\/[a-z0-9]+\.supabase\.co/ },
  { name: "api-key-ish", re: /\b(sk|pk|rk|AKIA)[A-Za-z0-9]{16,}\b/ },
  {
    name: "private-key-block",
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "authorization-header",
    re: /authorization\s*[:=]\s*(bearer|basic|apikey)\s+[^\s"']+/i,
  },
  { name: "set-cookie", re: /set-cookie\s*[:=]\s*[^;\s]+/i },
];

/** True for files we should scan (skip binary images/fonts). */
function isScannable(rel) {
  return !/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|eot|ico|mp4|zip)$/i.test(rel);
}

function walk(dirPath, base, out = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(rel);
  }
  return out;
}

let total = 0;
const findings = [];

for (const rel of walk(dir, dir)) {
  if (!isScannable(rel)) continue;
  const text = fs.readFileSync(path.join(dir, rel), "utf8");
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (m) {
      total++;
      findings.push(`${rel} :: ${name} :: ${String(m[0]).slice(0, 80)}`);
    }
  }
}

if (findings.length > 0) {
  console.error(`❌ Privacy scan FAILED — ${findings.length} match(es):`);
  for (const f of findings) console.error(`   ${f}`);
  console.error(
    "Review the report; redact or regenerate before setting ALLURE_PUBLISH_READY=1.",
  );
  process.exit(1);
}

console.log(`✅ Privacy scan clean (${total} files scanned, 0 matches)`);
