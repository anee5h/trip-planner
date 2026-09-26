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

/** Maximum response body to download while validating a URL. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** Maximum redirect hops to follow. */
const MAX_REDIRECTS = 3;
const MAX_IMAGE_FETCH_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

type ImageRequest = () => Promise<ImageCheckResult>;

export interface ImageRetryOptions {
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export function parseRetryAfterMs(
  value: string | undefined,
  nowMs = Date.now(),
): number | undefined {
  if (!value?.trim()) return undefined;

  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : undefined;
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

    if (result.ok) return { ...result, attempts };

    if (
      result.failureType !== "transient" ||
      retryIndex === MAX_IMAGE_FETCH_RETRIES
    ) {
      return { ...result, attempts };
    }

    const retryAfterMs = parseRetryAfterMs(result.retryAfter, now());
    if (retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_AFTER_MS) {
      return {
        ...result,
        attempts,
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
    await wait(Math.max(backoffMs, retryAfterMs ?? 0) + retryAfterJitterMs);
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

/** Classifies a DNS lookup error code: temporary resolver/infrastructure
 *  failures are transient; everything else is a hard resolution failure. */
export function classifyDnsError(code: string | undefined): ImageFailureType {
  if (code === "EAI_AGAIN" || code === "ENETUNREACH" || code === "ETIMEDOUT") {
    return "transient";
  }
  return "hard";
}

export interface ImageCheckResult {
  ok: boolean;
  status?: number;
  error?: string;
  failureType?: ImageFailureType;
  retryAfter?: string;
  attempts?: number;
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
      });
    } else {
      finish({ ok: true, status: res.statusCode });
    }
  });
  res.on("error", (err) =>
    finish({
      ok: false,
      error: (err as Error).message,
      failureType: "transient",
    }),
  );
  res.on("close", () => {
    if (!settled) {
      finish({
        ok: false,
        error: "response closed before completion",
        failureType: "transient",
      });
    }
  });
}

export function classifyImageFailure(
  failureType: ImageFailureType | undefined,
  status?: number,
): { severity: Severity; code: string } {
  const effective =
    failureType ||
    (status === 404 || status === 410 || status === 500 ? "hard" : "transient");
  if (effective === "transient") {
    return { severity: "warning", code: "IMAGE_FETCH_WARNING" };
  }
  if (effective === "policy") {
    return { severity: "error", code: "IMAGE_POLICY_VIOLATION" };
  }
  return { severity: "error", code: "BROKEN_IMAGE_URL" };
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
    const { destinations } = context.catalog;
    const { httpTimeoutMs, allowedImageMimeTypes } = context.config;

    const issues: ValidationIssue[] = [];
    const seenUrls = new Map<string, string>();

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
        }
    > => {
      return new Promise((resolve) => {
        let parsed: URL;
        try {
          parsed = new URL(urlStr);
        } catch {
          resolve({ ok: false, error: "malformed URL", failureType: "policy" });
          return;
        }
        if (parsed.protocol !== "https:") {
          resolve({
            ok: false,
            error: "URL must use HTTPS",
            failureType: "policy",
          });
          return;
        }
        if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
          resolve({
            ok: false,
            error: `host '${parsed.hostname}' is not on the allowed image host list`,
            failureType: "policy",
          });
          return;
        }
        dns.lookup(parsed.hostname, { all: true }, (err, addresses) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException).code;
            resolve({
              ok: false,
              error: `DNS lookup failed for '${parsed.hostname}': ${err.message}`,
              failureType: classifyDnsError(code),
            });
            return;
          }
          if (!addresses || addresses.length === 0) {
            resolve({
              ok: false,
              error: `no addresses resolved for '${parsed.hostname}'`,
              failureType: "hard",
            });
            return;
          }
          for (const { address } of addresses) {
            if (isPrivateOrReservedAddress(address)) {
              resolve({
                ok: false,
                error: `host '${parsed.hostname}' resolves to private/reserved address ${address}`,
                failureType: "policy",
              });
              return;
            }
          }
          resolve({ ok: true });
        });
      });
    };

    // Performs one HTTPS GET and follows a bounded redirect chain. The outer
    // checkUrl retry policy covers preflight, request, and stream failures.
    const requestUrl = (
      urlStr: string,
      redirectsLeft = MAX_REDIRECTS,
    ): Promise<ImageCheckResult> => {
      return new Promise((resolve) => {
        let parsed: URL;
        try {
          parsed = new URL(urlStr);
        } catch (e: any) {
          resolve({ ok: false, error: e.message, failureType: "policy" });
          return;
        }
        if (parsed.protocol !== "https:") {
          resolve({
            ok: false,
            error: "URL must use HTTPS",
            failureType: "policy",
          });
          return;
        }
        if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
          resolve({
            ok: false,
            error: `host '${parsed.hostname}' is not on the allowed image host list`,
            failureType: "policy",
          });
          return;
        }
        const client = https;

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
            // Redirect: validate the next hop and follow up to MAX_REDIRECTS.
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              res.resume();
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
              preflight(nextUrl).then((preflightResult) => {
                if (!preflightResult.ok) {
                  resolve({
                    ok: false,
                    error: preflightResult.error,
                    failureType: preflightResult.failureType,
                  });
                  return;
                }
                requestUrl(nextUrl, redirectsLeft - 1).then(resolve);
              });
              return;
            }

            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              followImageResponse(res, allowedImageMimeTypes, resolve);
              return;
            }

            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400
            ) {
              // 3xx without a Location header (or after the redirect limit) is a
              // hard policy failure, not a success.
              res.resume();
              resolve({
                ok: false,
                error: `redirect without a valid location (HTTP ${res.statusCode})`,
                failureType: "policy",
              });
              return;
            }

            res.resume();
            const transient = res.statusCode === 429 || res.statusCode === 503;
            resolve({
              ok: false,
              status: res.statusCode,
              error: `HTTP ${res.statusCode}`,
              failureType: transient ? "transient" : "hard",
              ...(transient && res.headers["retry-after"]
                ? { retryAfter: res.headers["retry-after"] }
                : {}),
            });
          },
        );

        req.on("error", (err) =>
          resolve({ ok: false, error: err.message, failureType: "transient" }),
        );
        req.on("timeout", () => {
          req.destroy();
          resolve({
            ok: false,
            error: `Timeout after ${httpTimeoutMs}ms`,
            failureType: "transient",
          });
        });
      });
    };

    const checkUrl = (urlStr: string) =>
      retryImageFetch(async () => {
        const preflightResult = await preflight(urlStr);
        if (!preflightResult.ok) {
          return {
            ok: false,
            error: preflightResult.error,
            failureType: preflightResult.failureType,
          };
        }
        return requestUrl(urlStr);
      });

    // The catalogue receives 429s under larger request bursts. Cap concurrency
    // at three so retries do not amplify the provider-side throttle.
    const entries = Array.from(urlsToTest.entries());
    const batchSize = 3;
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk = entries.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async ([urlStr, refs]) => {
          const res = await checkUrl(urlStr);
          if (!res.ok) {
            const { severity, code } = classifyImageFailure(
              res.failureType,
              res.status,
            );

            for (const ref of refs) {
              issues.push({
                severity,
                code,
                message: `Destination '${ref.destId}' (${ref.field}) image check result: ${res.error}${(res.attempts ?? 1) > 1 ? ` (after ${res.attempts} attempts)` : ""} -> ${urlStr}`,
                targetId: ref.destId,
              });
            }
          }
        }),
      );
      await new Promise((r) => setTimeout(r, 200));
    }

    const errorsCount = issues.filter((i) => i.severity === "error").length;
    const warningsCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;

    return {
      name: imagesValidator.name,
      passed: errorsCount === 0,
      issues,
      metrics: {
        totalChecked,
        errorsCount,
        warningsCount,
        infoCount,
        durationMs: 0,
      },
    };
  },
};
