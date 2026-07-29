export interface ExperimentVariant {
  id: string;
  name: string;
  allocationPercentage: number; // e.g. 50 = 50%
  parameters?: Record<string, any>;
}

export interface ExperimentConfig {
  id: string;
  name: string;
  enabled: boolean;
  startDate: string; // ISO date format YYYY-MM-DD
  endDate: string; // ISO date format YYYY-MM-DD
  variants: ExperimentVariant[];
}

export interface AssignmentResult {
  experimentId: string;
  variantId: string;
  parameters: Record<string, any>;
  isControl: boolean;
  reason: "ASSIGNED" | "DISABLED" | "EXPIRED" | "NOT_FOUND";
}

const SESSION_STORAGE_KEY = "tabimap_experiment_session_id";
const OVERRIDES_STORAGE_KEY = "tabimap_experiment_overrides";

/**
 * FNV-1a deterministic hash function producing consistent 32-bit integers.
 */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

export class ExperimentFramework {
  private experiments: Map<string, ExperimentConfig> = new Map();
  private sessionId: string;
  private overrides: Record<string, boolean> = {}; // experimentId -> enabled

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.loadOverrides();
    this.registerDefaultExperiments();
  }

  private getOrCreateSessionId(): string {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        let sid = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!sid) {
          sid = `exp_sess_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
          localStorage.setItem(SESSION_STORAGE_KEY, sid);
        }
        return sid;
      }
    } catch {
      // Fallback in test / SSR
    }
    return "exp_sess_default_test_id";
  }

  private loadOverrides(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
        if (raw) {
          this.overrides = JSON.parse(raw);
        }
      }
    } catch {
      this.overrides = {};
    }
  }

  public registerExperiment(config: ExperimentConfig): void {
    this.experiments.set(config.id, config);
  }

  private registerDefaultExperiments(): void {
    this.registerExperiment({
      id: "exp_season_weight_2026",
      name: "Seasonal Weighting Calibration 2026",
      enabled: true,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      variants: [
        {
          id: "control",
          name: "Standard Seasonal Weighting (1.0x)",
          allocationPercentage: 50,
          parameters: { seasonalMultiplier: 1.0 },
        },
        {
          id: "treatment_seasonal_boost",
          name: "High Seasonal Sensitivity (1.25x)",
          allocationPercentage: 50,
          parameters: { seasonalMultiplier: 1.25 },
        },
      ],
    });
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public setKillSwitch(experimentId: string, enabled: boolean): void {
    this.overrides[experimentId] = enabled;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(
          OVERRIDES_STORAGE_KEY,
          JSON.stringify(this.overrides),
        );
      }
    } catch {
      // Fail silent
    }
  }

  public isExperimentActive(
    config: ExperimentConfig,
    now: Date = new Date(),
  ): { active: boolean; reason: "ACTIVE" | "DISABLED" | "EXPIRED" } {
    const isOverrideDisabled = this.overrides[config.id] === false;
    if (!config.enabled || isOverrideDisabled) {
      return { active: false, reason: "DISABLED" };
    }

    const endDate = new Date(config.endDate);
    if (now > endDate) {
      return { active: false, reason: "EXPIRED" };
    }

    return { active: true, reason: "ACTIVE" };
  }

  public getAssignment(
    experimentId: string,
    customSessionId?: string,
    now: Date = new Date(),
  ): AssignmentResult {
    const config = this.experiments.get(experimentId);
    if (!config) {
      return {
        experimentId,
        variantId: "control",
        parameters: {},
        isControl: true,
        reason: "NOT_FOUND",
      };
    }

    const { active, reason } = this.isExperimentActive(config, now);
    if (!active) {
      const controlVariant = config.variants.find((v) => v.id === "control");
      return {
        experimentId,
        variantId: "control",
        parameters: controlVariant?.parameters || {},
        isControl: true,
        reason: reason as "DISABLED" | "EXPIRED",
      };
    }

    // Deterministic Bucket Hash
    const targetSessionId = customSessionId || this.sessionId;
    const hashInput = `${experimentId}:${targetSessionId}`;
    const bucket = fnv1aHash(hashInput) % 100;

    let cumulative = 0;
    for (const variant of config.variants) {
      cumulative += variant.allocationPercentage;
      if (bucket < cumulative) {
        return {
          experimentId,
          variantId: variant.id,
          parameters: variant.parameters || {},
          isControl: variant.id === "control",
          reason: "ASSIGNED",
        };
      }
    }

    // Default fallback
    const fallbackControl = config.variants[0];
    return {
      experimentId,
      variantId: fallbackControl?.id || "control",
      parameters: fallbackControl?.parameters || {},
      isControl: true,
      reason: "ASSIGNED",
    };
  }

  public listExperiments(): ExperimentConfig[] {
    return Array.from(this.experiments.values());
  }
}

export const experimentFramework = new ExperimentFramework();
