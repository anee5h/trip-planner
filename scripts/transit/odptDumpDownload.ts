/**
 * KAI-291B2 — bounded ODPT Data Dump downloader.
 *
 * Maintenance/import pipeline transport. Offline-first design: `fetch` is
 * INJECTED, so every redirect/transport rule is proven with fake servers and
 * CI never touches the ODPT internet endpoint.
 *
 * Security rules (all pinned by tests):
 * - The consumer key travels ONLY on the initial authenticated ODPT request.
 *   Redirected requests follow the returned dump URL exactly after
 *   validation: no merged query params, no forwarded key.
 * - Redirects are followed manually against an explicit approved-origin
 *   allow-list. No wildcard hosts, no HTTP downgrade, no loops.
 * - The key never appears in returned records, manifests, logs or errors.
 * - Bodies stream with a byte cap and inline SHA-256; an unbounded
 *   `response.text()` is never used for the download transport.
 *
 * Node-only (scripts/transit). No browser, no runtime wiring.
 */

import { createHash } from "node:crypto";

/** Dump families B2 may acquire. Nothing else is fetchable. */
export const DUMP_RESOURCE_ALLOWLIST = [
  "odpt:Operator",
  "odpt:Station",
  "odpt:Railway",
  "odpt:Calendar",
] as const;

export type DumpResourceType = (typeof DUMP_RESOURCE_ALLOWLIST)[number];

/** The only origin an initial dump request may target. */
export const DUMP_ENTRY_ORIGIN = "https://api.odpt.org";

/** Dump route shape: /api/v4/<RDF_TYPE>.json (allow-listed type only). */
export function dumpEntryPath(rdfType: DumpResourceType): string {
  return `/api/v4/${rdfType}.json`;
}

/** Machine-readable download failure reasons. */
export type DumpDownloadErrorCode =
  | "provider_not_configured"
  | "invalid_rdf_type"
  | "unapproved_redirect_host"
  | "redirect_downgrade"
  | "redirect_loop"
  | "too_many_redirects"
  | "missing_location"
  | "malformed_location"
  | "invalid_credential"
  | "forbidden_scope"
  | "dump_unavailable"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_unreachable"
  | "response_too_large"
  | "empty_body"
  | "truncated_stream";

/** Fail-closed download error. Carries sanitized detail only — never a key. */
export class DumpDownloadError extends Error {
  readonly code: DumpDownloadErrorCode;
  constructor(code: DumpDownloadErrorCode, message: string) {
    super(`odpt-dump-download[${code}]: ${message}`);
    this.name = "DumpDownloadError";
    this.code = code;
  }
}

/** Minimal fetch surface the downloader needs (real fetch satisfies it). */
export interface DumpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: AsyncIterable<Uint8Array> | null;
}

export type DumpFetch = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal },
) => Promise<DumpResponse>;

/** One followed redirect hop, sanitized for records and logs. */
export interface DumpRedirectHop {
  readonly status: number;
  /** Redirect target origin, e.g. `https://dump.example`. No path/query. */
  readonly targetOrigin: string;
  /** Redirect target path, or null when the target carries query/fragment. */
  readonly targetPath: string | null;
  /** True when the Location carried query/fragment (values never recorded). */
  readonly hadSensitiveParts: boolean;
}

/** Sanitized download evidence. No key, no signed query, no token. */
export interface DumpDownloadRecord {
  readonly rdfType: DumpResourceType;
  /** Initial endpoint origin + path. Query stripped (it held the key). */
  readonly initialEndpoint: string;
  readonly initialStatus: number;
  readonly hops: readonly DumpRedirectHop[];
  readonly finalStatus: number;
  readonly contentType: string | null;
  readonly contentLengthHeader: number | null;
  readonly bytesDownloaded: number;
  readonly rawSha256: string;
  /**
   * Downloaded bytes (cap-enforced, so bounded). Returned so the pipeline
   * stages exactly the validated bytes — never re-fetched uncapped.
   */
  readonly bodyBytes: Uint8Array;
  /** Total HTTP attempts including the initial request and every hop. */
  readonly httpAttempts: number;
}

export interface DumpDownloadOptions {
  readonly rdfType: string;
  readonly apiKey: string;
  /** Exact origins (scheme + host) redirects may target. Empty = none. */
  readonly approvedRedirectOrigins: readonly string[];
  readonly byteCap: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly fetchImpl: DumpFetch;
}

/**
 * Resource-specific byte caps. Provisional and generous: set without live
 * size observation (no credential locally), so each cap is multiples above
 * any plausible topology payload, with the Content-Length pre-check and
 * streaming abort as the real guards. Adjusted after the first live audit.
 */
export const DUMP_BYTE_CAPS: Record<DumpResourceType, number> = {
  // Small registries: generous single-digit MB headroom.
  "odpt:Operator": 4 * 1024 * 1024,
  "odpt:Calendar": 8 * 1024 * 1024,
  // Railway records carry stationOrder arrays: tens of MB headroom.
  "odpt:Railway": 16 * 1024 * 1024,
  // Station is the largest topology family (all operators, coordinates,
  // multilingual titles). Generous cap; pre-check and streaming abort apply.
  "odpt:Station": 64 * 1024 * 1024,
};

export const DUMP_DEFAULT_TIMEOUT_MS = 60_000;
export const DUMP_DEFAULT_MAX_REDIRECTS = 3;

/**
 * Committed exact-origin allow-list for dump redirects. Entries are added
 * ONLY after a controlled discovery is reviewed and explicitly approved:
 * normal audit/promote follows ONLY these origins. Never a wildcard, never
 * runtime-supplied for normal operation.
 *
 * - https://dataodpt.blob.core.windows.net: observed 2026-09-12 via
 *   one-request discovery (302 from api.odpt.org, signed-query Location),
 *   explicitly approved in review. Provider-issued query (SAS-style) on the
 *   redirect target is followed exactly; the consumer key is never merged
 *   into it or forwarded.
 */
export const APPROVED_DUMP_REDIRECT_ORIGINS: readonly string[] = [
  "https://dataodpt.blob.core.windows.net",
];

function isAllowedResource(value: string): value is DumpResourceType {
  return (DUMP_RESOURCE_ALLOWLIST as readonly string[]).includes(value);
}

/** Sanitized redirect discovery: origin only, never query or key. */
export interface DumpRedirectDiscovery {
  readonly rdfType: DumpResourceType;
  readonly initialEndpoint: string;
  readonly initialStatus: number;
  readonly targetOrigin: string;
  readonly targetPath: string | null;
  readonly hadSensitiveParts: boolean;
}

/**
 * Performs ONLY the authenticated initial request for one dump family and
 * reports the redirect target WITHOUT following it. Used for controlled
 * first-contact discovery: the observed origin goes to review, and only an
 * explicitly approved origin ever enters the committed allow-list.
 */
export async function discoverDumpRedirect(input: {
  readonly rdfType: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl: DumpFetch;
}): Promise<DumpRedirectDiscovery> {
  if (!isAllowedResource(input.rdfType)) {
    throw new DumpDownloadError(
      "invalid_rdf_type",
      `resource ${JSON.stringify(input.rdfType)} is not an acquirable dump family.`,
    );
  }
  if (input.apiKey.length === 0) {
    throw new DumpDownloadError(
      "provider_not_configured",
      "ODPT_API_KEY is absent; refusing to issue any dump request.",
    );
  }
  const initial = new URL(
    `${DUMP_ENTRY_ORIGIN}${dumpEntryPath(input.rdfType)}?acl:consumerKey=${encodeURIComponent(input.apiKey)}`,
  );
  const response = await fetchOne(input.fetchImpl, initial, input.timeoutMs);
  if (response.status < 300 || response.status >= 400) {
    throw new DumpDownloadError(
      "provider_unavailable",
      `discovery expected a redirect but observed status ${response.status}.`,
    );
  }
  const location = response.headers.get("location");
  if (location === null || location.length === 0) {
    throw new DumpDownloadError(
      "missing_location",
      `redirect from ${sanitizeEndpoint(initial)} carries no Location.`,
    );
  }
  let target: URL;
  try {
    target = new URL(location, initial);
  } catch {
    throw new DumpDownloadError(
      "malformed_location",
      `redirect from ${sanitizeEndpoint(initial)} carries an unparsable Location.`,
    );
  }
  const hadSensitiveParts = target.search.length > 0 || target.hash.length > 0;
  return {
    rdfType: input.rdfType,
    initialEndpoint: sanitizeEndpoint(initial),
    initialStatus: response.status,
    targetOrigin: target.origin,
    targetPath: hadSensitiveParts ? null : target.pathname,
    hadSensitiveParts,
  };
}

function sanitizeEndpoint(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

async function fetchOne(
  fetchImpl: DumpFetch,
  url: URL,
  timeoutMs: number,
): Promise<DumpResponse> {
  try {
    return await fetchImpl(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new DumpDownloadError(
        "provider_timeout",
        `request to ${sanitizeEndpoint(url)} timed out.`,
      );
    }
    throw new DumpDownloadError(
      "provider_unreachable",
      `request to ${sanitizeEndpoint(url)} failed before a response.`,
    );
  }
}

function rejectByStatus(status: number, rdfType: string): never {
  if (status === 401) {
    throw new DumpDownloadError(
      "invalid_credential",
      "dump endpoint rejected the credential.",
    );
  }
  if (status === 403) {
    throw new DumpDownloadError(
      "forbidden_scope",
      "dump endpoint refused access (permission/licence scope).",
    );
  }
  if (status === 404) {
    throw new DumpDownloadError(
      "dump_unavailable",
      `dump family ${rdfType} is unavailable at the endpoint.`,
    );
  }
  if (status === 429) {
    throw new DumpDownloadError("rate_limited", "dump endpoint rate-limited.");
  }
  if (status >= 500) {
    throw new DumpDownloadError(
      "provider_unavailable",
      `dump endpoint failed with status ${status}.`,
    );
  }
  throw new DumpDownloadError(
    "provider_unavailable",
    `unexpected dump status ${status}.`,
  );
}

/**
 * Downloads one dump family. The key is used on the initial request only and
 * never retained in the returned record or any thrown error.
 */
export async function downloadDumpResource(
  options: DumpDownloadOptions,
): Promise<DumpDownloadRecord> {
  if (!isAllowedResource(options.rdfType)) {
    throw new DumpDownloadError(
      "invalid_rdf_type",
      `resource ${JSON.stringify(options.rdfType)} is not an acquirable dump family.`,
    );
  }
  if (options.apiKey.length === 0) {
    // Zero network calls without a credential: fail before any fetch.
    throw new DumpDownloadError(
      "provider_not_configured",
      "ODPT_API_KEY is absent; refusing to issue any dump request.",
    );
  }
  const rdfType = options.rdfType;
  // The param NAME stays literal (`URL.searchParams.set` would encode its
  // colon); only the value is encoded — matching the server boundary form.
  const initial = new URL(
    `${DUMP_ENTRY_ORIGIN}${dumpEntryPath(rdfType)}?acl:consumerKey=${encodeURIComponent(options.apiKey)}`,
  );

  const hops: DumpRedirectHop[] = [];
  const visited = new Set<string>([sanitizeEndpoint(initial)]);
  let attempts = 0;
  let initialStatus = 0;

  // The key travels on this first request only. Every hop below fetches the
  // validated Location exactly, with no key and no inherited query.
  let current = initial;
  for (;;) {
    attempts += 1;
    const response = await fetchOne(
      options.fetchImpl,
      current,
      options.timeoutMs,
    );
    if (attempts === 1) initialStatus = response.status;
    if (response.status < 300 || response.status >= 400) {
      if (response.status !== 200) {
        rejectByStatus(response.status, rdfType);
      }
      return finishDownload(response, {
        rdfType,
        initial,
        initialStatus,
        hops,
        attempts,
        byteCap: options.byteCap,
      });
    }
    // 3xx: validate-then-follow, manually.
    const location = response.headers.get("location");
    if (location === null || location.length === 0) {
      throw new DumpDownloadError(
        "missing_location",
        `redirect from ${sanitizeEndpoint(current)} carries no Location.`,
      );
    }
    let target: URL;
    try {
      target = new URL(location, current);
    } catch {
      throw new DumpDownloadError(
        "malformed_location",
        `redirect from ${sanitizeEndpoint(current)} carries an unparsable Location.`,
      );
    }
    if (target.protocol !== "https:") {
      throw new DumpDownloadError(
        "redirect_downgrade",
        `redirect target uses ${target.protocol}; HTTPS only.`,
      );
    }
    if (!options.approvedRedirectOrigins.includes(target.origin)) {
      throw new DumpDownloadError(
        "unapproved_redirect_host",
        `redirect target origin ${target.origin} is not in the approved allow-list.`,
      );
    }
    const fingerprint = sanitizeEndpoint(target);
    if (visited.has(fingerprint)) {
      throw new DumpDownloadError(
        "redirect_loop",
        `redirect target ${fingerprint} was already visited.`,
      );
    }
    if (hops.length >= options.maxRedirects) {
      throw new DumpDownloadError(
        "too_many_redirects",
        `more than ${options.maxRedirects} redirects; refusing to continue.`,
      );
    }
    visited.add(fingerprint);
    const hadSensitiveParts =
      target.search.length > 0 || target.hash.length > 0;
    hops.push({
      status: response.status,
      targetOrigin: target.origin,
      targetPath: hadSensitiveParts ? null : target.pathname,
      hadSensitiveParts,
    });
    current = target;
  }
}

async function finishDownload(
  response: DumpResponse,
  context: {
    rdfType: DumpResourceType;
    initial: URL;
    initialStatus: number;
    hops: DumpRedirectHop[];
    attempts: number;
    byteCap: number;
  },
): Promise<DumpDownloadRecord> {
  const contentType = response.headers.get("content-type");
  const lengthHeader = response.headers.get("content-length");
  const declared =
    lengthHeader === null ? null : Number.parseInt(lengthHeader, 10);
  const contentLengthHeader =
    declared !== null && Number.isInteger(declared) && declared >= 0
      ? declared
      : null;
  if (contentLengthHeader !== null && contentLengthHeader > context.byteCap) {
    throw new DumpDownloadError(
      "response_too_large",
      `declared ${contentLengthHeader} bytes exceeds the ${context.byteCap} cap; body untouched.`,
    );
  }
  if (response.body === null) {
    throw new DumpDownloadError(
      "empty_body",
      "200 response carries no readable body.",
    );
  }
  const hash = createHash("sha256");
  const chunks: Uint8Array[] = [];
  let bytesDownloaded = 0;
  try {
    for await (const chunk of response.body) {
      bytesDownloaded += chunk.byteLength;
      if (bytesDownloaded > context.byteCap) {
        throw new DumpDownloadError(
          "response_too_large",
          `stream crossed the ${context.byteCap} byte cap; aborted.`,
        );
      }
      chunks.push(chunk);
      hash.update(chunk);
    }
  } catch (error) {
    if (error instanceof DumpDownloadError) throw error;
    throw new DumpDownloadError(
      "truncated_stream",
      "response stream broke before completion.",
    );
  }
  if (bytesDownloaded === 0) {
    throw new DumpDownloadError("empty_body", "downloaded zero bytes.");
  }
  const bodyBytes = new Uint8Array(bytesDownloaded);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    rdfType: context.rdfType,
    initialEndpoint: sanitizeEndpoint(context.initial),
    initialStatus: context.initialStatus,
    hops: context.hops,
    finalStatus: 200,
    contentType,
    contentLengthHeader,
    bytesDownloaded,
    rawSha256: hash.digest("hex"),
    bodyBytes,
    httpAttempts: context.attempts,
  };
}
