import type { Destination } from "../../src/shared/types/destination";
import type { Collection } from "../../src/shared/types/collection";

export const QA_FRAMEWORK_VERSION = "1.0.0";

export type Severity = "info" | "warning" | "error";

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  targetId?: string;
}

export interface ValidationResult {
  name: string;
  passed: boolean;
  issues: ValidationIssue[];
  metrics: {
    totalChecked: number;
    errorsCount: number;
    warningsCount: number;
    infoCount: number;
  };
}

export interface CatalogData {
  destinations: Destination[];
  collections: Collection[];
}

export interface ValidationConfig {
  hubCollectionBlacklist: string[];
  budgetTolerancePercent: number;
  budgetMinToleranceYen: number;
  httpTimeoutMs: number;
  maxWarningThreshold: number;
  allowedImageMimeTypes: string[];
}

export interface ValidationContext {
  catalog: CatalogData;
  config: ValidationConfig;
}

export interface ValidatorModule {
  name: string;
  description: string;
  dependsOn?: string[];
  purpose: string;
  guarantees: string[];
  doesNotValidate: string[];
  validate(context: ValidationContext): Promise<ValidationResult>;
}

export interface ReleaseReportMetadata {
  version: string;
  qaFrameworkVersion: string;
  gitCommit: string;
  generatedAt: string;
  validators: ValidationResult[];
}
