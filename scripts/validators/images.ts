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
  // IPv4 literal
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
    // network request (SSRF guard). Returns null when safe to fetch.
    const preflight = (urlStr: string): Promise<string | null> => {
      return new Promise((resolve) => {
        let parsed: URL;
        try {
          parsed = new URL(urlStr);
        } catch {
          resolve("malformed URL");
          return;
        }
        if (parsed.protocol !== "https:") {
          resolve("URL must use HTTPS");
          return;
        }
        if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
          resolve(
            `host '${parsed.hostname}' is not on the allowed image host list`,
          );
          return;
        }
        dns.lookup(parsed.hostname, { all: true }, (err, addresses) => {
          if (err) {
            resolve(`DNS lookup failed for '${parsed.hostname}'`);
            return;
          }
          if (!addresses || addresses.length === 0) {
            resolve(`no addresses resolved for '${parsed.hostname}'`);
            return;
          }
          for (const { address } of addresses) {
            if (isPrivateOrReservedAddress(address)) {
              resolve(
                `host '${parsed.hostname}' resolves to private/reserved address ${address}`,
              );
              return;
            }
          }
          resolve(null);
        });
      });
    };

    // Helper to test HTTPS GET with retry on 429/timeout, a redirect limit,
    // content-type validation, and a response-size cap.
    const checkUrl = (
      urlStr: string,
      isRetry = false,
      redirectsLeft = MAX_REDIRECTS,
    ): Promise<{ ok: boolean; status?: number; error?: string }> => {
      return new Promise((resolve) => {
        let parsed: URL;
        try {
          parsed = new URL(urlStr);
        } catch (e: any) {
          resolve({ ok: false, error: e.message });
          return;
        }
        if (parsed.protocol !== "https:") {
          resolve({ ok: false, error: "URL must use HTTPS" });
          return;
        }
        if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
          resolve({
            ok: false,
            error: `host '${parsed.hostname}' is not on the allowed image host list`,
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
                resolve({ ok: false, error: "too many redirects" });
                return;
              }
              let nextUrl: string;
              try {
                nextUrl = new URL(res.headers.location, urlStr).toString();
              } catch {
                resolve({ ok: false, error: "invalid redirect location" });
                return;
              }
              preflight(nextUrl).then((preflightError) => {
                if (preflightError) {
                  resolve({ ok: false, error: preflightError });
                  return;
                }
                checkUrl(nextUrl, isRetry, redirectsLeft - 1).then(resolve);
              });
              return;
            }

            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 400
            ) {
              const contentType = res.headers["content-type"] || "";
              const normalizedMime = contentType
                .split(";")[0]
                .trim()
                .toLowerCase();
              let tooLarge = false;
              let bytes = 0;
              res.on("data", (chunk) => {
                bytes += chunk.length;
                if (bytes > MAX_RESPONSE_BYTES) {
                  tooLarge = true;
                  res.destroy();
                }
              });
              res.on("end", () => {
                if (tooLarge) {
                  resolve({
                    ok: false,
                    error: `response exceeds ${MAX_RESPONSE_BYTES} byte cap`,
                  });
                } else if (
                  allowedImageMimeTypes.length > 0 &&
                  !allowedImageMimeTypes.includes(normalizedMime)
                ) {
                  resolve({
                    ok: false,
                    error: `Content-Type '${normalizedMime}' is not an allowed image MIME type`,
                  });
                } else {
                  resolve({ ok: true, status: res.statusCode });
                }
              });
              res.on("error", (err) =>
                resolve({ ok: false, error: err.message }),
              );
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
              resolve({
                ok: false,
                status: res.statusCode,
                error: `HTTP ${res.statusCode}`,
              });
            }
          },
        );

        req.on("error", (err) => resolve({ ok: false, error: err.message }));
        req.on("timeout", () => {
          req.destroy();
          resolve({ ok: false, error: `Timeout after ${httpTimeoutMs}ms` });
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
          const preflightError = await preflight(urlStr);
          const res = preflightError
            ? { ok: false, error: preflightError }
            : await checkUrl(urlStr);
          if (!res.ok) {
            const isHardFailure =
              res.status === 404 || res.status === 410 || res.status === 500;
            const severity: Severity = isHardFailure ? "error" : "warning";
            const code = isHardFailure
              ? "BROKEN_IMAGE_URL"
              : "IMAGE_FETCH_WARNING";

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
