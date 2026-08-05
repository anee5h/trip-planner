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
  "images.unsplash.com",
  "media.istockphoto.com",
  "museum.seiko.co.jp",
  "mangapark.jp",
]);

/** Maximum response body to download while validating a URL. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

/** Maximum redirect hops to follow. */
const MAX_REDIRECTS = 3;

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
          severity: "warning",
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

    // Helper to test HTTPS GET with retry on 429/timeout, a redirect limit,
    // content-type validation, and a response-size cap. failureType is
    // "policy" or "hard" for merge-blocking errors and "transient" for
    // retryable/remote failures.
    const checkUrl = (
      urlStr: string,
      isRetry = false,
      redirectsLeft = MAX_REDIRECTS,
    ): Promise<{
      ok: boolean;
      status?: number;
      error?: string;
      failureType?: "policy" | "hard" | "transient";
    }> => {
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
                checkUrl(nextUrl, isRetry, redirectsLeft - 1).then(resolve);
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

            if (
              (res.statusCode === 429 || res.statusCode === 503) &&
              !isRetry
            ) {
              res.resume();
              setTimeout(async () => {
                const retryRes = await checkUrl(urlStr, true);
                resolve(retryRes);
              }, 1000);
            } else {
              const transient =
                res.statusCode === 429 || res.statusCode === 503;
              resolve({
                ok: false,
                status: res.statusCode,
                error: `HTTP ${res.statusCode}`,
                failureType: transient ? "transient" : "hard",
              });
            }
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

    // Run batch HTTPS requests with throttled concurrency (4 requests per batch with 200ms delay)
    const entries = Array.from(urlsToTest.entries());
    const batchSize = 4;
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk = entries.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async ([urlStr, refs]) => {
          const preflightResult = await preflight(urlStr);
          const res = preflightResult.ok
            ? await checkUrl(urlStr)
            : {
                ok: false,
                error: preflightResult.error,
                failureType: preflightResult.failureType,
              };
          if (!res.ok) {
            const { severity, code } = classifyImageFailure(
              res.failureType,
              res.status,
            );

            for (const ref of refs) {
              issues.push({
                severity,
                code,
                message: `Destination '${ref.destId}' (${ref.field}) image check result: ${res.error} -> ${urlStr}`,
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
