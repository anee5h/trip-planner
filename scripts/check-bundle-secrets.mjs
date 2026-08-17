#!/usr/bin/env node
/**
 * KAI-81: secrets-in-bundle check.
 *
 * Scans the built client artifacts (dist/) for credentials that must never
 * ship to the browser:
 *   - Supabase service-role JWTs — both the literal `"role":"service_role"`
 *     form AND the encoded form: JWT candidates are split into their three
 *     sections, the payload is base64url-decoded, and the claim is checked,
 *     because a normal legacy service-role JWT carries its role inside the
 *     base64url-encoded payload, not as a readable literal in the bundle.
 *   - Supabase elevated server keys: `sb_secret_...` and
 *     SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY assignments.
 *     Client-side `sb_publishable_...` / anon-role credentials are allowed.
 *   - the service_role pattern itself
 *   - Resend API keys (re_...) and generic long-lived secret patterns
 * Fails closed when dist/ is missing so a broken build cannot pass silently.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.join(process.cwd(), "dist");

const SECRET_PATTERNS = [
  {
    name: "Supabase service-role JWT literal",
    re: /"role"\s*:\s*"service_role"/,
  },
  {
    name: "service_role literal",
    re: /service_role/,
  },
  {
    name: "Supabase secret key (sb_secret_)",
    re: /sb_secret_[A-Za-z0-9_-]{16,}/,
  },
  {
    name: "Supabase secret key assignment",
    re: /SUPABASE_SECRET_KEY\s*[=:]\s*["'][^"']{16,}["']/i,
  },
  {
    name: "Resend API key",
    re: /re_[A-Za-z0-9]{20,}/,
  },
  {
    name: "generic long secret assignment",
    re: /(SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|LINEAR_API_KEY)\s*[=:]\s*["'][^"']{16,}["']/i,
  },
];

/** A JWT looks like header.payload.signature, each section base64url. */
const JWT_CANDIDATE_RE =
  /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function decodeJwtPayload(payloadSection) {
  try {
    const json = Buffer.from(payloadSection, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Returns the list of secret-pattern names found in a single file's content.
 * Exported so regression tests can feed synthetic content directly.
 */
export function findSecretViolations(content) {
  const violations = [];
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) violations.push(name);
  }
  // Encoded service-role JWT: decode every JWT candidate's payload and fail
  // when its role claim is service_role. anon/publishable credentials are
  // legitimate client-side values and stay allowed.
  for (const match of content.matchAll(JWT_CANDIDATE_RE)) {
    const payload = decodeJwtPayload(match[0].split(".")[1]);
    if (payload?.role === "service_role") {
      violations.push("Supabase service-role JWT (decoded payload)");
      break;
    }
  }
  return violations;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(js|html|css|json|map)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function main() {
  if (!existsSync(DIST)) {
    console.error("FAIL: dist/ missing — run the build before this check");
    process.exit(1);
  }
  const files = walk(DIST);
  let violations = 0;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const name of findSecretViolations(content)) {
      violations += 1;
      console.error(
        `❌ ${name} found in ${path.relative(process.cwd(), file)}`,
      );
    }
  }
  if (violations > 0) {
    console.error(`❌ ${violations} secret pattern(s) in the bundle`);
    process.exit(1);
  }
  console.log(`✅ no secret patterns in ${files.length} built files`);
}

// CLI entry only when executed directly — importing the module (tests)
// must not run the dist scan.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
