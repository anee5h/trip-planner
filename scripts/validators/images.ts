import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
  Severity,
} from "./types";
import https from "https";
import dns from "dns";

/** Hosts that the catalogue is allowed to reference for destination images. */
export const ALLOWED_IMAGE_HOSTS = new Set([
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "thumb.wikimedia.org",
  "images.unsplash.com",
  "media.istockphoto.com",
  "museum.seiko.co.jp",
  "mangapark.jp",
]);

function imageProviderKey(urlStr: string): string {
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return hostname.endsWith(".wikimedia.org") ? "wikimedia.org" : hostname;
  } catch {
    return "invalid-image-url";
  }
}

function safeImageUrlForReport(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|key|secret|auth|sig|credential|password|passwd/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return "[invalid image URL]";
  }
}

function validateImageUrlShape(urlStr: string): string | undefined {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return "malformed URL";
  }
  if (url.protocol !== "https:") return "URL must use HTTPS";
  if (url.username || url.password) {
    return "URL must not contain embedded credentials";
  }
  if (!ALLOWED_IMAGE_HOSTS.has(url.hostname)) {
    return `host '${url.hostname}' is not on the allowed image host list`;
  }
  return undefined;
}

function publicImageFailureSummary(result: ImageCheckResult): string {
  if (result.providerCooldownBlocked) {
    const status =
      result.status === undefined ? "provider" : `HTTP ${result.status}`;
    return `${status} cooldown; remaining checks were deferred`;
  }
  if (result.retryBudgetExceeded && result.status !== undefined) {
    return `HTTP ${result.status}; retry budget exhausted`;
  }
  if (result.status !== undefined) return `HTTP ${result.status}`;

  switch (result.failureSource) {
    case "dns":
      return "DNS resolution failure";
    case "http":
      return "HTTP request failure";
    case "policy":
      return "image policy rejection";
    case "request":
      return "network request failure";
    case "stream":
      return "image response stream failure";
    case "timeout":
      return "image request timeout";
    default:
      return "image fetch failure";
  }
}

/** Maximum response body to download while validating a URL. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** Maximum redirect hops to follow. */
const MAX_REDIRECTS = 3;

function boundedIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

/**
 * Centralized live-probe budget. Wikimedia subdomains share a provider key,
 * so their requests are serialized and paced even when unrelated hosts run in
 * parallel. CI can lower the global concurrency without editing validator code.
 */
export const IMAGE_VALIDATION_POLICY = Object.freeze({
  maxConcurrentRequests: boundedIntegerEnv(
    "IMAGE_VALIDATION_MAX_CONCURRENT_REQUESTS",
    3,
    1,
    5,
  ),
  maxConcurrentRequestsPerProvider: 1,
  maxRetries: 2,
  maxRateLimitRetries: 1,
  maxProviderTransientHttpResponses: 4,
  maxProviderTransportFailures: 4,
  maxProviderInconclusiveUrls: 8,
  baseRetryDelayMs: 1_000,
  maxRetryDelayMs: 8_000,
  maxRetryAfterMs: 30_000,
  minRequestStartIntervalMs: 200,
  minWikimediaRequestStartIntervalMs: 1_000,
});

// Keep tuning values centralized above while preserving local names at call sites.
const MAX_IMAGE_FETCH_RETRIES = IMAGE_VALIDATION_POLICY.maxRetries;
const MAX_RATE_LIMIT_RETRIES = IMAGE_VALIDATION_POLICY.maxRateLimitRetries;
const MAX_PROVIDER_TRANSIENT_HTTP_RESPONSES =
  IMAGE_VALIDATION_POLICY.maxProviderTransientHttpResponses;
const MAX_PROVIDER_TRANSPORT_FAILURES =
  IMAGE_VALIDATION_POLICY.maxProviderTransportFailures;
const MAX_PROVIDER_INCONCLUSIVE_URLS =
  IMAGE_VALIDATION_POLICY.maxProviderInconclusiveUrls;
const BASE_RETRY_DELAY_MS = IMAGE_VALIDATION_POLICY.baseRetryDelayMs;
const MAX_RETRY_DELAY_MS = IMAGE_VALIDATION_POLICY.maxRetryDelayMs;
const MAX_RETRY_AFTER_MS = IMAGE_VALIDATION_POLICY.maxRetryAfterMs;
const MAX_CONCURRENT_IMAGE_REQUESTS =
  IMAGE_VALIDATION_POLICY.maxConcurrentRequests;
const MAX_OUTSTANDING_DNS_LOOKUPS = MAX_CONCURRENT_IMAGE_REQUESTS;
const MAX_CONCURRENT_IMAGE_REQUESTS_PER_PROVIDER =
  IMAGE_VALIDATION_POLICY.maxConcurrentRequestsPerProvider;
const MIN_IMAGE_REQUEST_START_INTERVAL_MS =
  IMAGE_VALIDATION_POLICY.minRequestStartIntervalMs;
const MIN_WIKIMEDIA_REQUEST_START_INTERVAL_MS =
  IMAGE_VALIDATION_POLICY.minWikimediaRequestStartIntervalMs;

const HTTP_DATE_MONTHS = new Map(
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].map((name, index) => [name.toLowerCase(), index]),
);
const HTTP_DATE_WEEKDAYS = new Map([
  ["sun", 0],
  ["sunday", 0],
  ["mon", 1],
  ["monday", 1],
  ["tue", 2],
  ["tuesday", 2],
  ["wed", 3],
  ["wednesday", 3],
  ["thu", 4],
  ["thursday", 4],
  ["fri", 5],
  ["friday", 5],
  ["sat", 6],
  ["saturday", 6],
]);

type ImageRequest = () => Promise<ImageCheckResult>;

export interface ImageRetryOptions {
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onAttempt?: (result: ImageCheckResult, attempt: number) => void;
  onWait?: (wait: {
    result: ImageCheckResult;
    retryAfterMs: number;
    /** Exponential-backoff time beyond any overlapping Retry-After delay. */
    backoffDelayMs: number;
    requestedWaitMs: number;
    elapsedWaitMs: number;
  }) => void;
  onRetryAfterOverBudget?: (retryAfterMs: number) => void;
}

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export function parseRetryAfterMs(
  value: string | undefined,
  nowMs = Date.now(),
): number | undefined {
  if (!value?.trim()) return undefined;

  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    if (
      !Number.isFinite(seconds) ||
      seconds > Number.MAX_SAFE_INTEGER / 1_000
    ) {
      return Number.MAX_SAFE_INTEGER;
    }
    return seconds * 1_000;
  }

  const imfFixdate =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/i.exec(
      normalized,
    );
  const rfc850Date =
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/i.exec(
      normalized,
    );
  const asctimeDate =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-3]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/i.exec(
      normalized,
    );

  let parts:
    | {
        weekday: string;
        day: number;
        month: string;
        year?: number;
        yearSuffix?: number;
        hour: number;
        minute: number;
        second: number;
      }
    | undefined;

  if (imfFixdate) {
    parts = {
      weekday: imfFixdate[1],
      day: Number(imfFixdate[2]),
      month: imfFixdate[3],
      year: Number(imfFixdate[4]),
      hour: Number(imfFixdate[5]),
      minute: Number(imfFixdate[6]),
      second: Number(imfFixdate[7]),
    };
  } else if (rfc850Date) {
    parts = {
      weekday: rfc850Date[1],
      day: Number(rfc850Date[2]),
      month: rfc850Date[3],
      yearSuffix: Number(rfc850Date[4]),
      hour: Number(rfc850Date[5]),
      minute: Number(rfc850Date[6]),
      second: Number(rfc850Date[7]),
    };
  } else if (asctimeDate) {
    parts = {
      weekday: asctimeDate[1],
      month: asctimeDate[2],
      day: Number(asctimeDate[3].trim()),
      hour: Number(asctimeDate[4]),
      minute: Number(asctimeDate[5]),
      second: Number(asctimeDate[6]),
      year: Number(asctimeDate[7]),
    };
  } else {
    return undefined;
  }

  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return undefined;

  // Date.parse normalizes impossible dates (e.g. 31 February), so validate all
  // supplied calendar fields against the parsed UTC date before using it.
  const retryDate = new Date(retryAt);
  const monthIndex = HTTP_DATE_MONTHS.get(parts.month.toLowerCase());
  const weekdayIndex = HTTP_DATE_WEEKDAYS.get(parts.weekday.toLowerCase());

  if (
    retryDate.getUTCDate() !== parts.day ||
    retryDate.getUTCMonth() !== monthIndex ||
    (parts.year !== undefined && retryDate.getUTCFullYear() !== parts.year) ||
    (parts.yearSuffix !== undefined &&
      retryDate.getUTCFullYear() % 100 !== parts.yearSuffix) ||
    retryDate.getUTCHours() !== parts.hour ||
    retryDate.getUTCMinutes() !== parts.minute ||
    retryDate.getUTCSeconds() !== parts.second ||
    retryDate.getUTCDay() !== weekdayIndex
  ) {
    return undefined;
  }

  return Math.max(0, retryAt - nowMs);
}

/** Retries only transient fetch failures with bounded backoff and jitter. */
export async function retryImageFetch(
  request: ImageRequest,
  options: ImageRetryOptions = {},
): Promise<ImageCheckResult> {
  const wait = options.sleep ?? sleep;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  let result: ImageCheckResult = {
    ok: false,
    error: "image request did not run",
  };

  for (
    let retryIndex = 0;
    retryIndex <= MAX_IMAGE_FETCH_RETRIES;
    retryIndex++
  ) {
    result = await request();
    const attempts = retryIndex + 1;
    options.onAttempt?.(result, attempts);

    if (result.ok) return { ...result, attempts };

    const retryLimit =
      result.status === 429 ? MAX_RATE_LIMIT_RETRIES : MAX_IMAGE_FETCH_RETRIES;
    if (
      result.failureType !== "transient" ||
      result.retryBudgetExceeded === true ||
      retryIndex === retryLimit
    ) {
      return { ...result, attempts };
    }

    const retryAfterMs = parseRetryAfterMs(result.retryAfter, now());
    if (retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_AFTER_MS) {
      options.onRetryAfterOverBudget?.(retryAfterMs);
      return {
        ...result,
        attempts,
        retryBudgetExceeded: true,
        error: `${result.error ?? `HTTP ${result.status ?? "request failure"}`}; Retry-After exceeds the ${MAX_RETRY_AFTER_MS}ms retry budget`,
      };
    }

    const backoffCeiling = Math.min(
      BASE_RETRY_DELAY_MS * 2 ** retryIndex,
      MAX_RETRY_DELAY_MS,
    );
    const jitter = Math.max(0, Math.min(1, random()));
    const backoffMs = Math.round(backoffCeiling * (0.5 + jitter));
    const retryAfterJitterMs =
      retryAfterMs === undefined
        ? 0
        : Math.floor(Math.max(0, Math.min(1, random())) * 250);
    const requestedWaitMs =
      Math.max(backoffMs, retryAfterMs ?? 0) + retryAfterJitterMs;
    const waitStartedAt = performance.now();
    await wait(requestedWaitMs);
    options.onWait?.({
      result,
      retryAfterMs: retryAfterMs ?? 0,
      backoffDelayMs: Math.max(0, backoffMs - (retryAfterMs ?? 0)),
      requestedWaitMs,
      elapsedWaitMs: Math.round(performance.now() - waitStartedAt),
    });
  }

  return result;
}

export function isPrivateOrReservedAddress(address: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const [a, b, c] = v4.slice(1, 4).map((n) => Number(n));
    if (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    ) {
      return true;
    }
    return false;
  }
  // IPv6: reject loopback, link-local, ULA, and unspecified prefixes.
  const lower = address.toLowerCase();
  if (lower.startsWith("::1") || lower === "::") return true;
  if (
    lower.startsWith("fe80") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd")
  ) {
    return true;
  }
  return false;
}

export type ImageFailureType = "policy" | "hard" | "transient";

/** A DNS failure cannot establish that the image resource itself is invalid. */
export function classifyDnsError(_code: string | undefined): ImageFailureType {
  return "transient";
}

const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "EPIPE",
  "ENETDOWN",
  "ENETUNREACH",
  "ERR_STREAM_PREMATURE_CLOSE",
  "ETIMEDOUT",
]);

/** Unknown and certificate/URL errors are terminal, not retryable outages. */
export function classifyNetworkError(
  code: string | undefined,
): ImageFailureType {
  return code && TRANSIENT_NETWORK_ERROR_CODES.has(code) ? "transient" : "hard";
}

export interface ImageCheckResult {
  ok: boolean;
  status?: number;
  error?: string;
  failureType?: ImageFailureType;
  failureSource?: "policy" | "dns" | "http" | "timeout" | "request" | "stream";
  retryAfter?: string;
  attempts?: number;
  retryBudgetExceeded?: boolean;
  providerCooldownBlocked?: boolean;
  /** Internal signal: defer this attempt until the provider cooldown expires. */
  providerCooldownDelayMs?: number;
  /** Internal signal: the redirect target must acquire its own provider slot. */
  redirectTo?: string;
  bytesDownloaded?: number;
}

/**
 * Follows a 2xx image response stream: validates Content-Type, caps the body
 * size, and settles exactly once (guarded by a flag) even when a stream is
 * destroyed and emits close without end. Exposed for unit testing with mocked
 * streams.
 */
export function followImageResponse(
  res: NodeJS.ReadableStream & {
    statusCode?: number;
    headers?: { "content-type"?: string };
    destroy?: () => void;
    on: (event: string, handler: (...args: unknown[]) => void) => unknown;
  },
  allowedImageMimeTypes: string[],
  onResult: (result: ImageCheckResult) => void,
): void {
  const contentType = res.headers?.["content-type"] || "";
  const normalizedMime = contentType.split(";")[0].trim().toLowerCase();
  let bytes = 0;
  let settled = false;
  const finish = (result: ImageCheckResult) => {
    if (settled) return;
    settled = true;
    onResult(result);
  };
  res.on("data", (chunk) => {
    bytes +=
      typeof chunk === "string" ? chunk.length : (chunk as Buffer).length;
    if (bytes > MAX_RESPONSE_BYTES) {
      finish({
        ok: false,
        error: `response exceeds ${MAX_RESPONSE_BYTES} byte cap`,
        failureType: "policy",
        failureSource: "policy",
        bytesDownloaded: bytes,
      });
      res.destroy?.();
    }
  });
  res.on("end", () => {
    if (settled) return;
    if (
      allowedImageMimeTypes.length > 0 &&
      !allowedImageMimeTypes.includes(normalizedMime)
    ) {
      finish({
        ok: false,
        error: `Content-Type '${normalizedMime}' is not an allowed image MIME type`,
        failureType: "policy",
        failureSource: "policy",
        bytesDownloaded: bytes,
      });
    } else {
      finish({ ok: true, status: res.statusCode, bytesDownloaded: bytes });
    }
  });
  res.on("error", (err) =>
    finish({
      ok: false,
      error: (err as Error).message,
      failureType: classifyNetworkError((err as NodeJS.ErrnoException).code),
      failureSource: "stream",
      bytesDownloaded: bytes,
    }),
  );
  res.on("close", () => {
    if (!settled) {
      finish({
        ok: false,
        error: "response closed before completion",
        failureType: "transient",
        failureSource: "stream",
        bytesDownloaded: bytes,
      });
    }
  });
}

export function classifyImageFailure(
  failureType: ImageFailureType | undefined,
  status?: number,
): { severity: Severity; code: string } {
  const effective =
    failureType ??
    (status === 429 || (status !== undefined && status >= 500 && status <= 599)
      ? "transient"
      : status === undefined
        ? "transient"
        : "hard");
  if (effective === "transient") {
    return { severity: "warning", code: "IMAGE_FETCH_INCONCLUSIVE" };
  }
  if (effective === "policy") {
    return { severity: "error", code: "IMAGE_POLICY_VIOLATION" };
  }
  return { severity: "error", code: "IMAGE_FETCH_BROKEN" };
}

function inconclusiveCause(
  result: ImageCheckResult,
): "rate_limited" | "timeout" | "transient_5xx" | "network" | "other" {
  if (result.status === 429) return "rate_limited";
  if (
    result.failureSource === "timeout" ||
    result.error?.toLowerCase().includes("timed out")
  ) {
    return "timeout";
  }
  if (
    result.status !== undefined &&
    result.status >= 500 &&
    result.status <= 599
  ) {
    return "transient_5xx";
  }
  if (
    result.failureSource === "dns" ||
    result.failureSource === "request" ||
    result.failureSource === "stream"
  ) {
    return "network";
  }
  return "other";
}

function isTransientHttpStatus(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}

export const imagesValidator: ValidatorModule = {
  name: "Catalog Images",
  description:
    "Validates HTTP availability, content-type headers, and duplicate image URLs across destinations.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure all hero images, main images, and gallery photos resolve to HTTP 200 OK image resources without exposing the CI runner to SSRF.",
  guarantees: [
    "HTTPS-only image URLs",
    "Image URL hostname is on the allowlist",
    "Resolved IP is not a private/loopback/reserved address",
    "HTTP 200 OK status on image URLs",
    "Content-Type matches an allowed image MIME type",
    "Response body stays under a size cap",
    "Duplicate URL detection (flagged as warning)",
  ],
  doesNotValidate: ["Perceptual image content hashing", "Search ranking"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    return imageValidationRunner.run(context, true);
  },
  async validateDeterministic(
    context: ValidationContext,
  ): Promise<ValidationResult> {
    return imageValidationRunner.run(context, false);
  },
};

const imageValidationRunner = {
  async run(
    context: ValidationContext,
    remoteChecks: boolean,
  ): Promise<ValidationResult> {
    const validationStartedAt = performance.now();
    const { destinations } = context.catalog;
    const { httpTimeoutMs, allowedImageMimeTypes } = context.config;

    const issues: ValidationIssue[] = [];
    const seenUrls = new Map<string, string>();
    let duplicateUrlReferences = 0;

    // Collect all unique URLs to test efficiently
    const urlsToTest = new Map<string, { destId: string; field: string }[]>();

    for (const dest of destinations) {
      const urls: { url: string; field: string }[] = [];

      if (dest.heroImage)
        urls.push({ url: dest.heroImage, field: "heroImage" });
      if (dest.image && dest.image !== dest.heroImage)
        urls.push({ url: dest.image, field: "image" });

      if (!dest.heroImage && !dest.image) {
        issues.push({
          severity: "error",
          code: "MISSING_DESTINATION_IMAGES",
          message: `Destination '${dest.id}' has no heroImage or image photos.`,
          targetId: dest.id,
        });
      }

      for (const { url, field } of urls) {
        if (!url || typeof url !== "string") continue;

        // Duplicate URL tracking (Warning)
        if (seenUrls.has(url)) {
          duplicateUrlReferences += 1;
          issues.push({
            severity: "warning",
            code: "DUPLICATE_IMAGE_URL",
            message: `Destination '${dest.id}' (${field}) reuses image URL already used by '${seenUrls.get(url)}'.`,
            targetId: dest.id,
          });
        } else {
          seenUrls.set(url, dest.id);
        }

        if (!urlsToTest.has(url)) {
          urlsToTest.set(url, []);
        }
        urlsToTest.get(url)!.push({ destId: dest.id, field });
      }
    }

    const totalChecked = urlsToTest.size;
    const diagnostics = {
      uniqueUrlsChecked: totalChecked,
      imageUrlsInScope: totalChecked,
      verifiedUrls: 0,
      brokenUrls: 0,
      inconclusiveUrls: 0,
      inconclusiveRateLimitedUrls: 0,
      inconclusiveTimeoutUrls: 0,
      inconclusiveTransient5xxUrls: 0,
      inconclusiveNetworkUrls: 0,
      inconclusiveOtherUrls: 0,
      duplicateUrlReferences,
      imageFetchAttempts: 0,
      retryAttempts: 0,
      httpRequests: 0,
      http2xxResponses: 0,
      http429Responses: 0,
      http503Responses: 0,
      http403Responses: 0,
      http404Responses: 0,
      otherHttpErrorResponses: 0,
      redirectResponses: 0,
      successfulFirstAttempts: 0,
      successfulRetries: 0,
      retryExhaustedUrls: 0,
      retryAfterHeaders: 0,
      retryAfterOverBudget: 0,
      retryAfterWaitMs: 0,
      exponentialBackoffDelayMs: 0,
      totalRetryWaitElapsedMs: 0,
      concurrencyQueueWaitMs: 0,
      providerQueueWaitMs: 0,
      interRequestPacingDelayMs: 0,
      wikimediaRequestPacingDelayMs: 0,
      wikimediaHttpRequests: 0,
      wikimediaHttp429Responses: 0,
      providerCooldownWaitMs: 0,
      providerCooldownSkippedUrls: 0,
      providerCircuitOpenCount: 0,
      maxConcurrentRequests: 0,
      networkRequestDurationMs: 0,
      responseBodyBytes: 0,
      dnsLookups: 0,
      dnsCapacitySkips: 0,
      maxConcurrentDnsLookups: 0,
      dnsLookupDurationMs: 0,
      transientDnsFailures: 0,
      permanentDnsFailures: 0,
      dnsRetries: 0,
      dnsTimeouts: 0,
      requestTimeouts: 0,
      requestFailures: 0,
      streamFailures: 0,
      timeoutRetries: 0,
      validatorDurationMs: 0,
    };

    if (!remoteChecks) {
      diagnostics.uniqueUrlsChecked = 0;
      for (const [urlStr, refs] of urlsToTest.entries()) {
        const shapeError = validateImageUrlShape(urlStr);
        if (!shapeError) continue;
        diagnostics.brokenUrls += 1;
        for (const ref of refs) {
          issues.push({
            severity: "error",
            code: "IMAGE_POLICY_VIOLATION",
            message: `Destination '${ref.destId}' (${ref.field}) has an invalid image URL: ${shapeError} -> ${safeImageUrlForReport(urlStr)}`,
            targetId: ref.destId,
          });
        }
      }
      const errorsCount = issues.filter(
        (issue) => issue.severity === "error",
      ).length;
      const warningsCount = issues.filter(
        (issue) => issue.severity === "warning",
      ).length;
      const infoCount = issues.filter(
        (issue) => issue.severity === "info",
      ).length;
      const validatorDurationMs = Math.round(
        performance.now() - validationStartedAt,
      );
      diagnostics.validatorDurationMs = validatorDurationMs;
      return {
        name: imagesValidator.name,
        passed: errorsCount === 0,
        status: errorsCount === 0 ? "not-run" : "failed",
        issues,
        diagnostics,
        metrics: {
          totalChecked: 0,
          errorsCount,
          warningsCount,
          infoCount,
          durationMs: validatorDurationMs,
        },
      };
    }

    const providerCooldowns = new Map<string, number>();
    const providerRequestStartTimes = new Map<string, number>();
    const blockedProviders = new Set<string>();
    const blockedProviderStatuses = new Map<string, number>();
    const blockedProviderFailureSources = new Map<
      string,
      NonNullable<ImageCheckResult["failureSource"]>
    >();
    const rateLimitCountsByUrl = new Map<string, number>();
    const rateLimitCountsByProvider = new Map<string, number>();
    const transientHttpCountsByProvider = new Map<string, number>();
    const transportFailureCountsByProvider = new Map<string, number>();
    const inconclusiveUrlCountsByProvider = new Map<string, number>();
    const activeProviders = new Map<string, number>();
    const providerWaiters = new Map<string, Array<() => void>>();
    const requestWaiters: Array<() => void> = [];
    let activeRequestSlots = 0;
    let networkRequestsStarted = 0;
    let lastNetworkRequestStartAt = 0;
    let pacingLock = Promise.resolve();

    const acquireProviderSlot = (provider: string): Promise<() => void> =>
      new Promise((resolve) => {
        const queuedAt = performance.now();
        const grantSlot = (slotAlreadyCounted = false) => {
          if (!slotAlreadyCounted) {
            activeProviders.set(
              provider,
              (activeProviders.get(provider) ?? 0) + 1,
            );
          }
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            const next = providerWaiters.get(provider)?.shift();
            if (next) next();
            else {
              const active = (activeProviders.get(provider) ?? 1) - 1;
              if (active === 0) activeProviders.delete(provider);
              else activeProviders.set(provider, active);
              providerWaiters.delete(provider);
            }
          });
        };

        if (
          (activeProviders.get(provider) ?? 0) <
          MAX_CONCURRENT_IMAGE_REQUESTS_PER_PROVIDER
        ) {
          grantSlot();
          return;
        }

        const waiters = providerWaiters.get(provider) ?? [];
        waiters.push(() => {
          diagnostics.providerQueueWaitMs += Math.round(
            performance.now() - queuedAt,
          );
          grantSlot(true);
        });
        providerWaiters.set(provider, waiters);
      });

    const acquireRequestSlot = (): Promise<() => void> =>
      new Promise((resolve) => {
        const queuedAt = performance.now();
        const grantSlot = () => {
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            const next = requestWaiters.shift();
            if (next) next();
            else activeRequestSlots -= 1;
          });
        };

        if (activeRequestSlots < MAX_CONCURRENT_IMAGE_REQUESTS) {
          activeRequestSlots += 1;
          grantSlot();
          return;
        }

        requestWaiters.push(() => {
          diagnostics.concurrencyQueueWaitMs += Math.round(
            performance.now() - queuedAt,
          );
          grantSlot();
        });
      });

    const waitForRequestStartPacing = async () => {
      const previousLock = pacingLock;
      let releaseLock!: () => void;
      pacingLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await previousLock;

      try {
        const pacingWaitMs =
          networkRequestsStarted < MAX_CONCURRENT_IMAGE_REQUESTS
            ? 0
            : Math.max(
                0,
                lastNetworkRequestStartAt +
                  MIN_IMAGE_REQUEST_START_INTERVAL_MS -
                  performance.now(),
              );
        if (pacingWaitMs > 0) {
          const pacingStartedAt = performance.now();
          await sleep(pacingWaitMs);
          diagnostics.interRequestPacingDelayMs += Math.round(
            performance.now() - pacingStartedAt,
          );
        }
        networkRequestsStarted += 1;
        lastNetworkRequestStartAt = performance.now();
      } finally {
        releaseLock();
      }
    };

    const waitForWikimediaRequestStartPacing = async (provider: string) => {
      if (provider !== "wikimedia.org") return;
      const lastRequestStartedAt = providerRequestStartTimes.get(provider);
      if (lastRequestStartedAt === undefined) return;
      const waitMs = Math.max(
        0,
        lastRequestStartedAt +
          MIN_WIKIMEDIA_REQUEST_START_INTERVAL_MS -
          performance.now(),
      );
      if (waitMs === 0) return;
      const waitStartedAt = performance.now();
      await sleep(waitMs);
      diagnostics.wikimediaRequestPacingDelayMs += Math.round(
        performance.now() - waitStartedAt,
      );
    };

    const withRequestLimit = async <T>(
      provider: string,
      operation: () => Promise<T>,
    ): Promise<T> => {
      const releaseProvider = await acquireProviderSlot(provider);
      try {
        const releaseRequest = await acquireRequestSlot();
        try {
          return await operation();
        } finally {
          releaseRequest();
        }
      } finally {
        releaseProvider();
      }
    };

    let activeHttpRequests = 0;
    let activeDnsLookups = 0;

    const getProviderCooldown = (urlStr: string) => {
      const provider = imageProviderKey(urlStr);
      if (blockedProviders.has(provider)) {
        return { blocked: true, waitMs: 0 };
      }
      const cooldownUntil = providerCooldowns.get(provider);
      if (cooldownUntil === undefined) {
        return { blocked: false, waitMs: 0 };
      }
      const waitMs = Math.max(0, cooldownUntil - Date.now());
      if (waitMs === 0) providerCooldowns.delete(provider);
      return { blocked: false, waitMs };
    };

    const openProviderCircuit = (
      provider: string,
      status: number | undefined,
      source: NonNullable<ImageCheckResult["failureSource"]>,
    ) => {
      if (blockedProviders.has(provider)) return;
      providerCooldowns.delete(provider);
      blockedProviders.add(provider);
      if (status !== undefined) blockedProviderStatuses.set(provider, status);
      blockedProviderFailureSources.set(provider, source);
      diagnostics.providerCircuitOpenCount += 1;
    };

    const recordProviderTransportFailure = (
      urlStr: string,
      source: NonNullable<ImageCheckResult["failureSource"]>,
    ) => {
      const provider = imageProviderKey(urlStr);
      const count = (transportFailureCountsByProvider.get(provider) ?? 0) + 1;
      transportFailureCountsByProvider.set(provider, count);
      if (count >= MAX_PROVIDER_TRANSPORT_FAILURES) {
        openProviderCircuit(provider, undefined, source);
      }
    };

    const recordProviderThrottle = (
      urlStr: string,
      statusCode: number,
      retryAfterHeader: string | undefined,
    ) => {
      const provider = imageProviderKey(urlStr);
      const retryAfterMs = parseRetryAfterMs(retryAfterHeader, Date.now());
      if (retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_AFTER_MS) {
        openProviderCircuit(provider, statusCode, "http");
        return;
      }

      if (statusCode === 429) {
        const rateLimitCount = (rateLimitCountsByUrl.get(urlStr) ?? 0) + 1;
        const providerRateLimitCount =
          (rateLimitCountsByProvider.get(provider) ?? 0) + 1;
        rateLimitCountsByUrl.set(urlStr, rateLimitCount);
        rateLimitCountsByProvider.set(provider, providerRateLimitCount);
        if (
          rateLimitCount > MAX_RATE_LIMIT_RETRIES ||
          providerRateLimitCount >= MAX_PROVIDER_TRANSIENT_HTTP_RESPONSES
        ) {
          openProviderCircuit(provider, statusCode, "http");
          return;
        }
      } else if (statusCode >= 500 && statusCode <= 599) {
        const failureCount =
          (transientHttpCountsByProvider.get(provider) ?? 0) + 1;
        transientHttpCountsByProvider.set(provider, failureCount);
        if (failureCount >= MAX_PROVIDER_TRANSIENT_HTTP_RESPONSES) {
          openProviderCircuit(provider, statusCode, "http");
          return;
        }
      }

      const cooldownMs = Math.max(BASE_RETRY_DELAY_MS, retryAfterMs ?? 0);
      const cooldownUntil = Date.now() + cooldownMs;
      providerCooldowns.set(
        provider,
        Math.max(providerCooldowns.get(provider) ?? 0, cooldownUntil),
      );
    };

    const providerBlockedResult = (urlStr: string): ImageCheckResult => {
      diagnostics.providerCooldownSkippedUrls += 1;
      const provider = imageProviderKey(urlStr);
      const status = blockedProviderStatuses.get(provider);
      return {
        ok: false,
        ...(status === undefined ? {} : { status }),
        error: `provider '${provider}' paused after repeated transient failures or a Retry-After beyond the retry budget`,
        failureType: "transient",
        failureSource: blockedProviderFailureSources.get(provider) ?? "http",
        retryBudgetExceeded: true,
        providerCooldownBlocked: true,
      };
    };

    const providerCooldownDelayResult = (waitMs: number): ImageCheckResult => ({
      ok: false,
      error: "provider cooldown is active",
      failureType: "transient",
      failureSource: "http",
      providerCooldownDelayMs: waitMs,
    });

    const waitForProviderCooldown = async (
      waitMs: number,
      remainingBudgetMs: number,
    ): Promise<number | undefined> => {
      if (waitMs > remainingBudgetMs) return undefined;
      const waitStartedAt = performance.now();
      await sleep(waitMs);
      const elapsedMs = Math.round(performance.now() - waitStartedAt);
      diagnostics.providerCooldownWaitMs += elapsedMs;
      return elapsedMs;
    };

    // Validate URL shape, scheme, host allowlist, and resolved IP before any
    // network request (SSRF guard). Returns ok:true when safe to fetch.
    const preflight = (
      urlStr: string,
    ): Promise<
      | { ok: true }
      | {
          ok: false;
          error: string;
          failureType: "policy" | "hard" | "transient";
          failureSource?: "dns";
        }
    > => {
      return new Promise((resolve) => {
        const shapeError = validateImageUrlShape(urlStr);
        if (shapeError) {
          resolve({ ok: false, error: shapeError, failureType: "policy" });
          return;
        }
        const parsed = new URL(urlStr);
        if (activeDnsLookups >= MAX_OUTSTANDING_DNS_LOOKUPS) {
          diagnostics.dnsCapacitySkips += 1;
          resolve({
            ok: false,
            error: "DNS resolver capacity is saturated",
            failureType: "transient",
            failureSource: "dns",
          });
          return;
        }
        activeDnsLookups += 1;
        diagnostics.maxConcurrentDnsLookups = Math.max(
          diagnostics.maxConcurrentDnsLookups,
          activeDnsLookups,
        );
        let dnsCapacityReleased = false;
        const releaseDnsCapacity = () => {
          if (dnsCapacityReleased) return;
          dnsCapacityReleased = true;
          activeDnsLookups -= 1;
        };
        diagnostics.dnsLookups += 1;
        const dnsStartedAt = performance.now();
        let dnsSettled = false;
        let dnsLookupTimedOut = false;
        let dnsTimer: ReturnType<typeof setTimeout>;
        const finishDns = (
          result:
            | { ok: true }
            | {
                ok: false;
                error: string;
                failureType: "policy" | "hard" | "transient";
                failureSource?: "dns";
              },
        ) => {
          if (dnsSettled) return;
          dnsSettled = true;
          clearTimeout(dnsTimer);
          if (!dnsLookupTimedOut) releaseDnsCapacity();
          diagnostics.dnsLookupDurationMs += Math.round(
            performance.now() - dnsStartedAt,
          );
          if (result.ok === false && result.failureSource === "dns") {
            if (result.failureType === "transient") {
              diagnostics.transientDnsFailures += 1;
              recordProviderTransportFailure(urlStr, "dns");
            } else {
              diagnostics.permanentDnsFailures += 1;
            }
          }
          resolve(result);
        };
        dnsTimer = setTimeout(() => {
          dnsLookupTimedOut = true;
          diagnostics.dnsTimeouts += 1;
          finishDns({
            ok: false,
            error: `DNS lookup timed out after ${httpTimeoutMs}ms`,
            failureType: "transient",
            failureSource: "dns",
          });
        }, httpTimeoutMs);
        try {
          dns.lookup(parsed.hostname, { all: true }, (err, addresses) => {
            if (dnsLookupTimedOut) {
              releaseDnsCapacity();
              return;
            }
            if (dnsSettled) return;
            releaseDnsCapacity();
            if (err) {
              const code = (err as NodeJS.ErrnoException).code;
              finishDns({
                ok: false,
                error: `DNS lookup failed for '${parsed.hostname}': ${err.message}`,
                failureType: classifyDnsError(code),
                failureSource: "dns",
              });
              return;
            }
            if (!addresses || addresses.length === 0) {
              finishDns({
                ok: false,
                error: `no addresses resolved for '${parsed.hostname}'`,
                failureType: "transient",
                failureSource: "dns",
              });
              return;
            }
            for (const { address } of addresses) {
              if (isPrivateOrReservedAddress(address)) {
                finishDns({
                  ok: false,
                  error: `host '${parsed.hostname}' resolves to private/reserved address ${address}`,
                  failureType: "policy",
                });
                return;
              }
            }
            finishDns({ ok: true });
          });
        } catch (err) {
          releaseDnsCapacity();
          finishDns({
            ok: false,
            error: `DNS lookup failed for '${parsed.hostname}': ${err instanceof Error ? err.message : String(err)}`,
            failureType: "transient",
            failureSource: "dns",
          });
        }
      });
    };

    // Performs one HTTPS GET. The caller schedules redirect targets separately
    // so every hop acquires the target provider's request slot and cooldown.
    const requestUrl = async (
      urlStr: string,
      redirectsLeft = MAX_REDIRECTS,
    ): Promise<ImageCheckResult> => {
      let parsed: URL;
      try {
        parsed = new URL(urlStr);
      } catch (e: any) {
        return { ok: false, error: e.message, failureType: "policy" };
      }
      if (parsed.protocol !== "https:") {
        return {
          ok: false,
          error: "URL must use HTTPS",
          failureType: "policy",
        };
      }
      if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
        return {
          ok: false,
          error: `host '${parsed.hostname}' is not on the allowed image host list`,
          failureType: "policy",
        };
      }

      const provider = imageProviderKey(urlStr);
      const providerCooldown = getProviderCooldown(urlStr);
      if (providerCooldown.blocked) return providerBlockedResult(urlStr);
      if (providerCooldown.waitMs > 0) {
        return providerCooldownDelayResult(providerCooldown.waitMs);
      }
      await waitForWikimediaRequestStartPacing(provider);
      await waitForRequestStartPacing();
      return new Promise((resolve) => {
        const client = https;
        diagnostics.httpRequests += 1;
        if (provider === "wikimedia.org")
          diagnostics.wikimediaHttpRequests += 1;
        activeHttpRequests += 1;
        diagnostics.maxConcurrentRequests = Math.max(
          diagnostics.maxConcurrentRequests,
          activeHttpRequests,
        );
        const requestStartedAt = performance.now();
        if (provider === "wikimedia.org") {
          providerRequestStartTimes.set(provider, requestStartedAt);
        }
        let requestDurationRecorded = false;
        const recordRequestDuration = () => {
          if (requestDurationRecorded) return;
          requestDurationRecorded = true;
          activeHttpRequests -= 1;
          diagnostics.networkRequestDurationMs += Math.round(
            performance.now() - requestStartedAt,
          );
        };

        let responseReceived = false;
        let requestTimedOut = false;
        const req = client.get(
          urlStr,
          {
            headers: {
              "User-Agent":
                "TabiMapBot/1.7.0 (https://github.com/aneesh-patil/trip-planner; contact@tabimap.app)",
              Accept:
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: httpTimeoutMs,
          },
          (res) => {
            responseReceived = true;
            const statusCode = res.statusCode ?? 0;
            if (statusCode >= 200 && statusCode < 300) {
              const successfulProvider = imageProviderKey(urlStr);
              rateLimitCountsByUrl.delete(urlStr);
              rateLimitCountsByProvider.delete(successfulProvider);
              transientHttpCountsByProvider.delete(successfulProvider);
              transportFailureCountsByProvider.delete(successfulProvider);
              inconclusiveUrlCountsByProvider.delete(successfulProvider);
              diagnostics.http2xxResponses += 1;
            } else if (statusCode === 429) {
              diagnostics.http429Responses += 1;
              if (provider === "wikimedia.org") {
                diagnostics.wikimediaHttp429Responses += 1;
              }
            } else if (statusCode === 503) {
              diagnostics.http503Responses += 1;
            } else if (statusCode === 403) {
              diagnostics.http403Responses += 1;
            } else if (statusCode === 404) {
              diagnostics.http404Responses += 1;
            } else if (statusCode >= 400) {
              diagnostics.otherHttpErrorResponses += 1;
            }
            if (isTransientHttpStatus(statusCode)) {
              if (res.headers["retry-after"])
                diagnostics.retryAfterHeaders += 1;
              recordProviderThrottle(
                urlStr,
                statusCode,
                res.headers["retry-after"],
              );
            }

            // Redirect: validate the next hop and follow up to MAX_REDIRECTS.
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              diagnostics.redirectResponses += 1;
              recordRequestDuration();
              res.destroy?.();
              if (redirectsLeft <= 0) {
                resolve({
                  ok: false,
                  error: "too many redirects",
                  failureType: "policy",
                });
                return;
              }
              let nextUrl: string;
              try {
                nextUrl = new URL(res.headers.location, urlStr).toString();
              } catch {
                resolve({
                  ok: false,
                  error: "invalid redirect location",
                  failureType: "policy",
                });
                return;
              }
              resolve({
                ok: false,
                error: "redirect requires a separately scheduled request",
                failureType: "policy",
                failureSource: "policy",
                redirectTo: nextUrl,
              });
              return;
            }

            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              followImageResponse(res, allowedImageMimeTypes, (result) => {
                if (result.failureSource === "stream") {
                  diagnostics.streamFailures += 1;
                }
                diagnostics.responseBodyBytes += result.bytesDownloaded ?? 0;
                recordRequestDuration();
                resolve(result);
              });
              return;
            }

            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400
            ) {
              // 3xx without a Location header (or after the redirect limit) is a
              // hard policy failure, not a success.
              diagnostics.redirectResponses += 1;
              recordRequestDuration();
              res.destroy?.();
              resolve({
                ok: false,
                error: `redirect without a valid location (HTTP ${res.statusCode})`,
                failureType: "policy",
                failureSource: "policy",
              });
              return;
            }

            recordRequestDuration();
            res.destroy?.();
            const transient = isTransientHttpStatus(res.statusCode ?? 0);
            resolve({
              ok: false,
              status: res.statusCode,
              error: `HTTP ${res.statusCode}`,
              failureType: transient ? "transient" : "hard",
              failureSource: "http",
              ...(transient && res.headers["retry-after"]
                ? { retryAfter: res.headers["retry-after"] }
                : {}),
            });
          },
        );

        req.on("error", (err) => {
          if (responseReceived || requestTimedOut) return;
          diagnostics.requestFailures += 1;
          recordRequestDuration();
          const failureType = classifyNetworkError(
            (err as NodeJS.ErrnoException).code,
          );
          if (failureType === "transient") {
            recordProviderTransportFailure(urlStr, "request");
          }
          resolve({
            ok: false,
            error: err.message,
            failureType,
            failureSource: "request",
          });
        });
        req.on("timeout", () => {
          if (requestTimedOut) return;
          requestTimedOut = true;
          diagnostics.requestTimeouts += 1;
          recordRequestDuration();
          recordProviderTransportFailure(urlStr, "timeout");
          req.destroy();
          resolve({
            ok: false,
            error: `Timeout after ${httpTimeoutMs}ms`,
            failureType: "transient",
            failureSource: "timeout",
          });
        });
      });
    };

    const performAttemptWithCooldown = async (
      urlStr: string,
      waitWithinBudget: (waitMs: number) => Promise<boolean>,
    ) => {
      let currentUrl = urlStr;
      let redirectsLeft = MAX_REDIRECTS;
      while (true) {
        const beforeAttempt = getProviderCooldown(currentUrl);
        if (beforeAttempt.blocked) return providerBlockedResult(currentUrl);
        if (beforeAttempt.waitMs > 0) {
          if (!(await waitWithinBudget(beforeAttempt.waitMs))) {
            return providerBlockedResult(currentUrl);
          }
          continue;
        }

        const result = await withRequestLimit(
          imageProviderKey(currentUrl),
          async () => {
            const beforePreflight = getProviderCooldown(currentUrl);
            if (beforePreflight.blocked)
              return providerBlockedResult(currentUrl);
            if (beforePreflight.waitMs > 0) {
              return providerCooldownDelayResult(beforePreflight.waitMs);
            }

            const preflightResult = await preflight(currentUrl);
            if (!preflightResult.ok) {
              return {
                ok: false,
                error: preflightResult.error,
                failureType: preflightResult.failureType,
                failureSource: preflightResult.failureSource,
              };
            }

            const beforeRequest = getProviderCooldown(currentUrl);
            if (beforeRequest.blocked) return providerBlockedResult(currentUrl);
            if (beforeRequest.waitMs > 0) {
              return providerCooldownDelayResult(beforeRequest.waitMs);
            }
            return requestUrl(currentUrl, redirectsLeft);
          },
        );

        if (result.providerCooldownDelayMs !== undefined) {
          if (!(await waitWithinBudget(result.providerCooldownDelayMs))) {
            return providerBlockedResult(currentUrl);
          }
          continue;
        }
        if (result.redirectTo !== undefined) {
          currentUrl = result.redirectTo;
          redirectsLeft -= 1;
          continue;
        }
        return result;
      }
    };

    const checkUrl = (urlStr: string) => {
      let providerCooldownWaitedMs = 0;
      const waitWithinBudget = async (waitMs: number) => {
        const elapsedMs = await waitForProviderCooldown(
          waitMs,
          MAX_RETRY_AFTER_MS - providerCooldownWaitedMs,
        );
        if (elapsedMs === undefined) return false;
        providerCooldownWaitedMs += elapsedMs;
        return true;
      };

      return retryImageFetch(
        () => performAttemptWithCooldown(urlStr, waitWithinBudget),
        {
          onAttempt: (result, attempt) => {
            diagnostics.imageFetchAttempts += 1;
            if (result.ok && attempt === 1) {
              diagnostics.successfulFirstAttempts += 1;
            } else if (result.ok) {
              diagnostics.successfulRetries += 1;
            } else if (
              attempt > 1 &&
              attempt ===
                (result.status === 429
                  ? MAX_RATE_LIMIT_RETRIES + 1
                  : MAX_IMAGE_FETCH_RETRIES + 1) &&
              result.failureType === "transient"
            ) {
              diagnostics.retryExhaustedUrls += 1;
            }

            const provider = imageProviderKey(urlStr);
            if (result.ok || result.failureType !== "transient") {
              inconclusiveUrlCountsByProvider.delete(provider);
            } else {
              const retryLimit =
                result.status === 429
                  ? MAX_RATE_LIMIT_RETRIES
                  : MAX_IMAGE_FETCH_RETRIES;
              const exhausted =
                result.retryBudgetExceeded === true ||
                attempt === retryLimit + 1;
              if (exhausted && !blockedProviders.has(provider)) {
                const failedUrlCount =
                  (inconclusiveUrlCountsByProvider.get(provider) ?? 0) + 1;
                inconclusiveUrlCountsByProvider.set(provider, failedUrlCount);
                if (failedUrlCount >= MAX_PROVIDER_INCONCLUSIVE_URLS) {
                  blockedProviders.add(provider);
                  if (result.status !== undefined) {
                    blockedProviderStatuses.set(provider, result.status);
                  }
                  blockedProviderFailureSources.set(
                    provider,
                    result.failureSource ?? "request",
                  );
                  diagnostics.providerCircuitOpenCount += 1;
                }
              }
            }
          },
          onWait: (wait) => {
            diagnostics.retryAttempts += 1;
            diagnostics.retryAfterWaitMs += wait.retryAfterMs;
            diagnostics.exponentialBackoffDelayMs += wait.backoffDelayMs;
            diagnostics.totalRetryWaitElapsedMs += wait.elapsedWaitMs;
            if (wait.result.failureSource === "dns") {
              diagnostics.dnsRetries += 1;
            }
            if (wait.result.failureSource === "timeout") {
              diagnostics.timeoutRetries += 1;
            }
          },
          onRetryAfterOverBudget: () => {
            diagnostics.retryAfterOverBudget += 1;
          },
        },
      );
    };

    const entries = Array.from(urlsToTest.entries());
    await Promise.all(
      entries.map(async ([urlStr, refs]) => {
        const res = await checkUrl(urlStr);
        if (res.ok) {
          diagnostics.verifiedUrls += 1;
          return;
        }

        const { severity, code } = classifyImageFailure(
          res.failureType,
          res.status,
        );
        if (severity === "warning") {
          diagnostics.inconclusiveUrls += 1;
          const cause = inconclusiveCause(res);
          if (cause === "rate_limited") {
            diagnostics.inconclusiveRateLimitedUrls += 1;
          } else if (cause === "timeout") {
            diagnostics.inconclusiveTimeoutUrls += 1;
          } else if (cause === "transient_5xx") {
            diagnostics.inconclusiveTransient5xxUrls += 1;
          } else if (cause === "network") {
            diagnostics.inconclusiveNetworkUrls += 1;
          } else {
            diagnostics.inconclusiveOtherUrls += 1;
          }
        } else {
          diagnostics.brokenUrls += 1;
        }

        const finding =
          severity === "warning"
            ? `verification incomplete (${inconclusiveCause(res)})`
            : "confirmed broken";
        for (const ref of refs) {
          issues.push({
            severity,
            code,
            message: `Destination '${ref.destId}' (${ref.field}) image ${finding}: ${publicImageFailureSummary(res)}${(res.attempts ?? 1) > 1 ? ` (after ${res.attempts} attempts)` : ""} -> ${safeImageUrlForReport(urlStr)}`,
            targetId: ref.destId,
          });
        }
      }),
    );

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;
    const validatorDurationMs = Math.round(
      performance.now() - validationStartedAt,
    );
    diagnostics.validatorDurationMs = validatorDurationMs;
    const status =
      errorsCount > 0
        ? "failed"
        : diagnostics.inconclusiveUrls > 0
          ? "inconclusive"
          : "passed";

    return {
      name: imagesValidator.name,
      passed: status === "passed",
      status,
      issues,
      diagnostics,
      metrics: {
        totalChecked,
        errorsCount,
        warningsCount,
        infoCount,
        durationMs: validatorDurationMs,
      },
    };
  },
};
