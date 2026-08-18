#!/usr/bin/env node
/**
 * KAI-126: pre-publish privacy/secrets scan for Allure output.
 *
 * Scans TEST/DATA output (not Allure's own framework assets) for patterns
 * that must NOT leak into the private-but-shared dashboard or the public
 * repo's Actions artifacts: emails, JWT-shaped tokens, Supabase service
 * keys, auth headers, cookies, private keys, obvious secrets.
 *
 * Design (reviewer-driven):
 * - Skips Allure framework bundles (assets/*.js, *.css, fonts, images) —
 *   those are Allure's own code, not test output.
 * - Scans report data/ (test result JSON, history), data/attachments/*,
 *   and allure-results/* (the per-test JSON + attachments) including
 *   ZIP/trace contents (decompressed in memory, not skipped).
 * - Allowlists KNOWN PUBLIC values (e.g. info@meguruto.app — the app's
 *   public contact address) so a legitimate report does not false-fail.
 * - Keeps JWT/auth/cookie/private-key detection strict.
 *
 * Usage: node scripts/check-allure-privacy.mjs <dir> [--allow <value>]... [--sanitize]
 *   --sanitize: delete binary attachments (screenshots/videos) from the
 *   scanned directory BEFORE upload — a regex scanner cannot declare
 *   uninspectable binaries safe, so they are excluded from public
 *   Actions artifacts by default.
 * Exit 0 = clean; exit 1 = matches found (list them).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error(
    "usage: node scripts/check-allure-privacy.mjs <dir> [--allow <value>]... [--sanitize]",
  );
  process.exit(2);
}
const SANITIZE = process.argv.includes("--sanitize");

// Binary attachment extensions that cannot be inspected by regex.
const BINARY_EXT = /\.(png|jpe?g|gif|webp|mp4|webm|ico|woff2?|ttf|eot)$/i;

// Known intentionally-public values (app contact, etc.). Additive.
const ALLOWLIST = ["info@meguruto.app"];
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--allow" && process.argv[i + 1]) {
    ALLOWLIST.push(process.argv[i + 1]);
    i++;
  }
}

const PATTERNS = [
  { name: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  {
    name: "JWT",
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    name: "supabase-service-role",
    re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/g,
  },
  { name: "supabase-url", re: /https:\/\/[a-z0-9]+\.supabase\.co/g },
  { name: "api-key-ish", re: /\b(sk|pk|rk|AKIA)[A-Za-z0-9]{16,}\b/g },
  {
    name: "private-key-block",
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "authorization-header",
    re: /authorization\s*[:=]\s*(bearer|basic|apikey)\s+[^\s"']+/gi,
  },
  { name: "set-cookie", re: /set-cookie\s*[:=]\s*[^;\s]+/gi },
];

/**
 * Decide whether a file is SCANNABLE:
 * - Always scan: allure-results/*.json (per-test results), data/*.json,
 *   data/attachments/* (except binary media), *.txt, *.log, *.html in
 *   report data/.
 * - NEVER scan Allure's own framework assets (assets/*.js|css|svg|woff2,
 *   and the report's vendor bundles) — they are Allure code, not output.
 * - ZIPs/traces are scanned by decompressing in memory.
 */
function isScannable(rel) {
  const base = path.basename(rel);
  // Allure framework assets — never test output.
  if (/^assets\/.*\.(js|css|svg|woff2?|ttf|eot|ico|png|jpe?g|gif)$/.test(rel)) {
    return false;
  }
  if (/^(app|styles|chunk|index)[^/]*\.(js|css)$/.test(base)) return false;
  // Binary media attachments: skip (not text).
  if (/\.(png|jpe?g|gif|webp|ico|mp4|woff2?|ttf|eot)$/i.test(base))
    return false;
  // Everything else (json, html, txt, log, xml, zip, trace, diff) — scan.
  return true;
}

/** Read a file as text; if it's a ZIP (trace), decompress entries in memory.
 *  FAILS CLOSED: an unparseable ZIP is surfaced as a finding (content we
 *  could not inspect), and network/trace entry text is NOT truncated — a
 *  secret could live in the tail of a long payload. */
function readText(fullPath, rel) {
  const buf = fs.readFileSync(fullPath);
  if (/\.(zip|trace)$/i.test(rel)) {
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      // decompressZip throws on malformed central directory.
      const chunks = decompressZip(buf);
      const texts = [];
      for (const c of chunks) {
        if (
          c.name.includes("network") ||
          c.name.includes("console") ||
          c.name.endsWith(".json") ||
          c.name.endsWith(".txt")
        ) {
          // Full entry text — no truncation.
          texts.push(`--- ${c.name} ---\n${c.data.toString("utf8")}`);
        }
      }
      return texts.join("\n");
    }
    // A .zip/.trace that is NOT actually a ZIP: fail closed.
    return `UNPARSEABLE_TRACE ${rel}`;
  }
  return buf.toString("utf8");
}

/** Minimal ZIP decompressor (store + deflate) for trace inspection. */
function decompressZip(buf) {
  const out = [];
  // EOCD search
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no EOCD");
  const count = buf.readUInt16LE(eocd + 10);
  // Validate entry count against buffer bounds (fail closed on garbage).
  const maxPossible = Math.floor(buf.length / 30);
  if (count > maxPossible) throw new Error(`implausible entry count ${count}`);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    // Central-directory entry signature + bounds check.
    if (offset + 46 > buf.length)
      throw new Error(`central dir entry ${i} out of bounds`);
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4b) {
      throw new Error(`central dir entry ${i} missing signature`);
    }
    const method = buf.readUInt16LE(offset + 10);
    // Only store (0) and deflate (8) are accepted; anything else fails
    // closed (unsupported compression = content we cannot verify).
    if (method !== 0 && method !== 8) {
      throw new Error(`unsupported ZIP compression method ${method}`);
    }
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    const localOffset = buf.readUInt32LE(offset + 42);
    // Local header + bounds.
    if (localOffset + 30 > buf.length)
      throw new Error(`local header ${i} out of bounds`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length) {
      throw new Error(`entry ${i} data out of bounds`);
    }
    let data = buf.subarray(dataStart, dataStart + compSize);
    if (method === 8) data = zlib.inflateRawSync(data);
    out.push({ name, data });
    offset += 46 + nameLen + extraLen;
  }
  return out;
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

function isAllowed(value) {
  return ALLOWLIST.some((a) => value.includes(a));
}

const findings = [];
let scannedFiles = 0;

for (const rel of walk(dir, dir)) {
  if (!isScannable(rel)) continue;
  let text;
  try {
    text = readText(path.join(dir, rel), rel);
  } catch {
    // Unreadable/decompression failure — FAIL CLOSED: we could not
    // inspect this file, so treat it as a finding.
    findings.push(`${rel} :: unreadable :: could not decompress/inspect`);
    continue;
  }
  if (text.startsWith("UNPARSEABLE_TRACE")) {
    findings.push(
      `${rel} :: unparseable-trace :: not a valid ZIP, content uninspected`,
    );
    continue;
  }
  scannedFiles++;
  for (const { name, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const val = String(m[0]);
      if (isAllowed(val)) continue;
      findings.push(`${rel} :: ${name} :: ${val.slice(0, 80)}`);
    }
  }
}

// --sanitize: remove binary attachments (screenshots/videos) that a regex
// scanner cannot declare safe. They are excluded from public Actions
// artifacts by default; the private authenticated R2 store may retain
// verified-safe diagnostics (report data) separately.
if (SANITIZE) {
  let removed = 0;
  for (const rel of walk(dir, dir)) {
    if (BINARY_EXT.test(rel)) {
      fs.rmSync(path.join(dir, rel), { force: true });
      removed++;
    }
  }
  if (removed > 0) {
    console.log(
      `  (--sanitize) removed ${removed} binary attachment(s) from public artifact set`,
    );
  }
}

if (findings.length > 0) {
  console.error(`❌ Privacy scan FAILED — ${findings.length} match(es):`);
  for (const f of findings.slice(0, 50)) console.error(`   ${f}`);
  if (findings.length > 50)
    console.error(`   ... and ${findings.length - 50} more`);
  console.error(
    "Review the output; redact or regenerate before setting ALLURE_PUBLISH_READY=1.",
  );
  process.exit(1);
}

console.log(`✅ Privacy scan clean (${scannedFiles} files scanned, 0 matches)`);
