import type { ValidationConfig } from "../validators/types";

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  hubCollectionBlacklist: ["japan-top-castles", "unesco-world-heritage"],
  budgetTolerancePercent: 0.02,
  budgetMinToleranceYen: 100,
  httpTimeoutMs: 4000,
  maxWarningThreshold: 50,
  allowedImageMimeTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/svg+xml",
  ],
};
