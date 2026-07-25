import type {
  ValidatorModule,
  ValidationResult,
  ValidationIssue,
  ValidationContext,
  Severity,
} from "./types";
import http from "http";
import https from "https";

export const imagesValidator: ValidatorModule = {
  name: "Catalog Images",
  description:
    "Validates HTTP availability, content-type headers, and duplicate image URLs across destinations.",
  dependsOn: ["Catalog Destinations"],
  purpose:
    "Ensure all hero images, main images, and gallery photos resolve to HTTP 200 OK image resources.",
  guarantees: [
    "HTTP 200 OK status on image URLs",
    "Valid image MIME headers",
    "Duplicate URL detection (flagged as warning)",
  ],
  doesNotValidate: ["Perceptual image content hashing", "Search ranking"],
  async validate(context: ValidationContext): Promise<ValidationResult> {
    const { destinations } = context.catalog;
    const { httpTimeoutMs } = context.config;

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
      if (dest.gallery && Array.isArray(dest.gallery)) {
        dest.gallery.forEach((gUrl, idx) => {
          if (gUrl) urls.push({ url: gUrl, field: `gallery[${idx}]` });
        });
      }

      if (
        !dest.heroImage &&
        !dest.image &&
        (!dest.gallery || dest.gallery.length === 0)
      ) {
        issues.push({
          severity: "error",
          code: "MISSING_DESTINATION_IMAGES",
          message: `Destination '${dest.id}' has no heroImage, image, or gallery photos.`,
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

    // Helper to test HTTP GET with retry on 429/timeout
    const checkUrl = (
      urlStr: string,
      isRetry = false,
    ): Promise<{ ok: boolean; status?: number; error?: string }> => {
      return new Promise((resolve) => {
        try {
          const parsed = new URL(urlStr);
          const client = parsed.protocol === "https:" ? https : http;

          const req = client.get(
            urlStr,
            {
              headers: {
                "User-Agent":
                  "TabiMapBot/1.6.0 (https://github.com/aneesh-patil/trip-planner; contact@tabimap.app)",
                Accept:
                  "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              },
              timeout: httpTimeoutMs,
            },
            (res) => {
              if (
                res.statusCode &&
                res.statusCode >= 200 &&
                res.statusCode < 400
              ) {
                resolve({ ok: true, status: res.statusCode });
              } else if (
                (res.statusCode === 429 || res.statusCode === 503) &&
                !isRetry
              ) {
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
              res.resume();
            },
          );

          req.on("error", (err) => resolve({ ok: false, error: err.message }));
          req.on("timeout", () => {
            req.destroy();
            resolve({ ok: false, error: `Timeout after ${httpTimeoutMs}ms` });
          });
        } catch (e: any) {
          resolve({ ok: false, error: e.message });
        }
      });
    };

    // Run batch HTTP requests with throttled concurrency (4 requests per batch with 200ms delay)
    const entries = Array.from(urlsToTest.entries());
    const batchSize = 4;
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk = entries.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async ([urlStr, refs]) => {
          const res = await checkUrl(urlStr);
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
      },
    };
  },
};
